'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

interface MessageInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  isEmpty: boolean;
}

export default function MessageInput({ onSend, isStreaming, isEmpty }: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEmpty && !isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEmpty, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [text]);

  return (
    <div className="px-4 pb-5 pt-2">
      <div className="mx-auto max-w-3xl">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-end rounded-3xl bg-zinc-900/70 px-3 py-2 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_16px_40px_-24px_rgba(0,0,0,0.8)] backdrop-blur-md transition-shadow focus-within:shadow-[0_0_0_1px_rgba(129,140,248,0.45),0_0_0_6px_rgba(129,140,248,0.08)]">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={isStreaming ? 'Waiting for a reply…' : 'Ask anything…'}
              rows={1}
              disabled={isStreaming}
              aria-label="Message"
              className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent py-2.5 pl-1 text-sm leading-5 text-zinc-100 outline-none placeholder:text-zinc-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!text.trim() || isStreaming}
              aria-label="Send message"
              className="mb-0.5 ml-2 shrink-0 rounded-2xl bg-indigo-500 p-2 text-white shadow-sm shadow-indigo-500/30 transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>
        <p className="mt-2.5 text-center text-[11px] text-zinc-600">
          Enter to send · Shift+Enter for a new line. Answers can be wrong. Check anything that
          matters.
        </p>
      </div>
    </div>
  );
}
