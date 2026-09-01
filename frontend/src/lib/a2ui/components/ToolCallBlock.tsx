'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
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
  const pending = node.result === undefined;

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-zinc-900/70 px-3 py-2 text-left transition-colors hover:bg-zinc-800/80"
      >
        <Wrench className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-medium text-zinc-100">{node.name}</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            pending ? 'bg-amber-400/10 text-amber-300' : 'bg-emerald-400/10 text-emerald-300'
          }`}
        >
          {pending && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />}
          {pending ? 'running' : 'done'}
        </span>
        <span className="ml-auto text-zinc-500">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/5 bg-zinc-950">
          <div className="px-4 py-2">
            <p className="mb-1 text-xs text-zinc-500">Arguments</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-400 ring-1 ring-white/5">
              {node.args}
            </pre>
          </div>
          {node.result && (
            <div className="border-t border-white/5 px-4 py-2">
              <p className="mb-1 text-xs text-zinc-500">Result</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 ring-1 ring-white/5">
                {node.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
