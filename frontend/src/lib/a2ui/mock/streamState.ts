import type { A2UIComponentNode } from '../schema';
import { buildLegacyStreamTree } from '../builders/legacyStreamTree';
import type { MockAGUIEvent } from './aguiEvents';

/** Accumulator reduced from a sequence of `MockAGUIEvent`s. */
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
 * Reduces one mocked AG-UI event into the running stream state. Pure and
 * side-effect free so it's trivial to unit test and trivial to swap for a
 * real-event version later (see `legacyShim.ts`'s swap instructions).
 */
export function applyMockAGUIEvent(state: A2UIStreamState, event: MockAGUIEvent): A2UIStreamState {
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

    // TEXT_MESSAGE_START/END, REASONING_MESSAGE_START/END, TOOL_CALL_END:
    // pure lifecycle markers, no state change needed for this app's
    // read-only rendering.
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
