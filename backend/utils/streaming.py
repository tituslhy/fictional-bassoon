"""Convert LangGraph agent events into AG-UI protocol event dicts.

Emits ``{"event": <AG-UI EventType value>, "data": <event JSON>}`` dicts,
one per AG-UI event, ready to be published as-is via ``publish_event`` and
re-emitted as SSE in ``main.py``. See ``.claude/rules/protocol-version-pinning.md``
for the pinned ``ag-ui-protocol`` version and where its event vocabulary was
verified from.
"""

import json
import logging
import traceback
import uuid
from collections.abc import AsyncGenerator

from ag_ui.core.events import (
    BaseEvent,
    CustomEvent,
    ReasoningMessageContentEvent,
    ReasoningMessageEndEvent,
    ReasoningMessageStartEvent,
    RunErrorEvent,
    RunFinishedEvent,
    RunFinishedSuccessOutcome,
    RunStartedEvent,
    StepFinishedEvent,
    StepStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)
from langchain.messages import AIMessage, AIMessageChunk, AnyMessage, ToolMessage
from langfuse import Langfuse
from langfuse.langchain import CallbackHandler

from utils.a2ui import A2UIValidationError, build_stream_tree, validate_component_tree

logger = logging.getLogger("backend")

# Initialize a global Langfuse client (singleton).
# It manages its own background worker threads for batching and uploading traces.
langfuse_client = Langfuse()


class _RunState:
    """Per-run bookkeeping needed to bracket AG-UI start/content/end events.

    LangGraph's ``messages`` stream mode yields token-level deltas with no
    inherent "message boundary" signal of its own; the matching ``updates``
    entry (the completed message) is what tells us a message/tool call/step
    is finished. This class holds just enough state, scoped to a single
    ``stream_agent_events`` call, to pair start/content deltas with their end.
    """

    def __init__(self) -> None:
        self.current_step: str | None = None
        self.text_message_id: str | None = None
        self.reasoning_message_id: str | None = None
        # tool_call_id -> True once TOOL_CALL_START has been emitted for it
        self.started_tool_calls: dict[str, bool] = {}
        # tool_call chunk index -> tool_call_id, to resolve continuation
        # chunks that carry an index but not an id.
        self.tool_call_index_to_id: dict[int, str] = {}
        # Running 4-type A2UI tree (emitted as CUSTOM name=a2ui).
        self.a2ui_reasoning: str = ""
        self.a2ui_answer: str = ""
        self.a2ui_streaming: bool = False
        self.a2ui_tool_calls: list[dict[str, str]] = []


def _to_dict(event: BaseEvent) -> dict:
    """Wrap an AG-UI event into the ``{"event": ..., "data": ...}`` envelope."""
    return {"event": event.type.value, "data": event.model_dump_json(by_alias=True)}


async def stream_agent_events(agent, request) -> AsyncGenerator[dict, None]:
    """Stream all agent events as AG-UI protocol event dicts.

    Uses LangGraph's ``astream`` with ``stream_mode=["messages", "updates"]``
    and ``version="v2"`` (non-negotiable per ``streaming-patterns.md``) and
    converts each chunk into one or more AG-UI events (``RUN_STARTED``,
    ``STEP_STARTED``/``STEP_FINISHED``, ``TEXT_MESSAGE_*``,
    ``REASONING_MESSAGE_*``, ``TOOL_CALL_*``) plus ``CUSTOM`` frames
    (``name: "a2ui"``, nested 4-type tree in ``value``) after each
    tree-mutating event. Emits ``RUN_FINISHED`` when the agent completes
    successfully, or ``RUN_ERROR`` on exception (not both —
    ``RUN_ERROR`` is a terminal outcome in its own right). The last ``CUSTOM``
    before ``RUN_FINISHED`` has markdown ``streaming: false``.
    """
    # langfuse v3+/v4 CallbackHandler takes no per-trace kwargs; request-specific
    # session and metadata are propagated via the langfuse_-prefixed keys in the
    # LangChain config metadata below, and the trace name via run_name.
    langfuse_handler = CallbackHandler()

    config = {
        "configurable": {"thread_id": request.thread_id},
        "callbacks": [langfuse_handler],
        "run_name": "deep_agent_chat",
        "metadata": {
            "langfuse_session_id": request.thread_id,
            "job_id": request.job_id,
        },
    }
    input_messages = {"messages": [{"role": "user", "content": request.message}]}

    # AG-UI's run_id identifies this run within thread_id; job_id already
    # serves exactly that purpose (unique per /chat invocation), so it is
    # reused rather than minting a second, parallel ID system (see
    # citus-thread-id-integrity.md).
    run_id = request.job_id
    thread_id = request.thread_id
    state = _RunState()
    errored = False

    logger.info("streaming agent events for thread_id=%s", thread_id)

    yield _to_dict(RunStartedEvent(thread_id=thread_id, run_id=run_id))
    state.a2ui_streaming = True

    try:
        async for chunk in agent.astream(
            input_messages,
            config=config,
            stream_mode=["messages", "updates"],
            subgraphs=True,
            version="v2",
        ):
            if chunk["type"] == "messages":
                token, metadata = chunk["data"]

                if agent_name := metadata.get("lc_agent_name"):
                    if agent_name != state.current_step:
                        if state.current_step is not None:
                            yield _to_dict(StepFinishedEvent(step_name=state.current_step))
                        state.current_step = agent_name
                        yield _to_dict(StepStartedEvent(step_name=agent_name))

                if isinstance(token, AIMessageChunk):
                    for e in _handle_message_chunk(token, state):
                        yield e

            elif chunk["type"] == "updates":
                for source, update in chunk["data"].items():
                    if source in ("model", "tools"):
                        messages = update.get("messages") if isinstance(update, dict) else None
                        if not messages:
                            continue
                        for e in _handle_completed_message(messages[-1], state):
                            yield e

    except Exception as exc:
        errored = True
        logger.error("agent streaming error: %s", exc)
        logger.error(traceback.format_exc())
        # Close any open message/step BEFORE the terminal event — RUN_ERROR
        # ends the run, so nothing may follow it on the stream.
        for e in _close_open_streams(state):
            yield e
        yield _to_dict(RunErrorEvent(message=str(exc) or type(exc).__name__))

    finally:
        if not errored:
            # Close out any message/tool-call/step still open (defensive — the
            # happy path closes these via the matching "updates" chunk).
            for e in _close_open_streams(state):
                yield e
            state.a2ui_streaming = False
            custom = _a2ui_custom_event(state)
            if custom is not None:
                yield custom
            yield _to_dict(
                RunFinishedEvent(
                    thread_id=thread_id,
                    run_id=run_id,
                    outcome=RunFinishedSuccessOutcome(),
                )
            )


