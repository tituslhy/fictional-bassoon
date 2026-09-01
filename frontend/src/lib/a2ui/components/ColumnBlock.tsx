'use client';

import type { A2UIColumnNode } from '../schema';
import { A2UIRenderer } from '../renderer';

const GAP_CLASS: Record<NonNullable<A2UIColumnNode['gap']>, string> = {
  loose: 'space-y-3',
  tight: 'space-y-2',
};

export default function ColumnBlock({ node }: { node: A2UIColumnNode }) {
  return (
    <div className={GAP_CLASS[node.gap ?? 'loose']}>
      {node.children.map(child => (
        <A2UIRenderer key={child.id} node={child} />
      ))}
    </div>
  );
}
