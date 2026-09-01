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
Citus sharding, root README mermaid rendering, A2UI as a wire protocol
(agent-emitted UI JSON), laptop field tests, and a product-looking
generic chat UI.

**Titus 2026-09-01 (this session):** implement remaining tasks 1–6.
Tasks 5 and 6 are **authorized** (no longer tracker-only). New in-scope
items: `fieldtest.md` (local laptop only — do **not** run live field
tests in the cloud; no API keys) and frontend polish. Open decisions
below stay open. Nothing here is `[x]` — nothing is independently
verified yet.

## Status legend

- `[ ]` not started
- `[~]` in progress / landed but not independently verified
- `[x]` done — and independently verified by `protocol-reviewer`, not just
  self-reported by the developer subagent that did the work

## Agreed contracts (Titus, 2026-09-01) — implement against these

Not open decisions. Do not reopen unless Titus says so.

### History JSON — `GET /threads/{thread_id}/history`

- Existing FastAPI app (no new container, not PostgREST).
- Auth: Bearer JWT; 401 if missing/invalid.
- Ownership: FastAPI pool is privileged (RLS is for PostgREST
  `web_user`), so the handler **must** filter
  `api.threads.id = thread_id AND api.threads.user_id = jwt.user_id`.
  Not owned / missing → 404 (do not leak existence). Empty checkpoint →
  `{ "messages": [] }`.
- Body: `{ "messages": ThreadMessage[] }` matching
  `frontend/src/types/index.ts` (camelCase `toolCalls`). Pydantic models
  may live in `src/models/chat_models.py`; **mapping logic must not**.
- Map checkpoint `HumanMessage` / `AIMessage` / `ToolMessage` onto
  `ThreadMessage` fields that the frontend can turn into the 4-type A2UI
  tree (`column` / `reasoning` / `tool_call` / `markdown`) via
  `buildLegacyStreamTree`. Tool loops → `toolCalls` on the assistant
  turn (merge following `ToolMessage`s as `result`). Checkpointer does
  not store live reasoning tokens — `reasoning` will usually be empty.
- Do **not** expose checkpoint tables through PostgREST.
- Do **not** call `create_agent()` / `get_agent()` for this GET (would
  init the LLM + Tavily). Short-lived `AsyncPostgresSaver` +
  `aget`/`aget_state` on `{configurable: {thread_id}}`, pool closed in
  `finally`. `deep-agent-scope-lock.md` stays intact.
- Sidebar catalog stays PostgREST `GET /threads` **without**
  `messages(*)`. Stop dual-write to `api.messages` from
  `updateThreadMessages` / `addMessage`; leave the table unused.

### A2UI over the wire — AG-UI `CUSTOM` on the existing `/chat` SSE

- Same SSE channel (`sse-transport-lock.md`: fetch + `ReadableStream`,
  `event:` field duplicated with the type name). **No** parallel SSE
  channel. **No** `@a2ui/*` packages. **No** full A2UI v1.0
  (`updateComponents` / data binding / actions).
- Keep emitting the existing AG-UI vocabulary (`TEXT_MESSAGE_*`,
  `REASONING_*`, `TOOL_CALL_*`, `RUN_*`, `STEP_*`) so A2A's executor
  (which only reads `TEXT_MESSAGE_CONTENT` / `RUN_ERROR` /
  `RUN_FINISHED`) keeps working. `CUSTOM` on `stream:{job_id}` is
  ignored there — do not "fix" the executor to consume A2UI.
- Additional frames: SSE `event: CUSTOM`, `data:` = camelCase
  `CustomEvent` JSON from `ag-ui-protocol==0.1.21` (verify `name` /
  `value` against the installed `ag_ui.core.events.CustomEvent` before
  writing). Pin:
  - `name`: `"a2ui"`
  - `value`: validated nested 4-type tree (root `column`, children
    `reasoning` / `tool_call` / `markdown` as in
    `frontend/src/lib/a2ui/schema.ts` + `buildLegacyStreamTree`)
- Emit `CUSTOM` after each tree-mutating event (not on pure lifecycle
  frames). Last tree before `RUN_FINISHED` has markdown `streaming:
  false`. Validate the 4-type subset **before publish** (Python helper
  next to streaming, **not** in `src/models/`). Do not touch
  `src/agent.py` — the backend synthesizes the tree from the LangGraph
  stream it already converts.
- Frontend: add `CUSTOM` to `AGUIEventType`. `Chat.tsx` /
  `StreamingRenderer` render `A2UIRenderer` from `value` when present
  (optional `ThreadMessage.a2ui`). `buildLegacyStreamTree` remains the
  fallback for history hydrate and older streams without `CUSTOM`.
  `parseSSE()` stays.

### Other pinned decisions

- Streaming cursor: key off the in-progress message only
  (`status === 'streaming'`), not the global `useSSEStream` flag.