def _a2ui_custom_event(state: _RunState) -> dict | None:
    """Serialize the running 4-type tree as AG-UI ``CUSTOM`` ``name=a2ui``.

    Returns ``None`` (and logs) if the tree fails validation — the AG-UI
    text/tool stream still goes out; a bad tree must not kill the run.
    Verified against installed ``ag-ui-protocol==0.1.21`` ``CustomEvent``:
    required fields are ``name: str`` and ``value: Any``.
    """
    try:
        tree = validate_component_tree(
            build_stream_tree(
                reasoning=state.a2ui_reasoning,
                answer=state.a2ui_answer,
                tool_calls=state.a2ui_tool_calls,
                streaming=state.a2ui_streaming,
            )
        )
    except A2UIValidationError:
        logger.warning("skipping invalid A2UI CUSTOM tree", exc_info=True)
        return None
    return _to_dict(CustomEvent(name="a2ui", value=tree))


def _ensure_a2ui_tool_call(state: _RunState, tool_call_id: str, name: str) -> None:
    for tc in state.a2ui_tool_calls:
        if tc["id"] == tool_call_id:
            if name and not tc.get("name"):
                tc["name"] = name
            return
    state.a2ui_tool_calls.append({"id": tool_call_id, "name": name, "args": ""})


def _append_a2ui_tool_args(state: _RunState, tool_call_id: str, delta: str) -> None:
    for tc in state.a2ui_tool_calls:
        if tc["id"] == tool_call_id:
            tc["args"] = (tc.get("args") or "") + delta
            return


def _set_a2ui_tool_result(state: _RunState, tool_call_id: str, content: str) -> None:
    for tc in state.a2ui_tool_calls:
        if tc["id"] == tool_call_id:
            tc["result"] = content
            return
    state.a2ui_tool_calls.append({"id": tool_call_id, "name": "", "args": "", "result": content})


def _close_open_streams(state: _RunState) -> list[dict]:
    """End events for any text/reasoning message or step still open."""
    events: list[dict] = []
    if state.text_message_id is not None:
        events.append(_to_dict(TextMessageEndEvent(message_id=state.text_message_id)))
        state.text_message_id = None
    if state.reasoning_message_id is not None:
        events.append(_to_dict(ReasoningMessageEndEvent(message_id=state.reasoning_message_id)))
        state.reasoning_message_id = None
    if state.current_step is not None:
        events.append(_to_dict(StepFinishedEvent(step_name=state.current_step)))
        state.current_step = None
    return events


