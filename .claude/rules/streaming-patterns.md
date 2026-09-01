# LangGraph Streaming Patterns

## Non-negotiable API contract

- stream_mode=["messages", "updates"]
- version="v2"
- subgraphs=True
- Reasoning content lives in content_blocks — NEVER in additional_kwargs
- additional_kwargs must never be used for reasoning content

## Event types emitted by streaming.py (AG-UI vocabulary)

streaming.py converts LangGraph chunks into AG-UI protocol events
(`ag-ui-protocol==0.1.21` — see protocol-version-pinning.md), emitted as
`{"event": <type>, "data": <camelCase event JSON>}` dicts:

- RUN_STARTED / RUN_FINISHED / RUN_ERROR — run lifecycle; RUN_ERROR is
  terminal on its own (never followed by RUN_FINISHED), and any open
  message/step is closed BEFORE the terminal event
- STEP_STARTED / STEP_FINISHED — agent (LangGraph node) transitions
- REASONING_MESSAGE_START / CONTENT / END — thinking tokens
- TEXT_MESSAGE_START / CONTENT / END — final answer tokens
- TOOL_CALL_START / ARGS / END / RESULT — tool invocation + response

The legacy vocabulary (reasoning / tool_call / tool_result / answer /
agent / error / done) is fully retired — do not reintroduce it.

## Why this matters

LangGraph's streaming API changes frequently. These patterns reflect
the current working implementation. Do not revert to older patterns
even if they appear in documentation or examples.