- `/chat` idle timeout: import `IDLE_TIMEOUT_SECONDS` (120) from
  `src.protocol.executor` — do not fork a second literal. On timeout,
  emit terminal `RUN_ERROR` (close any open message/step first if
  synthesizing the event in FastAPI) and close the SSE. Do not revoke
  Celery (cancel stays an open decision). Frontend `onComplete` unlocks
  `isStreamingRef` (guard against double-finalize when `RUN_ERROR`
  already ran).
- Mermaid: docs-only so GitHub renders; do not delete services from the
  picture.
- `fieldtest.md`: laptop checklist; banner **do not run in cloud**.
- Frontend polish: product-looking generic chatbot; Tavily / Deep Agent
  is the current personality, not a lock-in. No new component libraries,
  Tailwind + lucide-react only.

## 1. Hydrate chat transcript from the checkpointer

**Source of truth for conversation content is the LangGraph Postgres
checkpointer**, not `api.messages`. Sidebar click / refresh should paint
whatever the agent will actually use on the next turn for that `thread_id`.

This is **hydrate latest state**, not LangGraph time-travel. Time-travel
(list `checkpoint_id` / restore a parent / fork) is explicitly out of
scope here — encore, not this task. Still an open decision below.

- [ ] `GET /threads/{thread_id}/history` on the existing FastAPI app (no
      new container) that loads checkpoint state for a thread the caller
      owns. Gate on `api.threads.user_id` matching the JWT (see Agreed
      contracts). Do **not** expose checkpoint tables through PostgREST.
- [ ] Map checkpoint messages (`HumanMessage` / `AIMessage` / `ToolMessage`)
      onto `{ "messages": ThreadMessage[] }` as specified above. Mapper
      lives next to agent/checkpointer code (`backend/src/history.py` or
      `backend/utils/checkpoint_messages.py`) — **not** in `src/models/`.
- [ ] Frontend: on thread select (and on refresh), fetch that history into
      `ThreadContext` instead of `GET /threads?select=*,messages(*)`.
      Same-tab click-back may keep using in-memory state; the fetch is for
      reload / another device / a killed tab / first select this session.
- [ ] Keep `api.threads` as the user's thread catalog (ownership, title,
      sidebar). Stop using `api.messages` as the transcript (drop dual-write
      from `updateThreadMessages` / `addMessage`). Leave the table in place.

**Collision watch:** history route mounts on `backend/main.py` (same file
A2A already mounted and where `/chat` idle timeout lands). Mapper not in
`src/models/`. Frontend: `ThreadContext.tsx` + Chat thread-select, not the
SSE transport.

Owners: `backend-agui-developer` (endpoint + mapper + JWT helper in
`src/auth.py`, thin route in `main.py`); `frontend-a2ui-developer`
(hydrate). JSON shape is pinned above — they can run in parallel against
it. `a2a-integrator` does **not** own this.

## 2. Streaming cursor only on the in-progress message

Today `MessageList` forwards one `isStreaming` flag to **every**
`MessageBubble`. `StreamingRenderer` then sets `streaming: true` on the
markdown node, so in a multi-turn thread every historical assistant
answer grows a blinking cursor while the new reply is in flight.

- [ ] Key the cursor off the in-progress message only (status
      `streaming`, or the streaming assistant id) — not the global hook.
      User bubbles and completed assistant bubbles stay still.

