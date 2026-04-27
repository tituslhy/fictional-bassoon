"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import type { Thread, ThreadMessage } from "@/types";

interface ThreadContextType {
  threads: Thread[];
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  createThread: () => Promise<string>;
  deleteThread: (id: string) => Promise<void>;
  addMessage: (threadId: string, msg: ThreadMessage) => Promise<void>;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  updateThreadMessages: (threadId: string, messages: ThreadMessage[]) => void; // Keeping sync version for streaming updates
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

const DB_BASE = process.env.NEXT_PUBLIC_DB_URL || "http://localhost:3002";

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [threads, setThreadsState] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { token, user } = useAuth();

  // Fetch threads from PostgREST on mount or token change
  useEffect(() => {
    if (!token || !user) {
      setThreadsState([]);
      setIsLoaded(true);
      return;
    }

    const fetchThreads = async () => {
      try {
        const res = await fetch(`${DB_BASE}/threads?select=*,messages(*)&order=updated_at.desc`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          const formatted: Thread[] = data.map((t: any) => ({
            id: t.id,
            title: t.title,
            updatedAt: new Date(t.updated_at).getTime(),
            messages: (t.messages || []).map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              reasoning: m.reasoning,
              toolCalls: m.tool_calls,
              status: m.status,
              error: m.error,
            })).sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()),
          }));
          setThreadsState(formatted);
          if (formatted.length > 0 && !activeThreadId) {
            setActiveThreadIdState(formatted[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch threads from DB:", err);
      } finally {
        setIsLoaded(true);
      }
    };

    fetchThreads();
  }, [token, user]);

  const setActiveThreadId = useCallback(
    (id: string | null) => {
      setActiveThreadIdState(id);
    },
    [setActiveThreadIdState],
  );

  const createThread = useCallback(async () => {
    const tempId = crypto.randomUUID();
    
    // Add to local state immediately for UI responsiveness
    const newThread: Thread = { id: tempId, title: "New Thread", messages: [], updatedAt: Date.now() };
    setThreadsState((prev) => [newThread, ...prev]);
    setActiveThreadId(tempId);

    if (token) {
      try {
        const res = await fetch(`${DB_BASE}/threads`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            id: tempId,
            user_id: user?.id,
            title: "New Thread",
          }),
        });
        if (!res.ok) throw new Error("Failed to persist thread");
      } catch (err) {
        console.error("Error persisting thread:", err);
      }
    }
    
    return tempId;
  }, [token, user, setActiveThreadId]);

  const deleteThread = useCallback(
    async (id: string) => {
      setThreadsState((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (activeThreadId === id && next.length > 0) {
          setActiveThreadId(next[0].id);
        } else if (activeThreadId === id) {
          setActiveThreadId(null);
        }
        return next;
      });

      if (token) {
        try {
          await fetch(`${DB_BASE}/threads?id=eq.${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (err) {
          console.error("Error deleting thread:", err);
        }
      }
    },
    [activeThreadId, token, setActiveThreadId],
  );

  const addMessage = useCallback(
    async (threadId: string, msg: ThreadMessage) => {
      setThreadsState((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, messages: [...t.messages, msg], updatedAt: Date.now() } : t,
        ),
      );

      if (token) {
        try {
          await fetch(`${DB_BASE}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: msg.id,
              thread_id: threadId,
              role: msg.role,
              content: msg.content,
              reasoning: msg.reasoning,
              tool_calls: msg.toolCalls,
              status: msg.status,
              error: msg.error,
            }),
          });
        } catch (err) {
          console.error("Error persisting message:", err);
        }
      }
    },
    [token],
  );

  const updateThreadTitle = useCallback(
    async (threadId: string, title: string) => {
      setThreadsState((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title } : t)),
      );

      if (token) {
        try {
          await fetch(`${DB_BASE}/threads?id=eq.${threadId}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title }),
          });
        } catch (err) {
          console.error("Error updating thread title:", err);
        }
      }
    },
    [token],
  );

  const updateThreadMessages = useCallback(
    (threadId: string, messages: ThreadMessage[]) => {
      setThreadsState((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, messages, updatedAt: Date.now() } : t)),
      );
      
      // Note: We don't persist full message list updates for streaming here
      // Individual message persistence is handled by addMessage or targeted updates
      // In a real production app, we might want to debounced-sync the final state
      if (token) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.status === "done") {
             // Upsert the finalized message
             fetch(`${DB_BASE}/messages`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                  "Prefer": "resolution=merge-duplicates"
                },
                body: JSON.stringify({
                  id: lastMsg.id,
                  thread_id: threadId,
                  role: lastMsg.role,
                  content: lastMsg.content,
                  reasoning: lastMsg.reasoning,
                  tool_calls: lastMsg.toolCalls,
                  status: lastMsg.status,
                  error: lastMsg.error,
                }),
              }).catch(e => console.error("Error upserting message:", e));
        }
      }
    },
    [token],
  );

  const sortedThreads = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  if (!isLoaded) return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  );

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

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  return storeRef;
}
