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

- [ ] A2UI component schema defined, allow-list started
- [ ] `ReasoningBlock` → A2UI component migrated
- [ ] `ToolCallBlock` → A2UI component migrated
- [ ] `AnswerBlock` / `MarkdownSection.tsx` → A2UI component migrated

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
