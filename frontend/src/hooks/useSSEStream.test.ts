import { renderHook, act, waitFor } from "@testing-library/react";
import { useSSEStream } from "./useSSEStream";
import { vi, describe, it, expect, beforeEach } from "vitest";

describe("useSSEStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should handle successful SSE stream", async () => {
    const onEvent = vi.fn();
    const onComplete = vi.fn();

    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode("event: answer\ndata: Hello\n\n"),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode("event: done\ndata: \n\n"),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent, onComplete }));

    await act(async () => {
      result.current.start({ message: "test", thread_id: "1" });
    });

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({ event: "answer", data: "Hello" });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it("should handle SSE error", async () => {
    const onError = vi.fn();
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSSEStream({ onEvent: vi.fn(), onError }));

    await act(async () => {
      result.current.start({ message: "test", thread_id: "1" });
    });

    // Wait for async error handler to complete
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Network error");
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
  });

  it("should abort stream when stop is called", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    
    // Create a mock reader that hangs
    const mockReader = {
      read: () => new Promise(() => {}),
      releaseLock: vi.fn(),
    };
    const mockResponse = { body: { getReader: () => mockReader } };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSSEStream({ onEvent: vi.fn() }));

    await act(async () => {
      result.current.start({ message: "test", thread_id: "1" });
    });

    expect(result.current.isStreaming).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(result.current.isStreaming).toBe(false);
  });
});