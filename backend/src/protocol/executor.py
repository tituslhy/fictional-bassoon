"""Maps A2A task lifecycle states onto the existing chat pipeline.

Per ``.claude/skills/a2a-service-packaging/SKILL.md``:

- ``submitted`` -> the point ``run_agent_task.delay()`` is called
- ``working``   -> events are flowing through the existing Redis pub/sub
  ``stream:{job_id}`` channel
- ``completed`` / ``failed`` -> the existing ``done`` / ``error`` events

Per ``.claude/rules/citus-thread-id-integrity.md``, the A2A ``taskId`` /
``contextId`` must resolve to the existing ``thread_id`` / ``job_id`` pair —
no third ID system. This executor enforces that literally: the A2A
``contextId`` *is* used as ``ChatRequest.thread_id``, and the A2A ``taskId``
*is* used as ``ChatRequest.job_id`` (and therefore as the Redis
``stream:{job_id}`` channel name). If the calling A2A client doesn't supply
its own ``contextId``/``taskId``, the SDK's default UUID generator mints one
before this executor ever runs, and that same value flows straight through —
never remapped, never duplicated.

No new Redis structures, DB tables, or Celery changes were introduced to
build this (`.claude/rules/legacy-stack-freeze.md`) — this reuses
``run_agent_task.delay()`` and ``subscribe()``/``stream:{job_id}`` exactly as
``main.py``'s ``/chat`` handler does today.
"""

import json
import logging
import uuid

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types.a2a_pb2 import (
    Message,
    Part,
    Role,
    Task,
    TaskState,
    TaskStatus,
    TaskStatusUpdateEvent,
)
from a2a.utils.errors import UnsupportedOperationError

from src.models.chat_models import ChatRequest
from src.queue.redis_pubsub import subscribe
from src.worker.tasks import run_agent_task

logger = logging.getLogger("backend")


def _agent_message(context_id: str, task_id: str, text: str) -> Message:
    return Message(
        message_id=str(uuid.uuid4()),
        context_id=context_id,
        task_id=task_id,
        role=Role.ROLE_AGENT,
        parts=[Part(text=text)],
    )


def _status_event(
    task_id: str,
    context_id: str,
    state: "TaskState",
    text: str | None = None,
) -> TaskStatusUpdateEvent:
    status = TaskStatus(state=state)
    if text:
        status.message.CopyFrom(_agent_message(context_id, task_id, text))
    return TaskStatusUpdateEvent(task_id=task_id, context_id=context_id, status=status)


class ChatAgentExecutor(AgentExecutor):
    """Bridges A2A ``message/send`` requests onto the Celery + Redis chat pipeline."""

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task_id = context.task_id
        thread_id = context.context_id
        user_input = context.get_user_input()

        if not task_id or not thread_id:
            # Should not happen: RequestContext always generates these if the
            # client didn't supply them (see a2a.server.agent_execution.context).
            await event_queue.enqueue_event(
                _status_event(
                    task_id or "unknown",
                    thread_id or "unknown",
                    TaskState.TASK_STATE_FAILED,
                    text="missing task_id/context_id",
                )
            )
            return

        chat_request = ChatRequest(message=user_input, thread_id=thread_id, job_id=task_id)

        logger.info(
            "A2A execute: task_id=%s (job_id) thread_id=%s (context_id)", task_id, thread_id
        )

        # Subscribe before enqueueing, same ordering as main.py's /chat handler,
        # to avoid missing events published before we start listening.
        pubsub = await subscribe(task_id)

        try:
            run_agent_task.delay(chat_request.model_dump())
        except Exception as exc:
            await pubsub.unsubscribe(f"stream:{task_id}")
            await pubsub.close()
            logger.exception("failed to enqueue A2A chat task: task_id=%s", task_id)
            await event_queue.enqueue_event(
                _status_event(task_id, thread_id, TaskState.TASK_STATE_FAILED, text=str(exc))
            )
            return

        # submitted: the point run_agent_task.delay() is called. The framework
        # requires the *first* event from an executor to be a full Task
        # object (establishing task_id/context_id), not a bare status update.
        await event_queue.enqueue_event(
            Task(
                id=task_id,
                context_id=thread_id,
                status=TaskStatus(state=TaskState.TASK_STATE_SUBMITTED),
            )
        )

        answer_parts: list[str] = []
        error_text: str | None = None
        working_announced = False

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                event = json.loads(message["data"])
                event_type = event.get("event", "message")

                # working: events are flowing through stream:{job_id}.
                if not working_announced:
                    await event_queue.enqueue_event(
                        _status_event(task_id, thread_id, TaskState.TASK_STATE_WORKING)
                    )
                    working_announced = True

                if event_type == "answer":
                    answer_parts.append(event.get("data", ""))
                elif event_type == "error":
                    error_text = event.get("data") or "agent error"
                elif event_type == "done":
                    break
        finally:
            await pubsub.unsubscribe(f"stream:{task_id}")
            await pubsub.close()

        if error_text:
            # failed: maps from the existing 'error' event.
            await event_queue.enqueue_event(
                _status_event(task_id, thread_id, TaskState.TASK_STATE_FAILED, text=error_text)
            )
        else:
            # completed: maps from the existing 'done' event (with no error seen).
            await event_queue.enqueue_event(
                _status_event(
                    task_id,
                    thread_id,
                    TaskState.TASK_STATE_COMPLETED,
                    text="".join(answer_parts),
                )
            )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        """Task cancellation is not implemented.

        Cancelling would require mapping the A2A task_id (== job_id) to the
        underlying Celery AsyncResult id so it could be revoked — a new
        lookup structure this rewrite doesn't currently have. Per
        ``.claude/rules/legacy-stack-freeze.md`` that's a scope-boundary
        decision (new Redis/DB structure), not something to add inline here.
        Flagged in the a2a-integrator report rather than resolved silently.
        """
        raise UnsupportedOperationError(message="Task cancellation is not supported yet")
