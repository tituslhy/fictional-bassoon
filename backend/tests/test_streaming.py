import json
from unittest.mock import MagicMock

import pytest
from langchain.messages import AIMessage, AIMessageChunk

from utils.streaming import stream_agent_events


def _event_types(events):
    return [e["event"] for e in events]


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

    assert _event_types(events) == [
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

    run_started = json.loads(events[0]["data"])
    assert run_started["threadId"] == "test_thread"
    assert run_started["runId"] == "test_job"

    step_started = json.loads(events[1]["data"])
    assert step_started["stepName"] == "worker_agent"

    reasoning_content = json.loads(events[3]["data"])
    assert reasoning_content["delta"] == "I am thinking"

    text_content_1 = json.loads(events[5]["data"])
    assert text_content_1["delta"] == "Hello"
    text_content_2 = json.loads(events[6]["data"])
    assert text_content_2["delta"] == " world"

    tool_call_start = json.loads(events[9]["data"])
    assert tool_call_start["toolCallId"] == "call_1"
    assert tool_call_start["toolCallName"] == "get_weather"

    tool_call_args = json.loads(events[10]["data"])
    assert tool_call_args["toolCallId"] == "call_1"
    assert json.loads(tool_call_args["delta"]) == {"city": "London"}

    run_finished = json.loads(events[-1]["data"])
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
    assert _event_types(events) == [
        "RUN_STARTED",
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END",
        "RUN_ERROR",
    ]

    text_content = json.loads(events[2]["data"])
    assert text_content["delta"] == "Starting"

    run_error = json.loads(events[-1]["data"])
    assert "Something went wrong" in run_error["message"]

    # No RUN_FINISHED after a RUN_ERROR — it's a terminal outcome on its own.
    assert "RUN_FINISHED" not in _event_types(events)
