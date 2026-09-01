/**
 * A2UI component-tree schema (this repo's constrained subset).
 *
 * Spec reference: A2UI v1.0 (`https://a2ui.org/specification/v1_0/*.json`),
 * inspected via the published `@a2ui/web_core@0.10.6` package (npm,
 * maintainers include a2ui-owners@google.com, homepage a2ui.org). See
 * `.claude/rules/protocol-version-pinning.md` for the full research trail
 * and why no A2UI npm package is installed here.
 *
 * This is deliberately NOT a full implementation of that spec. The real
 * spec's component wire shape is `{ id, component, ...props, children? }`
 * (see e.g. its `examples/12_chat-message.json`) — we keep that `id` /
 * `component` naming for familiarity, but we do not implement:
 *
 *   - `DataBinding` / `DynamicValue` (paths into a live data model)
 *   - `FunctionCall` (agent-invoked renderer-side functions)
 *   - `Action` (renderer -> agent event dispatch)
 *   - the flat `ComponentsList` + `ComponentId` reference/update-in-place
 *     model (surfaces, `updateComponents`, `updateDataModel`, etc.)
 *
 * All of the above are legitimate parts of the real protocol, but they're
 * a much bigger trust/execution surface than this app needs: every value
 * rendered here is a fully-resolved string handed to us up front, not a
 * live-bound or agent-invocable one. Skipping them keeps us well inside
 * `a2ui-no-executable-ui.md`'s boundary instead of merely inside it by
 * convention. If a future component genuinely needs data binding or
 * renderer-side actions, that's a deliberate, reviewed schema extension —
 * not a default to reach for.
 *
 * Nested `children: A2UIComponentNode[]` (vs. the real spec's flat
 * `ComponentId` registry) is also a deliberate simplification: this app
 * renders one fully-formed tree per message rather than diffing partial
 * `updateComponents` messages against an existing surface, so the
 * indirection isn't needed yet.
 */

/** The explicit, closed set of component types this renderer knows about. */
export type A2UIComponentType = 'column' | 'reasoning' | 'tool_call' | 'markdown';

interface A2UIComponentBase {
  /** Stable id, used as the React key and (for tool calls) reconciliation key. */
  id: string;
}

/**
 * Generic vertical-stack container. `gap` is a closed enum mapped to a
 * fixed Tailwind class by the renderer — the agent/producer never supplies
 * raw CSS or class names.
 */
export interface A2UIColumnNode extends A2UIComponentBase {
  component: 'column';
  gap?: 'loose' | 'tight';
  children: A2UIComponentNode[];
}

/** Collapsible reasoning/thinking text. Collapse behavior is a renderer detail. */
export interface A2UIReasoningNode extends A2UIComponentBase {
  component: 'reasoning';
  text: string;
}

/** A single tool invocation: name, arguments, and optional result. */
export interface A2UIToolCallNode extends A2UIComponentBase {
  component: 'tool_call';
  name: string;
  args: string;
  result?: string;
}

/**
 * Sanitized markdown block — the allow-listed home for what
 * `MarkdownSection.tsx` renders. `streaming` toggles the trailing cursor;
 * it is a rendering hint, not executable content.
 */
export interface A2UIMarkdownNode extends A2UIComponentBase {
  component: 'markdown';
  text: string;
  streaming?: boolean;
}

export type A2UIComponentNode =
  | A2UIColumnNode
  | A2UIReasoningNode
  | A2UIToolCallNode
  | A2UIMarkdownNode;
