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

- [~] AG-UI package/version pinned (`protocol-version-pinning.md`) — `ag-ui-protocol==0.1.21` added via `uv add`, pin recorded. Self-reported; not yet independently verified.
- [~] Event mapping implemented in `backend/utils/streaming.py` — legacy dict vocabulary replaced with AG-UI `EventType` events (RUN_STARTED/FINISHED/ERROR, STEP_STARTED/FINISHED, TEXT_MESSAGE_*, REASONING_MESSAGE_*, TOOL_CALL_*). Self-reported; not yet independently verified.
- [~] `worker_runner.py` / `main.py` `/chat` handling updated to publish AG-UI events — error/done paths now publish RUN_ERROR / RUN_FINISHED. Self-reported; not yet independently verified.
- [~] `frontend/src/types/index.ts`'s `SSEEventType` union updated to match — AG-UI union added as `AGUIEventType`, with `SSEEventType` now simply `= AGUIEventType`. The transitional `LegacySSEEventType` has been deleted (see resolved integration task below); self-reported, not yet independently verified.

**Open integration task — RESOLVED by `frontend-a2ui-developer`, 2026-08-31:**
the frontend consumption swap documented in the now-deleted
`lib/a2ui/mock/legacyShim.ts` has landed. `useSSEStream.ts` and `Chat.tsx`
parse and handle the real AG-UI vocabulary end-to-end; live chat streaming
is no longer broken on this branch. See this file's Log for the full
mapping and file list. Still `[~]` pending `protocol-reviewer`
verification, per this file's own status legend — not `[x]`.

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

