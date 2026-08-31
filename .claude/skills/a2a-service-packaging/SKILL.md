---
name: a2a-service-packaging
description: Use when exposing the backend as an A2A-callable service — authoring or updating the Agent Card, mounting JSON-RPC endpoints, or mapping A2A task lifecycle states onto the existing chat pipeline.
---

# A2A Service Packaging

## Mount point

The A2A surface is a new route/mount on the existing `backend` FastAPI app
(`backend/main.py`) — not a new service. See `container-budget.md`.

## Agent Card

- Author it as static JSON (or a small FastAPI route serving it), describing
  this agent's skills/capabilities per the pinned A2A version
  (`protocol-version-pinning.md`).
- Keep it honest — advertise exactly what this agent can do (chat + Tavily
  search via the Deep Agent), not aspirational capabilities.
- Validate it against the A2A schema before committing. This is the
  discovery contract other agents rely on; a malformed card breaks interop
  silently rather than loudly.

## Task lifecycle mapping

Map A2A task states onto the existing pipeline rather than inventing a
parallel one:

- `submitted` → the point `run_agent_task.delay()` is called
- `working` → events are flowing through the existing Redis pub/sub
  `stream:{job_id}` channel
- `completed` / `failed` → the existing `done` / `error` events (or their
  AG-UI equivalents once bridged — see the `ag-ui-event-bridge` skill)

## Identity

The A2A `taskId` / `contextId` must resolve to the existing `thread_id` /
`job_id` pair — see `citus-thread-id-integrity.md`. Don't invent a third ID
scheme on top of the two that already exist.
