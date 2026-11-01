# Interactive A2UI slice

Approved scope: model-generated comparison cards and a selectable list with a follow-up recommendation. Preserve existing chat, authentication, queue, SSE, database, and local runtime. No arbitrary executable UI or outbound A2A calls.

## Protocol and interface contract

Target the existing pinned `@a2ui/web_core@0.10.6` published `src/v1_0/schemas` (v1.0 candidate profile, not full conformance). Vendor schemas and validate backend output against them. No renderer SDK dependency; implement a narrow Tailwind renderer.

- New AG-UI CUSTOM name: `a2ui.surface`. Value is one standard `{version:"v1.0",createSurface:{surfaceId,catalogId,components,dataModel:{selection:[]}}}` envelope. Catalog ID: `https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json`.
- Supported components: `Text` (literal text, optional caption/body variant), `Column`/`Row` (ID-array children), `Card` (child ID), `ChoicePicker` (literal label/options, mutuallyExclusive, value `{path:"/selection"}`, chips or checkbox), `Button` (Text child ID, action.event `{name:"select_option", context:{selection:{path:"/selection"}}}`, primary/default/borderless).
- Root must be `root`. Max 60 components, depth 12, acyclic, unique IDs, no missing/unreachable refs, exactly one choice picker and one button. No executable functions, arbitrary bindings, remote content, or HTML rendering.
- `ThreadMessage.a2uiSurfaces` and HistoryMessage wire `a2uiSurfaces`: array of these envelopes. Existing lowercase custom tree remains separate for old chat blocks.
- `ChatRequest.a2ui_action`: optional standard `{version:"v1.0",action:{name:"select_option",surfaceId,sourceComponentId,timestamp,context:{selection:[value]}}}`. Browser sends through existing `/chat` with thread ID and display message. Server checks ownership, finds issued surface in checkpoint ToolMessages, validates action and option, replaces user text with canonical selection for agent. No model-controlled arbitrary action execution.
- Tool `render_interactive_ui(components)` accepts the component list the model authors, validates it, assigns surface UUID, and returns serialized standard envelope. Its completed ToolMessage triggers surface event and persists in checkpoints.
- The tool's model-facing input is an explicit JSON Schema (`UI_INPUT_SCHEMA`): an `anyOf` of the six component shapes with `component` constants, required fields, and `additionalProperties: false`. An auto-generated `list[dict]` schema was too vague, and the first live run failed with invented field names. Do not normalize invented names on the server; return errors that name the component and field so the model can correct itself.
- Frontend validates before render, presents accessible choice controls and submit, disables while streaming and prevents duplicate dispatch; keeps selection after submission, resets on failed stream to permit retry. History restores surfaces from tool results. Backend records action metadata in HumanMessage for future inspection.

## Sequence and file ownership

1. Pin schema/profile; write failing backend and frontend validation/action tests.
2. Backend: tool, strict surface validation, stream event, history hydration, action authorization before queueing.
3. Frontend (independent after this contract): strict validation, surface renderer, per-message surface state, callback through existing chat stream, action tests.
4. Integration: schema conformance, ownership/invalid action tests, all existing suites, lint/type checks, live browser generation → selection → agent reply → reload.
5. Update README and screenshots with the actual interactive flow and limitations. Keep local services up; recreate only app components needed to load changes, preserving provider overrides and volumes.

Do not recreate the removed migration checklist. User's existing README and a2ui-demo.png changes are preserved. No automatic commit or push required for this feature request.
