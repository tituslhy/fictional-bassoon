# Rewrite Tasks — AG-UI / A2UI / A2A

This file is the source of truth for where the rewrite stands. If a session
ends — credits run out, crash, whatever — read this file top to bottom
before doing anything else. A subagent's chat output claiming something is
done doesn't count until it's reflected here as `[x]`.

Owned by `planner` — it creates and updates this file. If it looks stale or
wrong, ask `planner` to reconcile it against the actual repo state before
trusting it.

## Status legend

- `[ ]` not started
- `[~]` in progress
- `[x]` done — and independently verified by `protocol-reviewer`, not just
  self-reported by the developer subagent that did the work

## Backend AG-UI wiring — owner: `backend-agui-developer`

- [ ] AG-UI package/version pinned (`protocol-version-pinning.md`)
- [ ] Event mapping implemented in `backend/utils/streaming.py`
- [ ] `worker_runner.py` / `main.py` `/chat` handling updated to publish AG-UI events
- [ ] `frontend/src/types/index.ts`'s `SSEEventType` union updated to match

## Frontend A2UI rendering — owner: `frontend-a2ui-developer`

- [~] A2UI component schema defined, allow-list started — `frontend/src/lib/a2ui/`
  (`schema.ts`, `allowList.ts`, `validator.ts`, `renderer.tsx`) implements a
  deliberately constrained subset of the real A2UI v1.0 spec (allow-list:
  `column`, `reasoning`, `tool_call`, `markdown` — no data binding/function
  calls/actions). Self-reported only; not yet independently verified by
  `protocol-reviewer`, so `[~]` not `[x]` per this file's own status legend.
- [~] `ReasoningBlock` → A2UI component migrated — now
  `frontend/src/lib/a2ui/components/ReasoningBlock.tsx`, dispatched via the
  `reasoning` component type. Same caveat as above.
- [~] `ToolCallBlock` → A2UI component migrated — now
  `frontend/src/lib/a2ui/components/ToolCallBlock.tsx`, dispatched via the
  `tool_call` component type. Same caveat as above.
- [~] `AnswerBlock` / `MarkdownSection.tsx` → A2UI component migrated —
  `MarkdownSection.tsx` stays at its existing path (folded in, not
  retired, per the a2ui-no-executable-ui.md instruction) and is now only
  reachable through `lib/a2ui/components/MarkdownBlock.tsx`'s `markdown`
  component type; `AnswerBlock`'s streaming-cursor behavior moved into
  `MarkdownSection.tsx` itself via a `streaming` prop. Same caveat as above.

Also done as part of this pass, not originally itemized above:
- `useSSEStream.ts` gained an optional `onA2UITree` callback that builds an
  A2UI tree from incoming frames via a MOCKED AG-UI event shape
  (`frontend/src/lib/a2ui/mock/`) — deliberately not wired to the real
  backend vocabulary yet (that isn't merged). `frontend/src/types/index.ts`
  was NOT touched, per instruction. See
  `frontend/src/lib/a2ui/mock/legacyShim.ts` for exactly what to delete/swap
  once real AG-UI events land — **that swap and end-to-end integration
  testing against real backend events is explicitly NOT done here** and
  stays open, consistent with the known serial dependency called out
  earlier in this file (AG-UI vocabulary must be pinned first).
- A2UI package/spec research recorded in
  `.claude/rules/protocol-version-pinning.md` (real, current `@a2ui/web_core`
  / `@a2ui/react` packages found and deliberately NOT installed — see that
  file's note for the two reasons why; spec v1.0 schema referenced instead).

Verified before finishing this pass: `npm run lint` clean; `npm run test --
run` 28/28 passed with no test files modified (existing
`StreamingRenderer.test.tsx` / `useSSEStream.test.ts` / `MessageBubble.test.tsx`
all pass unchanged — external props/DOM preserved); `npm run build`
succeeds; `npx tsc --noEmit` shows only the same 2 pre-existing,
unrelated errors confirmed via `git stash` to predate this work. Not done
here (open, not `[x]`-blocking but tracked): unit-tester coverage for the
new `lib/a2ui/**` modules, and end-to-end integration against real AG-UI
events per the swap note in `lib/a2ui/mock/legacyShim.ts`.

## A2A service packaging — owner: `a2a-integrator`

- [ ] Agent Card authored and schema-validated
- [ ] JSON-RPC router mounted on `backend/main.py`
- [ ] Task-state mapping (`submitted`/`working`/`completed`/`failed`) implemented

**Known collision:** `backend-agui-developer` and `a2a-integrator` both touch
`backend/main.py` — both run with `isolation: worktree`. If both are
in-flight at once, check this file for conflicting `[~]` entries before
merging either worktree.

## Testing gate — owner: `unit-tester`

Blocked until the three surfaces above are `[x]`.

- [~] Frontend coverage tooling set up — `@vitest/coverage-v8` is already in
  `frontend/package.json` devDependencies; the `test:coverage` script is
  still missing
- [ ] Backend coverage ≥90% (`pytest tests/ -v --cov=backend --cov-report=term-missing`)
- [ ] Frontend coverage ≥90%

## Review gate — owner: `protocol-reviewer`

Blocked until the testing gate above is `[x]`.

- [ ] Rule-file compliance checked (all ten `.claude/rules/*.md` — the
  earlier "seven" count was stale)
- [ ] Coverage numbers independently re-run and confirmed
- [ ] Test quality spot-checked (not just the percentage)
- [ ] General code quality pass (async correctness, typing, security, streaming UX)

## Log

<!-- planner appends a dated one-line entry here each time it reconciles this file -->
- 2026-08-31 — planner reconciled against repo state on `feature/refactor`: removed accidental wholesale duplication of the file's contents; verified all implementation checkboxes are correctly `[ ]` (no AG-UI/A2UI/A2A deps in `pyproject.toml`/`package.json`, no `backend/src/protocol/`, no `frontend/src/lib/a2ui/`, no router in `main.py`, `streaming.py`/`SSEEventType` still legacy vocabulary); marked frontend coverage tooling `[~]` (`@vitest/coverage-v8` present, `test:coverage` script absent); corrected rule-file count seven → ten.
- 2026-08-31 (second reconciliation) — planner re-verified every item against the repo: no drift since the entry above. Confirmed `protocol-version-pinning.md` version-log table is still all `_tbd_` (no pins), `worker_runner.py` still publishes legacy `error`/`done` dicts, `frontend/src/lib/` doesn't exist at all, `ReasoningBlock`/`ToolCallBlock`/`AnswerBlock` live inline in `StreamingRenderer.tsx` (not separate files — checklist wording kept, noted here), and `backend/main.py` has no `include_router`/JSON-RPC/Agent Card surface. No status changes needed; file was already accurate.
