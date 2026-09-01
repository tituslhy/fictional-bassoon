# Architecture

## Request flow

POST /chat → ChatRequest → enqueue run_agent_task (Celery)
→ subscribe Redis pub/sub stream:{job_id} → yield SSE to client

POST /auth/signup and /auth/login are synchronous — straight to Postgres,
no Celery, no Redis. Only /chat goes through the queue.

## Worker flow

run_agent_task → run_agent_and_stream() (async)
→ stream_agent_events() via LangGraph astream()
→ publish each event via publish_event() to Redis

## File responsibilities

- main.py — FastAPI app: /auth/signup, /auth/login, /chat, /health (171
  lines — not thin; auth handlers live inline rather than their own module)
- src/agent.py — agent construction via create_agent()/get_agent() functions,
  not a module-level constant
- utils/streaming.py — LangGraph event conversion to typed dicts
- src/models/ — Pydantic models only (auth_models.py, chat_models.py),
  nothing else
- src/celery_app.py — Celery config only
- src/worker/tasks.py — Celery task, bridges sync→async
- src/worker/worker_runner.py — async agent execution, publishes to Redis
- src/queue/redis_pubsub.py — publish_event() and subscribe() helpers only
- src/db.py — global asyncpg connection pool (get_db_pool / close_db_pool)
- src/db_bootstrap.py — schema bootstrap (tables, roles, RLS, Citus
  worker registration and create_distributed_table), run on FastAPI
  startup via the lifespan handler

## Hard rules

- agent.py exposes create_agent()/get_agent() — no additional wrapper layers
  beyond those two.
- src/models/ is models only — no utility functions.
- Do not add logic to files that are not responsible for it.
- If you touch main.py, don't add to the auth-logic-inline drift — flag it
  rather than deepening it. Extracting auth into its own module is a
  separate task, not something to fold into an unrelated change.

