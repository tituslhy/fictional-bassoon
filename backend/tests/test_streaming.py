import json
from unittest.mock import MagicMock, patch

import pytest
from langchain.messages import AIMessage, AIMessageChunk, ToolMessage

from utils.a2ui import A2UIValidationError
from utils.streaming import (
    _a2ui_custom_event,
    _append_a2ui_tool_args,
    _ensure_a2ui_tool_call,
    _RunState,
    _set_a2ui_tool_result,
    stream_agent_events,
)


def _event_types(events):
    return [e["event"] for e in events]


def _without_custom(events):
    return [e["event"] for e in events if e["event"] != "CUSTOM"]


def _custom_payloads(events):
    return [json.loads(e["data"]) for e in events if e["event"] == "CUSTOM"]


@pytest.mark.asyncio
async def test_stream_agent_events_basic():
    # Mock request
    request = MagicMock()
    request.thread_id = "test_thread"
    request.job_id = "test_job"
    request.message = "hello"

    # Mock agent
    agent = MagicMock()

    # Create mock chunks for astream
    async def mock_astream(*args, **kwargs):
        # Chunk 1: Agent handoff
        yield {
            "type": "messages",
            "data": (AIMessageChunk(content=""), {"lc_agent_name": "worker_agent"}),
        }
        # Chunk 2: Reasoning
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(
                    content="", content_blocks=[{"type": "reasoning", "reasoning": "I am thinking"}]
                ),
                {},
            ),
        }
        # Chunk 3: Answer tokens
        yield {"type": "messages", "data": (AIMessageChunk(content="Hello"), {})}
        yield {"type": "messages", "data": (AIMessageChunk(content=" world"), {})}
        # Chunk 4: Updates with completed message (Tool Call)
        yield {
            "type": "updates",
            "data": {
                "model": {
                    "messages": [
                        AIMessage(
                            content="",
                            tool_calls=[
                                {"name": "get_weather", "args": {"city": "London"}, "id": "call_1"}
                            ],
                        )
                    ]
                }
            },
        }

    agent.astream = mock_astream

    events = []
    async for event in stream_agent_events(agent, request):
        events.append(event)

    assert _without_custom(events) == [
        "RUN_STARTED",
        "STEP_STARTED",
        "REASONING_MESSAGE_START",
        "REASONING_MESSAGE_CONTENT",
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END",
        "REASONING_MESSAGE_END",
        "TOOL_CALL_START",
        "TOOL_CALL_ARGS",
        "TOOL_CALL_END",
        "STEP_FINISHED",
        "RUN_FINISHED",
    ]

    customs = _custom_payloads(events)
    assert customs, "expected CUSTOM a2ui frames after tree-mutating events"
    assert all(c["type"] == "CUSTOM" and c["name"] == "a2ui" for c in customs)
    last_tree = customs[-1]["value"]
    assert last_tree["component"] == "column"
    markdown = next(c for c in last_tree["children"] if c["component"] == "markdown")
    assert markdown["streaming"] is False
    assert "Hello" in markdown["text"]

    run_started = json.loads(events[0]["data"])
    assert run_started["threadId"] == "test_thread"
    assert run_started["runId"] == "test_job"

    def _payload(event_type: str) -> dict:
        return json.loads(next(e["data"] for e in events if e["event"] == event_type))

    step_started = _payload("STEP_STARTED")
    assert step_started["stepName"] == "worker_agent"

    reasoning_content = _payload("REASONING_MESSAGE_CONTENT")
    assert reasoning_content["delta"] == "I am thinking"

    text_deltas = [
        json.loads(e["data"])["delta"] for e in events if e["event"] == "TEXT_MESSAGE_CONTENT"
    ]
    assert text_deltas == ["Hello", " world"]

    tool_call_start = _payload("TOOL_CALL_START")
    assert tool_call_start["toolCallId"] == "call_1"
    assert tool_call_start["toolCallName"] == "get_weather"

    tool_call_args = _payload("TOOL_CALL_ARGS")
    assert tool_call_args["toolCallId"] == "call_1"
    assert json.loads(tool_call_args["delta"]) == {"city": "London"}

    run_finished = json.loads(events[-1]["data"])
    assert events[-1]["event"] == "RUN_FINISHED"
    assert run_finished["threadId"] == "test_thread"
    assert run_finished["runId"] == "test_job"
    assert run_finished["outcome"]["type"] == "success"


