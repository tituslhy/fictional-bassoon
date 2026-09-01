'use client';

import type { ToolCall } from '@/types';
import type { A2UIComponentNode } from '@/lib/a2ui/schema';
import { A2UIRenderer } from '@/lib/a2ui/renderer';
import { validateComponentTree } from '@/lib/a2ui/validator';
import { buildLegacyStreamTree } from '@/lib/a2ui/builders/legacyStreamTree';

interface StreamingRendererProps {
  reasoning?: string;
  answer: string;
  toolCalls: ToolCall[];
  isStreaming: boolean;
  /** Prefer a wire A2UI tree (CUSTOM name=a2ui). Fallback synthesizes one. */
  a2ui?: A2UIComponentNode;
}

/**
 * Renders an A2UI component tree. When `a2ui` is present (agent/backend
 * emitted CUSTOM name=a2ui on the SSE stream), that tree is used after
 * validation. Otherwise we synthesize the same 4-type tree from aggregated
 * AG-UI fields — the history-hydrate path, and older streams without CUSTOM.
 */
export default function StreamingRenderer({
  reasoning,
  answer,
  toolCalls,
  isStreaming,
  a2ui,
}: StreamingRendererProps) {
  const fallback = () =>
    validateComponentTree(
      buildLegacyStreamTree({
        reasoning,
        answer,
        toolCalls: toolCalls.map(tc => ({
          id: tc.id,
          name: typeof tc.name === 'string' ? tc.name : JSON.stringify(tc.name),
          args: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args, null, 2),
          result:
            tc.result === undefined
              ? undefined
              : typeof tc.result === 'string'
                ? tc.result
                : JSON.stringify(tc.result, null, 2),
        })),
        isStreaming,
      })
    );

  let tree;
  if (a2ui) {
    try {
      tree = validateComponentTree(a2ui);
    } catch {
      tree = fallback();
    }
  } else {
    tree = fallback();
  }

  return <A2UIRenderer node={tree} />;
}
