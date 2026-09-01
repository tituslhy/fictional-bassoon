import { renderHook, act, waitFor } from '@testing-library/react';
import { ThreadProvider, useThreadsContext, useThreadStore } from './ThreadContext';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// 1. Create a stable mock state to prevent infinite re-renders
const mockAuth = {
  token: 'mock-token',
  user: { id: 'user-1', email: 'test@example.com' },
  isLoading: false,
};

const mockAuthEmpty = {
  token: null,
  user: null,
  isLoading: false,
};

let currentMockAuth: typeof mockAuth | typeof mockAuthEmpty = mockAuth;

vi.mock('./AuthContext', () => ({
  useAuth: () => currentMockAuth,
}));

describe('ThreadContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockAuth = mockAuth;
    // 2. Default Mock fetch with a stable response
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes('/threads') || url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({ ok: true });
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThreadProvider>{children}</ThreadProvider>
  );

  it('should create a new thread', async () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    await waitFor(() => expect(result.current.threads).toEqual([]), { timeout: 2000 });

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    expect(threadId).toBeDefined();
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].id).toBe(threadId);
    expect(result.current.activeThreadId).toBe(threadId);
  });

  it('should add a message to a thread', async () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello',
      status: 'done' as const,
      toolCalls: [],
    };

    await act(async () => {
      await result.current.addMessage(threadId, message);
    });

    expect(result.current.threads[0].messages).toHaveLength(1);
    expect(result.current.threads[0].messages[0].content).toBe('Hello');
  });

  it('should delete a thread', async () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    expect(result.current.threads).toHaveLength(1);

    await act(async () => {
      await result.current.deleteThread(threadId);
    });

    expect(result.current.threads).toHaveLength(0);
    expect(result.current.activeThreadId).toBeNull();
  });

  it('should update thread title', async () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    await act(async () => {
      await result.current.updateThreadTitle(threadId, 'New Title');
    });

    expect(result.current.threads[0].title).toBe('New Title');
  });

  it('should update thread messages (sync for streaming)', async () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    const messages = [
      { id: 'm1', role: 'user' as const, content: 'hi', status: 'done' as const, toolCalls: [] },
      {
        id: 'm2',
        role: 'assistant' as const,
        content: 'hello...',
        status: 'streaming' as const,
        toolCalls: [],
      },
    ];

    await act(async () => {
      result.current.updateThreadMessages(threadId, messages);
    });

    expect(result.current.threads[0].messages).toHaveLength(2);
    expect(result.current.threads[0].messages[1].status).toBe('streaming');
  });

  it('should not dual-write finalized messages to api.messages', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    const messages = [
      {
        id: 'm1',
        role: 'assistant' as const,
        content: 'Final answer',
        status: 'done' as const,
        toolCalls: [],
      },
    ];

    fetchSpy.mockClear();

    await act(async () => {
      result.current.updateThreadMessages(threadId, messages);
    });

    expect(result.current.threads[0].messages[0].content).toBe('Final answer');
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.anything()
    );
  });

  it('should not dual-write errored messages to api.messages', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    const messages = [
      {
        id: 'm1',
        role: 'assistant' as const,
        content: '',
        status: 'error' as const,
        error: 'agent run failed',
        toolCalls: [],
      },
    ];

    fetchSpy.mockClear();

    await act(async () => {
      result.current.updateThreadMessages(threadId, messages);
    });

    expect(result.current.threads[0].messages[0].status).toBe('error');
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.anything()
    );
  });

  it('should handle unauthenticated state', async () => {
    currentMockAuth = mockAuthEmpty;
    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    await waitFor(() => expect(result.current.threads).toEqual([]));
    expect(result.current.threads).toHaveLength(0);
  });

  it('should log errors when persistence fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes('/threads') && !url.includes('?')) {
        // POST /threads
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    await act(async () => {
      await result.current.createThread();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Error persisting thread:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should fetch existing threads on mount and hydrate history from FastAPI', async () => {
    const mockThreads = [
      {
        id: 'thread-123',
        title: 'Existing Thread',
        updated_at: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/threads/') && url.includes('/history')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [
                {
                  id: 'msg-1',
                  role: 'user',
                  content: 'Hello',
                  status: 'done',
                  toolCalls: [],
                },
                {
                  id: 'msg-2',
                  role: 'assistant',
                  content: 'World',
                  status: 'done',
                  toolCalls: [],
                },
              ],
            }),
        });
      }
      if (url.includes('/threads')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockThreads),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(1);
    });

    await waitFor(() => {
      expect(result.current.threads[0].messages).toHaveLength(2);
    });

    expect(result.current.threads[0].messages[0].content).toBe('Hello');
    expect(result.current.threads[0].messages[1].content).toBe('World');
  });

  it('should retry history hydrate when re-selecting a thread after a failed GET', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockThreads = [
      {
        id: 'thread-123',
        title: 'Existing Thread',
        updated_at: new Date().toISOString(),
      },
    ];
    let historyCalls = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/threads/') && url.includes('/history')) {
        historyCalls += 1;
        if (historyCalls === 1) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [
                {
                  id: 'msg-1',
                  role: 'user',
                  content: 'Recovered',
                  status: 'done',
                  toolCalls: [],
                },
              ],
            }),
        });
      }
      if (url.includes('/threads')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockThreads),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(1);
    });
    await waitFor(() => expect(historyCalls).toBeGreaterThanOrEqual(1));
    expect(result.current.threads[0].messages).toHaveLength(0);

    await act(async () => {
      result.current.setActiveThreadId('thread-123');
    });

    await waitFor(() => {
      expect(result.current.threads[0].messages).toHaveLength(1);
    });
    expect(result.current.threads[0].messages[0].content).toBe('Recovered');
    consoleSpy.mockRestore();
  });

  it('should handle fetch errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network Error'));

    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    // Should still finish loading even if fetch fails
    await waitFor(() => {
      expect(result.current.threads).toBeDefined();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch threads from DB:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should provide a thread store via useThreadStore', async () => {
    const { result } = renderHook(() => useThreadStore(), { wrapper });

    await waitFor(() => {
      expect(result.current.current).toBeDefined();
    });

    expect(result.current.current.threads).toEqual([]);
  });

  it('should handle delete thread fetch errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(url => {
      callCount++;
      if (callCount === 1 && url.includes('/threads') && !url.includes('?')) {
        // First call for createThread
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/threads?id=eq')) {
        // DELETE /threads
        return Promise.reject(new Error('Delete failed'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    expect(result.current.threads).toHaveLength(1);

    await act(async () => {
      await result.current.deleteThread(threadId);
    });

    // Should still remove locally even if delete fails
    expect(result.current.threads).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith('Error deleting thread:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should add a message locally without posting to api.messages', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    fetchSpy.mockClear();

    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello',
      status: 'done' as const,
      toolCalls: [],
    };

    await act(async () => {
      await result.current.addMessage(threadId, message);
    });

    expect(result.current.threads[0].messages).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.anything()
    );
  });

  it('should handle update thread title fetch errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes('/threads?id=eq')) {
        // PATCH /threads - simulate error for title update
        return Promise.reject(new Error('Update title failed'));
      }
      if (url.includes('select=')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/threads')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    await act(async () => {
      await result.current.updateThreadTitle(threadId, 'New Title');
    });

    // Should still update locally even if persistence fails
    expect(result.current.threads[0].title).toBe('New Title');
    expect(consoleSpy).toHaveBeenCalledWith('Error updating thread title:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should update thread messages locally without upserting api.messages', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    fetchSpy.mockClear();

    const messages = [
      {
        id: 'm1',
        role: 'assistant' as const,
        content: 'Final answer',
        status: 'done' as const,
        toolCalls: [],
      },
    ];

    await act(async () => {
      result.current.updateThreadMessages(threadId, messages);
    });

    expect(result.current.threads[0].messages).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.anything()
    );
  });

  it('should update active thread to first thread when deleting the active thread', async () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.activeThreadId).toBe(threadId);

    // Delete the thread
    await act(async () => {
      await result.current.deleteThread(threadId);
    });

    // Thread should be removed and active thread should be null
    expect(result.current.threads).toHaveLength(0);
    expect(result.current.activeThreadId).toBeNull();
  });

  it('should clear active thread when deleting last thread', async () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });
    await waitFor(() => expect(result.current.threads).toEqual([]));

    let threadId: string = '';
    await act(async () => {
      threadId = await result.current.createThread();
    });

    expect(result.current.threads).toHaveLength(1);

    await act(async () => {
      await result.current.deleteThread(threadId);
    });

    expect(result.current.threads).toHaveLength(0);
    expect(result.current.activeThreadId).toBeNull();
  });
});
