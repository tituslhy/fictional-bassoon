"""Convert LangGraph agent events into typed SSE event dicts."""

import json
import logging
from collections.abc import AsyncGenerator
from langchain.messages import AIMessage, AIMessageChunk, AnyMessage, ToolMessage

logger = logging.getLogger("backend")


async def stream_agent_events(agent, request) -> AsyncGenerator[dict, None]:
    """Stream all agent events (reasoning, tool calls, answers) as dicts.

    Uses LangGraph's ``astream`` with ``stream_mode=["messages", "updates"]``
    and ``version="v2"`` to emit typed event dicts.  Emits ``done`` when the
    agent finishes and ``error`` on exception.
    """
    config = {"configurable": {"thread_id": request.thread_id}}
    input_messages = {"messages": [{"role": "user", "content": request.message}]}
    current_agent = None

    logger.info("streaming agent events for thread_id=%s", request.thread_id)

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
                    if agent_name != current_agent:
                        current_agent = agent_name
                        yield {"event": "agent", "data": agent_name}

                if isinstance(token, AIMessageChunk):
                    for e in _handle_message_chunk(token):
                        yield e

            elif chunk["type"] == "updates":
                for source, update in chunk["data"].items():
                    if source in ("model", "tools"):
                        for e in _handle_completed_message(update["messages"][-1]):
                            yield e

    except Exception as exc:
        logger.error("agent streaming error: %s", exc)
        yield {"event": "error", "data": str(exc)}

    finally:
        yield {"event": "done", "data": ""}


def _handle_message_chunk(token: AIMessageChunk):
    """Extract reasoning, answer, and tool_call events from an AIMessageChunk."""
    events = []

    for block in token.content_blocks:
        if block["type"] == "reasoning":
            events.append({"event": "reasoning", "data": block["reasoning"]})

    if token.text:
        events.append({"event": "answer", "data": token.text})

    if token.tool_call_chunks:
        events.append({
            "event": "tool_call",
            "data": _extract_tool_call_info(token),
        })

    return events


def _handle_completed_message(message: AnyMessage):
    """Extract tool_call and tool_result events from a completed AIMessage or ToolMessage."""
    events = []

    if isinstance(message, AIMessage) and message.tool_calls:
        for tc in message.tool_calls:
            payload = json.dumps({"name": tc["name"], "args": tc["args"]})
            events.append({"event": "tool_call", "data": payload})

    if isinstance(message, ToolMessage):
        content = (
            message.content
            if isinstance(message.content, str)
            else json.dumps(message.content)
        )
        events.append({"event": "tool_result", "data": content})

    return events


def _extract_tool_call_info(token: AIMessageChunk) -> str:
    """Build a human-readable ``name(args)`` string from tool call chunk data."""
    parts = []
    for tc in token.tool_call_chunks:
        name = tc.get("name", "")
        args = tc.get("args", "")
        if name:
            parts.append(f"{name}({args})")
        elif args:
            parts.append(args)
    return "".join(parts)
