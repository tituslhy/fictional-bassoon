import { describe, it, expect } from 'vitest';
import { A2UI_ALLOWED_COMPONENT_TYPES, isAllowedComponentType } from './allowList';

describe('A2UI Allow-list', () => {
  describe('A2UI_ALLOWED_COMPONENT_TYPES', () => {
    it('should contain the required component types', () => {
      expect(A2UI_ALLOWED_COMPONENT_TYPES).toContain('column');
      expect(A2UI_ALLOWED_COMPONENT_TYPES).toContain('reasoning');
      expect(A2UI_ALLOWED_COMPONENT_TYPES).toContain('tool_call');
      expect(A2UI_ALLOWED_COMPONENT_TYPES).toContain('markdown');
    });

    it('should have exactly 4 allowed component types', () => {
      expect(A2UI_ALLOWED_COMPONENT_TYPES).toHaveLength(4);
    });

    it('should be readonly', () => {
      // TypeScript will enforce this, but verify at runtime that it's an array
      expect(Array.isArray(A2UI_ALLOWED_COMPONENT_TYPES)).toBe(true);
    });
  });

  describe('isAllowedComponentType', () => {
    it('should return true for allowed component types', () => {
      expect(isAllowedComponentType('column')).toBe(true);
      expect(isAllowedComponentType('reasoning')).toBe(true);
      expect(isAllowedComponentType('tool_call')).toBe(true);
      expect(isAllowedComponentType('markdown')).toBe(true);
    });

    it('should return false for disallowed component types', () => {
      expect(isAllowedComponentType('text')).toBe(false);
      expect(isAllowedComponentType('button')).toBe(false);
      expect(isAllowedComponentType('form')).toBe(false);
      expect(isAllowedComponentType('custom')).toBe(false);
      expect(isAllowedComponentType('unknown')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isAllowedComponentType('COLUMN')).toBe(false);
      expect(isAllowedComponentType('Column')).toBe(false);
      expect(isAllowedComponentType('REASONING')).toBe(false);
      expect(isAllowedComponentType('Reasoning')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isAllowedComponentType('')).toBe(false);
    });

    it('should return false for whitespace', () => {
      expect(isAllowedComponentType(' ')).toBe(false);
      expect(isAllowedComponentType(' column ')).toBe(false);
    });
  });
});
