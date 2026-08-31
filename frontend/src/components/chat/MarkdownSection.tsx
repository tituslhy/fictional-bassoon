'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownSectionProps {
  content: string;
  /**
   * When true, renders the trailing streaming cursor that used to be drawn
   * by `AnswerBlock` (formerly inline in `StreamingRenderer.tsx`). This is
   * the sanitized "markdown block" component the A2UI allow-list dispatches
   * to for the `markdown` component type (see
   * `lib/a2ui/components/MarkdownBlock.tsx`) — `react-markdown` here never
   * renders raw HTML (no `rehype-raw`), so agent-produced text is rendered
   * as markdown only, never as markup or script.
   */
  streaming?: boolean;
}

export default function MarkdownSection({ content, streaming = false }: MarkdownSectionProps) {
  return (
    <div className="min-w-0">
      <div className="prose prose-invert prose-sm max-w-none prose-p leading-relaxed prose-ul:list-disc prose-ol:list-decimal prose-headings:text-[#e5e5e5] prose-code:text-[#f59e0b] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-[#111] prose-pre:border prose-pre:border-[#262626]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      {streaming && (
        <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-[#3b82f6] animate-pulse rounded-sm" />
      )}
    </div>
  );
}
