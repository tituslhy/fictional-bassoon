"""Streaming generator for Deep Agent SSE responses."""

from collections.abc import AsyncIterable

from fastapi.sse import ServerSentEvent
from langchain.messages import HumanMessage


# Node types worth surfacing to the client
_INTERESTING_NODES = {"model_request", "tools"}
# Model metadata source keys that indicate reasoning output
_REASONING_SOURCES = {"reasoning", "reasoning_tool"}


async def stream_agent_response(
    agent: object,
    user_input: str,
    config: dict,
) -> AsyncIterable[ServerSentEvent]:
    """Yield SSE events from the agent's multi-mode stream.

    Subscribes to ``updates``, ``messages``, and ``custom`` stream modes
    with ``subgraphs=True`` so subagent events are included.

    Events emitted:
        * ``message``      - agent/subagent node transitions
        * ``reasoning``    - model's internal reasoning text
        * ``tool_call_start``   - name of a tool call being invoked
        * ``tool_call_args``    - streaming arguments for that tool call
        * ``tool_call_complete``- fully-assembled tool call
        * ``answer_start``  - answer stream beginning from a new source
        * ``answer``        - single answer text token
        * ``custom``        - user-defined progress from subagent tools
        * ``answer_end``    - stream finished (sentinel)

    Args:
        agent: The configured Deep Agent instance.
        user_input: The user's prompt text.
        config: LangGraph config dict (e.g. ``{"thread_id": "..."}``).

    Yields:
        ServerSentEvent objects for each streaming chunk.
    """
    # Track whether the last yield was inline text (to avoid mid-line gaps)
    mid_line = False

    # Track which source ("main" or subagent ID) last emitted an answer
    last_source = ""

    # Unique event ID counter
    event_id = 0

    # ── Start the multi-mode stream ────────────────────────────────
    async for chunk in agent.*argsstream(
        {"messages": [HumanMessage(content=user_input)]},
        stream_mode=["updates", "messages", "custom"],
        subgraphs=True,
        version="v2",
        config=config,
    ):
        chunk_type: str = chunk["type"]
        ns: tuple = chunk["ns"]
        data = chunk["data"]

        # Determine if this event came from a subagent
        is_subagent = any(s.startswith("tools:") for s in ns)
        source: str = ns[0].split(":")[1] if is_subagent else "main"

        # ── updates mode: node transitions ──────────────────────────
        if chunk_type == "updates":
            for node_name in data:
                if node_name not in _INTERESTING_NODES:
                    continue
                if mid_line:
                    yield ServerSentEvent(raw_data="\n")
                    mid_line = False
                yield ServerSentEvent(
                    event="message",
                    data=f"[{source}] step: {node_name}",
                    id=str(event_id),
                )
                event_id += 1

        # ── messages mode: tokens and tool calls ────────────────────
        elif chunk_type == "messages":
            token, _meta = data  # type: ignore[assignment]
            token_type: str = getattr(token, "type", "")

            # ── Reasoning tokens ──────────────────────────────────
            reasoning: str | None = None
            if hasattr(token, "reasoning"):
                reasoning = token.reasoning
            elif hasattr(token, "content") and token.content:
                src: str = _meta.get("source", "") if _meta else ""
                if src in _REASONING_SOURCES:
                    reasoning = token.content

            if reasoning:
                yield ServerSentEvent(
                    event="reasoning", data=reasoning, id=str(event_id)
                )
                event_id += 1
                mid_line = False
                last_source = source
                continue

            # ── Tool call args (streaming in chunks) ──────────────
            tc_chunks = getattr(token, "tool_call_chunks", None)
            if tc_chunks:
                for tc in tc_chunks:
                    if tc.get("name") and not mid_line:
                        yield ServerSentEvent(
                            event="tool_call_start",
                            data={"tool": tc["name"], "source": source},
                            id=str(event_id),
                        )
                        event_id += 1
                        mid_line = False
                    if tc.get("args"):
                        yield ServerSentEvent(
                            event="tool_call_args",
                            data={"args": tc["args"], "source": source},
                            id=str(event_id),
                        )
                        event_id += 1

            # ── Tool call results (complete tool delivered back) ───
            if hasattr(token, "tool_calls") and token.tool_calls:
                for tc in token.tool_calls:
                    tc_dict = dict(tc) if not isinstance(tc, dict) else tc
                    name: str = tc_dict.get("name") or tc_dict.get("function_name", "")
                    args: object = tc_dict.get("args") or tc_dict.get(
                        "function_arguments", ""
                    )
                    yield ServerSentEvent(
                        event="tool_call_complete",
                        data={"tool": name, "args": args, "source": source},
                        id=str(event_id),
                    )
                    event_id += 1
                mid_line = False
                continue

            # ── Answer tokens (regular AI text content) ───────────
            if token_type == "ai" and token.content:
                if source != last_source:
                    if mid_line:
                        yield ServerSentEvent(raw_data="\n")
                        mid_line = False
                    yield ServerSentEvent(
                        event="answer_start",
                        data={"source": source},
                        id=str(event_id),
                    )
                    event_id += 1
                yield ServerSentEvent(
                    event="answer", data=token.content, id=str(event_id)
                )
                event_id += 1
                mid_line = True
                last_source = source

        # ── custom mode: user-defined progress events ─────────────
        elif chunk_type == "custom":
            if mid_line:
                yield ServerSentEvent(raw_data="\n")
                mid_line = False
            yield ServerSentEvent(
                event="custom", data=data, id=str(event_id)
            )
            event_id += 1

    # Send a final sentinel so the client knows the stream is complete
    yield ServerSentEvent(
        event="answer_end", data="{}", id=str(event_id)
    )
