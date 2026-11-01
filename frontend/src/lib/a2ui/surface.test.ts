import { describe, expect, it } from 'vitest';
import { validateSurface } from './surface';
import { surfaceFixture } from './surfaceFixture';

describe('interactive surface boundary', () => {
  it('accepts the bounded standard createSurface profile', () => {
    expect(validateSurface(surfaceFixture()).createSurface.surfaceId).toBe('surface-1');
  });
  it('accepts published optional picker defaults', () => {
    const surface = surfaceFixture();
    delete surface.createSurface.components[2].label;
    delete surface.createSurface.components[2].variant;
    expect(validateSurface(surface).createSurface.surfaceId).toBe('surface-1');
  });
  it('rejects overdeep trees before rendering', () => {
    const surface: any = surfaceFixture();
    surface.createSurface.components[0].children[0] = 'nested-0';
    for (let i = 0; i < 13; i++) {
      surface.createSurface.components.push({
        id: `nested-${i}`,
        component: 'Card',
        child: i === 12 ? 'heading' : `nested-${i + 1}`,
      });
    }
    expect(() => validateSurface(surface)).toThrow();
  });
  it.each([
    [
      'executable text',
      (s: any) => {
        s.createSurface.components[1].text = { call: 'eval', args: {} };
      },
    ],
    [
      'unknown property',
      (s: any) => {
        s.createSurface.components[1].onClick = 'alert(1)';
      },
    ],
    [
      'unsupported component',
      (s: any) => {
        s.createSurface.components[1].component = 'Image';
      },
    ],
    [
      'cycle',
      (s: any) => {
        s.createSurface.components[0].children.push('root');
      },
    ],
    [
      'missing reference',
      (s: any) => {
        s.createSurface.components[0].children.push('absent');
      },
    ],
    [
      'unreachable node',
      (s: any) => {
        s.createSurface.components.push({ id: 'orphan', component: 'Text', text: 'hidden' });
      },
    ],
    [
      'duplicate id',
      (s: any) => {
        s.createSurface.components.push(s.createSurface.components[1]);
      },
    ],
    [
      'unexpected binding',
      (s: any) => {
        s.createSurface.components[2].value.path = '/token';
      },
    ],
    [
      'arbitrary action',
      (s: any) => {
        s.createSurface.components[3].action.event.name = 'execute';
      },
    ],
    [
      'too many components',
      (s: any) => {
        s.createSurface.components = Array(61).fill(s.createSurface.components[1]);
      },
    ],
    [
      'duplicate choices',
      (s: any) => {
        s.createSurface.components[2].options[1].value = 'fastapi';
      },
    ],
    [
      'bad initial selection',
      (s: any) => {
        s.createSurface.dataModel.selection = ['unknown'];
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const surface = surfaceFixture();
    mutate(surface);
    expect(() => validateSurface(surface)).toThrow();
  });
});
