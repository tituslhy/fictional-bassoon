"use client";

import StreamingRenderer from "./StreamingRenderer";
import type { ThreadMessage } from "@/types";

interface MessageBubbleProps {
  message: ThreadMessage;
  isStreaming: boolean;
}

export default function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-[#1e293b] px-4 py-2.5 text-sm text-[#e5e5e5] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.status === "error" && message.error) {
    return (
      <div className="flex justify-start gap-3">
        <div className="flex-1 max-w-[85%] space-y-1">
          <div className="rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/5 px-4 py-2.5 text-sm text-[#ef4444]">
            {message.error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-3">
      <div className="flex-1 max-w-[85%] space-y-1">
        <StreamingRenderer
          reasoning={message.reasoning}
          answer={message.content}
          toolCalls={message.toolCalls}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
