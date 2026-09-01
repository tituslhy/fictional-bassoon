---
name: protocol-spec-verification
description: Use before implementing any AG-UI, A2UI, or A2A feature, or when uncertain about an event name, schema field, or RPC method — verifies against current live sources instead of training data, since all three protocols have changed materially in the last year.
---

# Protocol Spec Verification

## Why this exists

AG-UI, A2UI, and A2A have all shipped material spec/vocabulary changes
within roughly the last twelve months. Training-data recall of exact event
names, schema fields, or RPC method names is not reliable for any of the
three.

## Procedure

1. Check the pinned version in `protocol-version-pinning.md`'s version log
   and in `backend/pyproject.toml` / `frontend/package.json`.
2. Read the actual installed package source for the authoritative
   vocabulary — not a blog post, not a tutorial, not memory.
3. If nothing is pinned yet, fetch current docs (the `ag-ui-protocol` org on
   GitHub, a2a-protocol.org, Google's A2UI spec) before writing
   implementation code, and record what was pinned in
   `protocol-version-pinning.md` immediately after.
4. If a fetched doc and the installed package disagree, the installed
   package wins — flag the mismatch rather than silently reconciling it.

## When NOT to skip this

Every time — including when a pattern "looks obviously right" from a prior
AG-UI/A2A project. These protocols are young enough that knowledge from even
a few months ago can be stale.
