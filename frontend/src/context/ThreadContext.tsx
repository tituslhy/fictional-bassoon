"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { Thread, ThreadMessage } from "@/types";

const STORAGE_KEY = "fictional-bassoon-threads";

interface ThreadStore {
  threads: Thread[];
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  createThread: () => string;
  deleteThread: (id: string) => void;
  addMessage: (threadId: string, msg: ThreadMessage) => void;
  updateThreadTitle: (threadId: string, title: string) => void;
  updateThreadMessages: (threadId: string, messages: ThreadMessage[]) => void;
}

const ThreadContext = createContext<ThreadStore | null>(null);

export function ThreadProvider({ children }: { children: React.ReactNode }) {
  const [threads, setThreadsState] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(null);

  // Load threads from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setThreadsState(JSON.parse(raw));
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Persist threads to localStorage whenever they change
  useEffect(() => {
    if (threads.length > 0 || localStorage.getItem(STORAGE_KEY)) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
      } catch {
        // Ignore errors
      }
    }
  }, [threads]);

  const persistThreads = useCallback(
    (updater: Thread[] | ((prev: Thread[]) => Thread[])) => {
      setThreadsState((prev) => {
        return typeof updater === "function" ? updater(prev) : updater;
      });
    },
    [],
  );

  const setActiveThreadId = useCallback(
    (id: string | null) => {
      setActiveThreadIdState(id);
    },
    [setActiveThreadIdState],
  );

  const createThread = useCallback(() => {
    const id = crypto.randomUUID();
    persistThreads((prev) => [
      { id, title: "New Thread", messages: [], updatedAt: Date.now() },
      ...prev,
    ]);
    setActiveThreadId(id);
    return id;
  }, [persistThreads, setActiveThreadId]);

  const deleteThread = useCallback(
    (id: string) => {
      persistThreads((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (activeThreadId === id && next.length > 0) {
          setActiveThreadId(next[0].id);
        } else if (activeThreadId === id) {
          setActiveThreadId(null);
        }
        return next;
      });
    },
    [persistThreads, activeThreadId],
  );

  const addMessage = useCallback(
    (threadId: string, msg: ThreadMessage) => {
      persistThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, messages: [...t.messages, msg], updatedAt: Date.now() } : t,
        ),
      );
    },
    [persistThreads],
  );

  const updateThreadTitle = useCallback(
    (threadId: string, title: string) => {
      persistThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title } : t)),
      );
    },
    [persistThreads],
  );

  const updateThreadMessages = useCallback(
    (threadId: string, messages: ThreadMessage[]) => {
      persistThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, messages } : t)),
      );
    },
    [persistThreads],
  );

  const sortedThreads = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <ThreadContext.Provider
      value={{
        threads: sortedThreads,
        activeThreadId,
        setActiveThreadId,
        createThread,
        deleteThread,
        addMessage,
        updateThreadTitle,
        updateThreadMessages,
      }}
    >
      {children}
    </ThreadContext.Provider>
  );
}

export function useThreadsContext() {
  const ctx = useContext(ThreadContext);
  if (!ctx) throw new Error("useThreadsContext must be inside ThreadProvider");
  return ctx;
}

export function useThreadStore() {
  const store = useThreadsContext();
  const storeRef = useRef(store);

  // Keep ref up to date for use inside callbacks to avoid stale closures
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  return storeRef;
}