import type { A2UIComponentNode } from '../schema';
import { buildLegacyStreamTree } from '../builders/legacyStreamTree';
import type { AGUIStreamEvent } from './events';

/**
 * Accumulator reduced from a sequence of real `AGUIStreamEvent`s.
 *
 * This replaces the former `lib/a2ui/mock/streamState.ts` — same reducer
 * shape, now driven by `parseAGUIStreamEvent` (`./events.ts`) instead of the
 * temporary `legacySSEEventToMockAGUIEvent` shim, per the swap plan that
 * used to live in `lib/a2ui/mock/legacyShim.ts` (deleted).
 */
export interface A2UIStreamState {
  reasoningText: string;
  answerText: string;
  isStreaming: boolean;
  toolCalls: Array<{ id: string; name: string; args: string; result?: string }>;
}

export function createEmptyA2UIStreamState(): A2UIStreamState {
  return { reasoningText: '', answerText: '', isStreaming: false, toolCalls: [] };
}

/**
 * Reduces one real AG-UI event into the running stream state. Pure and
 * side-effect free so it's trivial to unit test.
 */
export function applyAGUIStreamEvent(
  state: A2UIStreamState,
  event: AGUIStreamEvent
): A2UIStreamState {
  switch (event.type) {
    case 'RUN_STARTED':
      return { ...state, isStreaming: true };

    case 'REASONING_MESSAGE_CONTENT':
      return { ...state, reasoningText: state.reasoningText + event.delta };

    case 'TEXT_MESSAGE_CONTENT':
      return { ...state, answerText: state.answerText + event.delta };

    case 'TOOL_CALL_START':
      return {
        ...state,
        toolCalls: [
          ...state.toolCalls,
          { id: event.toolCallId, name: event.toolCallName, args: '' },
        ],
      };

    case 'TOOL_CALL_ARGS':
      return {
        ...state,
        toolCalls: state.toolCalls.map(tc =>
          tc.id === event.toolCallId ? { ...tc, args: tc.args + event.delta } : tc
        ),
      };

    case 'TOOL_CALL_RESULT':
      return {
        ...state,
        toolCalls: state.toolCalls.map(tc =>
          tc.id === event.toolCallId ? { ...tc, result: event.content } : tc
        ),
      };

    case 'RUN_FINISHED':
    case 'RUN_ERROR':
      return { ...state, isStreaming: false };

    case 'CUSTOM':
      return state;

    default:
      return state;
  }
}

/** Converts accumulated stream state into a validated-ready A2UI tree. */
export function streamStateToA2UITree(state: A2UIStreamState): A2UIComponentNode {
  return buildLegacyStreamTree({
    reasoning: state.reasoningText || undefined,
    answer: state.answerText,
    toolCalls: state.toolCalls,
    isStreaming: state.isStreaming,
  });
}
