'use client';

import type { Thread } from '@/types';
import { Trash2, MessageSquare } from 'lucide-react';

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export default function ThreadItem({ thread, isActive, onClick, onDelete }: ThreadItemProps) {
  return (
    <div
      role="group"
      className={`group mb-0.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${
        isActive
          ? 'bg-white/[0.08] text-zinc-50 ring-1 ring-white/10'
          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
      }`}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <MessageSquare
          className={`h-4 w-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-600'}`}
        />
        <span className="flex-1 truncate text-sm">{thread.title}</span>
      </button>
      <button
        onClick={e => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${thread.title}`}
        className="shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5 text-zinc-500 transition-colors hover:text-red-400" />
      </button>
    </div>
  );
}
