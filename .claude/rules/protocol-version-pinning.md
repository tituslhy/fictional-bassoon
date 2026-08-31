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
| A2A | _tbd_ | _tbd_ | _tbd_ |
