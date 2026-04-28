# fictional-bassoon

High-performance, full-stack AI chat application designed to stream real-time agent reasoning, tool calls, and final answers. Built for industrial scalability and high visibility.

## Overview

This project is a showcase of distributed systems engineering applied to AI agents. It streams real-time agent reasoning, tool calls, tool results, and final answers to the browser via **Server-Sent Events (SSE)**. The architecture offloads heavy "Deep Agent" workloads to asynchronous workers, utilizes a sharded database cluster for infinite state persistence, and provides complete observability and LLM tracing across the entire stack.

## Architecture

```mermaid
%%{init: {'flowchart': {'useMaxWidth': false, 'curve': 'basis', 'rankSpacing': 120, 'nodeSpacing': 50}}}%%
graph TB
    SpacerTop[ ]
    SpacerMid1[ ]
    SpacerMid2[ ]
    SpacerBottom[ ]
    classDef browser fill:#e8e8e8,stroke:#888,color:#222
    classDef frontend fill:#ede9fe,stroke:#7c3aed,color:#3b0764
    classDef backend fill:#d1fae5,stroke:#059669,color:#064e3b
    classDef postgres fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef redis fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef observability fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef clickhouse fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef monitoring fill:#ede9fe,stroke:#7c3aed,color:#3b0764
    classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a

    subgraph Client [Browser]
        UI[Chat UI]
    end
    subgraph Proxy [Nginx]
        NG[Reverse Proxy]
    end
    subgraph Frontend [Next.js App]
        SSE[useSSEStream Hook]
        Auth[Auth Logic]
    end
    subgraph Backend [FastAPI & Workers]
        API[FastAPI /chat]
        AuthAPI[FastAPI /auth]
        Worker[Celery Worker]
        Agent[LangChain Deep Agent]
    end

    %% 🔥 External Tool Layer (new)
    subgraph Tools [External Tools]
        Tavily[Tavily Search API 🔎]
    end

    subgraph Observability [Langfuse Suite]
        Langfuse[Langfuse Web/Worker]
        Minio[Minio Object Store]
        LangfuseRedis[Langfuse Redis Cache/Queue]
        subgraph ClickhouseCluster [ClickHouse Cluster]
            CH01[CH-01 Node]
            CH02[CH-02 Node]
            CH03[CH-03 Node]
            CKP1[Keeper 01]
            CKP2[Keeper 02]
            CKP3[Keeper 03]
        end
    end

    subgraph Persistence [Distributed Data Layer]
        Broker[RabbitMQ Broker]
        subgraph RedisCluster [Redis Sentinel Cluster]
            RedisPrimary[App Redis Primary]
            RedisR1[Replica 1]
            RedisR2[Replica 2]
            Sentinel1[Sentinel 1]
            Sentinel2[Sentinel 2]
            Sentinel3[Sentinel 3]
        end
        PubSub[Redis Pub/Sub]
        subgraph PostgresCluster [Postgres Cluster]
            PgB[PgBouncer Pool]
            PGRST[PostgREST /api/db]
            CitusC[Citus Coordinator]
            CW1[Citus Worker 1]
            CW2[Citus Worker 2]
        end
    end

    subgraph Monitoring [LGTM Stack]
        Alloy[Grafana Alloy]
        Loki[Loki Logs]
        Prom[Prometheus Metrics]
        Tempo[Tempo Traces]
        Grafana[Grafana Dashboards]
    end

    %% 🔧 VERTICAL SPINE
    UI --> NG --> SSE --> API --> Broker --> Worker --> Agent --> PgB --> CitusC
    SpacerTop --> UI
    API --> SpacerMid1 --> Broker
    Worker --> SpacerMid2 --> Agent
    CitusC --> SpacerBottom

    %% FLOW
    UI -->|port 80| NG
    NG --> SSE
    NG -->|/api/auth| AuthAPI
    NG -->|/api/chat| API
    NG -->|/api/db| PGRST
    API -->|Subscribe| PubSub
    API -->|Enqueue Task| Broker
    Broker -->|Execute| Worker
    Worker -->|Run| Agent

    %% 🔥 Tavily tool usage (new)
    Agent -.->|Tool Call| Tavily

    Agent -->|Checkpoint| PgB
    PGRST -->|CRUD| PgB
    AuthAPI -->|Users| PgB
    PgB --> CitusC
    CitusC --> CW1
    CitusC --> CW2
    Agent -->|Publish Events| PubSub
    PubSub -->|SSE Stream| API
    Agent -->|Trace| Langfuse
    Langfuse --> Minio
    Langfuse --> CH01
    CH01 --- CH02
    CH02 --- CH03
    CKP1 --- CKP2
    CKP2 --- CKP3
    Langfuse --> LangfuseRedis

    %% Shared infra hint
    LangfuseRedis -.->|Shared Redis Infra| RedisPrimary

    RedisPrimary --> RedisR1
    RedisPrimary --> RedisR2
    Sentinel1 --- Sentinel2
    Sentinel2 --- Sentinel3

    Worker -.->|Metrics| Prom
    API -.->|Metrics| Prom
    Alloy -.->|Logs| Loki
    Prom --> Grafana
    Loki --> Grafana
    Tempo --> Grafana

    style SpacerTop fill:none,stroke:none
    style SpacerMid1 fill:none,stroke:none
    style SpacerMid2 fill:none,stroke:none
    style SpacerBottom fill:none,stroke:none

    %% NODE COLORS
    class UI,NG browser
    class SSE,Auth frontend
    class API,AuthAPI,Worker,Agent backend
    class PgB,PGRST,CitusC,CW1,CW2 postgres
    class RedisPrimary,RedisR1,RedisR2,Sentinel1,Sentinel2,Sentinel3,PubSub redis
    class Langfuse,Minio,LangfuseRedis observability
    class CH01,CH02,CH03,CKP1,CKP2,CKP3 clickhouse
    class Alloy,Loki,Prom,Tempo,Grafana monitoring
    class Tavily external

    %% ZONE COLORS
    style Client fill:#f3f4f6,stroke:#888
    style Proxy fill:#f3f4f6,stroke:#888
    style Frontend fill:#f5f3ff,stroke:#7c3aed
    style Backend fill:#ecfdf5,stroke:#059669
    style Tools fill:#f8fafc,stroke:#64748b
    style Persistence fill:#eff6ff,stroke:#2563eb
    style Observability fill:#fffbeb,stroke:#d97706
    style ClickhouseCluster fill:#fef2f2,stroke:#dc2626
    style Monitoring fill:#f5f3ff,stroke:#7c3aed
```

