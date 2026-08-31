---
paths:
  - "backend/pyproject.toml"
  - "frontend/package.json"
  - "backend/src/protocol/**"
  - "frontend/src/lib/agui/**"
  - "frontend/src/lib/a2ui/**"
---

# Protocol Version Pinning

## Context

Nothing in this repo depends on AG-UI, A2UI, or A2A yet — `backend/pyproject.toml`
and `frontend/package.json` are both clean of them. Every protocol dependency
added during this rewrite is a first-time addition, not an upgrade, which makes
version drift the single biggest risk here: there's no existing pin to anchor
against, and all three protocols have shipped material spec changes within the
last twelve months.

## Hard rules

- Before writing any AG-UI / A2UI / A2A code, state the exact package + version
  being targeted (e.g. `ag-ui-protocol==X.Y.Z`, the A2A SDK version, whichever
  A2UI reference implementation is in use) and pin it in `pyproject.toml` /
  `package.json`. No unpinned or `latest` protocol dependencies.
- Verify event names, schema fields, and RPC method names against the actual
  installed package's source or its current docs — never from training data.
  Guessing an event name on a protocol that renamed things six months ago is
  how this breaks silently in production.
- If a fetched doc and an installed package version disagree, the installed
  package wins. Flag the mismatch instead of silently reconciling it.
- Record pinned versions in the table below whenever they change.

## Version log

| Protocol | Package | Version pinned | Date |
|---|---|---|---|
| AG-UI | _tbd_ | _tbd_ | _tbd_ |
| A2UI | _tbd_ | _tbd_ | _tbd_ |
| A2A | `a2a-sdk[fastapi]` (from `a2aproject/a2a-python`) | `1.1.2` | 2026-08-31 |

### A2A verification notes (a2a-integrator, 2026-08-31)

- Verified via PyPI JSON API (`pypi.org/pypi/a2a-sdk/json`): `1.1.2` is the
  latest version actually published to PyPI (uploaded 2026-07-20). A `1.1.3`
  tag exists in the `a2aproject/a2a-python` GitHub changelog (2026-08-18) but
  had not been released to PyPI as of pinning — pinned the latest
  **released** version, not the latest tag.
- **Material spec change vs. prior A2A knowledge (protocol v0.3 → v1.0):**
  the installed SDK's primary types (`a2a.types.a2a_pb2`) are now
  **protobuf-generated**, and JSON-RPC method names moved from the old
  slash-style (`message/send`, `tasks/get`, `tasks/cancel`) to gRPC-service-style
  PascalCase names (`SendMessage`, `SendStreamingMessage`, `GetTask`,
  `CancelTask`, `ListTasks`, `CreateTaskPushNotificationConfig`, etc.) — see
  `a2a/server/routes/jsonrpc_dispatcher.py`'s `METHOD_TO_MODEL` mapping. The
  Agent Card schema also changed: there is no top-level `url` field anymore;
  it's `supported_interfaces: list[AgentInterface]` (`url`,
  `protocol_binding`, `tenant`, `protocol_version`) plus a
  `capabilities.extended_agent_card` field that didn't exist in v0.3.
  `a2a.compat.v0_3` exists specifically as an opt-in backward-compat adapter
  for agents still speaking the old wire format
  (`DefaultRequestHandler`/`create_jsonrpc_routes(..., enable_v0_3_compat=True)`).
  This confirms the "material spec change in the last 12 months" this rule
  warns about — training-data recall of A2A method names as `message/send`
  etc. is stale for this pinned version.
- `a2a-sdk[fastapi]` (not bare `a2a-sdk`) is required — the bare package's
  `create_jsonrpc_routes`/`add_a2a_routes_to_fastapi` raise `ImportError` at
  call time without the `fastapi` extra, because `sse-starlette` (needed for
  the JSON-RPC streaming methods) is not a base dependency, only pulled in by
  the `http-server`/`fastapi` extras.
