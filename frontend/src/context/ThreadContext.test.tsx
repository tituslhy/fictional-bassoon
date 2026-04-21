import { renderHook, act } from "@testing-library/react";
import { ThreadProvider, useThreadsContext } from "./ThreadContext";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThreadProvider>{children}</ThreadProvider>
);

describe("ThreadContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should create a new thread", () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    let threadId: string = "";
    act(() => {
      threadId = result.current.createThread();
    });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].id).toBe(threadId);
    expect(result.current.activeThreadId).toBe(threadId);
  });

  it("should add a message to a thread", () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    let threadId: string = "";
    act(() => {
      threadId = result.current.createThread();
    });

    const message = {
      id: "msg-1",
      role: "user" as const,
      content: "Hello",
      status: "done" as const,
      toolCalls: [],
    };

    act(() => {
      result.current.addMessage(threadId, message);
    });

    expect(result.current.threads[0].messages).toHaveLength(1);
    expect(result.current.threads[0].messages[0]).toEqual(message);
  });

  it("should delete a thread", () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    let threadId: string = "";
    act(() => {
      threadId = result.current.createThread();
    });

    expect(result.current.threads).toHaveLength(1);

    act(() => {
      result.current.deleteThread(threadId);
    });

    expect(result.current.threads).toHaveLength(0);
    expect(result.current.activeThreadId).toBeNull();
  });

  it("should update thread title", () => {
    const { result } = renderHook(() => useThreadsContext(), { wrapper });

    let threadId: string = "";
    act(() => {
      threadId = result.current.createThread();
    });

    act(() => {
      result.current.updateThreadTitle(threadId, "Updated Title");
    });

    expect(result.current.threads[0].title).toBe("Updated Title");
  });
});
