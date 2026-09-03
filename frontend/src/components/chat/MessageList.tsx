'use client';

import { useEffect, useRef } from 'react';
import { Compass, ListChecks, Scale, Search, Sparkles } from 'lucide-react';
import MessageBubble from './MessageBubble';
import type { ThreadMessage } from '@/types';

interface MessageListProps {
  messages: ThreadMessage[];
  isStreaming: boolean;
  onPrompt?: (text: string) => void;
}

const STARTER_PROMPTS = [
  {
    icon: Search,
    title: 'Search the web',
    prompt: "What's the latest news about LangGraph checkpointing? Search for it.",
  },
  {
    icon: Compass,
    title: 'Walk through a topic',
    prompt: 'Explain how a reasoning agent uses tools, step by step.',
  },
  {
    icon: ListChecks,
    title: 'Plan a workflow',
    prompt: 'Help me outline a research workflow that uses live web search.',
  },
  {
    icon: Scale,
    title: 'Compare options',
    prompt: 'Compare Redis pub/sub vs polling for a streaming chat app.',
  },
] as const;

export default function MessageList({ messages, isStreaming, onPrompt }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const lastMessage = messages[messages.length - 1];
  const lastMessageContentLength = lastMessage?.content?.length || 0;

  useEffect(() => {
    if (scrollContainerRef.current && bottomRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isNearBottom = distanceFromBottom < 100;

      if (isNearBottom) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [lastMessageContentLength, isStreaming]);

  if (messages.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center overflow-y-auto px-4"
        ref={scrollContainerRef}
      >
        <div className="mx-auto w-full max-w-xl pb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 shadow-[0_0_40px_-8px_rgba(129,140,248,0.55)] ring-1 ring-indigo-400/25">
            <Sparkles className="h-7 w-7 text-indigo-300" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">How can I help?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
            A reusable chat surface for a reasoning agent. This instance can search the web when it
            needs current facts.
          </p>
          <ul className="mt-8 grid gap-2.5 text-left text-sm sm:grid-cols-2">
            {STARTER_PROMPTS.map(item => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <button
                    type="button"
                    disabled={!onPrompt || isStreaming}
                    onClick={() => onPrompt?.(item.prompt)}
                    className="flex h-full w-full items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3.5 py-3 text-left text-zinc-300 transition-colors hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-zinc-50 disabled:cursor-default disabled:hover:border-white/5 disabled:hover:bg-white/[0.03] disabled:hover:text-zinc-300"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                    <span>
                      <span className="block font-medium text-zinc-100">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                        {item.prompt}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        {messages.map(msg => (
          <div key={msg.id} className="mb-6 last:mb-0">
            <MessageBubble message={msg} />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
