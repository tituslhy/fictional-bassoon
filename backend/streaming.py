"""
SSE streaming utilities.

Converts LangGraph agent stream events into FastAPI ServerSentEvent objects
using the new LangChain streaming API (version="v2"):
  - stream_mode=["messages", "updates"]
  - subgraphs=True for deep agent subagent tracking

Event types emitted on the SSE stream:
- reasoning:    thinking/scratchpad tokens from content_blocks
- tool_call:    completed tool invocations from AIMessage in updates
- tool_result:  completed tool outputs from ToolMessage in updates
- answer:       final response text chunks from token.text
- agent:        subagent name change (deep agent only)
- error:        any exception during streaming
- done:         stream termination sentinel
"""

import json
from collections.abc import AsyncGenerator

from fastapi.sse import ServerSentEvent
from langchain.messages import AIMessage, AIMessageChunk, AnyMessage, ToolMessage
from langgraph.graph.state import CompiledStateGraph

from models import ChatRequest


async def stream_agent_events(
    agent: CompiledStateGraph,
    request: ChatRequest,
) -> AsyncGenerator[ServerSentEvent, None]:
    """Yield ServerSentEvents for every meaningful event from the agent stream."""
    config = {"configurable": {"thread_id": request.thread_id}}
    input_messages = {"messages": [{"role": "user", "content": request.message}]}
    current_agent: str | None = None

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

                # Emit subagent name changes (deep agents only)
                if agent_name := metadata.get("lc_agent_name"):
                    if agent_name != current_agent:
                        current_agent = agent_name
                        yield ServerSentEvent(data=agent_name, event="agent")

                if isinstance(token, AIMessageChunk):
                    yield from _handle_message_chunk(token)

            elif chunk["type"] == "updates":
                for source, update in chunk["data"].items():
                    if source in ("model", "tools"):
                        yield from _handle_completed_message(update["messages"][-1])

    except Exception as exc:
        yield ServerSentEvent(data=str(exc), event="error")

    finally:
        yield ServerSentEvent(data="", event="done")


def _handle_message_chunk(token: AIMessageChunk) -> list[ServerSentEvent]:
    """Extract reasoning and answer tokens from a streaming AIMessageChunk."""
    events = []

    # Reasoning tokens via content_blocks (new API)
    reasoning_blocks = [b for b in token.content_blocks if b["type"] == "reasoning"]
    for block in reasoning_blocks:
        events.append(ServerSentEvent(data=block["reasoning"], event="reasoning"))

    # Answer text
    if token.text:
        events.append(ServerSentEvent(data=token.text, event="answer"))

    # Tool call deltas (streaming args as they arrive)
    if token.tool_call_chunks:
        events.append(ServerSentEvent(
            data=_extract_tool_call_info(token),
            event="tool_call",
        ))

    return events


def _handle_completed_message(message: AnyMessage) -> list[ServerSentEvent]:
    """Extract completed tool calls and tool results from update events."""
    events = []

    if isinstance(message, AIMessage) and message.tool_calls:
        for tc in message.tool_calls:
            payload = json.dumps({"name": tc["name"], "args": tc["args"]})
            events.append(ServerSentEvent(data=payload, event="tool_call"))

    if isinstance(message, ToolMessage):
        content = (
            message.content
            if isinstance(message.content, str)
            else json.dumps(message.content)
        )
        events.append(ServerSentEvent(data=content, event="tool_result"))

    return events


def _extract_tool_call_info(token: AIMessageChunk) -> str:
    """Extract streaming tool name + args deltas from a chunk."""
    parts = []
    for tc in token.tool_call_chunks:
        name = tc.get("name", "")
        args = tc.get("args", "")
        if name:
            parts.append(f"{name}({args})")
        elif args:
            parts.append(args)
    return "".join(parts)