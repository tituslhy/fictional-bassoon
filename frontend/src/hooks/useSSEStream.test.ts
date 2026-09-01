import { renderHook, act, waitFor } from '@testing-library/react';
import { useSSEStream } from './useSSEStream';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('useSSEStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle successful SSE stream', async () => {
    const onEvent = vi.fn();
    const onComplete = vi.fn();

    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'event: TEXT_MESSAGE_CONTENT\ndata: {"delta":"Hello"}\n\n'
              ),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'event: RUN_FINISHED\ndata: {"threadId":"t1","runId":"r1"}\n\n'
              ),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent, onComplete }));

    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({
        event: 'TEXT_MESSAGE_CONTENT',
        data: '{"delta":"Hello"}',
      });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it('should terminate the stream on RUN_ERROR (not just RUN_FINISHED)', async () => {
    const onEvent = vi.fn();
    const onComplete = vi.fn();

    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('event: RUN_ERROR\ndata: {"message":"boom"}\n\n'),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent, onComplete }));

    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({ event: 'RUN_ERROR', data: '{"message":"boom"}' });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('should handle HTTP error status', async () => {
    const onError = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useSSEStream({ onEvent: vi.fn(), onError }));

    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('HTTP 500: Internal Server Error');
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('should handle missing response body', async () => {
    const onComplete = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    const { result } = renderHook(() => useSSEStream({ onEvent: vi.fn(), onComplete }));

    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('should handle stream ending without a terminal event', async () => {
    const onComplete = vi.fn();
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'event: TEXT_MESSAGE_CONTENT\ndata: {"delta":"partial"}\n\n'
              ),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent: vi.fn(), onComplete }));

    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('should handle multiline data in SSE', async () => {
    const onEvent = vi.fn();
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'event: TEXT_MESSAGE_CONTENT\ndata: line 1\ndata: line 2\n\nevent: RUN_FINISHED\ndata: {}\n\n'
              ),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    renderHook(() => useSSEStream({ onEvent }));

    const { result } = renderHook(() => useSSEStream({ onEvent }));
    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({
        event: 'TEXT_MESSAGE_CONTENT',
        data: 'line 1\nline 2',
      });
    });
  });

  it('should handle SSE chunk without data', async () => {
    const onEvent = vi.fn();
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('event: REASONING_MESSAGE_CONTENT\n\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('event: RUN_FINISHED\ndata: {}\n\n'),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent }));
    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    // onEvent should not have been called for the empty chunk
    expect(onEvent).not.toHaveBeenCalledWith({
      event: 'REASONING_MESSAGE_CONTENT',
      data: expect.any(String),
    });
  });

  it('should handle SSE data without space', async () => {
    const onEvent = vi.fn();
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'event: TEXT_MESSAGE_CONTENT\ndata:nospace\n\nevent: RUN_FINISHED\ndata: {}\n\n'
              ),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent }));
    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({ event: 'TEXT_MESSAGE_CONTENT', data: 'nospace' });
    });
  });

  it('should ignore a frame with no event: header', async () => {
    const onEvent = vi.fn();
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: orphaned\n\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('event: RUN_FINISHED\ndata: {}\n\n'),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent }));
    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    expect(onEvent).not.toHaveBeenCalledWith({ event: expect.anything(), data: 'orphaned' });
    expect(onEvent).toHaveBeenCalledWith({ event: 'RUN_FINISHED', data: '{}' });
  });

  it('should build and report an A2UI tree via onA2UITree from real AG-UI events', async () => {
    const onEvent = vi.fn();
    const onA2UITree = vi.fn();
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'event: TEXT_MESSAGE_CONTENT\ndata: {"messageId":"m1","delta":"Hi"}\n\n'
              ),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('event: RUN_FINISHED\ndata: {}\n\n'),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent, onA2UITree }));
    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    await waitFor(() => {
      expect(onA2UITree).toHaveBeenCalled();
    });

    const lastCallTree = onA2UITree.mock.calls[onA2UITree.mock.calls.length - 1][0];
    expect(lastCallTree.component).toBe('column');
  });

  it('should handle SSE error', async () => {
    const onError = vi.fn();
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSSEStream({ onEvent: vi.fn(), onError }));

    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    // Wait for async error handler to complete
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Network error');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
  });

  it('should abort stream when stop is called', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    // Create a mock reader that hangs
    const mockReader = {
      read: () => new Promise(() => {}),
      releaseLock: vi.fn(),
    };
    const mockResponse = { ok: true, body: { getReader: () => mockReader } };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent: vi.fn() }));

    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    expect(result.current.isStreaming).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(result.current.isStreaming).toBe(false);
  });

  it('should include authorization header if token is provided', async () => {
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({ read: () => Promise.resolve({ done: true }), releaseLock: vi.fn() }),
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSSEStream({ onEvent: vi.fn(), token: 'test-token' }));

    await act(async () => {
      result.current.start({ message: 'test', thread_id: '1' });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });
});