@pytest.mark.asyncio
async def test_stream_agent_events_error():
    request = MagicMock()
    request.thread_id = "test_thread"
    request.job_id = "test_job"
    request.message = "hello"

    agent = MagicMock()

    async def mock_astream_error(*args, **kwargs):
        yield {"type": "messages", "data": (AIMessageChunk(content="Starting"), {})}
        raise ValueError("Something went wrong")
        yield {
            "type": "messages",
            "data": (AIMessageChunk(content="Never"), {}),
        }  # Should not reach

    agent.astream = mock_astream_error

    events = []
    async for event in stream_agent_events(agent, request):
        events.append(event)

    # Open messages are closed BEFORE the terminal RUN_ERROR — nothing may
    # follow the terminal event on the stream.
    assert _without_custom(events) == [
        "RUN_STARTED",
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END",
        "RUN_ERROR",
    ]

    text_content = json.loads(
        next(e["data"] for e in events if e["event"] == "TEXT_MESSAGE_CONTENT")
    )
    assert text_content["delta"] == "Starting"

    run_error = json.loads(events[-1]["data"])
    assert "Something went wrong" in run_error["message"]

    # No RUN_FINISHED after a RUN_ERROR — it's a terminal outcome on its own.
    assert "RUN_FINISHED" not in _event_types(events)


@pytest.mark.asyncio
async def test_stream_tool_call_chunks_and_orphan_result():
    request = MagicMock()
    request.thread_id = "t"
    request.job_id = "j"
    request.message = "search"

    agent = MagicMock()

    async def mock_astream(*args, **kwargs):
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(
                    content="",
                    tool_call_chunks=[
                        {"id": "call_9", "name": "tavily_search", "args": '{"q":', "index": 0}
                    ],
                ),
                {},
            ),
        }
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(
                    content="",
                    tool_call_chunks=[{"id": None, "name": None, "args": '"hi"}', "index": 0}],
                ),
                {},
            ),
        }
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(
                    content="",
                    tool_call_chunks=[{"id": None, "name": "skip", "args": "{}", "index": None}],
                ),
                {},
            ),
        }
        yield {
            "type": "updates",
            "data": {
                "tools": {
                    "messages": [
                        ToolMessage(content={"hits": 1}, tool_call_id="call_9"),
                    ]
                }
            },
        }
        yield {
            "type": "updates",
            "data": {
                "tools": {
                    "messages": [
                        ToolMessage(content="late", tool_call_id="orphan"),
                    ]
                }
            },
        }
        yield {"type": "updates", "data": {"model": "not-a-dict"}}
        yield {"type": "updates", "data": {"model": {"messages": []}}}
        yield {"type": "updates", "data": {"other": {"messages": [AIMessage(content="x")]}}}

    agent.astream = mock_astream

    events = []
    async for event in stream_agent_events(agent, request):
        events.append(event)

    types = _without_custom(events)
    assert "TOOL_CALL_START" in types
    assert "TOOL_CALL_ARGS" in types
    assert "TOOL_CALL_RESULT" in types
    assert types[-1] == "RUN_FINISHED"

    args_deltas = [json.loads(e["data"])["delta"] for e in events if e["event"] == "TOOL_CALL_ARGS"]
    assert "".join(args_deltas) == '{"q":"hi"}'

    customs = _custom_payloads(events)
    last_tree = customs[-1]["value"]
    tool_nodes = [
        c
        for col in last_tree["children"]
        if col["component"] == "column"
        for c in col.get("children", [])
        if c["component"] == "tool_call"
    ]
    ids = {n["id"] for n in tool_nodes}
    assert "tool-call-call_9" in ids
    assert "tool-call-orphan" in ids


