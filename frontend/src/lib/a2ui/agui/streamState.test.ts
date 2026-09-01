import { describe, it, expect } from 'vitest';
import {
  createEmptyA2UIStreamState,
  applyAGUIStreamEvent,
  streamStateToA2UITree,
} from './streamState';
import type { AGUIStreamEvent } from './events';

describe('applyAGUIStreamEvent', () => {
  it('accumulates reasoning, answer, and tool-call state across a full run', () => {
    const events: AGUIStreamEvent[] = [
      { type: 'RUN_STARTED' },
      { type: 'REASONING_MESSAGE_CONTENT', delta: 'Thinking' },
      { type: 'REASONING_MESSAGE_CONTENT', delta: ' more' },
      { type: 'TOOL_CALL_START', toolCallId: 'tc-1', toolCallName: 'search' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tc-1', delta: '{"q":"x"}' },
      { type: 'TOOL_CALL_RESULT', toolCallId: 'tc-1', content: 'results' },
      { type: 'TEXT_MESSAGE_CONTENT', delta: 'Answer' },
      { type: 'TEXT_MESSAGE_CONTENT', delta: ' text' },
      { type: 'RUN_FINISHED' },
    ];

    const state = events.reduce(applyAGUIStreamEvent, createEmptyA2UIStreamState());

    expect(state).toEqual({
      reasoningText: 'Thinking more',
      answerText: 'Answer text',
      isStreaming: false,
      toolCalls: [{ id: 'tc-1', name: 'search', args: '{"q":"x"}', result: 'results' }],
    });
  });

  it('stops streaming on RUN_ERROR just like RUN_FINISHED', () => {
    const started = applyAGUIStreamEvent(createEmptyA2UIStreamState(), { type: 'RUN_STARTED' });
    expect(started.isStreaming).toBe(true);

    const errored = applyAGUIStreamEvent(started, { type: 'RUN_ERROR', message: 'boom' });
    expect(errored.isStreaming).toBe(false);
  });

  it('leaves state untouched for lifecycle/bracket markers', () => {
    const state = createEmptyA2UIStreamState();
    const next = applyAGUIStreamEvent(state, { type: 'TEXT_MESSAGE_START' });
    expect(next).toEqual(state);
  });

  it('builds a validated-ready A2UI tree from accumulated state', () => {
    const state = {
      reasoningText: 'thinking',
      answerText: 'hello',
      isStreaming: true,
      toolCalls: [{ id: 'tc-1', name: 'search', args: '{}' }],
    };

    const tree = streamStateToA2UITree(state);
    expect(tree.component).toBe('column');
    if (tree.component === 'column') {
      expect(tree.children.map(c => c.component)).toEqual(['reasoning', 'column', 'markdown']);
    }
  });
});
