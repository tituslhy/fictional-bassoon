# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A full-stack AI chat application that streams agent reasoning, tool calls, and final answers in real time via SSE. The backend is FastAPI + Celery + LangGraph (Python); the frontend is Next.js App Router (TypeScript). Infrastructure is fully Dockerised with PostgreSQL/Citus, Redis Sentinel, RabbitMQ, and an LGTM observability stack.

## Repository layout

```
fictional-bassoon/
├── backend/        # FastAPI app + Celery worker
├── frontend/       # Next.js App Router
├── docker/         # Master docker-compose.yml + nginx reverse proxy
└── Makefile        # Orchestration targets (delegates to docker/)
```

## Commands

### Backend (`cd backend`)

```bash
uv sync                              # install dependencies
uv run pytest                        # run all tests
uv run pytest tests/test_streaming.py  # run a single test file
uv run pytest -k "test_name"         # run a single test by name
uv run ruff check .                  # lint
uv run ruff format .                 # format
uv run mypy .                        # type-check

# Run locally (infrastructure must be up first)
celery -A src.celery_app worker --loglevel=info &
uvicorn main:app --reload
```

### Frontend (`cd frontend`)

```bash
npm install
npm run dev        # dev server on :3000
npm run build      # production build
npm run test       # Vitest
npm run lint       # ESLint
npm run format     # ESLint + Prettier
```

### Docker / full stack (from repo root)

```bash
make up            # start all services (detached)
make up-build      # rebuild images then start
make down          # stop and remove containers
make logs          # follow logs
make clean         # remove volumes and images
```

The master compose at `docker/docker-compose.yml` includes `backend/docker-compose.yaml` and the frontend service, plus an nginx reverse proxy on `:80`.

## Architecture rules

Detailed rules live in `.claude/rules/` and are always loaded. Summary of what matters most:

- `main.py` is thin (~20 lines of real logic). Business logic belongs in `src/`.
- `src/agent.py` constructs the LangGraph agent at **module level** — no factory wrappers.
- `src/models/` contains Pydantic models only — no utilities.
- LangGraph streaming uses `stream_mode=["messages","updates"]`, `version="v2"`, `subgraphs=True`. Do not change these.
- Reasoning tokens come from `content_blocks`, never `additional_kwargs`.

## Key infrastructure details

- **Database**: PostgreSQL with Citus extension, sharded by `thread_id`. Connection pooling via PgBouncer on port 6432. Schema in `backend/src/db_bootstrap.py` (api.users, api.threads, api.messages with Row-Level Security).
- **Broker**: RabbitMQ (`BROKER_URL`). Celery result backend is Redis.
- **Redis**: Sentinel cluster (3 nodes + 3 sentinels) for HA. `redis_pubsub.py` supports Sentinel mode via `REDIS_SENTINEL_HOSTS`.
- **Observability**: Langfuse for LLM traces, Prometheus + Grafana + Loki + Tempo (LGTM stack). Celery worker starts a Prometheus metrics server on startup.

## Environment variables

Copy `backend/.env.example` to `backend/.env`. Required keys:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM provider |
| `TAVILY_API_KEY` | Web search tool |
| `BROKER_URL` | RabbitMQ connection string |
| `REDIS_URL` | Redis (or Sentinel config) |
| `DB_URI` | PostgreSQL via PgBouncer |
| `JWT_SECRET` | Auth token signing |
| `LANGFUSE_*` | Observability (optional locally) |

Frontend expects `NEXT_PUBLIC_API_URL` in `frontend/.env.local` (default: `http://localhost:8000`).

## Local service ports

| Service | Port |
|---|---|
| Next.js UI | 3000 |
| FastAPI | 8000 |
| Grafana | 3001 |
| Langfuse | 3030 |
| Prometheus | 9090 |
| Redis Insight | 5540 |
| PostgREST | 3002 |

## SSE event types

The backend emits these event types over the `/chat` SSE stream; the frontend `useSSEStream.ts` hook and `StreamingRenderer.tsx` consume them:

`reasoning` · `tool_call` · `tool_result` · `answer` · `agent` · `error` · `done`
