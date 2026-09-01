import { A2UI_ALLOWED_COMPONENT_TYPES, isAllowedComponentType } from './allowList';
import type { A2UIColumnNode, A2UIComponentNode } from './schema';

/**
 * Thrown when a would-be component tree fails validation — an unknown
 * `component` type, a missing required field, or a field of the wrong
 * shape. Callers should treat this as "don't render," not as something to
 * silently coerce past.
 */
export class A2UIValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string
  ) {
    super(`A2UI validation failed at "${path}": ${message}`);
    this.name = 'A2UIValidationError';
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new A2UIValidationError(`expected a string, got ${typeof value}`, path);
  }
}

function assertOptionalString(value: unknown, path: string): asserts value is string | undefined {
  if (value !== undefined) assertString(value, path);
}

function assertOptionalBoolean(value: unknown, path: string): asserts value is boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new A2UIValidationError(`expected a boolean, got ${typeof value}`, path);
  }
}

/**
 * Validates and narrows an unknown value into an `A2UIComponentNode`,
 * recursively. Throws `A2UIValidationError` rather than returning a
 * best-effort guess — there is no "render whatever this looks like"
 * fallback (`a2ui-no-executable-ui.md`).
 */
export function validateComponentNode(input: unknown, path = 'root'): A2UIComponentNode {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new A2UIValidationError('expected a component object', path);
  }
  const node = input as Record<string, unknown>;

  assertString(node.id, `${path}.id`);

  if (typeof node.component !== 'string' || !isAllowedComponentType(node.component)) {
    throw new A2UIValidationError(
      `unknown or disallowed component type ${JSON.stringify(node.component)} — allowed: ${A2UI_ALLOWED_COMPONENT_TYPES.join(', ')}`,
      `${path}.component`
    );
  }

  switch (node.component) {
    case 'column': {
      if (!Array.isArray(node.children)) {
        throw new A2UIValidationError('column requires a children array', `${path}.children`);
      }
      if (node.gap !== undefined && node.gap !== 'loose' && node.gap !== 'tight') {
        throw new A2UIValidationError('gap must be "loose" or "tight"', `${path}.gap`);
      }
      const column: A2UIColumnNode = {
        id: node.id,
        component: 'column',
        gap: node.gap as 'loose' | 'tight' | undefined,
        children: node.children.map((child, i) =>
          validateComponentNode(child, `${path}.children[${i}]`)
        ),
      };
      return column;
    }
    case 'reasoning': {
      assertString(node.text, `${path}.text`);
      return { id: node.id, component: 'reasoning', text: node.text };
    }
    case 'tool_call': {
      assertString(node.name, `${path}.name`);
      assertString(node.args, `${path}.args`);
      assertOptionalString(node.result, `${path}.result`);
      return {
        id: node.id,
        component: 'tool_call',
        name: node.name,
        args: node.args,
        result: node.result,
      };
    }
    case 'markdown': {
      assertString(node.text, `${path}.text`);
      assertOptionalBoolean(node.streaming, `${path}.streaming`);
      return { id: node.id, component: 'markdown', text: node.text, streaming: node.streaming };
    }
  }
}

/** Validates a full component tree from its root node. */
export function validateComponentTree(input: unknown): A2UIComponentNode {
  return validateComponentNode(input, 'root');
}