Owner: `frontend-a2ui-developer`. Single-surface; no backend.

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
      A2A: `asyncio.wait_for` on the listener; emit a terminal `RUN_ERROR`
      and close the SSE when the worker is presumed dead. **Import**
      `IDLE_TIMEOUT_SECONDS` from `src.protocol.executor` (do not edit
      the executor's A2A path; do not invent a second 120).
- [ ] Wire `onComplete` in `Chat.tsx` (or otherwise clear `isStreamingRef`
      and finalize the assistant message) so a stream that ends without a
      terminal event cannot leave send locked.

Owner: `backend-agui-developer` (`main.py` `/chat`);
`frontend-a2ui-developer` (`Chat.tsx` / `useSSEStream.ts`). `/chat`
timeout must not change the AG-UI terminal contract (`RUN_ERROR` is
terminal on its own). Do **not** dispatch `a2a-integrator` for the
import.

## 4. Real Citus sharding — workers join, tables distribute

Titus 2026-09-01: yes, we want real sharding. The coordinator + 2 worker
containers already ran; they never formed a cluster.

**Implementation already landed** in `db_bootstrap.py` (this branch).
Not `[x]` — not independently verified, and live smoke has not run.

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
      `api.messages`; a chat round-trip still checkpointers. **This smoke
      belongs in `fieldtest.md` and runs on a local laptop — not in the
      cloud (no API keys here).** Do not re-implement bootstrap.

Owner: already `db_bootstrap.py` + compose env. Docs in
`citus-thread-id-integrity.md`. Frozen stack: do not touch
`backend/docker/citus/**` as a byproduct of tasks 1–3/5–8
(`legacy-stack-freeze.md`).

## 5. Root README mermaid diagrams do not render

**Authorized 2026-09-01.** Docs-only. Make the diagrams parse on GitHub.
Do not "simplify the architecture" by deleting services from the picture.

GitHub (and similar) fail to paint the diagrams in root `README.md`.
The architecture flowchart (the `graph LR` under Architecture) is the
main one; the sequence diagram under "How a chat message streams" may
be in the same boat. Frontend/backend READMEs also have mermaid blocks
— check those, but the complaint is the root file.

Likely render-breakers in the architecture graph (confirm, don't
assume one of these is sufficient):

- `%%{init: {...}}%%` directive (`useMaxWidth: false`, nested quotes)
- emoji in a node label (`Tavily Search API 🔎`) and in `%%` comments
- nested subgraphs (ClickHouse inside Observability; Redis/Postgres
  inside Persistence)
- `/` and `+` in quoted node text (`A2A Router /a2a + Agent Card`)

- [ ] Architecture `graph LR` renders on GitHub.
- [ ] Chat-stream `sequenceDiagram` renders on GitHub.
- [ ] Glance at `frontend/README.md` / `backend/README.md` mermaid
      blocks for the same failure class.

Owner: **main session** (docs-only; keep developer subagents on code).
Glance is enough for the laptop field test too (`fieldtest.md`).

## 6. A2UI over the wire — agent JSON → frontend renderer

**Authorized 2026-09-01.** Shape is pinned under Agreed contracts
(`CUSTOM` / `name: "a2ui"` / nested 4-type `value`). Still **not**
full A2UI v1.0 and **not** official `@a2ui` packages (those remain
open decisions).

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

- [ ] Agent/backend can emit a validated A2UI component tree on the
      existing `/chat` SSE stream (`CUSTOM` as specified above).
      Synthesize in `backend/utils/streaming.py` (output side only —
      do not change `astream()` / `stream_mode` /
      `content_blocks`). Do not edit `src/agent.py`.
- [ ] `Chat.tsx` / `StreamingRenderer` render that tree via
      `A2UIRenderer` when a `CUSTOM` `name: "a2ui"` payload is present;
      `buildLegacyStreamTree` remains the fallback.

Owners: `backend-agui-developer` (emit + validate);
`frontend-a2ui-developer` (parse `CUSTOM`, prefer wire tree).
`a2a-integrator` stays idle — executor already ignores unknown event
types.

## 7. `fieldtest.md` — local laptop checklist (do not run in cloud)

New 2026-09-01. Write the file; **do not execute it in this cloud
environment** (no API keys, no live LLM/Tavily).

- [ ] Add `fieldtest.md` at repo root with an explicit banner:
      **do not run in cloud**. Checklist for Titus's laptop after
      `make up` with real keys:
      - Chat UI: reasoning / tool_call / markdown blocks on a live turn
        (CUSTOM tree path if the stream carries it)
      - Checkpointer hydrate: refresh / other-tab / thread re-select
        paints checkpoint messages, not `api.messages`
      - Streaming cursor only on the in-progress assistant bubble
      - `/chat` idle timeout if feasible (dead worker / blocked listen
        → `RUN_ERROR`, composer unlocks). Skip or note if too
        destructive for a casual pass.
      - Citus smoke SQL: `citus_get_active_worker_nodes()`,
        `pg_dist_partition` for `api.threads` / `api.messages`,
        checkpoint tables distributed **or** bootstrap log shows the
        local fallback; one chat round-trip still checkpointers
      - Mermaid glance: root README diagrams render on GitHub preview
        / local mermaid renderer

Owner: **main session** (write after or alongside implementation so
steps cite real routes). `unit-tester` does **not** run these live.

## 8. Frontend polish — product-looking generic chatbot

New 2026-09-01. In-scope for `frontend-a2ui-developer` (or main
session). Look like something someone would actually want to use.

This app is a **generic chatbot that can be repurposed**. Current
personality is a Deep Agent with Tavily search — that is the present
tooling, not the product identity. Do not change `src/agent.py`
(`deep-agent-scope-lock.md`).

- [ ] Chat chrome: empty state, sidebar header, composer, login/signup
      copy, `layout.tsx` metadata — read as a reusable chat product,
      not a demo named after the repo. Tavily/search may appear as a
      capability hint, not as lock-in branding.
- [ ] Visual hierarchy and spacing of sidebar, message list, user
      bubbles, and input so the main path feels intentional. Tailwind
      utilities + existing lucide-react only (`frontend-stack-conventions.md`).
      No new CSS files, no new component libraries.

Owner: `frontend-a2ui-developer` (same wave as tasks 2, 1-frontend,
3-frontend, 6-frontend). Verify in the browser if tools exist; otherwise
tests + note what could not be clicked.

## Delegation (this session) — collisions and order

`a2a-integrator` is **not dispatched**. A2A already mounts on
`main.py`. Open A2A decisions stay open. `CUSTOM` on the shared Redis
channel is safe because `ChatAgentExecutor` only switches on
`TEXT_MESSAGE_CONTENT` / `RUN_ERROR` / `RUN_FINISHED`.

Do **not** mark any item `[x]` until `protocol-reviewer` independently
verifies. Coverage target: 90% on **new** code (backend pytest +
frontend Vitest, reported separately).

### Wave 0 — docs, no code collision

Main session: task 5 (root + glance at frontend/backend README
mermaid). Isolated to markdown files.

### Wave 1 — parallel against the pinned contracts

Genuinely parallel: backend files vs frontend files. JSON/`CUSTOM`
shape is pinned above, so frontend can mock. Do **not** treat
cross-stack integration testing as parallel.

| Subagent | Tasks | Files |
|---|---|---|
| `backend-agui-developer` | 1-backend, 3-backend, 6-backend | `backend/main.py` (history route **and** `/chat` timeout — **same agent, sequential inside this subagent**), new mapper module, `src/auth.py` (decode helper only; do not deepen inline auth in `main.py`), `backend/utils/streaming.py` + small A2UI validate/build helper, **not** `src/models/` for mapper logic, **not** `src/agent.py`, **not** `src/protocol/executor.py` beyond importing the timeout constant, **not** Celery/docker |
| `frontend-a2ui-developer` | 1-frontend, 2, 3-frontend, 6-frontend, 8 | `ThreadContext.tsx`, `Chat.tsx`, `useSSEStream.ts`, `MessageList.tsx` / `MessageBubble.tsx` / `StreamingRenderer.tsx`, `types/index.ts`, `lib/a2ui/agui/events.ts`, login/signup/layout/sidebar/empty state. Keep fetch+`ReadableStream`. |

Worktree isolation: **not required** for this pairing — they do not
share files, and `a2a-integrator` is idle. If anyone later dispatches
`a2a-integrator` anyway, it **must** be `isolation: worktree` vs
`backend-agui-developer` (both touch `backend/main.py`).

**File-level collisions to watch**

- `backend/main.py` — history GET + `/chat` timeout + existing A2A
  `include_router`. Additive only; do not rewrite auth handlers.
- `IDLE_TIMEOUT_SECONDS` — shared identifier; import, don't duplicate.
- `thread_id` / `job_id` — unchanged; history uses `thread_id` only.
- `frontend/src/types/index.ts` — `CUSTOM` + optional `a2ui` on
  `ThreadMessage`; frontend-owned.
- `backend/utils/streaming.py` — CUSTOM yield; keep LangGraph-facing
  half frozen (`streaming-patterns.md`).
- `api.messages` dual-write — frontend stops writing; backend history
  stops reading. Coordinate the cutover in Wave 1 (frontend can stop
  writing immediately; hydrate lands when GET exists — mock until then).

### Wave 2 — after Wave 1 exists

1. Main session: task 7 `fieldtest.md` (do not execute it here).
2. `unit-tester` (sequential). 90% on new code; mock `astream` / Redis /
   LLM; mock SSE at `fetch`/`ReadableStream`. Do not live-call OpenAI
   or Tavily. Do not run `fieldtest.md`.
3. `protocol-reviewer` (sequential after unit-tester). Independent
   coverage check + rule compliance. Still do not mark `[x]` from a
   developer self-report.

## Open decisions — for Titus, NOT tasks and NOT done

These stay open regardless of the `[ ]` statuses above. Do not silently
resolve any of them; each needs Titus's call.

- A2A `cancel()` unsupported (raises `UnsupportedOperationError`) and
  `InMemoryTaskStore` is process-local (lost on restart, not shared across
  replicas). Fixing either crosses the `legacy-stack-freeze.md` scope
  boundary.
- Optional adoption of the official `@a2ui/web_core` / `@a2ui/react`
  packages (deliberately not installed — see
  `protocol-version-pinning.md`). Task 6 uses the existing 4-type subset
  over `CUSTOM`; that does **not** resolve this.
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
- 2026-09-01 — Titus authorized remaining tasks 1–6 (5 and 6 no longer
  tracker-only) plus frontend polish and `fieldtest.md` (laptop only,
  not cloud). Pinned history JSON `{messages: ThreadMessage[]}`, A2UI
  `CUSTOM`/`name:a2ui` on existing SSE, cursor/timeout/mermaid
  decisions. Open decisions unchanged. Nothing marked `[x]`.
