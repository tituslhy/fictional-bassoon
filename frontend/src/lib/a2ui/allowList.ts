import type { A2UIComponentType } from './schema';

/**
 * The explicit A2UI component allow-list (`a2ui-no-executable-ui.md`).
 *
 * New component types are added here deliberately, one at a time, after a
 * renderer for that type exists under `lib/a2ui/components/` — never as an
 * open-ended "render whatever the tree contains" fallback. `validator.ts`
 * rejects any `component` value not present in this list.
 */
export const A2UI_ALLOWED_COMPONENT_TYPES: readonly A2UIComponentType[] = [
  'column',
  'reasoning',
  'tool_call',
  'markdown',
] as const;

export function isAllowedComponentType(value: string): value is A2UIComponentType {
  return (A2UI_ALLOWED_COMPONENT_TYPES as readonly string[]).includes(value);
}
