# Backend

FastAPI streaming backend for a LangGraph Deep Agent, speaking the **AG-UI protocol** over SSE and exposing itself to other agents via **A2A**.

## Overview

This backend exposes:

- `POST /chat` — accepts user messages and streams **AG-UI protocol events** (`ag-ui-protocol==0.1.21`) back via Server-Sent Events (SSE).
- `POST /auth/signup` / `POST /auth/login` — account creation and JWT authentication (synchronous, no queue).
- `GET /.well-known/agent-card.json` — the **A2A Agent Card** describing this service to other agents.
- `POST /a2a` — the **A2A JSON-RPC endpoint** (`a2a-sdk[fastapi]==1.1.2`): other agents call `SendMessage` and get the same chat pipeline, with A2A `taskId` == `job_id` and `contextId` == `thread_id`.
- `GET /health` — health check (also reports Redis connectivity).

Each chat message triggers a LangGraph Deep Agent that performs reasoning, makes tool calls (Tavily web search), and produces a final response — all streamed token by token. **Celery** handles background task processing, **Redis Sentinel** provides high-availability pub/sub, and **Langfuse** traces every run.

```mermaid
flowchart LR
    C[Client] -->|POST /chat| F[FastAPI]
    P[Peer agent] -->|"JSON-RPC SendMessage (POST /a2a)"| F
    F -->|enqueue| Q[RabbitMQ] --> W[Celery Worker]
    W --> A[LangGraph Agent]
    A -->|AG-UI events| R[Redis Pub/Sub]
    R -->|"stream:{job_id}"| F
    F -->|SSE| C
    A -.->|traces| L[Langfuse]
    A -->|checkpoints| D[(Postgres/Citus)]
```

## Prerequisites

- **Python 3.11+**
- **uv** — Python package manager (`pip install uv`)
- **RabbitMQ** — message broker for Celery (default: `localhost:5672`)
- **Redis Sentinel** — high-availability pub/sub bridge
- **PostgreSQL (Citus)** — LangGraph checkpointer for session/state persistence
- **Langfuse Observability Suite** — for tracing and analytics

## Installation

```bash
# Create and activate a virtual environment
uv venv
source .venv/bin/activate

# Install dependencies
uv sync

# Create environment file
cp .env.example .env  # if .env.example exists
# Or create .env manually (see Configuration section below)
```

## Configuration

Create a `.env` file in the `backend/` directory with the following variables:

| Variable | Default | Required | Description |
|---|---|---|---|
| `BROKER_URL` | `amqp://guest:guest@localhost:5672//` | No | RabbitMQ connection string for Celery |
| `CELERY_RESULT_BACKEND` | `rpc://` | No | Celery result backend |
| `REDIS_URL` | `redis://localhost:6379` | No | Redis connection string for pub/sub |
| `DB_URI` | — | **Yes** | PostgreSQL connection string, via PgBouncer (e.g., `postgresql://user:pass@localhost:6432/dbname`) |
| `JWT_SECRET` | — | **Yes** | Auth token signing secret |
| `OPENAI_API_KEY` | — | **Yes** | OpenAI API key for LLM |
| `TAVILY_API_KEY` | — | **Yes** | Tavily API key for web search tool |
| `LANGFUSE_*` | — | No | Langfuse observability credentials/endpoint (tracing degrades gracefully without them) |

## Running the Application

### 1. Start the Celery Worker (REQUIRED)

The Celery worker is responsible for running the LangGraph agent. **Without it, chat requests will be enqueued but never processed.**

```bash
celery -A src.celery_app worker --loglevel=info
```

### 2. Start the FastAPI Dev Server

In a **separate terminal**:

```bash
uvicorn main:app --reload
```

The server starts at `http://localhost:8000`.

### 3. Verify Everything Works

```bash
# Health check
curl http://localhost:8000/health
# Expected: { "status": "ok", "redis": "connected" }

# A2A agent card
curl http://localhost:8000/.well-known/agent-card.json

# Chat endpoint (non-streaming test — use --no-buffer for raw SSE output)
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "thread_id": "test"}' \
  -N
```

## Docker Deployment

```bash
# Build and start all services (PostgreSQL/Citus, Redis Sentinel, Clickhouse, Minio, Langfuse, RabbitMQ, backend, celery_worker)
docker compose up --build

# Run in detached mode
docker compose up --build -d

# View logs
docker compose logs -f backend
docker compose logs -f celery_worker

# Stop all services
docker compose down
```

The Docker setup includes:

- **Citus Cluster** — distributed state persistence
- **Redis Sentinel Cluster** — high-availability pub/sub, task queuing, and caching
- **Clickhouse Cluster** — high-performance analytics for observability
- **Minio** — S3-compatible object storage for observability data
- **Langfuse** — tracing and observability dashboard
- **RabbitMQ 3** — Celery broker with management UI (port 5672 + 15672)
- **Backend** — FastAPI server (port 8000)
- **Celery Worker** — background agent runner

