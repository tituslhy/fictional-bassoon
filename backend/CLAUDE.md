# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Python 3.13 FastAPI backend that runs a Deep Agent (powered by LangGraph + DeepAgents) with GPT-5.4-Nano and Tavily search. The single POST endpoint streams reasoning tokens, tool calls, and answer text via Server-Sent Events.

## Structure

```
pyproject.toml    # Dependencies (FastAPI, deepagents, langchain, langgraph, uvicorn)
uv.lock           # PDM lock file
main.py           # App entry point — lifespan, routes, ChatRequest model
agent.py          # create_agent() — builds the Deep Agent with model + tools
streaming.py      # stream_agent_response() — multi-mode SSE generator
.env.example      # Required env vars: OPENAI_API_KEY, TAVILY_API_KEY
```

## Commands

```bash
# Install dependencies (uses PDM)
pdm install

# Run the dev server
uvicorn main:app --reload

# Or start via Python
python main.py

# Check linting/type checking (Ruff is configured)
ruff check .
```

## Architecture

- **lifespan** (main.py): Creates the Deep Agent once on startup, stores it on `app.state.agent`.
- **create_agent** (agent.py): Wraps `deepagents.create_deep_agent()` with `init_chat_model("gpt-5.4-nano")` and `TavilySearch(5)`.
- **stream_agent_response** (streaming.py): Subscribes to `["updates", "messages", "custom"]` with `subgraphs=True, version="v2"`. Emits SSE events with unique IDs for `Last-Event-ID` reconnection.
- **POST /ask** (main.py): Accepts `ChatRequest{query, conv_id}`, delegates to `stream_agent_response`.
- **GET /health**: Simple liveness check.

## SSE Event Types

| Event | Payload |
|-------|---------|
| `message` | `[main] step: model_request` |
| `reasoning` | Model's internal reasoning text |
| `tool_call_start` | `{"tool": "...", "source": "..."}` |
| `tool_call_args` | `{"args": "...", "source": "..."}` |
| `tool_call_complete` | `{"tool": "...", "args": "...", "source": "..."}` |
| `answer_start` | `{"source": "..."}` |
| `answer` | Raw text token |
| `custom` | Subagent progress event |
| `answer_end` | `{}` (sentinel) |

## Key Patterns

- Every module is intentionally thin — no business logic in `main.py`.
- Streaming uses FastAPI's native `EventSourceResponse` + `ServerSentEvent` (not manual SSE formatting).
- Conversation state is stored via `InMemorySaver` keyed by `thread_id` in the LangGraph config.
- The `event` field on each `ServerSentEvent` lets the client dispatch by type via `EventSource.addEventListener`.
