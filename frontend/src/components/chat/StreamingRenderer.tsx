'use client';

import type { ToolCall } from '@/types';
import { A2UIRenderer } from '@/lib/a2ui/renderer';
import { validateComponentTree } from '@/lib/a2ui/validator';
import { buildLegacyStreamTree } from '@/lib/a2ui/builders/legacyStreamTree';

interface StreamingRendererProps {
  reasoning?: string;
  answer: string;
  toolCalls: ToolCall[];
  isStreaming: boolean;
}

/**
 * Builds an A2UI component tree from the current message's aggregated
 * streaming state (still the props-driven shape `MessageBubble.tsx` passes
 * in) and renders it through the A2UI allow-list — this component no
 * longer contains any block-rendering JSX of its own. The three blocks
 * that used to live inline here (`ReasoningBlock`, `ToolCallBlock`,
 * `AnswerBlock`) now live under `frontend/src/lib/a2ui/components/` as
 * `reasoning`, `tool_call`, and `markdown` A2UI component renderers.
 *
 * Safety net preserved from the pre-A2UI version: `ToolCall.name`/`args`/
 * `result` are typed as strings but callers have historically handed us
 * non-string values at runtime (this is why the original inline
 * `ToolCallBlock` did the same `JSON.stringify` fallback — see git
 * history / "Error #31" comment). Normalizing here, before the tree is
 * validated, keeps that defensiveness in exactly one place rather than
 * pushing it into the schema/validator (which should be free to assume
 * strings mean strings).
 */
export default function StreamingRenderer({
  reasoning,
  answer,
  toolCalls,
  isStreaming,
}: StreamingRendererProps) {
  const tree = validateComponentTree(
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

  return <A2UIRenderer node={tree} />;
}
