/** Narrow v1.0 profile from @a2ui/web_core 0.10.6; not a general A2UI runtime. */
export const BASIC_CATALOG = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
type Base = { id: string };
export type SurfaceComponent = Base &
  (
    | { component: 'Text'; text: string; variant?: 'caption' | 'body' }
    | { component: 'Column' | 'Row'; children: string[] }
    | { component: 'Card'; child: string }
    | {
        component: 'ChoicePicker';
        label?: string;
        variant?: 'mutuallyExclusive';
        displayStyle?: 'chips' | 'checkbox';
        value: { path: '/selection' };
        options: { label: string; value: string }[];
      }
    | {
        component: 'Button';
        child: string;
        variant?: 'primary' | 'default' | 'borderless';
        action: {
          event: { name: 'select_option'; context: { selection: { path: '/selection' } } };
        };
      }
  );
export interface A2UISurface {
  version: 'v1.0';
  createSurface: {
    surfaceId: string;
    catalogId: typeof BASIC_CATALOG;
    components: SurfaceComponent[];
    dataModel: { selection: string[] };
  };
}
export interface A2UIAction {
  version: 'v1.0';
  action: {
    name: 'select_option';
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;
    context: { selection: [string] };
  };
}
function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error('Unsupported or invalid interactive surface');
}
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  const result = value as Record<string, unknown>;
  assert(Object.keys(result).every(key => allowed.includes(key)));
  return result;
}
function text(value: unknown, max = 2000): asserts value is string {
  assert(typeof value === 'string' && value.length > 0 && value.length <= max);
}
function binding(value: unknown) {
  assert(object(value, ['path']).path === '/selection');
}
export function validateSurface(value: unknown): A2UISurface {
  assert(JSON.stringify(value).length <= 48000);
  const envelope = object(value, ['version', 'createSurface']);
  assert(envelope.version === 'v1.0');
  const surface = object(envelope.createSurface, [
    'surfaceId',
    'catalogId',
    'components',
    'dataModel',
  ]);
  assert(typeof surface.surfaceId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(surface.surfaceId));
  assert(surface.catalogId === BASIC_CATALOG);
  const dataModel = object(surface.dataModel, ['selection']);
  assert(Array.isArray(dataModel.selection) && dataModel.selection.length === 0);
  assert(
    Array.isArray(surface.components) &&
      surface.components.length > 0 &&
      surface.components.length <= 60
  );
  const nodes = new Map<string, SurfaceComponent>();
  let choices = 0;
  let buttons = 0;
  for (const raw of surface.components) {
    const base = object(raw, [
      'id',
      'component',
      'text',
      'variant',
      'children',
      'child',
      'label',
      'options',
      'value',
      'displayStyle',
      'action',
    ]);
    assert(typeof base.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(base.id));
    assert(!nodes.has(base.id));
    switch (base.component) {
      case 'Text': {
        const n = object(raw, ['id', 'component', 'text', 'variant']);
        assert(typeof n.text === 'string' && n.text.length <= 2000);
        assert(n.variant === undefined || n.variant === 'caption' || n.variant === 'body');
        break;
      }
      case 'Column':
      case 'Row': {
        const n = object(raw, ['id', 'component', 'children']);
        assert(Array.isArray(n.children) && n.children.length > 0 && n.children.length <= 20);
        n.children.forEach(id => text(id, 128));
        break;
      }
      case 'Card': {
        text(object(raw, ['id', 'component', 'child']).child, 128);
        break;
      }
      case 'ChoicePicker': {
        choices++;
        const n = object(raw, [
          'id',
          'component',
          'label',
          'variant',
          'displayStyle',
          'value',
          'options',
        ]);
        if (n.label !== undefined) assert(typeof n.label === 'string' && n.label.length <= 200);
        assert(n.variant === undefined || n.variant === 'mutuallyExclusive');
        assert(
          n.displayStyle === undefined ||
            n.displayStyle === 'chips' ||
            n.displayStyle === 'checkbox'
        );
        binding(n.value);
        assert(Array.isArray(n.options) && n.options.length >= 2 && n.options.length <= 6);
        const values = new Set<string>();
        for (const option of n.options) {
          const o = object(option, ['label', 'value']);
          text(o.label, 160);
          text(o.value, 160);
          assert(!values.has(o.value));
          values.add(o.value);
        }
        break;
      }
      case 'Button': {
        buttons++;
        const n = object(raw, ['id', 'component', 'child', 'variant', 'action']);
        text(n.child, 128);
        assert(
          n.variant === undefined ||
            ['primary', 'default', 'borderless'].includes(n.variant as string)
        );
        const event = object(object(n.action, ['event']).event, ['name', 'context']);
        assert(event.name === 'select_option');
        binding(object(event.context, ['selection']).selection);
        break;
      }
      default:
        throw new Error('Unsupported interactive component');
    }
    nodes.set(base.id, raw as SurfaceComponent);
  }
  assert(choices === 1 && buttons === 1);
  const visited = new Set<string>();
  const walk = (id: string, depth: number) => {
    // Repeated references are rejected as well as cycles: this profile is a tree.
    assert(depth <= 12 && !visited.has(id));
    const node = nodes.get(id);
    assert(node);
    visited.add(id);
    if (node.component === 'Button') assert(nodes.get(node.child)?.component === 'Text');
    if ('children' in node) node.children.forEach(child => walk(child, depth + 1));
    if ('child' in node) walk(node.child, depth + 1);
  };
  walk('root', 0);
  assert(visited.size === nodes.size);
  return value as A2UISurface;
}