## API Reference

### POST /auth/signup

Create a new user account.

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "full_name": "John Doe"
}
```

**Response:** `TokenResponse` (access token)

### POST /auth/login

Authenticate user and return JWT.

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** `TokenResponse` (access token)

### POST /chat

Starts a streaming agent session.

**Request body:**

```json
{
  "message": "What is the weather in Tokyo?",
  "thread_id": "default",
  "job_id": "optional-uuid"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `message` | string | Yes | — | User message (1–10,000 chars) |
| `thread_id` | string | No | `default` | Conversation thread identifier |
| `job_id` | string | No | auto-generated UUID | Unique job ID for tracking |

**Response:** SSE stream (`Content-Type: text/event-stream`)

**SSE Event types (AG-UI vocabulary):**

Every frame carries the AG-UI event type on the SSE `event:` field and the full camelCase event JSON on `data:` (a documented deviation from AG-UI's reference encoder, kept for the hand-rolled frontend parser — see `.claude/rules/protocol-version-pinning.md`).

| Event | Key data fields | Description |
|---|---|---|
| `RUN_STARTED` | `threadId`, `runId` | Run begins (`runId` == `job_id`) |
| `STEP_STARTED` / `STEP_FINISHED` | `stepName` | Agent (LangGraph node) transitions |
| `REASONING_MESSAGE_START` / `CONTENT` / `END` | `messageId`, `delta` | Thinking tokens (from `content_blocks`) |
| `TEXT_MESSAGE_START` / `CONTENT` / `END` | `messageId`, `delta` | Final answer tokens |
| `TOOL_CALL_START` | `toolCallId`, `toolCallName` | Tool invocation begins |
| `TOOL_CALL_ARGS` | `toolCallId`, `delta` | Streaming tool arguments (JSON string) |
| `TOOL_CALL_END` / `TOOL_CALL_RESULT` | `toolCallId`, `content` | Call complete / tool response |
| `RUN_FINISHED` | `threadId`, `runId`, `outcome` | Terminal: success |
| `RUN_ERROR` | `message` | Terminal: failure — never followed by `RUN_FINISHED`, and any open message/step is closed *before* it |

### GET /.well-known/agent-card.json

The A2A Agent Card: service name, `supportedInterfaces` (JSON-RPC at `/a2a`, protocol v1.0), capabilities, and the `chat` skill.

### POST /a2a

A2A v1.0 JSON-RPC endpoint (PascalCase methods: `SendMessage`, `GetTask`, …). A `SendMessage` enqueues the same Celery task as `/chat` and maps the run onto A2A task states:

```mermaid
stateDiagram-v2
    [*] --> submitted: run_agent_task.delay()
    submitted --> working: first AG-UI event arrives
    working --> completed: RUN_FINISHED
    working --> failed: RUN_ERROR
    working --> failed: 120s with no events (worker presumed dead)
    completed --> [*]
    failed --> [*]
```

Known limitations (deliberate, documented): `CancelTask` is unsupported (would need a job_id→Celery-result mapping), and task state lives in the SDK's in-memory store (process-local).

### GET /health

Simple health check.

**Response:**

```json
{ "status": "ok", "redis": "connected" }
```

## Project Structure

```
backend/
├── main.py                      # FastAPI app entry point
│                                # Routes: POST /chat, /auth/*, GET /health,
│                                # A2A router (/a2a + agent card) via include_router
├── pyproject.toml               # Python dependencies (ag-ui-protocol + a2a-sdk pinned)
├── uv.lock                      # Locked dependency lockfile
├── .env                         # Environment variables (DO NOT commit)
├── logging.ini                  # Python logging configuration
│
├── src/
│   ├── agent.py                 # LangGraph DeepAgent construction (create_agent/get_agent)
│   ├── auth.py                  # Authentication logic
│   ├── celery_app.py            # Celery app configuration
│   ├── db.py                    # asyncpg connection pooling
│   ├── db_bootstrap.py          # Schema bootstrap (tables, roles, RLS) on startup
│   ├── models/
│   │   ├── auth_models.py       # Auth Pydantic models
│   │   └── chat_models.py       # Chat Pydantic models
│   ├── protocol/                # A2A service surface
│   │   ├── agent_card.py        # Agent Card served at /.well-known/agent-card.json
│   │   ├── executor.py          # ChatAgentExecutor: A2A task states ↔ chat pipeline
│   │   └── router.py            # build_a2a_router() mounted in main.py
│   ├── queue/
│   │   └── redis_pubsub.py      # Redis pub/sub helpers
│   └── worker/
│       ├── tasks.py             # Celery task definitions (sync→async bridge)
│       └── worker_runner.py     # Async agent execution, publishes AG-UI events
│
├── utils/
│   └── streaming.py             # LangGraph events → AG-UI protocol events
│
├── tests/                       # pytest suite (95% coverage)
│
├── docker/
│   ├── Dockerfile               # Multi-stage Docker image (Python 3.13-slim + uv)
│   ├── citus/                   # Citus cluster init (checkpoint tables)
│   ├── clickhouse/              # Clickhouse Cluster config
│   └── redis/                   # Sentinel Cluster config
│
└── docker-compose.yaml          # Backend stack compose file
```

## How Streaming Works (Deep Dive)

### Request Flow

1. **Client** sends `POST /chat` with `message` and optional `thread_id`
2. **FastAPI** generates a `job_id` (UUID4) and subscribes to Redis channel `stream:{job_id}`
3. **FastAPI** enqueues `run_agent_task.delay(request_dict)` to Celery
4. **FastAPI** yields SSE events from the Redis pub/sub to the client

### Worker Flow

1. **Celery worker** receives `run_agent_task`
2. **tasks.py** bridges sync Celery context to async
3. **worker_runner.py** calls `agent.astream(stream_mode=["messages", "updates"], version="v2")`
4. **streaming.py** converts each LangGraph chunk to AG-UI events (`{"event": <type>, "data": <camelCase JSON>}`):
   - `AIMessageChunk.content_blocks` (reasoning) → `REASONING_MESSAGE_START/CONTENT` (+ `END` from the matching `updates` chunk)
   - `AIMessageChunk.text` → `TEXT_MESSAGE_START/CONTENT` (+ `END`)
   - `AIMessageChunk.tool_call_chunks` → `TOOL_CALL_START/ARGS` (+ `END`)
   - Completed `ToolMessage` → `TOOL_CALL_RESULT`
   - Agent handoff metadata (`lc_agent_name`) → `STEP_STARTED`/`STEP_FINISHED`
5. Each event is published to Redis via `publish_event(job_id, event)`
6. On success the stream closes with `RUN_FINISHED`; on exception, open messages/steps are closed and a single terminal `RUN_ERROR` is emitted (never both)

### Key Streaming Patterns

- `stream_mode=["messages", "updates"]` — captures both token-level events (`messages`) and message-level events (`updates`)
- `version="v2"` — uses the latest LangGraph streaming API contract
- `subgraphs=True` — captures events from sub-agents in the LangGraph graph
- Reasoning content lives in `content_blocks` — **never** in `additional_kwargs`

## Development

### Running locally

```bash
# Terminal 1: Celery worker
celery -A src.celery_app worker --loglevel=info

# Terminal 2: FastAPI dev server
uvicorn main:app --reload

# Terminal 3: Test with curl
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Test", "thread_id": "dev"}' \
  -N
```

### Testing

```bash
# Run all tests with coverage (52 tests, 95% — the gate is ≥90%)
uv run pytest -q --cov=. --cov-report=term-missing

# Lint / format / type-check
uv run ruff check .
uv run ruff format .
uv run mypy .
```

## Troubleshooting

### No events streaming to the client

| Symptom | Likely Cause | Fix |
|---|---|---|
| SSE connects but no events | Celery worker not running | `celery -A src.celery_app inspect ping` |
| "failed to enqueue chat task" | RabbitMQ unreachable | `rabbitmqctl status` |
| "subscribed" but no events | Redis unreachable | `redis-cli ping` (should return PONG) |
| Agent hangs indefinitely | PostgreSQL checkpointer issue | Verify `DB_URI` is correct |

### Port conflicts

| Port | Service | Default |
|---|---|---|
| 8000 | FastAPI | `localhost:8000` |
| 5672 | RabbitMQ | `localhost:5672` |
| 15672 | RabbitMQ Management UI | `localhost:15672` |
| 6379 | Redis | `localhost:6379` |
| 5432 | PostgreSQL | `localhost:5432` |

## Key Files to Know

| File | Responsibility |
|---|---|
| `main.py` | FastAPI routes, SSE response, A2A router mount |
| `src/agent.py` | Agent construction (`create_agent()` / `get_agent()`) |
| `src/auth.py` | Authentication logic |
| `src/celery_app.py` | Celery broker/backend config |
| `src/db_bootstrap.py` | Schema bootstrap (tables, roles, RLS) on startup |
| `src/models/chat_models.py` | Pydantic ChatRequest model |
| `src/protocol/agent_card.py` | A2A Agent Card |
| `src/protocol/executor.py` | A2A task lifecycle ↔ chat pipeline mapping |
| `src/protocol/router.py` | `build_a2a_router()` |
| `src/queue/redis_pubsub.py` | Redis publish/subscribe helpers |
| `src/worker/tasks.py` | Celery task + sync→async bridge |
| `src/worker/worker_runner.py` | Async agent execution loop |
| `utils/streaming.py` | LangGraph events → AG-UI protocol events |
| `logging.ini` | Python logging configuration |
| `docker/Dockerfile` | Container image definition |
| `docker-compose.yaml` | Backend stack orchestration |
