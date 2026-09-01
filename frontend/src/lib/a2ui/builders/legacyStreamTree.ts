import type { A2UIComponentNode } from '../schema';

/**
 * Minimal shape this builder needs from a chat message's aggregated
 * streaming state. Intentionally not importing `ToolCall`/`ThreadMessage`
 * from `@/types` here — this builder is meant to also back the real
 * AG-UI-event-driven path in `lib/a2ui/agui/`, which accumulates its own
 * local state rather than the legacy `ThreadMessage` shape.
 */
export interface LegacyStreamInput {
  reasoning?: string;
  answer: string;
  toolCalls: Array<{ id: string; name: string; args: string; result?: string }>;
  isStreaming: boolean;
}

/**
 * Builds an A2UI component tree from the app's current per-message
 * aggregated state (reasoning text, answer text, tool calls, streaming
 * flag). This is the shared conversion point used by both:
 *
 *   - `StreamingRenderer.tsx`, which still receives this shape as props
 *     from `MessageBubble.tsx` (unchanged external contract), and
 *   - `lib/a2ui/agui/streamState.ts`, which reduces real AG-UI events
 *     into this same shape before handing off to this function.
 *
 * Keeping one builder for both proves the A2UI tree is the actual stable
 * contract — the input side (props today, events once AG-UI lands) is the
 * part that's expected to change.
 */
export function buildLegacyStreamTree(input: LegacyStreamInput): A2UIComponentNode {
  const children: A2UIComponentNode[] = [];

  if (input.reasoning) {
    children.push({ id: 'reasoning', component: 'reasoning', text: input.reasoning });
  }

  if (input.toolCalls.length > 0) {
    children.push({
      id: 'tool-calls',
      component: 'column',
      gap: 'tight',
      children: input.toolCalls.map(tc => ({
        id: `tool-call-${tc.id}`,
        component: 'tool_call',
        name: tc.name,
        args: tc.args,
        result: tc.result,
      })),
    });
  }

  if (input.answer || input.isStreaming) {
    children.push({
      id: 'answer',
      component: 'markdown',
      text: input.answer,
      streaming: input.isStreaming,
    });
  }

  return { id: 'root', component: 'column', gap: 'loose', children };
}
