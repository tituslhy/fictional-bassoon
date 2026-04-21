# Project Context: fictional-bassoon

This project is a full-stack AI chat application designed to stream real-time agent reasoning, tool calls, tool results, and final answers using Server-Sent Events (SSE). It leverages a FastAPI backend with LangGraph for agent orchestration, Celery for background processing, and a Next.js frontend for a reactive user experience.

## Project Overview

- **Purpose:** Provide a robust, streaming-first AI chat interface.
- **Architecture:** 
  - **Backend (`backend/`):** FastAPI handles HTTP requests. `/chat` enqueues tasks to Celery and subscribes to a Redis channel to stream events back to the client via SSE.
  - **Worker:** A Celery worker executes the LangGraph agent asynchronously, publishing events to Redis Pub/Sub.
  - **Frontend (`frontend/`):** A Next.js 14 application (App Router) that consumes the SSE stream and manages conversation threads.
- **Key Technologies:**
  - **Backend:** FastAPI, LangGraph, Celery, Redis, PostgreSQL (Checkpointer), OpenAI GPT-4.
  - **Frontend:** Next.js 14, TypeScript, Tailwind CSS, Lucide React.
  - **Infrastructure:** RabbitMQ (Broker), Redis (Pub/Sub), PostgreSQL (Session State).

## Building and Running

### Backend Setup
1. **Environment:** Use `uv` for dependency management.
   ```bash
   cd backend
   uv sync
   source .venv/bin/activate
   ```
2. **Infrastructure:** Ensure RabbitMQ, Redis, and PostgreSQL are running.
   ```bash
   docker compose up -d
   ```
3. **Run Celery Worker (Required):**
   ```bash
   celery -A src.celery_app worker --loglevel=info
   ```
4. **Run FastAPI Server:**
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Setup
1. **Install Dependencies:**
   ```bash
   cd frontend
   npm install
   ```
2. **Run Development Server:**
   ```bash
   npm run dev
   ```

### Testing
- **Backend:** `uv run pytest` or `uv run tox` for cross-version testing.

## Development Conventions

### Backend Standards
- **File Responsibilities:**
  - `main.py`: Thin entry point (~90 lines), handles `/chat` and `/health` only. No business logic.
  - `src/agent.py`: LangGraph agent construction. Instantiated at module level (no factory wrappers).
  - `src/models/`: Pydantic models only.
  - `src/worker/tasks.py`: Bridges sync Celery tasks to async execution.
  - `utils/streaming.py`: Converts LangGraph events into SSE-compatible dicts.
- **Code Quality:** Use Google-style docstrings. Comments should explain *why*, not *what*.
- **Pydantic:** Strictly use Pydantic for all request/response schemas.

### Frontend Standards
- **Framework:** Next.js App Router with TypeScript (strict mode).
- **Styling:** Tailwind CSS only. Avoid custom CSS files.
- **SSE Handling:** Implement `useSSEStream` hook to handle `reasoning`, `tool_call`, `tool_result`, `answer`, `agent`, `error`, and `done` events.
- **UI:** Display reasoning tokens distinctly (e.g., italicized or in a collapsible section).

### Streaming Patterns (Non-negotiable)
- **LangGraph Config:** 
  - `stream_mode=["messages", "updates"]`
  - `version="v2"`
  - `subgraphs=True`
- **Reasoning:** Content must live in `content_blocks`, never in `additional_kwargs`.

## Key Files & Locations
- **API Routes:** `backend/main.py`
- **Agent Logic:** `backend/src/agent.py`
- **SSE Conversion:** `backend/utils/streaming.py`
- **Frontend Hook:** `frontend/src/hooks/useSSEStream.ts`
- **Thread State:** `frontend/src/context/ThreadContext.tsx`
- **Rules & Standards:** `.claude/rules/`
