'use client';

import { Plus } from 'lucide-react';

interface NewThreadButtonProps {
  onClick: () => void;
}

export default function NewThreadButton({ onClick }: NewThreadButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-500/25 transition-colors hover:bg-indigo-400"
    >
      <Plus className="h-4 w-4" />
      New chat
    </button>
  );
}
