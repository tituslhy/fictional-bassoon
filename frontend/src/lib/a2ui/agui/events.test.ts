import { describe, it, expect } from 'vitest';
import { parseAGUIStreamEvent } from './events';
import type { SSEEvent } from '@/types';

function frame(event: SSEEvent['event'], data: unknown): SSEEvent {
  return { event, data: JSON.stringify(data) };
}

describe('parseAGUIStreamEvent', () => {
  it('parses TEXT_MESSAGE_CONTENT deltas', () => {
    const result = parseAGUIStreamEvent(frame('TEXT_MESSAGE_CONTENT', { delta: 'hello' }));
    expect(result).toEqual({ type: 'TEXT_MESSAGE_CONTENT', delta: 'hello' });
  });

  it('parses REASONING_MESSAGE_CONTENT deltas', () => {
    const result = parseAGUIStreamEvent(frame('REASONING_MESSAGE_CONTENT', { delta: 'thinking' }));
    expect(result).toEqual({ type: 'REASONING_MESSAGE_CONTENT', delta: 'thinking' });
  });

  it('parses TOOL_CALL_START with camelCase fields', () => {
    const result = parseAGUIStreamEvent(
      frame('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'search' })
    );
    expect(result).toEqual({ type: 'TOOL_CALL_START', toolCallId: 'tc-1', toolCallName: 'search' });
  });

  it('parses TOOL_CALL_ARGS', () => {
    const result = parseAGUIStreamEvent(
      frame('TOOL_CALL_ARGS', { toolCallId: 'tc-1', delta: '{"q":"x"}' })
    );
    expect(result).toEqual({ type: 'TOOL_CALL_ARGS', toolCallId: 'tc-1', delta: '{"q":"x"}' });
  });

  it('parses TOOL_CALL_RESULT', () => {
    const result = parseAGUIStreamEvent(
      frame('TOOL_CALL_RESULT', { toolCallId: 'tc-1', content: 'done' })
    );
    expect(result).toEqual({ type: 'TOOL_CALL_RESULT', toolCallId: 'tc-1', content: 'done' });
  });

  it('parses RUN_ERROR message', () => {
    const result = parseAGUIStreamEvent(frame('RUN_ERROR', { message: 'boom' }));
    expect(result).toEqual({ type: 'RUN_ERROR', message: 'boom' });
  });

  it('treats lifecycle markers as payload-less events', () => {
    const result = parseAGUIStreamEvent(frame('RUN_STARTED', { threadId: 't1', runId: 'r1' }));
    expect(result).toEqual({ type: 'RUN_STARTED' });
  });

  it('treats TOOL_CALL_END as a payload-less lifecycle marker', () => {
    const result = parseAGUIStreamEvent(frame('TOOL_CALL_END', { toolCallId: 'tc-1' }));
    expect(result).toEqual({ type: 'TOOL_CALL_END' });
  });

  it('parses CUSTOM a2ui payloads', () => {
    const result = parseAGUIStreamEvent(
      frame('CUSTOM', { type: 'CUSTOM', name: 'a2ui', value: { id: 'root', component: 'column', children: [] } })
    );
    expect(result).toEqual({
      type: 'CUSTOM',
      name: 'a2ui',
      value: { id: 'root', component: 'column', children: [] },
    });
  });

  it('returns null for malformed JSON data', () => {
    const result = parseAGUIStreamEvent({ event: 'TEXT_MESSAGE_CONTENT', data: 'not json' });
    expect(result).toBeNull();
  });

  it('falls back to empty string for missing delta field', () => {
    const result = parseAGUIStreamEvent(frame('TEXT_MESSAGE_CONTENT', {}));
    expect(result).toEqual({ type: 'TEXT_MESSAGE_CONTENT', delta: '' });
  });
});
