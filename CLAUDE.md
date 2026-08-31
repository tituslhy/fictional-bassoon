# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A full-stack AI chat application that streams agent reasoning, tool calls, and final answers in real time via SSE. The backend is FastAPI + Celery + LangGraph (Python); the frontend is Next.js App Router (TypeScript). Infrastructure is fully Dockerised with PostgreSQL/Citus, Redis Sentinel, RabbitMQ, and an LGTM observability stack.

**Mid-migration:** the project is moving from a hand-wired custom SSE event vocabulary to a protocol-driven architecture — AG-UI for the agent↔frontend event stream (still over SSE, see `sse-transport-lock.md`), A2UI for declarative frontend rendering instead of fixed React components (see `a2ui-no-executable-ui.md`), and A2A to expose the backend as a callable service to other agents. Until that migration is done, the SSE event types section below is the *current* (legacy) vocabulary, not the target one.

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

Detailed rules live in `.claude/rules/`. `architecture.md` and `streaming-patterns.md` load every session; the rest are path-scoped via `paths:` frontmatter and load only when Claude touches matching files — check that frontmatter for scope before assuming a rule doesn't apply. This section intentionally doesn't restate rule content: a summary here is one more copy that can go stale independently of the source, which is exactly what happened to the last version of this section.

## Subagent delegation

Named subagents exist in `.claude/agents/`: `planner`, `backend-agui-developer`,
`frontend-a2ui-developer`, `a2a-integrator`, `unit-tester`, `protocol-reviewer`.
This is not a blanket "always delegate" policy — small, quick, or iterative
changes belong in the main conversation, same as anywhere else. Delegation
is for the specific case below.

For any task spanning more than one of the three implementation surfaces —
backend AG-UI wiring, frontend A2UI rendering, A2A service packaging —
invoke `planner` first. It reads this section and the relevant rule files
and returns a delegation plan: what's genuinely parallel, what's serial, and
any file-level collision to watch for. **Don't skip straight to spawning
concurrent subagents without it.** The three surfaces look independent by
directory (`backend/utils/streaming.py` + `backend/main.py`;
`frontend/src/components/chat/` + `frontend/src/lib/a2ui/`; a new router on
the existing `backend` service) but aren't fully independent in practice —
`backend-agui-developer` and `a2a-integrator` both touch `backend/main.py`,
which is exactly the kind of collision `planner` exists to catch. Both of
those two run with `isolation: worktree` for this reason.

Known serial dependency regardless of what `planner` finds: the AG-UI event
vocabulary (`protocol-version-pinning.md`) must be pinned before frontend
A2UI rendering can be end-to-end tested against real events. Scaffold the
frontend side in parallel against a mocked event shape, but don't treat
integration testing across the two as parallelizable.

`backend/docker/**` config, Celery, and the data layer are frozen for this
rewrite (`legacy-stack-freeze.md`) — not a fourth parallel stream, explicitly
out of scope.

After implementation, `unit-tester` then `protocol-reviewer` run as
sequential gates, not parallel streams — both depend on the developer
subagents' output existing first. `protocol-reviewer` independently verifies
the coverage numbers and rule compliance rather than trusting self-reports.

This section is guidance, not enforcement — Claude can still decide
otherwise, same as any other CLAUDE.md instruction. If you want the 90%
coverage gate or the planner-first routing to be a hard block rather than a
strong suggestion, that's a hooks problem, not a wording problem — see the
hooks phase.

## Key infrastructure details

- **Database**: PostgreSQL with Citus extension. Schema in `backend/src/db_bootstrap.py` (api.users, api.threads, api.messages with Row-Level Security) plus LangGraph checkpoint tables in `backend/docker/citus/init.sql`, both keyed by `thread_id` — see `citus-thread-id-integrity.md` for the current (non-)distribution state before assuming this is sharded. Connection pooling via PgBouncer on port 6432.
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

## SSE event types (current — being replaced by AG-UI)

The backend emits these event types over the `/chat` SSE stream; the frontend `useSSEStream.ts` hook and `StreamingRenderer.tsx` consume them:

`reasoning` · `tool_call` · `tool_result` · `answer` · `agent` · `error` · `done`

This is the pre-migration vocabulary. Once AG-UI wiring lands, this list is superseded by AG-UI's standard event types — update this section (and its header) at that point rather than leaving both vocabularies documented as current.
