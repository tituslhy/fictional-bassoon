# A2UI implementation handoff

Paused at the user's request on 1 November 2026 because credits are running out. **Do not treat this feature as complete.**

## Objective and authorization

User approved an interactive A2UI vertical slice: model-generated comparison cards and a selectable list, with the selection returning to the agent for a follow-up recommendation. Demo prompt:

> Compare FastAPI, Flask, and Django for a small API project, and let me select one for a follow-up recommendation.

Branch created: `codex/a2ui`. Base HEAD: `6f54cd1` (already on origin/main). All feature changes are currently **uncommitted and unpushed**. User has not requested a feature commit/push yet. Preserve the pre-existing README capability restructuring and `images/a2ui-demo.png` (that image shows the OLD text/tool-card demo, not interactive UI).

## Non-negotiable session constraints

- **Do not read any `.env` files.** User separately authorized Docker loading `backend/.env` to supply provider credentials; do not print or inspect its contents. Tests must disable dotenv loading.
- **Keep the stack running.** No `down`, volume deletion, database resets, or removal of saved app/trace data. Recreate only app services when needed to load implementation changes.
- Keep credentials in ignored `handoffs/local-stack/`; never commit them or include them in screenshots.
- Use existing Next.js/Tailwind/React frontend and FastAPI/Celery/Redis backend. Do not add a parallel infrastructure stack.

## Design / protocol contract

Read `docs/a2ui/implementation-plan.md` and `AGENTS.md` first. The existing four lowercase component tree was custom structured chat rendering, not full A2UI. This feature deliberately uses the actual **v1.0 candidate profile** from the already-pinned published `@a2ui/web_core@0.10.6` schemas.

Exact upstream schemas plus Apache-2.0 license are vendored in `backend/src/a2ui_schemas/`, with origin and archive SHA in its README. Temporary source archive/extraction: `/tmp/bassoon-a2ui.tgz`, `/tmp/bassoon-a2ui-spec/package`. Added pinned `jsonschema==4.25.1` to backend and lockfile. Validation resolves only local schemas.

New event: AG-UI `CUSTOM`, name `a2ui.surface`, value is a standard envelope:

```json
{"version":"v1.0","createSurface":{"surfaceId":"ui-unique","catalogId":"https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json","components":[],"dataModel":{"selection":[]}}}
```

Supported standard components: Text, Column, Row, Card, ChoicePicker, Button. Flat list with component references, root ID `root`. Exactly one single-choice picker and one submit button. Only `/selection` binding, only `select_option` event. No arbitrary functions, remote content, HTML, or executable UI. 60 components max, depth12, bounded text/options, unique IDs, no cycles/missing/unreachable/shared references.

Renderer action travels in existing ChatRequest `a2ui_action`:

```json
{"version":"v1.0","action":{"name":"select_option","surfaceId":"issued-id","sourceComponentId":"button-id","timestamp":"2026-11-01T16:00:00Z","context":{"selection":["option-value"]}}}
```

Server checks thread ownership first, then resolves action against actual issued surfaces from checkpoint ToolMessages. Browser message text is replaced by canonical server-derived selection text. No action executes external operations.

## Implemented backend

