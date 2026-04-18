# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

fictional-bassoon is a FastAPI backend that exposes a streaming Deep Agent endpoint. An AI agent (built with LangGraph/LangChain) streams all token types—reasoning, tool calls, tool results, and final answer—as Server-Sent Events (SSE).

## Codebase Structure

```
fictional-bassoon/
├── backend/
│   ├── main.py            # FastAPI app: /chat (SSE) and /health endpoints
│   ├── streaming.py       # SSE streaming utilities: converts LangGraph agent events to ServerSentEvent objects
│   ├── models.py          # Pydantic models (ChatRequest with message + thread_id)
│   ├── notebooks/
│   │   └── test_stream.ipynb  # Interactive testing notebook
│   ├── pyproject.toml     # UV-managed deps: deepagents, fastapi, langchain, langgraph, uvicorn
│   ├── uv.lock
│   └── .env               # TAVILY_API_KEY, OPENAI_API_KEY, LANGSMITH_*
└── frontend/              # (empty)
```

### Key Architecture

- `main.py` mounts the FastAPI app with a `/chat` POST endpoint that yields `ServerSentEvent` objects via `EventSourceResponse`.
- `streaming.py` uses LangGraph's `astream()` with `stream_mode=["messages", "updates"]` and `subgraphs=True` to emit typed SSE events: `reasoning`, `tool_call`, `tool_result`, `answer`, `agent`, `error`, `done`.
- `models.py` defines `ChatRequest` (message: str, thread_id: str) for the request payload.
- The agent is instantiated via `get_agent()` from the `deepagents` package.

## Development Commands

```bash
# Enter backend directory
cd backend

# Install dependencies (requires UV: https://github.com/astral-sh/uv)
uv sync

# Run the dev server
uvicorn main:app --reload

# Run the testing notebook manually
# Open backend/notebooks/test_stream.ipynb in an IDE or Jupyter
```

## Dependencies

- Python 3.13 (set in `.python-version`)
- Package manager: **uv** (see `uv.lock`)
- Core deps: `deepagents>=0.5.3`, `fastapi>=0.136.0`, `langchain>=1.2.15`, `langgraph>=1.1.8`, `uvicorn[standard]>=0.44.0`
