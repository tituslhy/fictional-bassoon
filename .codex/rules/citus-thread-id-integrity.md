---
paths:
  - "backend/docker/citus/init.sql"
  - "backend/src/db_bootstrap.py"
  - "backend/src/models/chat_models.py"
  - "backend/src/protocol/**"
---

# Citus / thread_id Integrity

## Context — read this before assuming anything about sharding

Citus **is** clustered at runtime: FastAPI startup (`backend/src/db_bootstrap.py`)
calls `citus_set_coordinator_host`, `citus_add_node` for each entry in
`CITUS_WORKER_NODES`, then distributes tables. Compose wires
`citus_worker_1:5432,citus_worker_2:5432` and waits for both workers to be
healthy before the backend starts. `init.sql` only CREATE TABLEs — it cannot
register workers that are not up yet.

Distribution:

- `api.users` — **reference table** (replicated). Required so
  `api.threads.user_id` can keep its FK.
- `api.threads` — distributed by `id` (the thread_id shard key).
- `api.messages` — distributed by `thread_id`, colocated with `api.threads`.
  Primary key is `(thread_id, id)` because Citus unique/PK constraints must
  include the distribution column. Existing volumes with PK `(id)` are
  migrated on bootstrap.
- LangGraph `checkpoints` / `checkpoint_blobs` / `checkpoint_writes` —
  distributed by `thread_id` and colocated with each other. If Citus still
  rejects LangGraph's `jsonb_each_text` correlated subquery (`invalid
  attnum`), bootstrap **logs and leaves those tables local** rather than
  failing the API schema. Re-verify against the installed
  `langgraph-checkpoint-postgres` before assuming they sharded.

`thread_id` / `api.threads.id` remain the one session key. AG-UI run IDs and
A2A `taskId`/`contextId` must resolve to that pair — no third ID system.

## Hard rules

- Any new identifier introduced by AG-UI (thread/run ID) or A2A (task ID,
  context ID) must resolve to the existing `thread_id` value already threaded
  through `ChatRequest`, the checkpoint tables, and `api.threads`. Do not
  introduce a second, parallel session/task ID system.
- Do not add `create_distributed_table` calls outside `db_bootstrap.py`.
  Worker membership belongs there too (idempotent `citus_add_node`), not a
  new compose service.
- Don't describe the cluster as "distribution not yet enabled". Say
  `api.threads` / `api.messages` are sharded by `thread_id`, users are a
  reference table, and checkpoint tables are sharded unless bootstrap
  recorded a fallback.
