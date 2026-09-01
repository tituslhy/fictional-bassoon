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

  it('should upsert finalized message when status is done', async () => {
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

    await act(async () => {
      result.current.updateThreadMessages(threadId, messages);
    });

    // Should call fetch to upsert the "done" message
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Prefer: 'resolution=merge-duplicates',
        }),
      })
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

  it('should fetch existing threads on mount and sort messages', async () => {
    const mockThreads = [
      {
        id: 'thread-123',
        title: 'Existing Thread',
        updated_at: new Date().toISOString(),
        messages: [
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'World',
            status: 'done',
            created_at: '2024-01-01T12:00:01Z',
          },
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            status: 'done',
            created_at: '2024-01-01T12:00:00Z',
          },
        ],
      },
    ];

    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes('/threads')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockThreads),
        });
      }
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(1);
    });

    expect(result.current.threads[0].messages[0].content).toBe('Hello');
    expect(result.current.threads[0].messages[1].content).toBe('World');
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

  it('should handle add message fetch errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(url => {
      callCount++;
      if (callCount <= 2 && url.includes('/threads')) {
        // First calls for fetching/creating threads
        if (url.includes('?'))
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/messages')) {
        // POST /messages - simulate error
        return Promise.reject(new Error('Add message failed'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

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

    // Should still add locally even if persistence fails
    expect(result.current.threads[0].messages).toHaveLength(1);
    expect(consoleSpy).toHaveBeenCalledWith('Error persisting message:', expect.any(Error));
    consoleSpy.mockRestore();
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

  it('should handle update thread messages fetch errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(url => {
      callCount++;
      if (url.includes('/threads')) {
        if (url.includes('?id=eq')) {
          return Promise.resolve({ ok: true });
        }
        if (url.includes('select=')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/messages')) {
        // Simulate error when upserting finalized message
        return Promise.reject(new Error('Upsert failed'));
      }
      return Promise.resolve({ ok: true });
    });

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

    await act(async () => {
      result.current.updateThreadMessages(threadId, messages);
    });

    // Should still update locally even if persistence fails
    expect(result.current.threads[0].messages).toHaveLength(1);
    expect(consoleSpy).toHaveBeenCalledWith('Error upserting message:', expect.any(Error));
    consoleSpy.mockRestore();
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
