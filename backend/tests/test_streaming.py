import pytest
import json
from unittest.mock import MagicMock
from langchain.messages import AIMessageChunk, AIMessage
from utils.streaming import stream_agent_events

@pytest.mark.asyncio
async def test_stream_agent_events_basic():
    # Mock request
    request = MagicMock()
    request.thread_id = "test_thread"
    request.message = "hello"

    # Mock agent
    agent = MagicMock()
    
    # Create mock chunks for astream
    async def mock_astream(*args, **kwargs):
        # Chunk 1: Agent handoff
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(content=""),
                {"lc_agent_name": "worker_agent"}
            )
        }
        # Chunk 2: Reasoning
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(content="", content_blocks=[{"type": "reasoning", "reasoning": "I am thinking"}]),
                {}
            )
        }
        # Chunk 3: Answer tokens
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(content="Hello"),
                {}
            )
        }
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(content=" world"),
                {}
            )
        }
        # Chunk 4: Updates with completed message (Tool Call)
        yield {
            "type": "updates",
            "data": {
                "model": {
                    "messages": [
                        AIMessage(content="", tool_calls=[{"name": "get_weather", "args": {"city": "London"}, "id": "call_1"}])
                    ]
                }
            }
        }

    agent.astream = mock_astream

    events = []
    async for event in stream_agent_events(agent, request):
        events.append(event)

    assert events[0] == {"event": "agent", "data": "worker_agent"}
    assert events[1] == {"event": "reasoning", "data": "I am thinking"}
    assert events[2] == {"event": "answer", "data": "Hello"}
    assert events[3] == {"event": "answer", "data": " world"}
    
    # The actual implementation stringifies args if it's a dict before JSON dumping the payload
    # See utils/streaming.py _handle_completed_message
    expected_payload = json.dumps({
        "name": "get_weather",
        "args": json.dumps({"city": "London"}),
        "id": "call_1",
    })
    assert events[4] == {"event": "tool_call", "data": expected_payload}
    assert events[-1] == {"event": "done", "data": ""}

@pytest.mark.asyncio
async def test_stream_agent_events_error():
    request = MagicMock()
    request.thread_id = "test_thread"
    request.message = "hello"

    agent = MagicMock()
    
    async def mock_astream_error(*args, **kwargs):
        yield {
            "type": "messages",
            "data": (AIMessageChunk(content="Starting"), {})
        }
        raise ValueError("Something went wrong")
        yield {"type": "messages", "data": (AIMessageChunk(content="Never"), {})} # Should not reach

    agent.astream = mock_astream_error

    events = []
    async for event in stream_agent_events(agent, request):
        events.append(event)

    assert events[0] == {"event": "answer", "data": "Starting"}
    assert events[1]["event"] == "error"
    assert "Something went wrong" in events[1]["data"]
    assert events[2] == {"event": "done", "data": ""}
