"use client";

import { Plus } from "lucide-react";

interface NewThreadButtonProps {
  onClick: () => void;
}

export default function NewThreadButton({ onClick }: NewThreadButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg bg-[#3b82f6] text-sm text-white hover:bg-[#2563eb] transition-colors"
    >
      <Plus className="w-4 h-4" />
      New Thread
    </button>
  );
}
