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
| A2UI | _no package installed — spec-only, see note below_ | spec v1.0 (`@a2ui/web_core@0.10.6`'s `src/v1_0/schemas/*.json`, `$id: https://a2ui.org/specification/v1_0/...`) | 2026-08-31 |
| A2A | _tbd_ | _tbd_ | _tbd_ |

### A2UI research note (frontend-a2ui-developer, 2026-08-31)

Verified live against npm/GitHub rather than training data
(`protocol-spec-verification` skill): the current, actively-published,
official reference implementation is the `a2ui-project/a2ui` monorepo
(homepage `https://a2ui.org/`, npm maintainer `a2ui-owners@google.com`),
published as scoped packages `@a2ui/web_core` (schema + core runtime,
latest `0.10.6`, published 2026-08-03) and `@a2ui/react` (React renderer,
latest `0.10.2`). Both are real, installable, current packages — this was
not a "spec-only, nothing exists" situation.

**Decision: don't install either package as a dependency.** Two reasons,
both load-bearing:

1. `frontend-stack-conventions.md` bars new component libraries without
   explicit sign-off, and `@a2ui/react` is exactly that — a full component
   library with its own default styling, which would fight the existing
   Tailwind dark-theme treatment of the reasoning/tool-call/answer blocks
   rather than extend it.
2. The full v1.0 wire protocol (`agent_to_renderer.json` /
   `common_types.json` in the package) includes `DataBinding` (live paths
   into a data model), `FunctionCall` (agent-invoked renderer-side
   functions from a registered catalog), and `Action` (renderer → agent
   event dispatch) — a materially larger trust/execution surface than
   `a2ui-no-executable-ui.md` calls for here. This app's three migrated
   blocks (reasoning, tool call, sanitized markdown) are read-only,
   fully-resolved-string rendering with no need for live binding or
   renderer-side function invocation. Adopting the full spec wholesale to
   render three static blocks would mean carrying (and having to reason
   about, for the "no executable UI" boundary) protocol machinery this app
   doesn't use.

Instead, `frontend/src/lib/a2ui/schema.ts` implements a small,
deliberately-scoped subset: a nested component tree using the real spec's
`id` / `component` field naming (verified against
`src/v1_0/schemas/catalogs/basic/examples/12_chat-message.json` and
`35_markdown-text.json` in the package), with four allow-listed component
types (`column`, `reasoning`, `tool_call`, `markdown`) and no data
binding/function-call/action support. See the doc comment at the top of
`schema.ts` for the itemized list of what's intentionally not implemented
and why. If a future component genuinely needs data binding or
renderer-side actions, extending toward the real spec (or installing
`@a2ui/web_core` for just its schema/validation, not `@a2ui/react`) is a
deliberate, reviewed decision — not a default.

`lib/a2ui/mock/aguiEvents.ts`'s mocked AG-UI event names were checked
against the real, currently-published `@ag-ui/core@0.0.59` (npm, published
2026-08-03) `EventType` enum for fidelity — that package is not installed
either (frontend doesn't consume it directly; SSE frames are hand-parsed
per `sse-transport-lock.md`), and its version is not "pinned" here since
pinning AG-UI's actual backend dependency is `backend-agui-developer`'s
task, not this one.
