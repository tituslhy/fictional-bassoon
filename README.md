# fictional-bassoon

FastAPI SSE streaming backend for a LangGraph Deep Agent, paired with a Next.js chat frontend.

## Overview

This project is a full-stack AI chat application that streams real-time agent reasoning, tool calls, tool results, and final answers to the browser via Server-Sent Events (SSE).

**Architecture:**

- **Backend** (`backend/`): FastAPI handles incoming chat requests, enqueues them as Celery tasks for background processing, and bridges agent events (published to Redis by workers) to the client via SSE.
- **Frontend** (`frontend/`): Next.js chat application that consumes the SSE stream, renders streaming events in real-time, and manages conversation threads.

```
Client (Browser)
    │ POST /chat
    ▼
FastAPI (/chat endpoint)
    │ subscribe Redis "stream:{job_id}"
    ├──► Celery worker ──► LangGraph Agent ──► Redis pub/sub
    │                                  │
    │   SSE events ◄───────────────────┘
    ▼
Client receives SSE events in real-time
(reasoning → tool_call → tool_result → answer → done)
```

## Quick Start

### 1. Prerequisites

Ensure you have the following installed:

- **Python 3.11+** — backend runtime
- **Node.js 18+** — frontend runtime
- **uv** — Python package manager (`pip install uv`)
- **RabbitMQ** — message broker for Celery (default: `localhost:5672`)
- **Redis** — pub/sub bridge (default: `localhost:6379`)
- **PostgreSQL** — LangGraph checkpointer for session state

### 2. Start Infrastructure

Make sure RabbitMQ, Redis, and PostgreSQL are running:

```bash
# Using Docker (all three services in one container set)
docker run -d -p 5672:5672 -p 6379:6379 -p 5432:5432 rabbitmq:3 redis:7 postgres:16
```

### 3. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
uv venv
source .venv/bin/activate

# Install dependencies
uv sync

# Create .env file with your configuration
# Edit .env and set your secrets:
#   BROKER_URL=amqp://guest:guest@localhost:5672//
#   REDIS_URL=redis://localhost:6379
#   DB_URI=postgresql://user:pass@localhost:5432/dbname
#   OPENAI_API_KEY=sk-...

# Start the Celery worker (REQUIRED — handles all agent tasks)
celery -A src.celery_app worker --loglevel=info

# In a new terminal, start the FastAPI dev server
uvicorn main:app --reload
# Server starts at http://localhost:8000
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local

# Start the dev server
npm run dev
# App starts at http://localhost:3000
```

### 5. Open the App

Open [http://localhost:3000](http://localhost:3000) in your browser. Type a message and the agent will stream its reasoning, tool calls, and response in real-time.

## Project Structure

```
fictional-bassoon/
├── main.py                      # FastAPI entry point (thin, ~90 lines)
├── CLAUDE.md                    # Developer reference (this project's codebase guide)
├── docker-compose.yaml           # Docker compose for infrastructure
│
├── backend/
│   ├── main.py                  # FastAPI app, /chat and /health endpoints
│   ├── pyproject.toml           # Python dependencies
│   ├── uv.lock                  # Locked dependency lockfile
│   ├── .env                     # Environment variables (secrets)
│   ├── logging.ini              # Python logging configuration
│   ├── docker/
│   │   ├── Dockerfile           # Backend Docker image
│   │   └── .env.example         # Example environment variables
│   ├── src/
│   │   ├── agent.py             # LangGraph DeepAgent construction
│   │   ├── celery_app.py        # Celery configuration
│   │   ├── models/
│   │   │   └── chat_models.py   # Pydantic ChatRequest model
│   │   ├── queue/
│   │   │   └── redis_pubsub.py  # Redis pub/sub helpers
│   │   └── worker/
│   │       ├── tasks.py          # Celery task definition
│   │       └── worker_runner.py # Async agent execution
│   ├── utils/
│   │   └── streaming.py         # LangGraph → SSE event conversion
│   └── notebooks/
│       └── test_stream.ipynb    # Streaming test notebook
│
└── frontend/
    ├── package.json             # Node dependencies
    ├── next.config.mjs          # Next.js configuration
    ├── tailwind.config.ts       # Tailwind CSS configuration
    ├── tsconfig.json            # TypeScript configuration
    ├── .env.local               # Frontend environment variables
    ├── docker/
    │   └── Dockerfile           # Frontend Docker image (multi-stage, standalone)
    ├── docker-compose.yaml      # Frontend compose file
    └── src/
        ├── app/
        │   ├── layout.tsx       # Root layout (ThreadProvider, dark mode)
        │   ├── page.tsx         # App entry point
        │   └── globals.css      # Global styles (Tailwind imports)
        ├── components/
        │   ├── chat/
        │   │   ├── Chat.tsx           # Main chat container
        │   │   ├── MessageList.tsx    # Scrollable message list
        │   │   ├── MessageBubble.tsx  # Single message display
        │   │   ├── MessageInput.tsx   # User input form
        │   │   ├── StreamingRenderer.tsx  # SSE event renderer
        │   │   └── MarkdownSection.tsx    # Markdown content renderer
        │   └── sidebar/
        │       ├── Sidebar.tsx        # Conversation sidebar
        │       ├── ThreadItem.tsx     # Individual thread item
        │       └── NewThreadButton.tsx    # New thread button
        ├── context/
        │   └── ThreadContext.tsx  # Thread state management
        ├── hooks/
        │   └── useSSEStream.ts    # SSE stream consumption hook
        └── types/
            └── index.ts         # TypeScript type definitions
