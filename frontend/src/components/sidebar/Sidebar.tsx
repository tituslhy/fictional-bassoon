"use client";

import { useThreadsContext } from "@/context/ThreadContext";
import ThreadItem from "./ThreadItem";
import NewThreadButton from "./NewThreadButton";

export default function Sidebar() {
  const { threads, activeThreadId, setActiveThreadId, createThread, deleteThread } =
    useThreadsContext();

  return (
    <aside className="w-72 border-r border-[#262626] bg-[#0f0f0f] flex flex-col shrink-0">
      <div className="p-3 border-b border-[#262626]">
        <NewThreadButton onClick={createThread} />
      </div>
      <nav className="flex-1 overflow-y-auto">
        {threads.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isActive={thread.id === activeThreadId}
            onClick={() => setActiveThreadId(thread.id)}
            onDelete={() => deleteThread(thread.id)}
          />
        ))}
        {threads.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[#6b7280]">
            No threads yet.
            <br />
            Create one to get started.
          </div>
        )}
      </nav>
    </aside>
  );
}