**Update, 2026-08-31 (later same day):** the mock layer described directly
above (`lib/a2ui/mock/`, `onA2UITree`'s mocked-event wiring,
`legacyShim.ts`) has been deleted and replaced per its own swap plan — see
this file's Log for the resolution. `lib/a2ui/mock/` no longer exists;
`onA2UITree` is now driven by `lib/a2ui/agui/events.ts` +
`lib/a2ui/agui/streamState.ts` parsing real AG-UI SSE frames. The A2UI
schema/allow-list/validator/renderer/component set referenced elsewhere in
this section is unchanged.

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
- 2026-08-31 (second reconciliation) — planner re-verified every item against the repo: no drift since the entry above. Confirmed `protocol-version-pinning.md` version-log table is still all `_tbd_` (no pins), `worker_runner.py` still publishes legacy `error`/`done` dicts, `frontend/src/lib/` doesn't exist at all, `ReasoningBlock`/`ToolCallBlock`/`AnswerBlock` live inline in `StreamingRenderer.tsx` (not separate files — checklist wording kept, noted here), and `backend/main.py` has no `include_router`/JSON-RPC/Agent Card surface. No status changes needed; file was already accurate.
- 2026-08-31 (backend-agui-developer, ported from worktree `agent-af282a7a3f657d273` at merge) — implemented AG-UI event bridge: pinned `ag-ui-protocol==0.1.21`, rewrote `backend/utils/streaming.py`, `backend/src/worker/worker_runner.py`, `backend/main.py` `/chat` SSE emission, and the frontend `SSEEventType`. Verification in the worktree: `ruff`/`mypy` clean on every touched file (0 new findings vs baseline); `pytest -q` 36 passed, 2 failed — both failures (`tests/test_streaming.py::test_stream_agent_events_basic`/`_error`) are **pre-existing and unrelated**: installed `langfuse==4.5.1`'s `CallbackHandler.__init__()` no longer accepts the `langfuse=`/`trace_name=`/`session_id=`/`metadata=` kwargs used by the unchanged langfuse wiring (confirmed via `inspect.signature`; identical failure on untouched checkout). This blocks any exercise of `stream_agent_events()` in tests — needs a langfuse pin/upgrade decision or a test-side `CallbackHandler` mock; flagged for `unit-tester`/`planner`, deliberately not fixed as part of the AG-UI bridge. Updated 4 backend test files to the AG-UI vocabulary (spot-check coverage only). Also stale and needing a follow-up: `.claude/rules/streaming-patterns.md`'s emitted-event list and root `CLAUDE.md`'s "SSE event types" section still document the legacy vocabulary.
- 2026-08-31 (main session, merge) — merged worktree `agent-af282a7a3f657d273` into `feature/refactor` after committing the frontend A2UI pass. One conflict (`frontend/src/types/index.ts`) resolved by adopting the AG-UI union plus a transitional `LegacySSEEventType` (see backend section note). The worktree's recreated copies of this file and the rule files were NOT merged; their content was ported into the canonical files by hand (AG-UI pin note → `protocol-version-pinning.md`, these log entries → here). Also fixed three pre-existing frontend `tsc` errors in test fixtures that were blocking the pre-commit type-check gate.
- 2026-08-31 — `a2a-integrator`: pinned `a2a-sdk[fastapi]==1.1.2` (see `protocol-version-pinning.md` for the v0.3→v1.0 method-name/schema mismatch found and flagged during verification); added `backend/src/protocol/` (`agent_card.py`, `executor.py`, `router.py`); mounted `POST /a2a` + `GET /.well-known/agent-card.json` on `backend/main.py` via `include_router` (2 lines added: one import, one mount call — auth handlers untouched); implemented `submitted`/`working`/`completed`/`failed` mapping onto the existing Celery/Redis pipeline with `taskId`==`job_id`/`contextId`==`thread_id` identity. Marked the three A2A checklist items `[~]` (self-verified, not yet independently checked by `protocol-reviewer`) with limitations called out inline (no cancel, in-memory task store only). `ruff check`/`ruff format` clean on new files; `mypy` clean on new files (7 pre-existing unrelated errors remain elsewhere); `pytest` 36 passed / 2 pre-existing failures unrelated to this change (`utils/streaming.py`'s Langfuse `CallbackHandler` signature mismatch, confirmed present before this change via `git stash`).
- 2026-08-31 (main session, post-merge integration fix) — merged worktree `agent-a7709928afd46868b`; conflicts resolved (`pyproject.toml` keeps both pins, `uv.lock` regenerated via `uv lock`, both doc files keep both sides). Then fixed the predicted cross-surface gap: `src/protocol/executor.py` was written against the legacy `answer`/`error`/`done` vocabulary its worktree branched from, while the merged worker now publishes AG-UI events — updated it to consume `TEXT_MESSAGE_CONTENT` (parsing `delta` from the event-JSON `data` payload), `RUN_ERROR` (terminal, `message` field), and `RUN_FINISHED`. Verified: `ruff`/`mypy` clean on `src/protocol/`; `pytest` 36 passed + the same 2 pre-existing langfuse failures. Note for `unit-tester`: no committed tests cover `src/protocol/` yet, so this mapping fix is verified by lint/type-check only — the executor state-path tests it already owes should assert the AG-UI vocabulary.
- 2026-08-31 (`frontend-a2ui-developer`) — resolved the "Open integration task": swapped the frontend off the legacy SSE vocabulary onto the real AG-UI events end-to-end, per `lib/a2ui/mock/legacyShim.ts`'s own swap plan (that file and the rest of `lib/a2ui/mock/` are now deleted). Verified event names/field aliasing directly against the installed `ag_ui-protocol==0.1.21` package (`backend/.venv/.../ag_ui/core/events.py` + `types.py`'s `alias_generator=to_camel`), not from memory, per `protocol-spec-verification`.
  - `frontend/src/types/index.ts`: deleted `LegacySSEEventType` and its transitional comments; `SSEEventType` is now simply `= AGUIEventType`.
  - `frontend/src/hooks/useSSEStream.ts`: `parseSSE()` now types `event:` directly as `AGUIEventType` (returns `null` for a frame missing the header instead of defaulting to an arbitrary event name); stream termination checks `RUN_FINISHED`/`RUN_ERROR` (a `TERMINAL_EVENTS` set) instead of the legacy `done` string, matching `stream_agent_events()`'s "one terminal event, never both" contract. The fetch/reader transport itself is untouched (`sse-transport-lock.md`).
  - `frontend/src/components/chat/Chat.tsx`: rewrote `handleMessageEvent`'s switch to the AG-UI vocabulary — `REASONING_MESSAGE_CONTENT`/`TEXT_MESSAGE_CONTENT` deltas append to `reasoning`/`content`; `TOOL_CALL_START`/`ARGS`/`RESULT` create/accumulate/resolve tool calls keyed directly on the AG-UI `toolCallId` (dropped the old index/`trackingKey` reconciliation logic — no longer needed since AG-UI always sends a real `toolCallId`, unlike legacy continuation chunks); `RUN_ERROR` finalizes the message with its `message` field as the error and resets streaming state (previously only `done` did this reset — `RUN_ERROR` is now terminal on its own, so this was a required fix, not just a rename, to avoid the UI getting stuck mid-stream on an agent error); `RUN_FINISHED` finalizes normally. `RUN_STARTED`/`STEP_STARTED`/`STEP_FINISHED`/`TEXT_MESSAGE_START`/`END`/`REASONING_MESSAGE_START`/`END`/`TOOL_CALL_END` are treated as no-op lifecycle/bracket markers. Deliberately did **not** change the error path's `status: 'done'` (vs. `ThreadMessage`'s unused `'error'` status variant, which `MessageBubble.tsx`'s `status === 'error'` branch expects but nothing has ever set) — that's a pre-existing behavior/persistence-semantics question (`ThreadContext.tsx` only persists messages with `status === 'done'`) out of scope for an event-vocabulary swap; flagged here for `unit-tester`/`planner` rather than silently changed.
  - `frontend/src/lib/a2ui/mock/` deleted entirely (`aguiEvents.ts`, `streamState.ts`, `legacyShim.ts`). Replaced with `frontend/src/lib/a2ui/agui/events.ts` (`parseAGUIStreamEvent()`, parses a real SSE frame's JSON `data` into a typed `AGUIStreamEvent`) and `frontend/src/lib/a2ui/agui/streamState.ts` (`applyAGUIStreamEvent()`/`createEmptyA2UIStreamState()`/`streamStateToA2UITree()`, same reducer as before minus the "Mock" naming), per the swap plan's step 3. `useSSEStream.ts`'s `onA2UITree` scaffolding option now runs off this real pipeline instead of the mock one; it remains unused by `Chat.tsx` itself (that component still drives `StreamingRenderer`/`MessageBubble` off `ThreadMessage` props, unchanged, per "keep the A2UI schema/allow-list/renderer as they are") — `onA2UITree` is available for a future caller, not dead code, but isn't wired to any UI in this pass.
  - Tests: rewrote `frontend/src/hooks/useSSEStream.test.ts` to the AG-UI vocabulary and added 3 new cases (RUN_ERROR-terminates-the-stream, a malformed/headerless frame is dropped, `onA2UITree` receives a validated tree built from real events). Added `frontend/src/lib/a2ui/agui/events.test.ts` (10 cases) and `frontend/src/lib/a2ui/agui/streamState.test.ts` (4 cases) for the new modules — these didn't exist before (no prior mock-layer test coverage). `StreamingRenderer.test.tsx`/`MessageBubble.test.tsx` untouched (unaffected — they exercise the still-unchanged props-driven A2UI tree path). Not done here, left for `unit-tester`: no dedicated `Chat.tsx` test file exists in this repo yet, so the new `handleMessageEvent` switch itself (as opposed to the pure `agui/` modules it delegates parsing to) is currently exercised only indirectly/not at all by committed tests — flagged as the main coverage gap from this pass.
  - Verified: `npm run lint` clean; `npx tsc --noEmit` clean (zero errors, including the 2 pre-existing ones noted in the earlier frontend-a2ui-developer log entry — no longer present); `npm run test -- --run` 45/45 passed (6 test files); `npm run build` succeeds; `npx prettier --check` clean on all touched files.