```

## API Reference

### POST /chat

Sends a chat message and starts a streaming agent session.

**Request body:**

```json
{
  "message": "What is the weather in Tokyo?",
  "thread_id": "default",
  "job_id": "optional-custom-uuid"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `message` | string | Yes | — | User message (1–10,000 chars) |
| `thread_id` | string | No | `default` | Conversation thread ID |
| `job_id` | string | No | auto UUID | Unique job identifier |

**Response:** SSE stream (`text/event-stream`)

**Event types in the SSE stream:**

| Event | Description | Data format |
|---|---|---|
| `reasoning` | Agent's internal reasoning/thinking tokens | Raw string |
| `tool_call` | Tool invocation by the agent | JSON `{name, args}` |
| `tool_result` | Tool response | Raw string |
| `answer` | Final response tokens | Raw string |
| `agent` | Agent handoff (which agent is active) | String |
| `error` | Error occurred | Error message |
| `done` | Stream finished | Empty |

**Example:**

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, agent!", "thread_id": "test"}' \
  --no-buffer
```

### GET /health

Simple health check endpoint.

**Response:**

```json
{ "status": "ok" }
```

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend** | FastAPI | HTTP server + SSE streaming |
| | Celery | Background task queue |
| | Redis | Pub/sub bridge (worker ↔ API) |
| | LangGraph | Agent orchestration |
| | PostgreSQL | Checkpointer (session state) |
| | OpenAI GPT-4.1-Nano | LLM inference |
| **Frontend** | Next.js 14 | React framework (App Router) |
| | TypeScript | Type safety |
| | Tailwind CSS | Styling |
| | react-markdown | Markdown rendering |
| | Lucide React | Icon library |

## Development

### Running everything locally

```bash
# Terminal 1: Start Celery worker
cd backend && source .venv/bin/activate
celery -A src.celery_app worker --loglevel=info

# Terminal 2: Start FastAPI server
uvicorn main:app --reload

# Terminal 3: Start frontend
cd frontend && npm run dev
```

### Docker deployment

```bash
cd backend
docker compose up --build
```

### Testing

```bash
cd backend
uv run pytest          # Run all tests
uv run tox             # Run tests across Python versions
```

## Configuration

### Backend (`.env` in `backend/`)

| Variable | Default | Description |
|---|---|---|
| `BROKER_URL` | `amqp://guest:guest@localhost` | RabbitMQ connection string |
| `CELERY_RESULT_BACKEND` | `rpc://` | Celery result backend |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `DB_URI` | — (required) | PostgreSQL connection string |
| `OPENAI_API_KEY` | — (required) | OpenAI API key |

### Frontend (`.env.local` in `frontend/`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL |

## Streaming Details

The streaming pipeline works as follows:

1. Client sends `POST /chat` with a message
2. FastAPI generates a `job_id` (UUID) and subscribes to Redis channel `stream:{job_id}`
3. FastAPI enqueues the task to Celery via `run_agent_task.delay()`
4. Celery worker runs the LangGraph agent with `astream(stream_mode=["messages", "updates"])`
5. Each agent event is converted to an SSE event dict by `stream_agent_events()`
6. Events are published to Redis pub/sub via `publish_event()`
7. FastAPI reads from Redis and forwards to the client as SSE
8. When the agent finishes, a `done` event is emitted and the subscription closes

**Key pattern decisions:**

- `stream_mode=["messages", "updates"]` — captures both token-level and message-level events
- `version="v2"` — uses the latest LangGraph streaming API contract
- `subgraphs=True` — captures events from sub-agents
- Reasoning content lives in `content_blocks` — never in `additional_kwargs`

## Troubleshooting

### No events streaming to the client

1. **Celery worker not running?** All agent tasks require the worker. Check: `celery -A src.celery_app inspect ping`
2. **Redis not reachable?** `redis-cli ping` should return `PONG`
3. **RabbitMQ not running?** `rabbitmqctl status \| grep RabbitMQ`

### Agent hangs or times out

- Default Celery time limit is 360s (6 min). Long-running agents may need `soft_time_limit` adjustments in `src/tasks.py`.
- Check PostgreSQL connectivity — the checkpointer is required for session state.

### Frontend can't connect to backend

- Verify `NEXT_PUBLIC_API_URL` in `frontend/.env.local` matches your backend URL
- Check CORS settings in `main.py` (currently allows all origins with `allow_origins=["*"]`)
- Ensure the backend is running on the expected port (default: 8000)

## File Locations

| What you need | Where to find it |
|---|---|
| FastAPI routes | `backend/main.py` |
| Agent construction | `backend/src/agent.py` |
| Streaming event conversion | `backend/utils/streaming.py` |
| Pydantic models | `backend/src/models/chat_models.py` |
| Celery task | `backend/src/worker/tasks.py` |
| Redis pub/sub | `backend/src/queue/redis_pubsub.py` |
| SSE hook (frontend) | `frontend/src/hooks/useSSEStream.ts` |
| Chat components | `frontend/src/components/chat/` |
| Thread context | `frontend/src/context/ThreadContext.tsx` |
| TypeScript types | `frontend/src/types/index.ts` |
| Developer reference | `CLAUDE.md` and `.claude/rules/` |
