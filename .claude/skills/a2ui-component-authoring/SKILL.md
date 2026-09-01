---
name: a2ui-component-authoring
description: Use when defining new A2UI component types, updating the frontend's component-tree renderer, or migrating StreamingRenderer.tsx / MarkdownSection.tsx off their current fixed-component rendering onto the A2UI declarative contract.
---

# A2UI Component Authoring

## Current state (what's being replaced)

`frontend/src/components/chat/StreamingRenderer.tsx` renders three fixed
blocks — `ReasoningBlock`, `ToolCallBlock`, `AnswerBlock` — driven by typed
props, not by anything the agent sends as structure. `MarkdownSection.tsx`
renders agent text through `react-markdown` + `remark-gfm`. Under A2UI, none
of this is fixed React logic reacting to typed fields — the agent describes
a component tree and the renderer walks it.

## Process for adding a new component type

1. Define the component's shape in the A2UI schema first — not in TSX. The
   schema is the contract; the renderer is downstream of it.
2. Add it to the explicit allow-list (see `a2ui-no-executable-ui.md` — no
   open-ended "render whatever" fallback).
3. Implement the React renderer for that one component type under
   `frontend/src/lib/a2ui/`.
4. Only after the renderer exists does the backend get permission to emit
   that component type.

## Migrating the existing three blocks

- `ReasoningBlock` → an A2UI reasoning-equivalent component — collapsible
  behavior is a renderer detail, not a protocol concern.
- `ToolCallBlock` → an A2UI tool-call-equivalent component.
- `AnswerBlock` / `MarkdownSection.tsx` → an A2UI markdown component,
  sanitized rendering only, explicitly allow-listed rather than an
  unconstrained pass-through.

## Hard boundary

No component renders raw HTML or executes agent-supplied strings as code.
If a design seems to need that, it's a sign the component should be broken
into more structured fields — flag it rather than reaching for
`dangerouslySetInnerHTML` or similar.
