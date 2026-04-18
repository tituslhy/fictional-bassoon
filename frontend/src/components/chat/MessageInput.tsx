"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface MessageInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  isEmpty: boolean;
}

export default function MessageInput({ onSend, isStreaming, isEmpty }: MessageInputProps) {
  const [text, setText] = useState("");
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
    setText("");
    textareaRef.current?.focus();
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [text]);

  return (
    <div className="border-t border-[#262626] px-4 py-4 bg-[#0a0a0a]">
      <div className="mx-auto max-w-3xl">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-end rounded-xl bg-[#1e1e1e] border border-[#262626] px-3 py-2 focus-within:border-[#3b82f6]/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isStreaming) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Type a message..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none bg-transparent text-sm text-[#e5e5e5] placeholder:text-[#6b7280] outline-none disabled:opacity-50 max-h-[200px] min-h-[24px] leading-5"
            />
            <button
              type="submit"
              disabled={!text.trim() || isStreaming}
              className="ml-2 p-2 rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
        <p className="text-center text-[10px] text-[#6b7280] mt-2">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
