---
name: ag-ui-event-bridge
description: Use when converting the backend's LangGraph agent stream into AG-UI protocol events — i.e. modifying backend/utils/streaming.py, backend/src/worker/worker_runner.py, or backend/main.py's /chat endpoint to emit AG-UI events instead of the legacy reasoning/tool_call/tool_result/answer/agent/error/done vocabulary.
---

# AG-UI Event Bridge

## Where this lives

- `backend/utils/streaming.py::stream_agent_events()` — converts LangGraph's
  `astream()` chunks into event dicts. This is the conversion point.
- `backend/src/worker/worker_runner.py::run_agent_and_stream()` — calls
  `stream_agent_events()` and publishes each event via `publish_event()`.
- `backend/main.py::chat()` — subscribes to Redis, yields each event as
  `ServerSentEvent`.

## Before touching any of this

Read `.cursor/rules/protocol-version-pinning.mdc` and confirm the AG-UI
package/version pinned in `backend/pyproject.toml`. Do not assume event
names — see the `protocol-spec-verification` skill.

## Conversion mapping (legacy → AG-UI)

| Legacy event | AG-UI event(s) |
|---|---|
| `agent` | step/agent-name marker per the pinned spec |
| `reasoning` | reasoning/thinking event per the pinned spec |
| `answer` | text-message content event per the pinned spec |
| `tool_call` | tool-call start/args events per the pinned spec |
| `tool_result` | tool-call end/result event per the pinned spec |
| `error` | error event per the pinned spec |
| `done` | run-finished event per the pinned spec |

Don't fill in exact AG-UI event names from memory — confirm each one against
the installed package before writing this mapping for real, then update the
table above with the actual names once confirmed.

## What doesn't change

- `stream_agent_events()`'s LangGraph-facing half (the `astream()` call,
  `stream_mode`, `content_blocks` handling) — governed by
  `streaming-patterns.md`, untouched by this rewrite.
- The SSE transport, the Redis pub/sub bridge, `thread_id` as the
  correlation key — see `sse-transport-lock.md` and
  `citus-thread-id-integrity.md`.
- Only the shape of the dict being published changes, not the pipeline
  around it.

## Verify after changing this

`frontend/src/hooks/useSSEStream.ts`'s `parseSSE()` must be updated in
lockstep — it parses `event:`/`data:` lines against the legacy type list in
`frontend/src/types/index.ts`'s `SSEEventType` union. That union needs to
grow or change to match, or the frontend silently drops unknown event types.
