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
checkpointer, plus two logic breaks found in the 2026-09-01 code review.

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
- **Citus distribution is not enabled.** Coordinator + 2 worker
  containers run (`citusdata/citus:13.0`), and every table is *keyed* by
  `thread_id`, but nothing is sharded: there is no `citus_add_node` /
  `master_add_node` anywhere, and no `create_distributed_table` anywhere.
  The workers never join the cluster; all app traffic hits the
  coordinator like a single Postgres. Checkpoint tables are also
  deliberately local because of a documented Citus/LangGraph
  `jsonb_each_text` incompatibility (`.claude/rules/citus-thread-id-integrity.md`).
  Turning distribution on is a separate decision, not folded into 1–3.

## Log

<!-- planner appends a dated one-line entry here each time it reconciles this file -->
- 2026-09-01 — replaced the completed AG-UI/A2UI/A2A tracker with the next
  batch (Titus): (1) hydrate transcript from the checkpointer as source of
  truth, (2) streaming cursor only on the in-progress message, (3) `/chat`
  dead-worker idle timeout + `isStreamingRef` unlock. Citus
  not-actually-distributed recorded under Open decisions, not as a task.
