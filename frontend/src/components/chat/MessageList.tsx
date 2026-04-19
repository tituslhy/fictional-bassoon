"use client";

import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import type { ThreadMessage } from "@/types";

interface MessageListProps {
  messages: ThreadMessage[];
  isStreaming: boolean;
}

export default function MessageList({ messages, isStreaming }: MessageListProps) {
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

  return (
    <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {messages.map((msg) => (
          <div key={msg.id} className="mb-6 last:mb-0">
            <MessageBubble message={msg} isStreaming={isStreaming} />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}