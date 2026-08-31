'use client';

import type { A2UIComponentNode } from './schema';
import ColumnBlock from './components/ColumnBlock';
import ReasoningBlock from './components/ReasoningBlock';
import ToolCallBlock from './components/ToolCallBlock';
import MarkdownBlock from './components/MarkdownBlock';

/**
 * Walks an A2UI component tree and dispatches each node to its registered,
 * allow-listed renderer. There is deliberately no default/fallback branch —
 * `validateComponentNode` (see `validator.ts`) is the only place a tree
 * should ever have an unrecognized `component` value, and it throws rather
 * than letting one reach here. The `switch` below is exhaustive over
 * `A2UIComponentType`; adding a new component type without a `case` here is
 * a compile error, not a silent no-op or a raw pass-through.
 */
export function A2UIRenderer({ node }: { node: A2UIComponentNode }) {
  switch (node.component) {
    case 'column':
      return <ColumnBlock node={node} />;
    case 'reasoning':
      return <ReasoningBlock node={node} />;
    case 'tool_call':
      return <ToolCallBlock node={node} />;
    case 'markdown':
      return <MarkdownBlock node={node} />;
  }
}
