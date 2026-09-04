---
paths:
  - "backend/docker/postgres/init.sql"
  - "backend/src/db_bootstrap.py"
  - "backend/src/models/chat_models.py"
  - "backend/src/protocol/**"
---

# thread_id Integrity

## Context

Postgres is a **single node** (no Citus). FastAPI startup
(`backend/src/db_bootstrap.py`) creates the `api` schema, PostgREST
roles, grants, and RLS. `init.sql` does the same on first volume
create. `thread_id` / `api.threads.id` remain the one session key.

- `api.users` — auth identities.
- `api.threads` — keyed by `id` (the thread_id).
- `api.messages` — keyed by `(thread_id, id)` so history rows stay
  colocated with their thread. History hydration still comes from the
  LangGraph checkpointer, not PostgREST `messages(*)`.
- LangGraph `checkpoints` / `checkpoint_blobs` / `checkpoint_writes` —
  local tables keyed by `thread_id`.

AG-UI run IDs and A2A `taskId`/`contextId` must resolve to that pair —
no third ID system.

## Hard rules

- Any new identifier introduced by AG-UI (thread/run ID) or A2A (task ID,
  context ID) must resolve to the existing `thread_id` value already
  threaded through `ChatRequest`, the checkpoint tables, and
  `api.threads`. Do not introduce a second, parallel session/task ID
  system.
- Do not reintroduce Citus (`create_distributed_table`, worker
  registration, `CITUS_*` env). Schema changes belong in
  `db_bootstrap.py` (and `init.sql` for first boot).
