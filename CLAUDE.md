# fictional-bassoon

FastAPI SSE streaming backend for a LangGraph Deep Agent.
Streams reasoning, tool calls, tool results, and final answer as SSE.
Celery + Redis pub/sub bridges the async worker to the FastAPI response.

## What this is NOT
- Not a monolith — never consolidate logic into one file
- Frontend is not yet developed — do not scaffold it

## Structure
- backend/ — all server code
- frontend/ — empty, pending

## Dev Commands
cd backend
uv sync                                          # install deps
uvicorn main:app --reload                        # dev server
celery -A celery_app worker --loglevel=info      # required for streaming

## Prerequisites
- RabbitMQ on localhost:5672 (Celery broker)
- Redis on localhost:6379 (pub/sub bridge)

## Code Standards
- Google-style docstrings on all functions and classes
- Comments explain WHY not WHAT — never comment self-evident code
- Pydantic models for all request/response shapes

## Rules
See .claude/rules/ for detailed standards:
- streaming-patterns.md — LangGraph streaming API contract (read this first)
- architecture.md — file responsibilities and what lives where