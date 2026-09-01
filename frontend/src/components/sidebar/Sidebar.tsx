'use client';

import { useMemo, useState } from 'react';
import { LogOut, Search, Sparkles, User as UserIcon } from 'lucide-react';
import { useThreadsContext } from '@/context/ThreadContext';
import { useAuth } from '@/context/AuthContext';
import ThreadItem from './ThreadItem';
import NewThreadButton from './NewThreadButton';

export default function Sidebar() {
  const { threads, activeThreadId, setActiveThreadId, createThread, deleteThread } =
    useThreadsContext();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(thread => thread.title.toLowerCase().includes(q));
  }, [threads, query]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-white/5 bg-zinc-950/70 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-4 pb-1 pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 shadow-[0_0_24px_-6px_rgba(129,140,248,0.8)] ring-1 ring-indigo-400/30">
          <Sparkles className="h-4 w-4 text-indigo-300" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-zinc-50">Relay</p>
          <p className="text-[11px] text-zinc-500">Chat with an agent</p>
        </div>
      </div>
      <div className="p-3">
        <NewThreadButton onClick={createThread} />
        {threads.length > 0 && (
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-2 ring-1 ring-white/5 focus-within:ring-indigo-400/40">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="w-full bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </label>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {visibleThreads.map(thread => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isActive={thread.id === activeThreadId}
            onClick={() => setActiveThreadId(thread.id)}
            onDelete={() => deleteThread(thread.id)}
          />
        ))}
        {threads.length === 0 && (
          <div className="px-3 py-10 text-center text-xs leading-relaxed text-zinc-500">
            No conversations yet.
            <br />
            Start one to keep a thread.
          </div>
        )}
        {threads.length > 0 && visibleThreads.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-zinc-500">No matching chats.</div>
        )}
      </nav>

      {user && (
        <div className="border-t border-white/5 p-3">
          <div className="group flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5">
            <div className="flex min-w-0 items-center gap-3 overflow-hidden">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white">
                <UserIcon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {user.full_name || user.email.split('@')[0]}
                </p>
                <p className="truncate text-xs text-zinc-500">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-zinc-500 opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
