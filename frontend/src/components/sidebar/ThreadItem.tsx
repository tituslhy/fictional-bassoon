"use client";

import type { Thread } from "@/types";
import { Trash2, MessageSquare } from "lucide-react";

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
      className={`group w-full flex items-center gap-3 px-3 py-2.5 transition-colors
        ${isActive ? "bg-[#1a1a1a] text-[#e5e5e5]" : "text-[#9ca3af] hover:bg-[#1a1a1a] hover:text-[#e5e5e5]"}`}
    >
      <button
        onClick={onClick}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? "text-[#3b82f6]" : "text-[#6b7280]"}`} />
        <span className="truncate text-sm flex-1">{thread.title}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${thread.title}`}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1"
      >
        <Trash2 className="w-3.5 h-3.5 text-[#6b7280] hover:text-[#ef4444] transition-colors" />
      </button>
    </div>
  );
}