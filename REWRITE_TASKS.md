# Rewrite Tasks — post-protocol follow-ups

This file is the source of truth for where the work stands. If a session
ends — credits run out, crash, whatever — read this file top to bottom
before doing anything else. A subagent's chat output claiming something is
done doesn't count until it's reflected here as `[x]`.

Owned by `planner` — it creates and updates this file. If it looks stale or
wrong, ask `planner` to reconcile it against the actual repo state before
trusting it.

The AG-UI / A2UI / A2A rewrite landed 2026-09-01 (reviewer-verified, live
smoke test passed). That tracker is gone; git history still has it. This
file tracks the next batch: hydrate the chat UI from the LangGraph
checkpointer, two logic breaks from the 2026-09-01 code review, real
Citus sharding, root README mermaid rendering, and A2UI as a
wire protocol (agent-emitted UI JSON), not only a frontend adapter.

## Status legend

- `[ ]` not started
- `[~]` in progress
- `[x]` done — and independently verified by `protocol-reviewer`, not just
  self-reported by the developer subagent that did the work

## 1. Hydrate chat transcript from the checkpointer

**Source of truth for conversation content is the LangGraph Postgres
checkpointer**, not `api.messages`. Sidebar click / refresh should paint
whatever the agent will actually use on the next turn for that `thread_id`.

This is **hydrate latest state**, not LangGraph time-travel. Time-travel
(list `checkpoint_id` / restore a parent / fork) is explicitly out of
scope here — encore, not this task.

- [ ] `GET` history endpoint on the existing FastAPI app (no new container)
      that loads `AsyncPostgresSaver.aget_state({"configurable": {"thread_id"}})`
      for a thread the caller owns. Gate on `api.threads` RLS / `user_id`
      — do **not** expose checkpoint tables through PostgREST.
- [ ] Map checkpoint messages (`HumanMessage` / `AIMessage` / `ToolMessage`)
      onto the existing `ThreadMessage` / A2UI tree (`column` / `reasoning` /
      `tool_call` / `markdown`). Tool loops become `tool_call` nodes. Live
      reasoning tokens from the original SSE tape will **not** come back —
      the checkpointer stores completed graph messages, not the stream.
- [ ] Frontend: on thread select (and on refresh), fetch that history into
      `ThreadContext` instead of `GET /threads?select=*,messages(*)`.
      Same-tab click-back may keep using in-memory state; the fetch is for
      reload / another device / a killed tab.
- [ ] Keep `api.threads` as the user's thread catalog (ownership, title,
      sidebar). Stop using `api.messages` as the transcript (drop dual-write
      from `updateThreadMessages`, or leave the table as unused until a
      later cleanup). `addMessage` / last-row upsert of assistant-only
      rows is the current drift: user turns live in the checkpointer, UI
      reload reads PostgREST.

**Collision watch:** history route mounts on `backend/main.py` (same file
A2A already touched). Mapper should live next to agent/checkpointer code,
not in `src/models/`. Frontend changes are `ThreadContext.tsx` + Chat
thread-select, not the SSE transport (`sse-transport-lock.md`).

Owners: backend history endpoint + mapper; frontend thread hydrate. Not
parallel with a naive split — agree the JSON shape first.

## 2. Streaming cursor only on the in-progress message

Today `MessageList` forwards one `isStreaming` flag to **every**
`MessageBubble`. `StreamingRenderer` then sets `streaming: true` on the
markdown node, so in a multi-turn thread every historical assistant
answer grows a blinking cursor while the new reply is in flight.

- [ ] Key the cursor off the in-progress message only (status
      `streaming`, or the streaming assistant id) — not the global hook.
      User bubbles and completed assistant bubbles stay still.

Owner: `frontend-a2ui-developer` (or main session — small, single-surface).

## 3. Dead worker on `/chat` — idle timeout + UI unlock