- `src/interactive_ui.py`: strict profile + official JSON Schema validation, `build_surface`, `surface_from_tool`, `resolve_action`, and LangChain tool `render_interactive_ui`.
- `src/agent.py`: UI tool alongside Tavily and system prompt directing interactive comparisons. Model unchanged (`openai:gpt-5.4-nano`).
- `utils/streaming.py`: emits standard surfaces from successful named UI ToolMessages; iterates all messages in tool update batches (previously only last); persists action metadata in input HumanMessage `additional_kwargs.a2ui_action`.
- `src/threads.py`: validates actions before queueing, after ownership check. Reads checkpoint and derives safe follow-up prompt.
- `src/history.py`: hydrates surfaces from matching tool results. Latest local edit also restores submitted action metadata only after a subsequent nonempty AI reply, so incomplete action turns can be retried.
- `src/models/chat_models.py`: optional bounded `a2ui_action` request; history aliases `a2uiSurfaces` and `a2uiAction` (explicit alias avoids Pydantic's a2Ui casing).
- Tests `backend/tests/test_interactive_ui.py` exercise schema/profile, malicious tree/action rejection, streaming, batched tools, history, ownership ordering, canonical prompt, tool registration, and selection hydration.

## Implemented frontend (subagent finished)

- `lib/a2ui/surface.ts`: strict matching profile validation and types.
- `lib/a2ui/SurfaceRenderer.tsx`: native accessible choices, cards/layout, submit, pending/sent/error states, retries, safe literal text.
- Chat.tsx consumes `a2ui.surface`, retains surfaces per assistant message, sends standard action in `/chat`.
- MessageList/MessageBubble render history surfaces and pass action callback.
- Latest local change persists successful selection by surface ID via user `ThreadMessage.a2uiAction`; it is set only after RUN_FINISHED, not errors/disconnects. Renderer restores selected/sent state after thread switches and history reload.
- Starter prompt updated for FastAPI/Flask/Django comparison.
- No new frontend dependencies. Frontend test agent reported **227 tests passed**, TypeScript and scoped ESLint clean after final edits. Test files: Chat.a2ui.test.tsx, SurfaceRenderer.test.tsx, surface.test.ts, surfaceFixture.ts.

## CURRENT BLOCKER — fix this next

**First live model run failed to generate valid UI.** It called `render_interactive_ui` three times, each returned `Unsupported component`, then fell back to prose. This is NOT a frontend rendering failure: validation correctly rejected malformed model output.

Captured actual tool args used **`type: "Column"` instead of `component: "Column"`**, `children` for Card instead of `child`, and `childId` for Button instead of `child`. The current tool signature `components: list[dict[str, Any]]` exposes an underspecified schema, and its docstring wasn't explicit enough for this model.

**Next action:** provide an exact structured tool input schema (e.g. `@tool(args_schema=UI_INPUT_SCHEMA)` with each component variant's fields, required `id` + `component`, `additionalProperties:false`, and correct Card/Button `child`). Keep standard wire shape; do NOT silently normalize invented field names or replace model-authored layout with a canned server template. Improve validation error to identify the bad field/component and available types. Include a compact valid example in tool guidance if needed.

A test was intentionally added LAST and is currently red:

`test_ui_tool_advertises_exact_component_fields_to_model`

It expects `render_interactive_ui.args_schema` to be a dict with `properties.components.items.anyOf`, six variants declaring exact `component` constants, required `component`, and no extra fields. Current result: **1 failed, 23 passed** for test_interactive_ui.py. Failure is expected: args_schema is still auto-generated Pydantic class. Implement the explicit schema, rerun tests, and retry live in a NEW conversation (avoid model being biased by failed attempts).

## Verification state / other findings

- Before last persistence/schema-test edits, full backend suite: **135 passed**, existing warnings about short test JWT key and unawaited mock coroutine.
- After backend selection persistence edit: targeted **23 passed**. Then added exact-tool-schema test => **23 passed, 1 expected failure**. Full suite needs rerun after next implementation.
- Frontend final: **227 passed**, type check and scoped ESLint clean (agent reported). Existing AuthContext tests print expected missing-provider error logs but pass.
- Initial frontend Docker production build passed.
- Ruff fixed imports/format on early backend changes. Later edits still need final formatting/lint.
- Local `.venv` mypy reports pre-existing `src/auth.py` no-any-return at password helper lines25/29 because its passlib stubs differ from pre-commit environment. Earlier commit hooks with their own environment passed. Don't reintroduce redundant casts that fail the hook; run appropriate hooks and distinguish environment mismatch. A new interactive_ui Any return was fixed using cast; streaming Any import was fixed.
- Independent review (`a2ui_review`) found only P2 loss of selected/sent state across remount. Both backend and frontend local changes now address it; live verification still needed. No executable UI or ownership bypass found in review.
- Meaningful extra tests suggested: malformed context types, count/depth bounds, multiple UI tool results hydration.

## Running local stack / deployment status

Project: `bassoon-local`. Generated compose: `handoffs/local-stack/compose.yaml`; provider override: `handoffs/local-stack/provider-override.yaml`. **Do not print generated compose** (contains local secrets).

App http://localhost:8080, Langfuse3001, Grafana3002, RabbitMQ15672, Redis Insight5540, Prometheus9090, MinIO9001, ClickHouse18123, Alloy12345, direct FastAPI docs18000.

Only backend/celery_worker/frontend were recreated. All infrastructure/data left up.

Local build contexts are source COPIES under `handoffs/local-stack/backend` and `.../frontend`, so editing repository code alone does not update containers. **Do not rerun scripts/prepare_local_stack.py** against this current setup: it would overwrite generated compose/proxy configuration. Instead copy changed files/directories explicitly, excluding .env files and caches, then build only app services.

Generated backend `Dockerfile.cached` uses `bassoon-smoke-runtime:local`, `/smoke-venv`, and was amended with:

```
RUN uv pip install --python /smoke-venv/bin/python jsonschema==4.25.1
```

Standard committed backend Dockerfile already installs pyproject/lock; no need to change it.

Commands (Docker sandbox escalation required):

```sh
docker compose --env-file backend/.env -p bassoon-local \
  -f handoffs/local-stack/compose.yaml \
  -f handoffs/local-stack/provider-override.yaml build backend celery_worker frontend

docker compose --env-file backend/.env -p bassoon-local \
  -f handoffs/local-stack/compose.yaml \
  -f handoffs/local-stack/provider-override.yaml up -d --no-deps backend celery_worker frontend
```

These let Docker load the explicitly authorized provider key; don't open the .env file. Recopy both backend/frontend first: deployed images currently **lack the latest selection persistence fixes and future structured-tool schema fix**.

## Browser state and live test

Playwright tab0 current at localhost8080, signed in as user. New failed chat title `Compare FastAPI, Flask, and Django for a...`. It shows 3 failed UI tool calls and explanatory prose. It is a genuine failed test; do not screenshot this as success.

A temporary browser-only fetch wrapper remains on tab0:

- `window.__uiOriginalFetch`: original fetch
- `window.__uiRuns`: completed chat responses `{status,text}`; contains no request credentials
- wrapper clones only /chat responses.

Restore after testing: `window.fetch = window.__uiOriginalFetch; delete window.__uiOriginalFetch; delete window.__uiRuns;` (or navigating reload clears it). Avoid dumping token-by-token event arrays; aggregate by toolCallId first if inspecting arguments.

Other browser tabs retain dashboards and previous tests. User credentials are in ignored `handoffs/local-stack/user-accounts.md`; no credentials in this handoff.

## Safe test commands

A temporary runner `/tmp/bassoon-pytest.py` changes to backend, disables/monkeypatches dotenv loading, installs an audit hook rejecting any attempt to open `.env*`, then runs pytest. Use:

```sh
backend/.venv/bin/python /tmp/bassoon-pytest.py -q
```

If missing, recreate that guarded runner instead of blindly calling `uv run pytest` (src/agent.py calls load_dotenv at import).

Frontend can use Vitest programmatically with `envDir:false` (avoid automatic .env loading):

```js
import { startVitest } from './node_modules/vitest/dist/node.js';
const ctx = await startVitest('test', [], {run:true, envDir:false});
if (!ctx) process.exitCode=1;
else {
  if(ctx.state.getUnhandledErrors().length || ctx.state.getFiles().some(f=>f.result?.state==='fail')) process.exitCode=1;
  await ctx.close();
}
```

Run from frontend using node --input-type=module. Agent used this successfully.

## Remaining completion checklist

1. Fix explicit model-facing tool schema (current red test); improve actionable validation errors.
2. Finish backend/frontend tests and lint/type checks; review fixes and ensure bounds match.
3. Recopy updated app sources into ignored build contexts; rebuild/recreate only app services retaining provider override.
4. Live NEW chat with approved prompt must generate actual cards+choices. Capture standard surface envelope, not just legacy `a2ui` trees.
5. Select one option, submit, verify real agent follow-up uses selection, no duplicate requests, no errors. Verify switch away/back AND reload restore cards/selected/sent state; failed actions should remain retryable.
6. Save real screenshots to root images (e.g. `a2ui-interactive.png`, `a2ui-selection.png`). Update README capability table/demo and release notes with actual verified behavior. Existing README still describes old four-component demo and needs replacement/qualification.
7. Update AGENTS.md and stale guidance as appropriate. `.codex` protocol/architecture/scope files already amended with authorized new feature; `.claude` historical rules still contain original freeze, but canonical entry points to AGENTS.md.
8. Keep stack running. Report exact limitations: candidate restricted profile, only createSurface and select_option; no general updateComponents/function execution/full conformance.
9. Do not claim completion or push until live behavior actually works. User requested takeover now; no further feature work performed after this handoff.
