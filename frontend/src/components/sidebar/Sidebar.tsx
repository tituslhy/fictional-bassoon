"use client";

import { useThreadsContext } from "@/context/ThreadContext";
import { useAuth } from "@/context/AuthContext";
import { LogOut, User as UserIcon } from "lucide-react";
import ThreadItem from "./ThreadItem";
import NewThreadButton from "./NewThreadButton";

export default function Sidebar() {
  const { threads, activeThreadId, setActiveThreadId, createThread, deleteThread } =
    useThreadsContext();
  const { user, logout } = useAuth();

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

      {user && (
        <div className="p-3 border-t border-[#262626] bg-[#0f0f0f]">
          <div className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-zinc-900 group transition-colors">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                <UserIcon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user.full_name || user.email.split("@")[0]}
                </p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
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