A2A already bounds a silent worker at 120s (`IDLE_TIMEOUT_SECONDS` in
`backend/src/protocol/executor.py`) and fails the task. `/chat` does
not: `pubsub.listen()` waits forever; nginx `proxy_read_timeout` is 24h;
the composer stays disabled.

If that connection later closes *without* `RUN_FINISHED` / `RUN_ERROR`
and without a fetch error, `useSSEStream` calls `onComplete` and clears
its own `isStreaming` — but `Chat.tsx` never passes `onComplete`, and
`isStreamingRef` is only cleared on a terminal AG-UI event or `onError`.
The input looks usable; `handleSend` no-ops.

- [ ] Idle timeout on `/chat`'s Redis listen, same class of failure as
      A2A: emit a terminal `RUN_ERROR` (and close the SSE) when the
      worker is presumed dead. Reuse the A2A timeout value unless there's
      a reason to diverge.
- [ ] Wire `onComplete` in `Chat.tsx` (or otherwise clear `isStreamingRef`
      and finalize the assistant message) so a stream that ends without a
      terminal event cannot leave send locked.

Owner: backend `/chat` timeout (touches `backend/main.py`); frontend
`Chat.tsx` / `useSSEStream.ts` unlock. `/chat` timeout must not change
the AG-UI terminal contract (`RUN_ERROR` is terminal on its own).

## 4. Real Citus sharding — workers join, tables distribute

Titus 2026-09-01: yes, we want real sharding. The coordinator + 2 worker
containers already ran; they never formed a cluster.

- [~] Register workers at FastAPI startup (`citus_set_coordinator_host` +
      idempotent `citus_add_node` from `CITUS_WORKER_NODES`). No new
      compose service. Backend waits on both workers healthy.
- [~] `api.users` as a **reference table**; `api.threads` distributed by
      `id`; `api.messages` distributed by `thread_id` and colocated.
      Messages PK is `(thread_id, id)` (Citus unique-constraint rule);
      existing volumes with PK `(id)` are migrated on bootstrap.
- [~] LangGraph checkpoint tables distributed by `thread_id`, colocated
      with each other. If Citus still rejects LangGraph's `jsonb_each_text`
      subquery, bootstrap logs and leaves them local instead of failing
      the API schema.
- [ ] Live smoke after `make up`: `SELECT * FROM citus_get_active_worker_nodes()`
      returns both workers; `pg_dist_partition` lists `api.threads` /
      `api.messages`; a chat round-trip still checkpointers.

Owner: `db_bootstrap.py` + compose env. Docs in
`citus-thread-id-integrity.md`. Existing volumes: first backend start after
this change runs the PK migration + `create_distributed_table` (moves
data onto workers). A wipe (`make clean`) is the nuclear option, not
required.

## 5. Root README mermaid diagrams do not render

Do **not** start this until Titus says so. Tracker only.

GitHub (and similar) fail to paint the diagrams in root `README.md`.
The architecture flowchart (the `graph LR` under Architecture) is the
main one; the sequence diagram under "How a chat message streams" may
be in the same boat. Frontend/backend READMEs also have mermaid blocks
— check those when this is picked up, but the complaint is the root
file.

Likely render-breakers in the architecture graph (confirm, don't
assume one of these is sufficient):

- `%%{init: {...}}%%` directive (`useMaxWidth: false`, nested quotes)
- emoji in a node label (`Tavily Search API 🔎`) and in `%%` comments
- nested subgraphs (ClickHouse inside Observability; Redis/Postgres
  inside Persistence)
- `/` and `+` in quoted node text (`A2A Router /a2a + Agent Card`)

Fix is docs-only when it happens: make the diagrams parse on GitHub.
Do not "simplify the architecture" by deleting services from the
picture.

- [ ] Architecture `graph LR` renders on GitHub.
- [ ] Chat-stream `sequenceDiagram` renders on GitHub.
- [ ] Glance at `frontend/README.md` / `backend/README.md` mermaid
      blocks for the same failure class.