## Key Design Decisions

- **SSE over WebSockets**  
  Simpler, more reliable streaming model for server → client updates. Leverages standard HTTP and provides automatic keep-alive support via FastAPI's `EventSourceResponse`.

- **Celery + RabbitMQ for Orchestration**  
  Decouples the long-running agent reasoning process from the HTTP request lifecycle, ensuring the API remains responsive.

- **PostgREST for Automated CRUD**  
  Exposes the Postgres database directly as a REST API for standard data operations (user profiles, message history), removing the need for boilerplate FastAPI CRUD endpoints.

- **Redis Sentinel for High Availability**  
  Ensures resilient pub/sub event streaming and caching for distributed components.

- **Dual PgBouncer Pools (Transaction + Session)**  
  Optimizes database connectivity by separating short-lived API queries from long-lived agent state connections.

- **Citus for Horizontal Scaling**  
  Shards LangGraph agent state by `thread_id` across a multi-node cluster, ensuring the system can handle millions of concurrent conversations.

- **Langfuse Observability & Clickhouse**  
  Provides deep tracing of agent trajectories, token usage analysis, and detailed execution logs for production debugging. Langfuse utilizes Redis/Valkey for asynchronous event queuing (via BullMQ), API key validation, and prompt caching.

- **LGTM Stack for Infrastructure Monitoring**  
  Full integration of Loki (logs), Grafana (dashboards), Tempo (tracing), and Prometheus (metrics) across all distributed boundaries.

## Project Structure

```
fictional-bassoon/
├── docker/                     # Master Orchestration
│   ├── docker-compose.yml      # Unified Stack Config
│   └── nginx/                  # Reverse Proxy Config
├── backend/                    # FastAPI Backend
│   ├── main.py                 # API Entry Point (/chat, /auth)
│   ├── src/                    # Logic, Models, & Auth
│   ├── docker/                 # Monitoring, Citus & Redis config
│   └── docker-compose.yaml     # Backend-specific Stack
└── frontend/                   # Next.js Frontend
    ├── src/                    # UI Components & Context
    └── docker-compose.yaml     # Frontend-specific Stack
```

## Quick Start (Unified Stack)

The easiest way to run the entire application is using the master Docker Compose:

```bash
cd docker
docker compose up -d
```

This will start the unified gateway on [http://localhost](http://localhost).

## Local Development

### 1. Start Infrastructure
```bash
cd backend
docker compose up -d
```

### 2. Backend Setup
```bash
cd backend
uv sync
source .venv/bin/activate
celery -A src.celery_app worker --loglevel=info &
uvicorn main:app --reload
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## Monitoring & Observability

Consolidated access through Nginx and direct ports:

| Service | Proxy URL | Direct URL | Purpose |
|---|---|---|---|
| **Chat UI** | [http://localhost](http://localhost) | [http://localhost:3000](http://localhost:3000) | Main Application |
| **API Docs** | [http://localhost/api/docs](http://localhost/api/docs) | [http://localhost:8000/docs](http://localhost:8000/docs) | API Reference |
| **Langfuse** | - | [http://localhost:3030](http://localhost:3030) | LLM Tracing & Observability |
| **PostgREST** | [http://localhost/api/db](http://localhost/api/db) | [http://localhost:3002](http://localhost:3002) | Data Explorer |
| **Grafana** | - | [http://localhost:3001](http://localhost:3001) | Dashboards & Logs |
| **Prometheus** | - | [http://localhost:9090](http://localhost:9090) | Metrics |
| **Redis Insight** | - | [http://localhost:5540](http://localhost:5540) | Redis GUI |
