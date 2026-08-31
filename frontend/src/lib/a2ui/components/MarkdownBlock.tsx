'use client';

import MarkdownSection from '@/components/chat/MarkdownSection';
import type { A2UIMarkdownNode } from '../schema';

/**
 * Renderer for the `markdown` A2UI component type. This is the "folded
 * into the allow-list" seam for `MarkdownSection.tsx` described in
 * `a2ui-no-executable-ui.md` — `MarkdownSection.tsx` itself still owns the
 * sanitized `react-markdown` rendering (it isn't retired or duplicated
 * here), but the only supported path to it is now through the A2UI
 * component registry rather than being reachable as a standalone side
 * channel for arbitrary agent text.
 */
export default function MarkdownBlock({ node }: { node: A2UIMarkdownNode }) {
  return <MarkdownSection content={node.text} streaming={node.streaming} />;
}
