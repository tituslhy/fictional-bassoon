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
      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:text-zinc-200 prose-ul:list-disc prose-ol:list-decimal prose-headings:text-zinc-50 prose-a:text-indigo-300 prose-code:rounded prose-code:bg-zinc-900 prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:text-amber-300 prose-pre:border prose-pre:border-white/10 prose-pre:bg-zinc-900">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-indigo-400 align-middle" />
      )}
    </div>
  );
}
