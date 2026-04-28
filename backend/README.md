# Backend

FastAPI SSE streaming backend for a LangGraph Deep Agent.

## Overview

This backend exposes several HTTP endpoints for chat and authentication:
- `POST /chat`: Accepts user messages and returns real-time streaming events via Server-Sent Events (SSE).
- `POST /auth/signup`: Creates a new user account.
- `POST /auth/login`: Authenticates user and returns JWT.

Each message to `/chat` triggers a LangGraph Deep Agent that performs reasoning, makes tool calls (e.g., web search), and produces a final response — all streamed token by token to the client.

The architecture uses **Celery** for background task processing and **Redis Sentinel** for high-availability pub/sub as the bridge between the FastAPI server and the async worker.

```
Client ──POST /chat──► FastAPI
                              │
                              ├──► Celery worker ──► LangGraph Agent ──► Redis Sentinel Cluster
                              │                                              │
                              ◄── SSE events ──────────────────────────────┘
```

## Prerequisites

- **Python 3.11+**
- **uv** — Python package manager (`pip install uv`)
- **RabbitMQ** — message broker for Celery (default: `localhost:5672`)
- **Redis Sentinel** — high-availability pub/sub bridge
- **PostgreSQL (Citus)** — LangGraph checkpointer for session/state persistence

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
| `DB_URI` | — | **Yes** | PostgreSQL connection string (e.g., `postgresql://user:pass@localhost:5432/dbname`) |
| `OPENAI_API_KEY` | — | **Yes** | OpenAI API key for LLM |
| `TAVILY_API_KEY` | — | **Yes** | Tavily API key for web search tool |

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
# Expected: { "status": "ok" }

# Chat endpoint (non-streaming test — use --no-buffer for raw SSE output)
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "thread_id": "test"}' \
  -N
```

## Docker Deployment

```bash
# Build and start all services (PostgreSQL/Citus, Redis Sentinel, Clickhouse, Minio, RabbitMQ, backend, celery_worker)
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
- **Redis Sentinel Cluster** — high-availability pub/sub
- **Clickhouse Cluster** — high-performance analytics for observability
- **Minio** — S3-compatible object storage for observability data
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

**SSE Event types:**

| Event | Data Format | Description |
|---|---|---|
| `reasoning` | `string` | Agent's internal reasoning/thinking tokens (from `content_blocks`) |
| `tool_call` | `JSON {name, args}` | Tool invocation by the agent |
| `tool_result` | `string` | Response from a tool execution |
| `answer` | `string` | Final response tokens (text content) |
| `agent` | `string` | Agent handoff — which agent is currently active |
| `error` | `string` | Error message |
| `done` | (empty) | Stream termination signal |

### GET /health

Simple health check.

**Response:**

```json
{ "status": "ok" }
```

## Project Structure

```
backend/
├── main.py                      # FastAPI app entry point (~90 lines)
│                                # Routes: POST /chat, /auth/signup, /auth/login, GET /health
├── pyproject.toml               # Python dependencies
├── uv.lock                      # Locked dependency lockfile
├── .env                         # Environment variables (DO NOT commit)
├── logging.ini                  # Python logging configuration
├── tox.ini                      # Test configuration
│
├── src/
│   ├── agent.py                 # LangGraph DeepAgent construction
│   ├── auth.py                  # Authentication logic
│   ├── celery_app.py            # Celery app configuration
│   ├── db.py                    # Database connection pooling
│   ├── models/
│   │   ├── auth_models.py       # Auth Pydantic models
│   │   └── chat_models.py       # Chat Pydantic models
│   ├── queue/
│   │   └── redis_pubsub.py      # Redis pub/sub helpers
│   │
│   └── worker/
│       ├── tasks.py              # Celery task definitions
│       └── worker_runner.py      # Async agent execution
│
├── utils/
│   └── streaming.py             # LangGraph → SSE event conversion
│
├── docker/
│   ├── Dockerfile               # Multi-stage Docker image (Python 3.13-slim + uv)
│   ├── clickhouse/              # Clickhouse Cluster config
│   ├── redis/                   # Sentinel Cluster config
│   └── .env.example             # Example environment variables
│
├── docker-compose.yaml          # Full stack compose file
│
└── notebooks/
    └── test_stream.ipynb        # Development notebook for testing streaming
```

## How Streaming Works (Deep Dive)

### Request Flow

1. **Client** sends `POST /chat` with `message` and optional `thread_id`
2. **FastAPI** generates a `job_id` (UUID4) and subscribes to Redis channel `stream:{job_id}`
3. **FastAPI** enqueues `run_agent_task.delay(request_dict)` to Celery
4. **FastAPI** yields SSE events from the Redis pub/sub to the client

### Worker Flow

1. **Celery worker** receives `run_agent_task`
2. **tasks.py** bridges sync Celery context to async via `_run_coroutine_sync()`
3. **worker_runner.py** calls `agent.astream(stream_mode=["messages", "updates"], version="v2")`
4. **streaming.py** converts each LangGraph event to an SSE dict:
   - `AIMessageChunk.content_blocks` → `reasoning` events
   - `AIMessageChunk.text` → `answer` events
   - `AIMessageChunk.tool_call_chunks` → `tool_call` events
   - Completed `ToolMessage` → `tool_result` events
   - Agent handoff metadata → `agent` events
5. Each event is published to Redis via `publish_event(job_id, event)`
6. When streaming completes, a `done` event is emitted

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
# Run all tests
uv run pytest

# Run tests across all configured Python versions
uv run tox
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
| `main.py` | FastAPI routes, SSE response |
| `src/agent.py` | Agent construction (module-level, memoized) |
| `src/auth.py` | Authentication logic |
| `src/celery_app.py` | Celery broker/backend config |
| `src/models/chat_models.py` | Pydantic ChatRequest model |
| `src/queue/redis_pubsub.py` | Redis publish/subscribe helpers |
| `src/worker/tasks.py` | Celery task + sync→async bridge |
| `src/worker/worker_runner.py` | Async agent execution loop |
| `utils/streaming.py` | LangGraph event → SSE dict conversion |
| `logging.ini` | Python logging configuration |
| `docker/Dockerfile` | Container image definition |
| `docker-compose.yaml` | Full stack orchestration |
