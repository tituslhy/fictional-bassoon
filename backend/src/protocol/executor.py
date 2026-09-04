"""Maps A2A task lifecycle states onto the existing chat pipeline.

Per ``.claude/skills/a2a-service-packaging/SKILL.md``:

- ``submitted`` -> the point ``run_agent_task.delay()`` is called
- ``working``   -> events are flowing through the existing Redis pub/sub
  ``stream:{job_id}`` channel
- ``completed`` / ``failed`` -> the AG-UI ``RUN_FINISHED`` / ``RUN_ERROR``
  terminal events (see ``utils/streaming.py``; the legacy ``done`` /
  ``error`` vocabulary this originally targeted was replaced by the AG-UI
  bridge)

Per ``.claude/rules/citus-thread-id-integrity.md``, the A2A ``taskId`` /
``contextId`` must resolve to the existing ``thread_id`` / ``job_id`` pair —
no third ID system. This executor enforces that literally: the A2A
``contextId`` *is* used as ``ChatRequest.thread_id``, and the A2A ``taskId``
*is* used as ``ChatRequest.job_id`` (and therefore as the Redis
``stream:{job_id}`` channel name). If the calling A2A client doesn't supply
its own ``contextId``/``taskId``, the SDK's default UUID generator mints one
before this executor ever runs, and that same value flows straight through —
never remapped, never duplicated.

Task persistence is the SDK ``TaskStore`` (Postgres ``a2a_tasks`` when
``DB_URI`` is set). This executor still reuses ``run_agent_task.delay()``
and ``subscribe()``/``stream:{job_id}`` exactly as ``main.py``'s ``/chat``
handler does.
"""

import asyncio
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

# Maximum gap between consecutive pub/sub events before the run is presumed
# dead. Unlike /chat's SSE stream, an A2A execute() has no client disconnect
# to unblock it, so a worker that dies mid-run would otherwise leave the
# request hanging on pubsub.listen() forever. Streaming emits token-level
# events, so legitimate gaps are short; this bounds the worst case.
IDLE_TIMEOUT_SECONDS = 120.0


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
            listener = aiter(pubsub.listen())
            while True:
                try:
                    message = await asyncio.wait_for(anext(listener), timeout=IDLE_TIMEOUT_SECONDS)
                except StopAsyncIteration:
                    break
                except TimeoutError:
                    logger.error(
                        "A2A execute: no events for %.0fs, presuming worker dead: task_id=%s",
                        IDLE_TIMEOUT_SECONDS,
                        task_id,
                    )
                    error_text = (
                        f"no events from the agent worker for {IDLE_TIMEOUT_SECONDS:.0f}s; "
                        "run presumed dead"
                    )
                    break

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

                # "data" carries the full AG-UI event as a JSON string (see
                # utils/streaming.py's envelope) — parse it for the payload.
                if event_type == "TEXT_MESSAGE_CONTENT":
                    payload = json.loads(event.get("data") or "{}")
                    answer_parts.append(payload.get("delta", ""))
                elif event_type == "RUN_ERROR":
                    payload = json.loads(event.get("data") or "{}")
                    error_text = payload.get("message") or "agent error"
                    break
                elif event_type == "RUN_FINISHED":
                    break
        finally:
            await pubsub.unsubscribe(f"stream:{task_id}")
            await pubsub.close()

        if error_text:
            # failed: maps from the AG-UI RUN_ERROR terminal event.
            await event_queue.enqueue_event(
                _status_event(task_id, thread_id, TaskState.TASK_STATE_FAILED, text=error_text)
            )
        else:
            # completed: maps from the AG-UI RUN_FINISHED terminal event.
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
