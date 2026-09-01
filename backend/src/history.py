"""Hydrate chat transcript from the LangGraph Postgres checkpointer.

Maps checkpoint ``HumanMessage`` / ``AIMessage`` / ``ToolMessage`` objects onto
the ``HistoryMessage`` shape the frontend already uses (``ThreadMessage``).
Does **not** live in ``src/models/`` (models are Pydantic only) and does **not**
call ``create_agent()`` / ``get_agent()`` (that would init the LLM + Tavily).
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from langchain.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.messages import BaseMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from src.models.chat_models import HistoryMessage, HistoryToolCall

logger = logging.getLogger("backend")


def message_text(message: Any) -> str:
    """Flatten a LangChain message's ``content`` into a single string."""
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                block_type = block.get("type")
                if block_type in ("text", "output_text") and "text" in block:
                    parts.append(str(block["text"]))
        return "".join(parts)
    if content is None:
        return ""
    return str(content)


def _message_id(message: Any) -> str:
    raw = getattr(message, "id", None)
    if raw:
        return str(raw)
    return str(uuid.uuid4())


def _tool_calls_from_ai(message: AIMessage) -> list[HistoryToolCall]:
    calls: list[HistoryToolCall] = []
    for tc in message.tool_calls or []:
        raw_args: Any = tc.get("args", "")
        if isinstance(raw_args, str):
            args = raw_args
        else:
            args = json.dumps(raw_args)
        calls.append(
            HistoryToolCall(
                id=str(tc.get("id") or uuid.uuid4()),
                name=str(tc.get("name") or "unknown"),
                args=args,
                expanded=False,
            )
        )
    return calls


def _attach_tool_result(messages: list[HistoryMessage], tool_message: ToolMessage) -> None:
    """Merge a ``ToolMessage`` into the matching ``toolCalls`` entry on the
    most recent assistant turn. Tool loops become ``tool_call`` nodes on that
    turn rather than standalone transcript rows.
    """
    tool_call_id = getattr(tool_message, "tool_call_id", None)
    result = message_text(tool_message)
    if not tool_call_id:
        return
    for prev in reversed(messages):
        if prev.role != "assistant":
            continue
        for tc in prev.tool_calls:
            if tc.id == tool_call_id:
                tc.result = result
                return
        return


def checkpoint_messages_to_history(raw: list[Any] | None) -> list[HistoryMessage]:
    """Convert checkpoint channel ``messages`` into ``HistoryMessage`` rows.

    Live reasoning tokens from the original SSE tape are not in the
    checkpointer — ``reasoning`` is left empty. Tool results ride on the
    assistant turn that issued the call.
    """
    out: list[HistoryMessage] = []
    if not raw:
        return out

    for item in raw:
        if isinstance(item, HumanMessage):
            out.append(
                HistoryMessage(
                    id=_message_id(item),
                    role="user",
                    content=message_text(item),
                    tool_calls=[],
                    status="done",
                )
            )
        elif isinstance(item, AIMessage):
            out.append(
                HistoryMessage(
                    id=_message_id(item),
                    role="assistant",
                    content=message_text(item),
                    reasoning="",
                    tool_calls=_tool_calls_from_ai(item),
                    status="done",
                )
            )
        elif isinstance(item, ToolMessage):
            _attach_tool_result(out, item)
        elif isinstance(item, BaseMessage):
            # Unknown LangChain message type — skip rather than invent a role.
            logger.debug("skipping unsupported checkpoint message type %s", type(item).__name__)
        else:
            logger.debug("skipping non-message checkpoint entry %s", type(item).__name__)

    return out


async def load_checkpoint_messages(pool, thread_id: str) -> list[Any]:
    """Read the latest checkpoint's ``messages`` channel for ``thread_id``.

    Uses a short-lived ``AsyncPostgresSaver`` on the existing FastAPI pool —
    no ``setup()``, no agent construction. Missing checkpoint → empty list.
    """
    saver = AsyncPostgresSaver(pool)
    config: dict[str, Any] = {"configurable": {"thread_id": thread_id}}
    tup = await saver.aget_tuple(config)  # type: ignore[arg-type]
    if tup is None:
        return []
    checkpoint = tup.checkpoint or {}
    values = checkpoint.get("channel_values") or {}
    messages = values.get("messages") or []
    return list(messages)
