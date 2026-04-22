# Project Context: fictional-bassoon

This project is a high-performance, full-stack AI chat application designed to stream real-time agent reasoning, tool calls, tool results, and final answers using Server-Sent Events (SSE). It utilizes a distributed architecture with a FastAPI backend, LangGraph for agent orchestration, and Celery for asynchronous task processing.

## Architecture & Data Flow

```mermaid
graph TD
    subgraph Frontend [Next.js]
        Hook[useSSEStream]
    end

    subgraph API [FastAPI]
        Chat[/chat]
    end

    subgraph Async [Celery & Redis]
        Worker[Celery Worker]
        PubSub[Redis Pub/Sub]
    end

    subgraph Intelligence [LangGraph]
        Agent[Agent Graph]
        DB[(PostgreSQL)]
    end

    Hook -->|POST| Chat
    Chat -->|Subscribe| PubSub
    Chat -->|Enqueue| Worker
    Worker -->|Execute| Agent
    Agent -->|Publish| PubSub
    Agent -->|Checkpoint| DB
    PubSub -->|Stream| Chat
    Chat -->|SSE| Hook
```

- **Backend (`backend/`):** FastAPI manages the SSE connection. It generates a unique `job_id` for every request, subscribes to a corresponding Redis Pub/Sub channel, and yields messages as they arrive.
- **Worker:** A Celery worker (using RabbitMQ as a broker) executes the agent. It publishes serialized events to the specific Redis channel, ensuring the API layer remains non-blocking.
- **Streaming Pipeline:** Events are emitted via LangGraph's `astream` (v2) with `stream_mode=["messages", "updates"]`.

## Monitoring Stack (LGTM)

The infrastructure includes a pre-configured observability stack:
- **Loki:** Aggregates logs from all Docker containers via Grafana Alloy.
- **Grafana:** Centralized dashboarding for metrics, logs, and traces.
- **Tempo:** Distributed tracing (OTLP) for identifying latency in agent tool calls.
- **Prometheus:** Scrapes metrics from FastAPI, Celery Workers, RabbitMQ, Redis, and Postgres.
- **Redis Insight:** Real-time visibility into the Pub/Sub and caching layer.

## Project Structure

```bash
fictional-bassoon/
├── backend/
│   ├── main.py              # Entry point, SSE logic
│   ├── src/
│   │   ├── agent.py         # LangGraph definition
│   │   ├── celery_app.py    # Worker & Metrics setup
│   │   ├── queue/           # Redis Pub/Sub management
│   │   └── worker/          # Task orchestration
│   ├── docker/              # Monitoring & Deployment config
│   └── tests/               # Backend testing
└── frontend/
    ├── src/
    │   ├── app/             # UI Pages
    │   ├── components/      # React Components
    │   ├── context/         # Thread State
    │   ├── hooks/           # SSE logic (useSSEStream)
    │   └── types/           # TS Interfaces
```

## Technical Standards

### Streaming Contract
- **Event Types:** `reasoning`, `tool_call`, `tool_result`, `answer`, `agent`, `error`, `done`.
- **Reasoning:** Captured from `AIMessageChunk.content_blocks`.
- **Concurrency:** Every Celery task maintains its own isolated event loop and connection pool to prevent `RuntimeError: Event loop is closed`.

### Observability
- **Metrics:** FastAPI is instrumented with `prometheus-fastapi-instrumentator`. Celery workers run a sidecar metrics server on port `8001`.
- **Logs:** Structured logging is piped to Loki with `container_name` labels.

## Build & Run

### 1. Infrastructure
```bash
cd backend
docker compose up -d
```

### 2. Backend & Worker
```bash
# In separate terminals
celery -A src.celery_app worker --loglevel=info
uvicorn main:app --reload
```

### 3. Frontend
```bash
cd frontend
npm run dev
```
