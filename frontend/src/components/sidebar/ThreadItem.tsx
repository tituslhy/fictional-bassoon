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
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
        ${isActive ? "bg-[#1a1a1a] text-[#e5e5e5]" : "text-[#9ca3af] hover:bg-[#1a1a1a] hover:text-[#e5e5e5]"}`}
    >
      <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? "text-[#3b82f6]" : "text-[#6b7280]"}`} />
      <span className="truncate text-sm flex-1">{thread.title}</span>
      <span
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="w-3.5 h-3.5 text-[#6b7280] hover:text-[#ef4444] transition-colors" />
      </span>
    </button>
  );
}
