---
paths:
  - "backend/docker/citus/init.sql"
  - "backend/src/db_bootstrap.py"
  - "backend/src/models/chat_models.py"
  - "backend/src/protocol/**"
---

# Citus / thread_id Integrity

## Context — read this before assuming anything about sharding

`backend/docker/citus/init.sql` has a comment block stating, explicitly, that
the LangGraph checkpoint tables (`checkpoints`, `checkpoint_blobs`,
`checkpoint_writes`) are deliberately **not** Citus-distributed, because of a
known incompatibility between Citus and LangGraph's correlated subqueries
over `jsonb_each_text`. They're local tables on the coordinator, keyed by
`thread_id` in their primary key, but not sharded by it.

Further: there is no `create_distributed_table` call anywhere in this repo —
not for those tables, not for `api.users` / `api.threads` / `api.messages`.
Despite `CLAUDE.md` describing the database as "sharded by thread_id,"
nothing is currently Citus-distributed. The coordinator + 2-worker cluster
exists, but distribution hasn't been turned on. `thread_id` is the intended
future shard key by schema design, not the present reality.

## Hard rules

- Any new identifier introduced by AG-UI (thread/run ID) or A2A (task ID,
  context ID) must resolve to the existing `thread_id` value already threaded
  through `ChatRequest`, the checkpoint tables, and `api.threads`. Do not
  introduce a second, parallel session/task ID system.
- If this rewrite is the moment distribution actually gets turned on,
  re-verify the documented `jsonb_each_text` incompatibility against the
  current `langgraph-checkpoint-postgres` version before running
  `create_distributed_table` on the checkpoint tables — the workaround
  comment predates this rewrite and may or may not still apply.
- Don't update `CLAUDE.md`'s "sharded by thread_id" language to imply
  distribution is active unless it actually is. Say "keyed by thread_id,
  distribution not yet enabled" until that changes.
