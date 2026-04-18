# Architecture

## Request flow

POST /chat → ChatRequest → enqueue run_agent_task (Celery)
→ subscribe Redis pub/sub stream:{job_id} → yield SSE to client

## Worker flow

run_agent_task → run_agent_and_stream() (async)
→ stream_agent_events() via LangGraph astream()
→ publish each event via publish_event() to Redis

## File responsibilities

- main.py — FastAPI app, /chat and /health only, stays thin (~20 lines)
- agent.py — agent construction as module-level variable, no wrapper functions
- streaming.py — LangGraph event conversion to typed dicts
- models.py — Pydantic models only, nothing else
- celery_app.py — Celery config only
- tasks.py — Celery task, bridges sync→async
- worker_runner.py — async agent execution, publishes to Redis
- redis_pubsub.py — publish_event() and subscribe() helpers only

## Hard rules

- main.py must stay thin — no business logic
- agent.py instantiates at module level — no pointless factory wrappers
- models.py is models only — no utility functions
- Do not add logic to files that are not responsible for it
