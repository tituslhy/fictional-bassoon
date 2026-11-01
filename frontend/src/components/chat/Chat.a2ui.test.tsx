import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Chat from './Chat';
import { surfaceFixture } from '@/lib/a2ui/surfaceFixture';
import { useThreadsContext, useThreadStore } from '@/context/ThreadContext';
import { useSSEStream } from '@/hooks/useSSEStream';
import type { SSEEvent } from '@/types';
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('@/context/ThreadContext', () => ({ useThreadsContext: vi.fn(), useThreadStore: vi.fn() }));
vi.mock('@/hooks/useSSEStream', () => ({ useSSEStream: vi.fn() }));
vi.mock('@/components/sidebar/Sidebar', () => ({ default: () => null }));

describe('chat interactive UI integration', () => {
  let store: any;
  let callbacks: any;
  const start = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    let nextId = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `00000000-0000-0000-0000-${String(++nextId).padStart(12, '0')}`
    );
    Element.prototype.scrollIntoView = vi.fn();
    store = {
      threads: [
        {
          id: 'thread-1',
          title: 'Comparison',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: 'Compare these options.',
              toolCalls: [],
              status: 'done',
              a2uiSurfaces: [surfaceFixture()],
            },
          ],
        },
      ],
      updateThreadMessages: vi.fn((id, messages) => {
        store.threads[0].messages = messages;
      }),
      updateThreadTitle: vi.fn(),
    };
    vi.mocked(useThreadsContext).mockImplementation(() => ({
      ...store,
      activeThreadId: 'thread-1',
      createThread: vi.fn(),
    }));
    vi.mocked(useThreadStore).mockReturnValue({ current: store });
    vi.mocked(useSSEStream).mockImplementation(options => {
      callbacks = options;
      return { start, stop: vi.fn(), isStreaming: false };
    });
  });
  it('renders hydrated surfaces and sends selection through the existing chat request', async () => {
    render(<Chat />);
    fireEvent.click(screen.getByRole('radio', { name: 'FastAPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Get recommendation' }));
    expect(start).toHaveBeenCalledWith({
      message:
        'I selected FastAPI. Please give me a tailored recommendation and practical next steps for this option, using our comparison above.',
      thread_id: 'thread-1',
      a2ui_action: {
        version: 'v1.0',
        action: {
          name: 'select_option',
          surfaceId: 'surface-1',
          sourceComponentId: 'submit',
          timestamp: expect.any(String),
          context: { selection: ['fastapi'] },
        },
      },
    });
    await act(async () => callbacks.onEvent({ event: 'RUN_FINISHED', data: '{}' } as SSEEvent));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Selection sent'));
    expect(
      store.threads[0].messages.find((m: any) => m.role === 'user').a2uiAction.action.context
        .selection
    ).toEqual(['fastapi']);
  });
  it('hydrates the submitted choice from user action metadata', () => {
    store.threads[0].messages.push({
      id: 'selection-1',
      role: 'user',
      content: 'I selected Flask',
      status: 'done',
      toolCalls: [],
      a2uiAction: {
        version: 'v1.0',
        action: {
          name: 'select_option',
          surfaceId: 'surface-1',
          sourceComponentId: 'submit',
          timestamp: '2026-11-01T10:00:00Z',
          context: { selection: ['flask'] },
        },
      },
    });
    render(<Chat />);
    expect(screen.getByRole('radio', { name: 'Flask' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Get recommendation' })).toBeDisabled();
  });
  it('permits retry when an action stream reports RUN_ERROR', async () => {
    render(<Chat />);
    fireEvent.click(screen.getByRole('radio', { name: 'Flask' }));
    fireEvent.click(screen.getByRole('button', { name: 'Get recommendation' }));
    await act(async () =>
      callbacks.onEvent({ event: 'RUN_ERROR', data: '{"message":"Try later"}' })
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again'));
    expect(screen.getByRole('button', { name: 'Get recommendation' })).toBeEnabled();
  });
  it.each(['http', 'disconnect'])('permits retry after an action %s failure', async failure => {
    render(<Chat />);
    fireEvent.click(screen.getByRole('radio', { name: 'Flask' }));
    fireEvent.click(screen.getByRole('button', { name: 'Get recommendation' }));
    await act(async () => {
      if (failure === 'http') callbacks.onError('HTTP 503: Unavailable');
      else callbacks.onComplete();
    });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again'));
    expect(screen.getByRole('radio', { name: 'Flask' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Get recommendation' }));
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][0].a2ui_action.action.context.selection).toEqual(['flask']);
    await act(async () => callbacks.onEvent({ event: 'RUN_FINISHED', data: '{}' }));
  });

  it('retains a new surface from CUSTOM events and ignores malformed surfaces', async () => {
    render(<Chat />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Compare frameworks' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await act(async () =>
      callbacks.onEvent({
        event: 'CUSTOM',
        data: JSON.stringify({ name: 'a2ui.surface', value: surfaceFixture() }),
      })
    );
    expect(store.threads[0].messages.at(-1).a2uiSurfaces).toEqual([surfaceFixture()]);
    await act(async () =>
      callbacks.onEvent({
        event: 'CUSTOM',
        data: JSON.stringify({ name: 'a2ui.surface', value: { version: 'v1.0' } }),
      })
    );
    expect(store.threads[0].messages.at(-1).a2uiSurfaces).toHaveLength(1);
  });
});
