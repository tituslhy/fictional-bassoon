# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

FastAPI SSE streaming backend for a LangGraph Deep Agent, paired with a Next.js chat frontend. Streams reasoning, tool calls, tool results, and final answer as Server-Sent Events (SSE). Celery + Redis pub/sub bridges the async worker to the FastAPI response.

## Structure

- `main.py` — FastAPI app entry point (~170 lines): `/chat`, `/auth/signup`, `/auth/login`, `/health`
- `src/agent.py` — LangGraph agent construction via `create_agent()` / `get_agent()` factory functions
- `src/auth.py` — JWT token creation, password hashing (pbkdf2_sha256 + bcrypt fallback)
- `src/db.py` — Global AsyncConnectionPool singleton (FastAPI lifespan)
- `src/db_bootstrap.py` — Ensures `api` schema exists on startup
- `utils/streaming.py` — LangGraph event conversion to typed SSE dicts
- `src/models/chat_models.py` — Pydantic request/response models
- `src/models/auth_models.py` — Auth-specific Pydantic models
- `src/celery_app.py` — Celery config (broker, backend)
- `src/worker/tasks.py` — Celery task definition, bridges sync→async
- `src/worker/worker_runner.py` — async agent execution, publishes to Redis
- `src/queue/redis_pubsub.py` — `publish_event()` and `subscribe()` helpers
- `docker/` — Docker compose (unified stack), nginx config
- `frontend/` — Next.js chat app

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
  → get_agent() → creates fresh AsyncConnectionPool + AsyncPostgresSaver per task
  → agent.astream() → stream_agent_events() (convert LangGraph events to SSE dicts)
  → publish_event() → Redis pub/sub "stream:{job_id}"
```

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
npm run test                                    # run vitest
npm run test:ui                                 # vitest with UI
npm run lint                                    # eslint
npm run build                                   # production build

# Tests
cd backend
uv run pytest                                   # run all tests
uv run pytest tests/test_streaming.py            # single test file
uv run pytest tests/test_streaming.py::test_name # single test
uv run pytest --cov=src                          # with coverage
uv run tox                                       # run across Python versions

# Docker (unified stack)
cd docker
docker compose up -d

# Docker (backend infra only)
cd backend
docker compose up -d
```

## Streaming Patterns

### Non-negotiable API contract
- `stream_mode=["messages", "updates"]`
- `version="v2"`
- `subgraphs=True`
- Reasoning content lives in `content_blocks` — NEVER in `additional_kwargs`

### Event types emitted by utils/streaming.py
- **reasoning** — thinking tokens (from content_blocks)
- **tool_call** — tool invocation
- **tool_result** — tool response
- **answer** — final response tokens (text content)
- **agent** — agent state updates (agent handoff)
- **error** — error events
- **done** — stream termination signal

### Worker lifecycle critical notes
- `get_agent()` creates a fresh `AsyncConnectionPool` + `AsyncPostgresSaver` per call (not a singleton)
- Worker always closes the checkpointer pool in `finally` to avoid "Event loop is closed" errors
- Each Celery task uses its own Redis connection for publishing

## Auth

- Signup and login use JWT (HS256, 1-week expiry)
- Passwords hashed with pbkdf2_sha256 (bcrypt kept for verifying existing hashes)
- JWT claims include `user_id`, `email`, `role` (defaults to `web_user` for PostgREST)
- Auth endpoints talk to PostgreSQL via `src/db.py` global pool

## Code Standards
- Google-style docstrings on all functions and classes
- Comments explain WHY not WHAT — never comment self-evident code
- Pydantic models for all request/response shapes
- Frontend guidelines in `.claude/rules/frontend.md`
- Architecture rules in `.claude/rules/architecture.md`
- Streaming patterns in `.claude/rules/streaming-patterns.md`
