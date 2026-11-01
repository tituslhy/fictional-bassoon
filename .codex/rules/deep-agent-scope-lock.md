---
paths:
  - "backend/src/agent.py"
---

# Deep Agent Scope Lock

## Authorized interactive extension — 1 November 2026

The user explicitly approved adding `render_interactive_ui` alongside Tavily and a system prompt that calls it for comparisons and choices. This is the narrow exception to the original single-tool scope below. Keep the model and infrastructure unchanged; do not add unrelated tools.

## Context

`backend/src/agent.py` builds the agent via `create_deep_agent` (from the
`deepagents` package) with a single tool — `TavilySearch(max_results=5)` —
and `init_chat_model(model="openai:gpt-5.4-nano")`. That minimalism is
intentional: the engineering investment in this project is the distributed
pipeline around the agent, not the agent's own reasoning surface.

The agent is constructed through `create_agent()` and `get_agent()`. Treat the implementation as ground truth when verifying this description.

## Hard rules

- This rewrite changes how the agent's output is transported (AG-UI),
  rendered (A2UI), and exposed externally (A2A). It does not change what the
  agent does.
- Do not add tools, expand past the single Tavily tool, restructure the
  graph, or touch `model=` / `temperature=` as a side effect of protocol
  wiring.
- If an AG-UI or A2A requirement seems to force a change to `create_agent()`
  or `get_agent()` itself (not just how their output is consumed), stop and
  flag it to Titus rather than resolving it inline.
