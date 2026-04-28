# Project Context: fictional-bassoon

This project is a high-performance, full-stack AI chat application designed to stream real-time agent reasoning, tool calls, tool results, and final answers using Server-Sent Events (SSE). It features secure user authentication with JWT, a distributed architecture with a FastAPI backend, LangGraph for agent orchestration, and Celery for asynchronous task processing.

## Architecture & Data Flow

```mermaid
graph TD
    subgraph Frontend [Next.js]
        Hook[useSSEStream]
    end

    subgraph API [FastAPI]
        Chat[/chat]
        Auth[/auth]
    end

    subgraph Async [Celery & Redis]
        Worker[Celery Worker]
        PubSub[Redis Pub/Sub]
    end

    subgraph Intelligence [LangGraph]
        Agent[Agent Graph]
        PgB[PgBouncer]
        Citus[Citus Cluster]
    end

    Hook -->|POST| Chat
    Hook -->|POST| Auth
    Chat -->|Subscribe| PubSub
    Chat -->|Enqueue| Worker
    Worker -->|Execute| Agent
    Agent -->|Checkpoint| PgB
    PgB -->|Pool| Citus
    Agent -->|Publish| PubSub
    PubSub -->|Stream| Chat
    Chat -->|SSE| Hook
```

- **Backend (`backend/`):** FastAPI manages authentication and the SSE connection. It generates a unique `job_id` for every request, subscribes to a corresponding Redis Pub/Sub channel, and yields messages as they arrive.
- **Worker:** A Celery worker (using RabbitMQ as a broker) executes the agent. It publishes serialized events to the specific Redis channel, ensuring the API layer remains non-blocking.
- **Intelligence Layer:** LangGraph manages agent state. Checkpoints are persisted to a **Citus Cluster** sharded by `thread_id` to ensure horizontal scalability.
- **Connection Pooling:** **PgBouncer** is used as a front-door to the database cluster to handle the high volume of transient connections from distributed Celery workers.
- **Streaming Pipeline:** Events are emitted via LangGraph's `astream` with `stream_mode=["messages","updates"]`, `version="v2"`, and `subgraphs=True`.

## Monitoring Stack (LGTM)

The infrastructure includes a pre-configured observability stack:
- **Loki:** Aggregates logs from all Docker containers via Grafana Alloy.
- **Grafana:** Centralized dashboarding for metrics, logs, and traces.
- **Tempo:** Distributed tracing (OTLP) for identifying latency in agent tool calls.
- **Prometheus:** Scrapes metrics from FastAPI, Celery Workers, RabbitMQ, Redis, **Citus nodes, and PgBouncer**.
- **Redis Insight:** Real-time visibility into the Pub/Sub and caching layer.

## Project Structure

```bash
fictional-bassoon/
├── backend/
│   ├── main.py              # Entry point, SSE & Auth logic
│   ├── src/
│   │   ├── agent.py         # LangGraph definition
│   │   ├── auth.py          # JWT/Password auth
│   │   ├── celery_app.py    # Worker & Metrics setup
│   │   ├── db.py            # DB connection pooling
│   │   ├── queue/           # Redis Pub/Sub management
│   │   └── worker/          # Task orchestration
│   ├── docker/              # Monitoring & Deployment config
│   └── tests/               # Backend testing
└── frontend/
    ├── src/
    │   ├── app/             # UI Pages
    │   ├── components/      # React Components
    │   ├── context/         # Auth & Thread State
    │   ├── hooks/           # SSE logic (useSSEStream)
    │   └── types/           # TS Interfaces
```

## Technical Standards

### Streaming Contract
- **Event Types:** `reasoning`, `tool_call`, `tool_result`, `answer`, `agent`, `error`, `done`.
- **Reasoning:** Captured from `AIMessageChunk.content_blocks`.
- **Concurrency:** Every Celery task maintains its own isolated event loop and connection pool to prevent `RuntimeError: Event loop is closed`.

### Data Persistence
- **Sharding:** All LangGraph checkpoint tables are distributed across the Citus cluster using `thread_id` as the distribution column.
- **Pooling:** All database access from the application layer must go through the PgBouncer pooler (port 6432) to ensure connection stability.

### Observability
- **Metrics:** FastAPI is instrumented with `prometheus_fastapi_instrumentator`. Celery workers run a sidecar metrics server on port `8001`. Citus nodes and PgBouncer are monitored via dedicated exporters.
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
