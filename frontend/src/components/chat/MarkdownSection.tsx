"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownSection({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-p leading-relaxed prose-ul:list-disc prose-ol:list-decimal prose-headings:text-[#e5e5e5] prose-code:text-[#f59e0b] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-[#111] prose-pre:border prose-pre:border-[#262626]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