## 6. A2UI over the wire — agent JSON → frontend renderer

Do **not** start this until Titus says so. Tracker only.

The point of A2UI is the agent returns declarative UI (component-tree
JSON) and the host renders it from an allow-list. That is **not** what
happens today.

Checked 2026-09-01:

- Backend (`streaming.py`, agent, A2A) never emits an A2UI tree. The
  wire is AG-UI only (`TEXT_MESSAGE_*`, `REASONING_*`, `TOOL_CALL_*`).
  No `CUSTOM` (or other) event carries component JSON. Grep of
  `backend/` for A2UI / component-tree: zero hits.
- Frontend **can** render a tree: `validateComponentTree` +
  `A2UIRenderer` for the four allow-listed types (`column` /
  `reasoning` / `tool_call` / `markdown`). Tests cover this.
- Chat does not consume a tree from the stream. `StreamingRenderer`
  **builds** a tree locally via `buildLegacyStreamTree` from
  `ThreadMessage` props. `useSSEStream`'s `onA2UITree` is the same
  trick (reduce AG-UI frames → tree) and `Chat.tsx` does not pass it.
- Real A2UI v1.0 surface protocol (`updateComponents`, data binding,
  actions) was deliberately not implemented (`schema.ts`). Even a
  future wire payload would be this nested 4-type subset, not the
  full spec, unless that decision is revisited.

So: renderer yes; agent→JSON→renderer no. A2UI is a rendering
adapter over AG-UI, not a protocol the agent speaks.

When picked up (needs a shape decision first): how a tree rides SSE
without breaking `sse-transport-lock.md` / the AG-UI vocabulary
(e.g. AG-UI `CUSTOM` vs a parallel channel). Backend must emit;
`Chat.tsx` must render `A2UIRenderer` from that payload instead of
(or in addition to) `buildLegacyStreamTree`.

- [ ] Agent/backend can emit a validated A2UI component tree on the
      existing `/chat` SSE stream.
- [ ] `Chat.tsx` / `StreamingRenderer` render that tree rather than
      only synthesizing one from AG-UI text/tool fields.

## Open decisions — for Titus, NOT tasks and NOT done

These stay open regardless of the `[ ]` statuses above. Do not silently
resolve any of them; each needs Titus's call.

- A2A `cancel()` unsupported (raises `UnsupportedOperationError`) and
  `InMemoryTaskStore` is process-local (lost on restart, not shared across
  replicas). Fixing either crosses the `legacy-stack-freeze.md` scope
  boundary.
- Optional adoption of the official `@a2ui/web_core` / `@a2ui/react`
  packages (deliberately not installed — see
  `protocol-version-pinning.md`).
- Actual LangGraph time-travel UI (list checkpoints, restore a parent,
  fork a thread) — explicitly **not** part of task 1.

## Log

<!-- planner appends a dated one-line entry here each time it reconciles this file -->
- 2026-09-01 — replaced the completed AG-UI/A2UI/A2A tracker with the next
  batch (Titus): (1) hydrate transcript from the checkpointer as source of
  truth, (2) streaming cursor only on the in-progress message, (3) `/chat`
  dead-worker idle timeout + `isStreamingRef` unlock. Citus
  not-actually-distributed recorded under Open decisions, not as a task.
- 2026-09-01 — Titus: turn Citus into a real cluster (task 4). Bootstrap
  now registers workers and distributes `api.*` (plus checkpoint tables
  with a local fallback). Open decision removed. Live
  `citus_get_active_worker_nodes` smoke still open.
- 2026-09-01 — Titus: root README mermaid does not render. Added as
  task 5 (tracker only — do not fix until he says so).
- 2026-09-01 — Titus asked whether A2UI can carry agent-emitted UI JSON
  to the frontend. Checked: renderer exists, wire does not. Added as
  task 6 (tracker only).
