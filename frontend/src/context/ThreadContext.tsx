'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import type { Thread, ThreadMessage } from '@/types';

interface ThreadContextType {
  threads: Thread[];
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  createThread: () => Promise<string>;
  deleteThread: (id: string) => Promise<void>;
  addMessage: (threadId: string, msg: ThreadMessage) => Promise<void>;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  updateThreadMessages: (threadId: string, messages: ThreadMessage[]) => void;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

const DB_BASE = process.env.NEXT_PUBLIC_DB_URL || 'http://localhost:3002';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [threads, setThreadsState] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { token, user } = useAuth();
  const hydratedIdsRef = useRef<Set<string>>(new Set());
  const inflightIdsRef = useRef<Set<string>>(new Set());

  const hydrateThread = useCallback(
    async (id: string) => {
      if (!token || !id) return;
      if (hydratedIdsRef.current.has(id) || inflightIdsRef.current.has(id)) return;
      inflightIdsRef.current.add(id);
      try {
        const res = await fetch(`${API_BASE}/threads/${id}/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.error('Failed to hydrate thread history:', res.status);
          return;
        }
        const data = await res.json();
        const messages: ThreadMessage[] = (data.messages || []).map((m: ThreadMessage) => ({
          ...m,
          toolCalls: m.toolCalls || [],
        }));
        setThreadsState(prev => prev.map(t => (t.id === id ? { ...t, messages } : t)));
        hydratedIdsRef.current.add(id);
      } catch (err) {
        console.error('Failed to hydrate thread history:', err);
      } finally {
        inflightIdsRef.current.delete(id);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token || !user) {
      setThreadsState([]);
      setIsLoaded(true);
      hydratedIdsRef.current.clear();
      inflightIdsRef.current.clear();
      return;
    }

    const fetchThreads = async () => {
      try {
        const res = await fetch(
          `${DB_BASE}/threads?select=id,title,updated_at&user_id=eq.${user.id}&order=updated_at.desc`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          const formatted: Thread[] = data.map(
            (t: { id: string; title: string; updated_at: string }) => ({
              id: t.id,
              title: t.title,
              updatedAt: new Date(t.updated_at).getTime(),
              messages: [],
            })
          );
          setThreadsState(formatted);
          setActiveThreadIdState(current => current ?? formatted[0]?.id ?? null);
        }
      } catch (err) {
        console.error('Failed to fetch threads from DB:', err);
      } finally {
        setIsLoaded(true);
      }
    };

    fetchThreads();
  }, [token, user]);

  const setActiveThreadId = useCallback(
    (id: string | null) => {
      setActiveThreadIdState(id);
      // Re-clicking the same unhydrated thread must retry (React bails on
      // setState(same id), so the activeThreadId effect would not re-run).
      if (id && !hydratedIdsRef.current.has(id)) {
        void hydrateThread(id);
      }
    },
    [hydrateThread]
  );

  useEffect(() => {
    if (activeThreadId) {
      void hydrateThread(activeThreadId);
    }
  }, [activeThreadId, hydrateThread]);

  const createThread = useCallback(async () => {
    const tempId = crypto.randomUUID();

    const newThread: Thread = {
      id: tempId,
      title: 'New chat',
      messages: [],
      updatedAt: Date.now(),
    };
    setThreadsState(prev => [newThread, ...prev]);
    setActiveThreadIdState(tempId);
    hydratedIdsRef.current.add(tempId);

    if (token) {
      try {
        const res = await fetch(`${DB_BASE}/threads`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            id: tempId,
            user_id: user?.id,
            title: 'New chat',
          }),
        });
        if (!res.ok) throw new Error('Failed to persist thread');
      } catch (err) {
        console.error('Error persisting thread:', err);
      }
    }

    return tempId;
  }, [token, user]);

  const deleteThread = useCallback(
    async (id: string) => {
      hydratedIdsRef.current.delete(id);
      inflightIdsRef.current.delete(id);
      setThreadsState(prev => {
        const next = prev.filter(t => t.id !== id);
        if (activeThreadId === id && next.length > 0) {
          setActiveThreadId(next[0].id);
        } else if (activeThreadId === id) {
          setActiveThreadIdState(null);
        }
        return next;
      });

      if (token) {
        try {
          await fetch(`${DB_BASE}/threads?id=eq.${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (err) {
          console.error('Error deleting thread:', err);
        }
      }
    },
    [activeThreadId, token, setActiveThreadId]
  );

  const addMessage = useCallback(async (threadId: string, msg: ThreadMessage) => {
    setThreadsState(prev =>
      prev.map(t =>
        t.id === threadId ? { ...t, messages: [...t.messages, msg], updatedAt: Date.now() } : t
      )
    );
  }, []);

  const updateThreadTitle = useCallback(
    async (threadId: string, title: string) => {
      setThreadsState(prev => prev.map(t => (t.id === threadId ? { ...t, title } : t)));

      if (token) {
        try {
          await fetch(`${DB_BASE}/threads?id=eq.${threadId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
          });
        } catch (err) {
          console.error('Error updating thread title:', err);
        }
      }
    },
    [token]
  );

  const updateThreadMessages = useCallback((threadId: string, messages: ThreadMessage[]) => {
    setThreadsState(prev =>
      prev.map(t => (t.id === threadId ? { ...t, messages, updatedAt: Date.now() } : t))
    );
  }, []);

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
      {!isLoaded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}
    </ThreadContext.Provider>
  );
}

export function useThreadsContext() {
  const ctx = useContext(ThreadContext);
  if (!ctx) throw new Error('useThreadsContext must be inside ThreadProvider');
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
