# fictional-bassoon

FastAPI SSE streaming backend for a LangGraph Deep Agent, paired with a Next.js chat frontend.

Streams reasoning, tool calls, tool results, and final answer as Server-Sent Events (SSE).
Celery + Redis pub/sub bridges the async worker to the FastAPI response.

## What this is NOT
- Not a monolith — never consolidate logic into one file
- Frontend is already developed in `frontend/`

## Structure
- main.py — FastAPI app entry point, /chat and /health endpoints only (~90 lines)
- src/ — all application modules
  - agent.py — LangGraph agent construction (module-level variable, no factory wrappers)
  - celery_app.py — Celery config (broker, backend)
  - models/chat_models.py — Pydantic request/response models (ChatRequest)
  - queue/redis_pubsub.py — publish_event() and subscribe() helpers for Redis pub/sub bridge
  - worker/tasks.py — Celery task definition, bridges sync Celery context to async
  - worker/worker_runner.py — async agent execution, iterates agent.astream() and publishes to Redis
- utils/streaming.py — LangGraph event conversion to typed SSE dicts
- docker/ — Docker config (Dockerfile, .env.example)
- docker-compose.yaml — compose file
- notebooks/test_stream.ipynb — development notebook for testing streaming
- frontend/ — Next.js chat application

## Request flow

```
POST /chat
  → FastAPI generates job_id (UUID)
  → subscribe to Redis channel "stream:{job_id}"
  → enqueue run_agent_task (Celery)
  → yield SSE events from Redis pub/sub to client
```

```
Celery worker:
  → run_agent_task (sync entry) → run_agent_and_stream() (async)
  → agent.astream() → stream_agent_events() (convert LangGraph events to SSE dicts)
  → publish_event() → Redis pub/sub "stream:{job_id}"
```

## File responsibilities

- main.py — FastAPI app, /chat and /health only, stays thin
- src/agent.py — agent construction as module-level variable, no wrapper functions
- src/streaming.py — LangGraph event conversion to typed SSE dicts
- src/models/chat_models.py — Pydantic models only
- src/celery_app.py — Celery config only
- src/tasks.py — Celery task, bridges sync→async
- src/worker_runner.py — async agent execution, publishes to Redis
- src/redis_pubsub.py — publish_event() and subscribe() helpers only
- frontend/src/hooks/useSSEStream.ts — SSE consumption hook
- frontend/src/components/chat/ — chat UI components
- frontend/src/context/ThreadContext.tsx — thread state management

## Dev Commands

```bash
# Backend
cd backend
uv sync                                          # install deps
uvicorn main:app --reload                        # dev server (port 8000)
celery -A src.celery_app worker --loglevel=info  # required for streaming

# Frontend
cd frontend
npm install                                     # install deps
npm run dev                                     # dev server (port 3000)
```

## Prerequisites

### Services
- RabbitMQ on localhost:5672 (Celery broker)
- Redis on localhost:6379 (pub/sub bridge)
- PostgreSQL (for LangGraph checkpointer / session state)

### Environment variables (backend `.env`)
- `BROKER_URL` — RabbitMQ connection string (default: `amqp://guest:guest@localhost:5672//`)
- `CELERY_RESULT_BACKEND` — Celery result backend (default: `rpc://`)
- `REDIS_URL` — Redis connection string (default: `redis://localhost:6379`)
- `DB_URI` — PostgreSQL connection string (required for checkpointer)
- OpenAI API key (for LLM)

### Environment variables (frontend `.env.local`)
- `NEXT_PUBLIC_API_URL` — Backend URL (default: `http://localhost:8000`)

## Code Standards
- Google-style docstrings on all functions and classes
- Comments explain WHY not WHAT — never comment self-evident code
- Pydantic models for all request/response shapes

## Rules
See .claude/rules/ for detailed standards:
- streaming-patterns.md — LangGraph streaming API contract (read this first)
- architecture.md — file responsibilities and what lives where
- frontend.md - frontend guidelines

## Streaming Patterns

### Non-negotiable API contract
- stream_mode=["messages", "updates"]
- version="v2"
- subgraphs=True
- Reasoning content lives in content_blocks — NEVER in additional_kwargs
- additional_kwargs must never be used for reasoning content

### Event types emitted by streaming.py
- **reasoning** — thinking tokens (from content_blocks)
- **tool_call** — tool invocation (from AIMessageChunk or completed messages)
- **tool_result** — tool response
- **answer** — final response tokens (text content)
- **agent** — agent state updates (agent handoff)
- **error** — error events
- **done** — stream termination signal

## Docker

```bash
cd backend
docker compose up --build
```

## Testing

```bash
cd backend
uv run pytest          # run all tests
uv run tox             # run tests across all Python versions
```
