# Backend

FastAPI SSE streaming backend for a LangGraph Deep Agent.

## Overview

This backend exposes a single HTTP endpoint (`POST /chat`) that accepts user messages and returns real-time streaming events via Server-Sent Events (SSE). Each message triggers a LangGraph Deep Agent that performs reasoning, makes tool calls (e.g., web search), and produces a final response — all streamed token by token to the client.

The architecture uses **Celery** for background task processing and **Redis pub/sub** as the bridge between the FastAPI server and the async worker.

```
Client ──POST /chat──► FastAPI
                              │
                              ├──► Celery worker ──► LangGraph Agent ──► Redis pub/sub
                              │                                              │
                              ◄── SSE events ──────────────────────────────┘
```

## Prerequisites

- **Python 3.11+**
- **uv** — Python package manager (`pip install uv`)
- **RabbitMQ** — message broker for Celery (default: `localhost:5672`)
- **Redis** — pub/sub bridge (default: `localhost:6379`)
- **PostgreSQL** — LangGraph checkpointer for session/state persistence

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
# Build and start all services (PostgreSQL, Redis, RabbitMQ, backend, celery_worker)
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

- **PostgreSQL 16** — session state checkpointer (port 5432)
- **Redis 7** — pub/sub bridge (port 6379)
- **RabbitMQ 3** — Celery broker with management UI (port 5672 + 15672)
- **Backend** — FastAPI server (port 8000)
- **Celery Worker** — background agent runner

## API Reference

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

**Example SSE output:**

```
event: agent
data: deep_agents

event: reasoning
data: Let me search for the current weather in Tokyo...

event: tool_call
data: {"name": "tavily_search", "args": {"query": "weather in Tokyo"}}

event: tool_result
data: {"results": [...]}

event: answer
data: Based on the latest weather data, Tokyo is currently

event: answer
data: 22°C with clear skies.

event: done
data:
```

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
│                                # Routes: POST /chat, GET /health
├── pyproject.toml               # Python dependencies
├── uv.lock                      # Locked dependency lockfile
├── .env                         # Environment variables (DO NOT commit)
├── logging.ini                  # Python logging configuration
├── tox.ini                      # Test configuration
│
├── src/
│   ├── agent.py                 # LangGraph DeepAgent construction
│   │                            # Creates agent with GPT-4.1-Nano + TavilySearch
│   │                            # Uses PostgresSaver for checkpointer
│   │                            # Memoized at module level
│   │
│   ├── celery_app.py            # Celery app configuration
│   │                            # Broker: RabbitMQ
│   │                            # Backend: RPC (default)
│   │                            # Imports worker.tasks module
│   │
│   ├── models/
│   │   └── chat_models.py       # Pydantic models
│   │                            # ChatRequest: message, thread_id, job_id
│   │
│   ├── queue/
│   │   └── redis_pubsub.py      # Redis pub/sub helpers
│   │                            # publish_event(job_id, event) → Redis
│   │                            # subscribe(job_id) → pubsub object
│   │
│   └── worker/
│       ├── tasks.py              # Celery task definitions
│       │                         # run_agent_task: sync→async bridge
│       │                         # Uses _run_coroutine_sync() helper
│       │
│       └── worker_runner.py      # Async agent execution
│                                # run_agent_and_stream():
│                                #   1. Get agent from agent.py
│                                #   2. Iterate agent.astream()
│                                #   3. Publish each event to Redis
│
├── utils/
│   └── streaming.py             # LangGraph → SSE event conversion
│                               # stream_agent_events():
│                               #   - stream_mode=["messages", "updates"]
│                               #   - version="v2", subgraphs=True
│                               #   - Extracts reasoning, tool_call, answer, etc.
│
├── docker/
│   ├── Dockerfile               # Multi-stage Docker image (Python 3.13-slim + uv)
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

### Logging

Logging is configured via `logging.ini`. Logs are written to:

- **stdout/stderr** — for Docker/console output
- **`logs/app.log`** — file log (mounted as Docker volume)

To adjust log levels, edit `logging.ini`:

```ini
[loggers]
keys=root

[handlers]
keys=console

[formatters]
keys=default

[logger_root]
level=INFO
handlers=console

[handler_console]
class=StreamHandler
formatter=default

[formatter_default]
format=%(asctime)s - %(name)s - %(levelname)s - %(message)s
```

## Troubleshooting

### No events streaming to the client

| Symptom | Likely Cause | Fix |
|---|---|---|
| SSE connects but no events | Celery worker not running | `celery -A src.celery_app inspect ping` |
| "failed to enqueue chat task" | RabbitMQ unreachable | `rabbitmqctl status` |
| "subscribed" but no events | Redis unreachable | `redis-cli ping` (should return PONG) |
| Agent hangs indefinitely | PostgreSQL checkpointer issue | Verify `DB_URI` is correct |

### Celery worker not picking up tasks

```bash
# Check if worker is running
celery -A src.celery_app inspect registered

# Check broker connectivity
rabbitmqctl list_queues

# Restart worker
celery -A src.celery_app worker --loglevel=debug
```

### Agent times out

- Default Celery time limits: `soft_time_limit=300s`, `time_limit=360s`
- Adjust in `src/worker/tasks.py` if agents need more time

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
| `src/celery_app.py` | Celery broker/backend config |
| `src/models/chat_models.py` | Pydantic ChatRequest model |
| `src/queue/redis_pubsub.py` | Redis publish/subscribe helpers |
| `src/worker/tasks.py` | Celery task + sync→async bridge |
| `src/worker/worker_runner.py` | Async agent execution loop |
| `utils/streaming.py` | LangGraph event → SSE dict conversion |
| `logging.ini` | Python logging configuration |
| `docker/Dockerfile` | Container image definition |
| `docker-compose.yaml` | Full stack orchestration |
