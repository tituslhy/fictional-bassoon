/**
 * TEMPORARY bridge only — not part of the A2UI contract itself.
 *
 * `useSSEStream.ts` currently receives the legacy `SSEEvent` shape from
 * `frontend/src/types/index.ts` (owned by `backend-agui-developer`, still
 * the pre-AG-UI vocabulary: `reasoning` | `answer` | `tool_call` |
 * `tool_result` | `agent` | `error` | `done`). This shim exists solely so
 * the A2UI tree-building path in `lib/a2ui/mock/` can be exercised
 * end-to-end against the real transport today, ahead of the real AG-UI
 * event stream landing on the backend.
 *
 * --- How to swap this out once real AG-UI events land ---
 * 1. Confirm `types/index.ts`'s `SSEEventType` has been updated to the real
 *    AG-UI vocabulary (that's `backend-agui-developer`'s change, not this
 *    one).
 * 2. Delete this file and its call site in `useSSEStream.ts`.
 * 3. Feed the real events directly into `applyMockAGUIEvent`
 *    (`lib/a2ui/mock/streamState.ts`) — rename it (and `MockAGUIEvent` /
 *    the `Mock` prefix throughout `lib/a2ui/mock/`) once the shape is
 *    confirmed against the real package, since the event *names* here were
 *    already modeled on the real `@ag-ui/core` vocabulary and should line
 *    up closely, not exactly (verify field names, don't assume).
 */
import type { SSEEvent } from '@/types';
import type { MockAGUIEvent } from './aguiEvents';

export function legacySSEEventToMockAGUIEvent(event: SSEEvent): MockAGUIEvent | null {
  switch (event.event) {
    case 'reasoning':
      return { type: 'REASONING_MESSAGE_CONTENT', delta: event.data };

    case 'answer':
      return { type: 'TEXT_MESSAGE_CONTENT', delta: event.data };

    case 'tool_call':
      return parseLegacyToolCallFrame(event.data);

    case 'tool_result':
      return parseLegacyToolResultFrame(event.data);

    case 'error':
      return { type: 'RUN_ERROR', message: event.data };

    case 'done':
      return { type: 'RUN_FINISHED' };

    case 'agent':
      // Legacy "agent" state-update frames have no A2UI-rendered equivalent
      // in this app's current component set.
      return null;

    default:
      return null;
  }
}

function parseLegacyToolCallFrame(data: string): MockAGUIEvent {
  try {
    const parsed = JSON.parse(data) as {
      id?: string;
      index?: number;
      name?: string;
      args?: unknown;
    };
    const id = parsed.id ?? String(parsed.index ?? '0');
    if (parsed.name) {
      return { type: 'TOOL_CALL_START', toolCallId: id, toolCallName: parsed.name };
    }
    return {
      type: 'TOOL_CALL_ARGS',
      toolCallId: id,
      delta: typeof parsed.args === 'string' ? parsed.args : JSON.stringify(parsed.args ?? ''),
    };
  } catch {
    return { type: 'TOOL_CALL_ARGS', toolCallId: '0', delta: data };
  }
}

function parseLegacyToolResultFrame(data: string): MockAGUIEvent {
  try {
    const parsed = JSON.parse(data) as { data?: string; tool_call_id?: string };
    return {
      type: 'TOOL_CALL_RESULT',
      toolCallId: parsed.tool_call_id ?? '0',
      content: parsed.data ?? data,
    };
  } catch {
    return { type: 'TOOL_CALL_RESULT', toolCallId: '0', content: data };
  }
}
