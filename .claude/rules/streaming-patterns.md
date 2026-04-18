# LangGraph Streaming Patterns

## Non-negotiable API contract

- stream_mode=["messages", "updates"]
- version="v2"
- subgraphs=True
- Reasoning content lives in content_blocks — NEVER in additional_kwargs
- additional_kwargs must never be used for reasoning content

## Event types emitted by streaming.py

- reasoning — thinking tokens
- tool_call — tool invocation
- tool_result — tool response
- answer — final response tokens
- agent — agent state updates
- error — error events
- done — stream termination signal

## Why this matters

LangGraph's streaming API changes frequently. These patterns reflect
the current working implementation. Do not revert to older patterns
even if they appear in documentation or examples.
