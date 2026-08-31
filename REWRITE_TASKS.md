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

- [~] Agent Card authored and schema-validated — `backend/src/protocol/agent_card.py`;
  validated by round-tripping through the pinned SDK's protobuf JSON schema
  (`google.protobuf.json_format.ParseDict`/`MessageToDict`) and served at
  `/.well-known/agent-card.json`, confirmed via `TestClient`. Marked `[~]`
  rather than `[x]` per the status legend — not yet independently verified
  by `protocol-reviewer`.
- [~] JSON-RPC router mounted on `backend/main.py` — `backend/src/protocol/router.py`
  (`build_a2a_router() -> APIRouter`), mounted via `app.include_router(...)`
  at `POST /a2a`. Verified end-to-end with `TestClient` (`SendMessage`,
  `GetTask`, `CancelTask` against a mocked Redis pub/sub + Celery `.delay`).
  Same `[~]` caveat as above.
- [~] Task-state mapping (`submitted`/`working`/`completed`/`failed`) implemented —
  `backend/src/protocol/executor.py`'s `ChatAgentExecutor`. A2A `taskId` ==
  existing `job_id`, A2A `contextId` == existing `thread_id` (literal
  identity, not a lookup table — see `citus-thread-id-integrity.md`).
  **Known limitations, flagged rather than silently resolved:**
  - `cancel()` raises `UnsupportedOperationError` — real cancellation would
    need a job_id → Celery `AsyncResult` id mapping that doesn't exist
    today; adding one is a `legacy-stack-freeze.md` scope-boundary call, not
    something to add inline.
  - Task state is held in the SDK's `InMemoryTaskStore` — process-local,
    lost on restart, not shared across backend replicas. No new Redis/DB
    structure was added to fix this (also a `legacy-stack-freeze.md` call).
  - Push notifications and the A2A `0.3` protocol compat mode are not
    enabled — not part of "chat plus Tavily search," so left off per the
    Agent Card honesty requirement.

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
- 2026-08-31 — `a2a-integrator`: pinned `a2a-sdk[fastapi]==1.1.2` (see `protocol-version-pinning.md` for the v0.3→v1.0 method-name/schema mismatch found and flagged during verification); added `backend/src/protocol/` (`agent_card.py`, `executor.py`, `router.py`); mounted `POST /a2a` + `GET /.well-known/agent-card.json` on `backend/main.py` via `include_router` (2 lines added: one import, one mount call — auth handlers untouched); implemented `submitted`/`working`/`completed`/`failed` mapping onto the existing Celery/Redis pipeline with `taskId`==`job_id`/`contextId`==`thread_id` identity. Marked the three A2A checklist items `[~]` (self-verified, not yet independently checked by `protocol-reviewer`) with limitations called out inline (no cancel, in-memory task store only). `ruff check`/`ruff format` clean on new files; `mypy` clean on new files (7 pre-existing unrelated errors remain elsewhere); `pytest` 36 passed / 2 pre-existing failures unrelated to this change (`utils/streaming.py`'s Langfuse `CallbackHandler` signature mismatch, confirmed present before this change via `git stash`).
