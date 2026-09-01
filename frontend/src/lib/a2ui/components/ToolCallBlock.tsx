'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Code } from 'lucide-react';
import type { A2UIToolCallNode } from '../schema';

/**
 * Renderer for the `tool_call` A2UI component type. Migrated from the
 * `ToolCallBlock` that used to live inline in `StreamingRenderer.tsx`.
 * `name`/`args`/`result` are always strings by the time they reach this
 * component — `validateComponentNode` enforces that upstream, so there's no
 * defensive `JSON.stringify`-on-render here as there was in the pre-A2UI
 * version.
 */
export default function ToolCallBlock({ node }: { node: A2UIToolCallNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-[#262626] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-[#1a1a1a] hover:bg-[#222] transition-colors text-left"
      >
        <Code className="w-4 h-4 text-[#f59e0b]" />
        <span className="text-sm text-[#e5e5e5] font-medium">{node.name}</span>
        <span className="ml-auto text-[#6b7280]">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>
      {expanded && (
        <div className="bg-[#111] border-t border-[#262626]">
          <div className="px-4 py-2">
            <p className="text-xs text-[#6b7280] mb-1">Arguments</p>
            <pre className="text-xs text-[#9ca3af] font-mono whitespace-pre-wrap bg-[#0a0a0a] rounded border border-[#262626] px-3 py-2 max-h-40 overflow-auto">
              {node.args}
            </pre>
          </div>
          {node.result && (
            <div className="px-4 py-2 border-t border-[#262626]">
              <p className="text-xs text-[#6b7280] mb-1">Result</p>
              <pre className="text-xs text-[#e5e5e5] font-mono whitespace-pre-wrap bg-[#0a0a0a] rounded border border-[#262626] px-3 py-2 max-h-40 overflow-auto">
                {node.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
