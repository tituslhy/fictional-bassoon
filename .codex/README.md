# Codex project guidance

Start with [AGENTS.md](../AGENTS.md). This directory mirrors the existing project rule and role organization for Codex:

- `rules/`: architecture, streaming, protocol, data integrity, and scope constraints. Read applicable files explicitly as directed by AGENTS.md.
- `agents/`: six reference role briefs for planning, development, testing, and review. These are not automatically registered Codex agents.
- Existing workflow skills remain in `../.claude/skills/` and `../.cursor/skills/`; read their SKILL.md explicitly when needed. They are not duplicated here.

Claude/Cursor permission files and lifecycle hooks are not Codex configuration. They were not copied as if they would enforce permissions here. The old checklist hooks target a removed migration document. Codex uses the active session's tools and approval settings, with AGENTS.md as the project entry point.
