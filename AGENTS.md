# AGENTS.md

This is the canonical project guidance for Codex and other coding agents. Read it before changing this repository.

## What this project is

A full-stack AI chat application that streams agent reasoning, tool calls, and final answers in real time via SSE. The backend is FastAPI + Celery + LangGraph (Python); the frontend is Next.js App Router (TypeScript). Infrastructure is fully Dockerised with PostgreSQL/Citus, Redis Sentinel, RabbitMQ, and an LGTM observability stack.

**Protocol-driven architecture (migration landed 2026-09-01, reviewer-verified):** AG-UI for the agent↔frontend event stream (still over SSE, see `sse-transport-lock.md`), A2UI for declarative frontend rendering via a scoped allow-list instead of fixed React components (see `a2ui-no-executable-ui.md`), and A2A exposing the backend as a callable service to other agents (Agent Card at `/.well-known/agent-card.json`, JSON-RPC at `POST /a2a`). The legacy hand-wired SSE vocabulary is fully retired; the AG-UI event types section below is the current vocabulary. See `release.md` and the verified local-run section of `README.md` for current evidence and remaining limitations.

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

Detailed rules live in `.codex/rules/`. Read `architecture.md` and `streaming-patterns.md` for implementation work, then read the rules whose `paths:` patterns match the files being changed. These are explicit reference documents; do not assume the runtime automatically loads this directory.

## Subagent delegation

Role briefs live in `.codex/agents/`; they are reference prompts, not registered runtime agents. For work spanning backend AG-UI, frontend A2UI, and A2A surfaces, use the planner brief first to identify shared files and serial dependencies. Delegate only when authorized by the session and useful for independent work. For small changes, work directly. If delegation is used, run implementation before testing and independent protocol review. Do not assume Claude-specific tool lists, model names, or worktree settings apply to Codex.

The old migration checklist was removed; do not recreate it automatically. Keep release notes and verification evidence accurate. Infrastructure restrictions in the protocol rules apply to incidental rewrite work; explicit user requests to diagnose or fix infrastructure authorize that scope.

## Workspace and runtime safety

- Do not read `.env` files or reveal credentials. An explicitly authorized runtime may load provider configuration without displaying it. Check test/bootstrap configuration for implicit dotenv loading before running it.
- Keep the user's local services running unless asked to stop them. Do not remove volumes or reset persisted chat/trace data.
- Preserve unrelated edits and deletions already present in the working tree.
- Local generated configuration and test credentials belong in ignored `handoffs/`, never in release notes or screenshots.
- Use the existing `bassoon-local` project for its running smoke stack. Preserve its provider override when recreating API or worker containers; the ignored restart helper records that setup. Do not substitute the standard Compose project accidentally.

## Key infrastructure details

- **Database**: PostgreSQL with Citus. Coordinator + 2 workers; FastAPI bootstrap registers the workers and shards `api.threads` / `api.messages` by `thread_id` (`api.users` is a reference table). LangGraph checkpoint tables are distributed by `thread_id` as well, with a local fallback if Citus still rejects LangGraph's `jsonb_each_text` query — see `citus-thread-id-integrity.md`. Connection pooling via PgBouncer on port 6432.
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

## Verified local service ports

These are the isolated `bassoon-local` ports, not the default Compose configuration. See README for standard ports and screenshot evidence.

| Service | Port |
|---|---|
| Relay app | 8080 |
| FastAPI docs | 18000 |
| Langfuse | 3001 |
| Grafana | 3002 |
| RabbitMQ Management | 15672 |
| Redis Insight | 5540 |
| Prometheus | 9090 |
| MinIO Console | 9001 |
| ClickHouse Query | 18123 |
| Alloy | 12345 |

## Current verification limits

The 1 November 2026 live check validated 55 AG-UI output events against SDK 0.1.21. The chat request still uses `{message, thread_id}`, not the standard `RunAgentInput` contract. Do not claim complete AG-UI client compatibility.

Citus API tables are distributed, but the three LangGraph checkpoint tables currently remain local after the `jsonb_each_text` probe fails. This is an operational fallback, not a fix for the distributed-checkpoint incompatibility. Use `scripts/check_citus.sql` for read-only verification. Grafana log ingestion, the `/api/docs` schema path, and stale thread selection after account switching remain follow-up issues.

## SSE event types (AG-UI)

The backend (`backend/utils/streaming.py`) emits AG-UI protocol events (`ag-ui-protocol==0.1.21`, pinned — see `.codex/rules/protocol-version-pinning.md`) over the `/chat` SSE stream; the frontend `useSSEStream.ts` hook parses them and `Chat.tsx` consumes them:

`RUN_STARTED` · `RUN_FINISHED` · `RUN_ERROR` · `STEP_STARTED` · `STEP_FINISHED` · `TEXT_MESSAGE_START/CONTENT/END` · `REASONING_MESSAGE_START/CONTENT/END` · `TOOL_CALL_START/ARGS/END/RESULT` · `CUSTOM` (`name: "a2ui"` — nested 4-type chat-block tree in `value`; `name: "a2ui.surface"` — standard A2UI v1.0 `createSurface` envelope from `render_interactive_ui`, see `backend/src/interactive_ui.py` and `docs/a2ui/implementation-plan.md`)

`RUN_FINISHED` and `RUN_ERROR` are the terminal events (`RUN_ERROR` is never followed by `RUN_FINISHED`). Payloads are camelCase JSON on the `data` field with the type name duplicated on the SSE `event:` field — a documented deviation from AG-UI's reference encoder, kept for the hand-rolled `parseSSE()` (see the pin note in `protocol-version-pinning.md`). The pre-migration vocabulary (`reasoning`/`tool_call`/`tool_result`/`answer`/`agent`/`error`/`done`) is retired.
