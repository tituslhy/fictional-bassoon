/**
 * MOCK AG-UI event shape — placeholder only, not a wire contract.
 *
 * The real AG-UI event vocabulary is being wired on the backend in
 * parallel (`backend-agui-developer`'s track in `REWRITE_TASKS.md`) and
 * isn't merged yet. `frontend/src/types/index.ts`'s `SSEEventType` union is
 * still the legacy pre-AG-UI vocabulary (`reasoning` | `answer` |
 * `tool_call` | `tool_result` | `agent` | `error` | `done`) and is owned by
 * that task — nothing in `lib/a2ui/` imports or edits it except through the
 * `SSEEvent` type used by the temporary shim in `legacyShim.ts`.
 *
 * The event *names* below are modeled on the real, currently-published
 * `@ag-ui/core@0.0.59` package (npm, published 2026-08-03; homepage
 * https://github.com/ag-ui-protocol/ag-ui) `EventType` enum, fetched and
 * read directly rather than recalled from training data (see
 * `protocol-spec-verification` skill / `.claude/rules/protocol-version-pinning.md`).
 * That enum also documents `THINKING_*` as deprecated in favor of
 * `REASONING_*` — a good example of exactly the kind of recent rename this
 * project's verification skill warns about. This mock uses the
 * non-deprecated `REASONING_*` names.
 *
 * This is a deliberately small subset (just enough to drive the four A2UI
 * component types this app renders today) — not a full mirror of
 * `@ag-ui/core`'s event set (no `STATE_SNAPSHOT`, `STEP_STARTED`,
 * `MESSAGES_SNAPSHOT`, etc.).
 */

export type MockAGUIEventType =
  | 'RUN_STARTED'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'REASONING_MESSAGE_START'
  | 'REASONING_MESSAGE_CONTENT'
  | 'REASONING_MESSAGE_END'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_ARGS'
  | 'TOOL_CALL_END'
  | 'TOOL_CALL_RESULT'
  | 'RUN_FINISHED'
  | 'RUN_ERROR';

interface MockAGUIEventBase {
  type: MockAGUIEventType;
}

export interface MockTextMessageContentEvent extends MockAGUIEventBase {
  type: 'TEXT_MESSAGE_CONTENT';
  delta: string;
}

export interface MockReasoningMessageContentEvent extends MockAGUIEventBase {
  type: 'REASONING_MESSAGE_CONTENT';
  delta: string;
}

export interface MockToolCallStartEvent extends MockAGUIEventBase {
  type: 'TOOL_CALL_START';
  toolCallId: string;
  toolCallName: string;
}

export interface MockToolCallArgsEvent extends MockAGUIEventBase {
  type: 'TOOL_CALL_ARGS';
  toolCallId: string;
  delta: string;
}

export interface MockToolCallResultEvent extends MockAGUIEventBase {
  type: 'TOOL_CALL_RESULT';
  toolCallId: string;
  content: string;
}

export interface MockRunErrorEvent extends MockAGUIEventBase {
  type: 'RUN_ERROR';
  message: string;
}

/** Lifecycle markers that carry no payload beyond their type. */
export interface MockLifecycleEvent extends MockAGUIEventBase {
  type:
    | 'RUN_STARTED'
    | 'RUN_FINISHED'
    | 'TEXT_MESSAGE_START'
    | 'TEXT_MESSAGE_END'
    | 'REASONING_MESSAGE_START'
    | 'REASONING_MESSAGE_END'
    | 'TOOL_CALL_END';
}

export type MockAGUIEvent =
  | MockTextMessageContentEvent
  | MockReasoningMessageContentEvent
  | MockToolCallStartEvent
  | MockToolCallArgsEvent
  | MockToolCallResultEvent
  | MockRunErrorEvent
  | MockLifecycleEvent;
