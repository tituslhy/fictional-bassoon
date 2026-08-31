'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { A2UIReasoningNode } from '../schema';

/**
 * Renderer for the `reasoning` A2UI component type. Migrated from the
 * `ReasoningBlock` that used to live inline in `StreamingRenderer.tsx` —
 * collapse/expand is a renderer detail, not a protocol concern.
 */
export default function ReasoningBlock({ node }: { node: A2UIReasoningNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-[#262626] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] transition-colors text-left"
      >
        <span className="text-xs text-[#6b7280] italic">
          {expanded ? 'Hide reasoning' : 'Show reasoning'}
        </span>
        <span className="ml-auto text-[#6b7280]">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-[#0a0a0a] border-t border-[#262626]">
          <p className="text-sm text-[#6b7280] italic leading-relaxed whitespace-pre-wrap">
            {node.text}
          </p>
        </div>
      )}
    </div>
  );
}