@pytest.mark.asyncio
async def test_stream_step_switch_and_reasoning_error_closes_open():
    request = MagicMock()
    request.thread_id = "t"
    request.job_id = "j"
    request.message = "hi"

    agent = MagicMock()

    async def mock_astream(*args, **kwargs):
        yield {
            "type": "messages",
            "data": (AIMessageChunk(content=""), {"lc_agent_name": "worker_a"}),
        }
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(
                    content="",
                    content_blocks=[{"type": "reasoning", "reasoning": "hmm"}],
                ),
                {"lc_agent_name": "worker_b"},
            ),
        }
        raise RuntimeError("boom")

    agent.astream = mock_astream

    events = []
    async for event in stream_agent_events(agent, request):
        events.append(event)

    types = _without_custom(events)
    assert types[0] == "RUN_STARTED"
    assert "STEP_STARTED" in types
    assert "STEP_FINISHED" in types
    assert "REASONING_MESSAGE_START" in types
    assert "REASONING_MESSAGE_END" in types
    assert types[-1] == "RUN_ERROR"
    assert "RUN_FINISHED" not in types


@pytest.mark.asyncio
async def test_empty_reasoning_block_is_skipped():
    request = MagicMock()
    request.thread_id = "t"
    request.job_id = "j"
    request.message = "hi"

    agent = MagicMock()

    async def mock_astream(*args, **kwargs):
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(content="", content_blocks=[{"type": "reasoning", "reasoning": ""}]),
                {},
            ),
        }
        yield {"type": "messages", "data": (AIMessageChunk(content="ok"), {})}

    agent.astream = mock_astream
    events = []
    async for event in stream_agent_events(agent, request):
        events.append(event)
    assert "REASONING_MESSAGE_START" not in _without_custom(events)
    assert "TEXT_MESSAGE_CONTENT" in _without_custom(events)


@pytest.mark.asyncio
async def test_stream_agent_events_config_is_langsmith_metadata_not_langfuse():
    request = MagicMock()
    request.thread_id = "thread-ls"
    request.job_id = "job-ls"
    request.message = "hi"

    captured: dict = {}

    async def mock_astream(*args, **kwargs):
        captured["config"] = kwargs.get("config") or (args[1] if len(args) > 1 else None)
        if False:
            yield None

    agent = MagicMock()
    agent.astream = mock_astream

    events = [event async for event in stream_agent_events(agent, request)]
    assert events[0]["event"] == "RUN_STARTED"
    assert events[-1]["event"] == "RUN_FINISHED"

    config = captured["config"]
    assert config["run_name"] == "deep_agent_chat"
    assert config["configurable"]["thread_id"] == "thread-ls"
    assert config["metadata"]["thread_id"] == "thread-ls"
    assert config["metadata"]["job_id"] == "job-ls"
    assert config["metadata"]["session_id"] == "thread-ls"
    assert "callbacks" not in config
    assert "langfuse_session_id" not in config["metadata"]


def test_a2ui_helpers_cover_edge_branches():
    state = _RunState()
    _append_a2ui_tool_args(state, "missing", "{}")
    assert state.a2ui_tool_calls == []

    _set_a2ui_tool_result(state, "orphan", "ok")
    assert state.a2ui_tool_calls == [{"id": "orphan", "name": "", "args": "", "result": "ok"}]

    _ensure_a2ui_tool_call(state, "orphan", "search")
    assert state.a2ui_tool_calls[0]["name"] == "search"
    _ensure_a2ui_tool_call(state, "orphan", "ignored")
    assert state.a2ui_tool_calls[0]["name"] == "search"

    _ensure_a2ui_tool_call(state, "c2", "other")
    _append_a2ui_tool_args(state, "c2", '{"a":')
    _append_a2ui_tool_args(state, "c2", "1}")
    assert state.a2ui_tool_calls[1]["args"] == '{"a":1}'

    event = _a2ui_custom_event(state)
    assert event is not None
    payload = json.loads(event["data"])
    assert payload["name"] == "a2ui"

    def boom(*_args, **_kwargs):
        raise A2UIValidationError("nope")

    with patch("utils.streaming.validate_component_tree", side_effect=boom):
        assert _a2ui_custom_event(state) is None
