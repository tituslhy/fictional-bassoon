'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { A2UIReasoningNode } from '../schema';

/**
 * Renderer for the `reasoning` A2UI component type. Migrated from the
 * `ReasoningBlock` that used to live inline in `StreamingRenderer.tsx` —
 * collapse/expand is a renderer detail, not a protocol concern.
 */
export default function ReasoningBlock({ node }: { node: A2UIReasoningNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-zinc-900/50 px-3 py-2 text-left transition-colors hover:bg-zinc-900"
      >
        <Sparkles className="h-3.5 w-3.5 text-indigo-400/80" />
        <span className="text-xs italic text-zinc-500">
          {expanded ? 'Hide reasoning' : 'Show reasoning'}
        </span>
        <span className="ml-auto text-zinc-500">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/5 bg-zinc-950/80 px-3 py-2.5">
          <p className="whitespace-pre-wrap text-sm italic leading-relaxed text-zinc-500">
            {node.text}
          </p>
        </div>
      )}
    </div>
  );
}