def _handle_message_chunk(token: AIMessageChunk, state: _RunState) -> list[dict]:
    """Extract reasoning, text, and tool-call events from an AIMessageChunk."""
    events: list[dict] = []

    # Safely handle content_blocks if present (standard for reasoning models
    # in this project) — reasoning content is read from content_blocks and
    # NEVER from additional_kwargs, per streaming-patterns.md.
    content_blocks = getattr(token, "content_blocks", [])
    for block in content_blocks:
        if block.get("type") == "reasoning":
            delta = block.get("reasoning", "")
            if not delta:
                continue
            if state.reasoning_message_id is None:
                state.reasoning_message_id = str(uuid.uuid4())
                events.append(
                    _to_dict(
                        ReasoningMessageStartEvent(
                            message_id=state.reasoning_message_id, role="reasoning"
                        )
                    )
                )
            events.append(
                _to_dict(
                    ReasoningMessageContentEvent(message_id=state.reasoning_message_id, delta=delta)
                )
            )
            state.a2ui_reasoning += delta
            custom = _a2ui_custom_event(state)
            if custom is not None:
                events.append(custom)

    if token.text:
        if state.text_message_id is None:
            state.text_message_id = str(uuid.uuid4())
            events.append(_to_dict(TextMessageStartEvent(message_id=state.text_message_id)))
        events.append(
            _to_dict(TextMessageContentEvent(message_id=state.text_message_id, delta=token.text))
        )
        state.a2ui_answer += token.text
        custom = _a2ui_custom_event(state)
        if custom is not None:
            events.append(custom)

    if token.tool_call_chunks:
        for tc in token.tool_call_chunks:
            index = tc.get("index")
            tc_id = tc.get("id")
            if tc_id and index is not None:
                state.tool_call_index_to_id[index] = tc_id
            resolved_id = tc_id or (
                state.tool_call_index_to_id.get(index) if index is not None else None
            )
            if not resolved_id:
                continue

            if resolved_id not in state.started_tool_calls:
                state.started_tool_calls[resolved_id] = True
                tool_name = tc.get("name") or ""
                events.append(
                    _to_dict(
                        ToolCallStartEvent(
                            tool_call_id=resolved_id,
                            tool_call_name=tool_name,
                        )
                    )
                )
                _ensure_a2ui_tool_call(state, resolved_id, tool_name)
                custom = _a2ui_custom_event(state)
                if custom is not None:
                    events.append(custom)

            args_delta = tc.get("args")
            if args_delta:
                events.append(
                    _to_dict(ToolCallArgsEvent(tool_call_id=resolved_id, delta=args_delta))
                )
                _append_a2ui_tool_args(state, resolved_id, args_delta)
                custom = _a2ui_custom_event(state)
                if custom is not None:
                    events.append(custom)

    return events


def _handle_completed_message(message: AnyMessage, state: _RunState) -> list[dict]:
    """Extract terminal events for a completed AIMessage or ToolMessage.

    Closes the text/reasoning message (if one was open) and any tool calls
    the completed AIMessage carries, then emits TOOL_CALL_RESULT for a
    completed ToolMessage.
    """
    events: list[dict] = []

    if isinstance(message, AIMessage):
        if state.text_message_id is not None:
            events.append(_to_dict(TextMessageEndEvent(message_id=state.text_message_id)))
            state.text_message_id = None
        if state.reasoning_message_id is not None:
            events.append(_to_dict(ReasoningMessageEndEvent(message_id=state.reasoning_message_id)))
            state.reasoning_message_id = None

        if message.tool_calls:
            for tc in message.tool_calls:
                tc_id = tc.get("id") or ""
                if tc_id not in state.started_tool_calls:
                    # Fallback for non-streaming providers: no TOOL_CALL_START/ARGS
                    # chunks arrived, so emit the full call in one shot.
                    args: str | dict = tc["args"]
                    if isinstance(args, dict):
                        args = json.dumps(args)
                    state.started_tool_calls[tc_id] = True
                    events.append(
                        _to_dict(ToolCallStartEvent(tool_call_id=tc_id, tool_call_name=tc["name"]))
                    )
                    _ensure_a2ui_tool_call(state, tc_id, tc["name"])
                    custom = _a2ui_custom_event(state)
                    if custom is not None:
                        events.append(custom)
                    events.append(_to_dict(ToolCallArgsEvent(tool_call_id=tc_id, delta=args)))
                    _append_a2ui_tool_args(state, tc_id, args)
                    custom = _a2ui_custom_event(state)
                    if custom is not None:
                        events.append(custom)

                events.append(_to_dict(ToolCallEndEvent(tool_call_id=tc_id)))
                state.started_tool_calls.pop(tc_id, None)

    if isinstance(message, ToolMessage):
        content = message.content
        if not isinstance(content, str):
            content = json.dumps(content)

        events.append(
            _to_dict(
                ToolCallResultEvent(
                    message_id=str(uuid.uuid4()),
                    tool_call_id=message.tool_call_id,
                    content=content,
                )
            )
        )
        _set_a2ui_tool_result(state, message.tool_call_id, content)
        custom = _a2ui_custom_event(state)
        if custom is not None:
            events.append(custom)

    return events
