---
name: review-verification-gotchas
description: Verification traps found during the 2026-09-01 AG-UI/A2UI/A2A review gate — how to independently confirm coverage/lint claims in this repo
metadata:
  type: project
---

Recurring patterns to check early in any review of this repo:

- **Vitest 4 text reporter hides files at 100% coverage.** A coverage table
  that seems to omit whole directories (sidebar/, MessageBubble, validator)
  is NOT evidence of a filtered include set. Verify against
  `frontend/coverage/coverage-final.json` — on 2026-09-01 it confirmed all
  `src/**` files (minus documented `src/app/` exclusion) were counted.
- **`ruff check .` is not clean repo-wide and never was on this branch's
  base.** ~70 pre-existing findings live in untouched legacy files
  (`src/db.py`, `src/models/*`, `src/worker/tasks.py`, 8 older test files).
  Any "ruff clean" claim must be scoped to *touched* files — diff the
  changed-file list against the finding locations before calling it a
  regression.
- **mypy import-following surfaces a pre-existing error at
  `src/agent.py:62`** (AsyncPostgresSaver pool typing) even when only
  checking `utils/streaming.py` / `src/protocol/`. Don't attribute it to new
  code.
- **`(t: any)` / `(m: any)` in frontend store callbacks is pre-existing
  debt that keeps propagating** (18 occurrences on main, +4 on
  feature/refactor in Chat.tsx). `tsc --noEmit` passes because explicit
  `any` is legal under strict mode — flag new occurrences each review until
  someone types them as `Thread`/`ThreadMessage`.
- **AG-UI wire quirk to watch:** `utils/streaming.py`'s `finally` block
  emits TEXT_MESSAGE_END / STEP_FINISHED *after* RUN_ERROR. All current
  consumers (useSSEStream, main.py /chat, executor.py) break on the
  terminal event so the trailing frames are dead — but any new consumer
  that keeps reading past RUN_ERROR will see out-of-order closings.

**How to apply:** run the independent verification first, then use this
list to separate pre-existing debt from new findings before writing the
verdict.
