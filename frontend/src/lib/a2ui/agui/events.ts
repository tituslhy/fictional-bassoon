/**
 * Real AG-UI event shape consumed by the A2UI tree-building pipeline.
 *
 * Field names and event names are verified against the actual installed
 * `ag_ui-protocol==0.1.21` package (`backend/.venv/.../ag_ui/core/events.py`,
 * `ag_ui/core/types.py`'s `ConfiguredBaseModel` — `alias_generator=to_camel`)
 * per the `protocol-spec-verification` skill, not recalled from memory. The
 * backend serializes every event via `model_dump_json(by_alias=True)`
 * (`backend/utils/streaming.py`'s `_to_dict`), so the JSON on the SSE
 * `data:` line is camelCase: `messageId`, `toolCallId`, `toolCallName`,
 * `delta`, `content`, `message`, etc. See
 * `.claude/rules/protocol-version-pinning.md`'s "AG-UI pin note" for the
 * full vocabulary and the documented `event:` header deviation.
 *
 * This is a deliberately small subset — just the fields this app's A2UI
 * tree building (`streamState.ts`) actually needs — not a full mirror of
 * every AG-UI event's payload.
 *
 * This module replaces the former `lib/a2ui/mock/aguiEvents.ts`. It used to
 * model a placeholder shape ahead of the real backend event stream landing;
 * now that AG-UI events are the actual wire vocabulary
 * (`frontend/src/types/index.ts`'s `AGUIEventType`), the "Mock" naming was
 * dropped per the swap plan that used to live in `lib/a2ui/mock/legacyShim.ts`.
 */
import type { AGUIEventType, SSEEvent } from '@/types';

export interface AGUIStreamEventBase {
  type: AGUIEventType;
}

export interface TextMessageContentStreamEvent extends AGUIStreamEventBase {
  type: 'TEXT_MESSAGE_CONTENT';
  delta: string;
}

export interface ReasoningMessageContentStreamEvent extends AGUIStreamEventBase {
  type: 'REASONING_MESSAGE_CONTENT';
  delta: string;
}

export interface ToolCallStartStreamEvent extends AGUIStreamEventBase {
  type: 'TOOL_CALL_START';
  toolCallId: string;
  toolCallName: string;
}

export interface ToolCallArgsStreamEvent extends AGUIStreamEventBase {
  type: 'TOOL_CALL_ARGS';
  toolCallId: string;
  delta: string;
}

export interface ToolCallResultStreamEvent extends AGUIStreamEventBase {
  type: 'TOOL_CALL_RESULT';
  toolCallId: string;
  content: string;
}

export interface RunErrorStreamEvent extends AGUIStreamEventBase {
  type: 'RUN_ERROR';
  message: string;
}

export interface CustomA2UIStreamEvent extends AGUIStreamEventBase {
  type: 'CUSTOM';
  name: string;
  value: unknown;
}

/** Lifecycle/bracket markers this app's read-only rendering ignores the payload of. */
export interface LifecycleStreamEvent extends AGUIStreamEventBase {
  type:
    | 'RUN_STARTED'
    | 'RUN_FINISHED'
    | 'STEP_STARTED'
    | 'STEP_FINISHED'
    | 'TEXT_MESSAGE_START'
    | 'TEXT_MESSAGE_END'
    | 'TEXT_MESSAGE_CHUNK'
    | 'REASONING_MESSAGE_START'
    | 'REASONING_MESSAGE_END'
    | 'REASONING_MESSAGE_CHUNK'
    | 'TOOL_CALL_END'
    | 'TOOL_CALL_CHUNK';
}

export type AGUIStreamEvent =
  | TextMessageContentStreamEvent
  | ReasoningMessageContentStreamEvent
  | ToolCallStartStreamEvent
  | ToolCallArgsStreamEvent
  | ToolCallResultStreamEvent
  | RunErrorStreamEvent
  | CustomA2UIStreamEvent
  | LifecycleStreamEvent;

/**
 * Parses one real SSE frame (`event:` set to the AG-UI type name, `data:`
 * carrying the full AG-UI event JSON — `sse-transport-lock.md` /
 * `protocol-version-pinning.md`'s AG-UI pin note) into an `AGUIStreamEvent`.
 * Returns `null` for a frame whose `data:` isn't valid JSON (defensive —
 * a malformed frame is logged and dropped by the caller, not a reason to
 * tear down the SSE stream).
 */
export function parseAGUIStreamEvent(event: SSEEvent): AGUIStreamEvent | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(event.data) as Record<string, unknown>;
  } catch {
    return null;
  }

  switch (event.event) {
    case 'TEXT_MESSAGE_CONTENT':
      return { type: 'TEXT_MESSAGE_CONTENT', delta: String(data.delta ?? '') };

    case 'REASONING_MESSAGE_CONTENT':
      return { type: 'REASONING_MESSAGE_CONTENT', delta: String(data.delta ?? '') };

    case 'TOOL_CALL_START':
      return {
        type: 'TOOL_CALL_START',
        toolCallId: String(data.toolCallId ?? ''),
        toolCallName: String(data.toolCallName ?? ''),
      };

    case 'TOOL_CALL_ARGS':
      return {
        type: 'TOOL_CALL_ARGS',
        toolCallId: String(data.toolCallId ?? ''),
        delta: String(data.delta ?? ''),
      };

    case 'TOOL_CALL_RESULT':
      return {
        type: 'TOOL_CALL_RESULT',
        toolCallId: String(data.toolCallId ?? ''),
        content: String(data.content ?? ''),
      };

    case 'RUN_ERROR':
      return { type: 'RUN_ERROR', message: String(data.message ?? '') };

    case 'CUSTOM':
      return {
        type: 'CUSTOM',
        name: String(data.name ?? ''),
        value: data.value,
      };

    case 'RUN_STARTED':
    case 'RUN_FINISHED':
    case 'STEP_STARTED':
    case 'STEP_FINISHED':
    case 'TEXT_MESSAGE_START':
    case 'TEXT_MESSAGE_END':
    case 'TEXT_MESSAGE_CHUNK':
    case 'REASONING_MESSAGE_START':
    case 'REASONING_MESSAGE_END':
    case 'REASONING_MESSAGE_CHUNK':
    case 'TOOL_CALL_END':
    case 'TOOL_CALL_CHUNK':
      return { type: event.event };

    default:
      return null;
  }
}
