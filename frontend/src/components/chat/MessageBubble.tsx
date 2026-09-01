'use client';

import StreamingRenderer from './StreamingRenderer';
import type { ThreadMessage } from '@/types';

interface MessageBubbleProps {
  message: ThreadMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-indigo-500/15 px-4 py-2.5 text-sm leading-relaxed text-zinc-100 shadow-[0_0_0_1px_rgba(129,140,248,0.18)] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.status === 'error' && message.error) {
    return (
      <div className="flex justify-start gap-3">
        <div className="max-w-[85%] flex-1 space-y-1">
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {message.error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-3">
      <div className="max-w-[85%] flex-1 space-y-1">
        <StreamingRenderer
          reasoning={message.reasoning}
          answer={message.content}
          toolCalls={message.toolCalls}
          isStreaming={message.status === 'streaming'}
          a2ui={message.a2ui}
        />
      </div>
    </div>
  );
}
