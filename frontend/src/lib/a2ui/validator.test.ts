import { describe, it, expect } from 'vitest';
import { A2UIValidationError, validateComponentNode, validateComponentTree } from './validator';
import type { A2UIComponentNode } from './schema';

// Loose structural view of a validated node for assertions — the validator's
// return type is the discriminated union, but these tests assert
// node-specific props right after asserting the discriminant, so a full
// narrowing dance per test adds noise without adding safety.
type LooseNode = {
  id: string;
  component: string;
  text?: string;
  name?: string;
  args?: string;
  result?: string;
  streaming?: boolean;
  gap?: string;
  children: LooseNode[];
};

describe('A2UI Validator', () => {
  describe('A2UIValidationError', () => {
    it('should create error with correct message format', () => {
      const error = new A2UIValidationError('test message', 'root.child');
      expect(error.message).toContain('A2UI validation failed at "root.child": test message');
    });

    it('should have correct name', () => {
      const error = new A2UIValidationError('test', 'root');
      expect(error.name).toBe('A2UIValidationError');
    });

    it('should store path property', () => {
      const error = new A2UIValidationError('test', 'root.field');
      expect(error.path).toBe('root.field');
    });
  });

  describe('validateComponentNode - Reasoning', () => {
    it('should validate valid reasoning node', () => {
      const node = {
        id: 'reason_1',
        component: 'reasoning',
        text: 'I am thinking about this problem',
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.component).toBe('reasoning');
      expect(result.id).toBe('reason_1');
      expect(result.text).toBe('I am thinking about this problem');
    });

    it('should reject reasoning node without id', () => {
      const node = {
        component: 'reasoning',
        text: 'Some thinking',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(node)).toThrow(/expected a string/);
    });

    it('should reject reasoning node without text', () => {
      const node = {
        id: 'reason_1',
        component: 'reasoning',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(node)).toThrow(/text/);
    });

    it('should reject reasoning node with non-string text', () => {
      const node = {
        id: 'reason_1',
        component: 'reasoning',
        text: 123,
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
    });
  });

  describe('validateComponentNode - Tool Call', () => {
    it('should validate valid tool call node without result', () => {
      const node = {
        id: 'call_1',
        component: 'tool_call',
        name: 'get_weather',
        args: '{"city": "SF"}',
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.component).toBe('tool_call');
      expect(result.id).toBe('call_1');
      expect(result.name).toBe('get_weather');
      expect(result.args).toBe('{"city": "SF"}');
      expect(result.result).toBeUndefined();
    });

    it('should validate valid tool call node with result', () => {
      const node = {
        id: 'call_1',
        component: 'tool_call',
        name: 'get_weather',
        args: '{"city": "SF"}',
        result: 'Sunny, 72F',
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.component).toBe('tool_call');
      expect(result.result).toBe('Sunny, 72F');
    });

    it('should reject tool call without name', () => {
      const node = {
        id: 'call_1',
        component: 'tool_call',
        args: '{}',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(node)).toThrow(/name/);
    });

    it('should reject tool call without args', () => {
      const node = {
        id: 'call_1',
        component: 'tool_call',
        name: 'tool',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(node)).toThrow(/args/);
    });

    it('should reject tool call with non-string result', () => {
      const node = {
        id: 'call_1',
        component: 'tool_call',
        name: 'tool',
        args: '{}',
        result: 123,
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
    });
  });

  describe('validateComponentNode - Markdown', () => {
    it('should validate valid markdown node without streaming', () => {
      const node = {
        id: 'md_1',
        component: 'markdown',
        text: '# Hello\n\nWorld',
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.component).toBe('markdown');
      expect(result.id).toBe('md_1');
      expect(result.text).toBe('# Hello\n\nWorld');
      expect(result.streaming).toBeUndefined();
    });

    it('should validate markdown node with streaming=true', () => {
      const node = {
        id: 'md_1',
        component: 'markdown',
        text: 'Content',
        streaming: true,
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.streaming).toBe(true);
    });

    it('should validate markdown node with streaming=false', () => {
      const node = {
        id: 'md_1',
        component: 'markdown',
        text: 'Content',
        streaming: false,
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.streaming).toBe(false);
    });

    it('should reject markdown with non-boolean streaming', () => {
      const node = {
        id: 'md_1',
        component: 'markdown',
        text: 'Content',
        streaming: 'true',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(node)).toThrow(/boolean/);
    });

    it('should reject markdown without text', () => {
      const node = {
        id: 'md_1',
        component: 'markdown',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
    });
  });

  describe('validateComponentNode - Column', () => {
    it('should validate valid column with children', () => {
      const node = {
        id: 'col_1',
        component: 'column',
        children: [
          { id: 'md_1', component: 'markdown', text: 'Child 1' },
          { id: 'md_2', component: 'markdown', text: 'Child 2' },
        ],
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.component).toBe('column');
      expect(result.children).toHaveLength(2);
      expect(result.children[0].component).toBe('markdown');
    });

    it('should validate column with gap=loose', () => {
      const node = {
        id: 'col_1',
        component: 'column',
        gap: 'loose',
        children: [],
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.gap).toBe('loose');
    });

    it('should validate column with gap=tight', () => {
      const node = {
        id: 'col_1',
        component: 'column',
        gap: 'tight',
        children: [],
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.gap).toBe('tight');
    });

    it('should validate column without gap', () => {
      const node = {
        id: 'col_1',
        component: 'column',
        children: [],
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.gap).toBeUndefined();
    });

    it('should reject column with invalid gap', () => {
      const node = {
        id: 'col_1',
        component: 'column',
        gap: 'extra-loose',
        children: [],
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(node)).toThrow(/loose.*tight/);
    });

    it('should reject column without children array', () => {
      const node = {
        id: 'col_1',
        component: 'column',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(node)).toThrow(/children array/);
    });

    it('should reject column with non-array children', () => {
      const node = {
        id: 'col_1',
        component: 'column',
        children: 'not an array',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
    });

    it('should recursively validate nested children', () => {
      const node = {
        id: 'col_1',
        component: 'column',
        children: [
          {
            id: 'col_2',
            component: 'column',
            children: [{ id: 'md_1', component: 'markdown', text: 'Deep' }],
          },
        ],
      };

      const result = validateComponentNode(node) as LooseNode;
      expect(result.children[0].component).toBe('column');
      expect(result.children[0].children[0].component).toBe('markdown');
    });

    it('should provide path information for nested validation errors', () => {
      const node = {
        id: 'col_1',
        component: 'column',
        children: [
          { id: 'md_1', component: 'markdown' }, // missing text
        ],
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      const error = new A2UIValidationError('test', 'root.children[0]');
      expect(error.path).toContain('children');
    });
  });

  describe('validateComponentNode - Invalid inputs', () => {
    it('should reject non-object input', () => {
      expect(() => validateComponentNode('not an object')).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(123)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(null)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(undefined)).toThrow(A2UIValidationError);
    });

    it('should reject array input', () => {
      expect(() => validateComponentNode([])).toThrow(A2UIValidationError);
      expect(() => validateComponentNode([1, 2, 3])).toThrow(A2UIValidationError);
    });

    it('should reject unknown component type', () => {
      const node = {
        id: 'node_1',
        component: 'unknown_type',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
      expect(() => validateComponentNode(node)).toThrow(/unknown or disallowed/);
    });

    it('should reject node with non-string id', () => {
      const node = {
        id: 123,
        component: 'markdown',
        text: 'Test',
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
    });

    it('should reject node with non-string component', () => {
      const node = {
        id: 'node_1',
        component: 123,
      };

      expect(() => validateComponentNode(node)).toThrow(A2UIValidationError);
    });
  });

  describe('validateComponentTree', () => {
    it('should validate a complete tree', () => {
      const tree = {
        id: 'root',
        component: 'column',
        children: [
          { id: 'r1', component: 'reasoning', text: 'Thinking' },
          { id: 'md1', component: 'markdown', text: 'Answer' },
          { id: 'tc1', component: 'tool_call', name: 'search', args: '{}' },
        ],
      };

      const result = validateComponentTree(tree) as LooseNode;
      expect(result.component).toBe('column');
      expect(result.children).toHaveLength(3);
    });

    it('should use "root" as the path prefix', () => {
      const node = {
        component: 'markdown',
        text: 'Test',
      };

      try {
        validateComponentTree(node);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(A2UIValidationError);
        expect((error as A2UIValidationError).path).toBe('root.id');
      }
    });
  });
});
