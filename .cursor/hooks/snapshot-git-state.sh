#!/bin/bash
# .cursor/hooks/snapshot-git-state.sh
#
# subagentStart hook. Records which files are already dirty before a
# worker subagent starts, so require-checklist-update.sh (subagentStop)
# can tell what THIS subagent actually touched, not what was already
# uncommitted before it ran.

INPUT=$(cat)
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // .subagent_id // .conversation_id // empty')

# No agent id in the payload — nothing to key the snapshot on. Fail open;
# this is a start-of-run bookkeeping step, not a gate, so exit 0 either way.
if [ -z "$AGENT_ID" ]; then
  exit 0
fi

SNAPSHOT_DIR="/tmp/cursor-rewrite-tasks-hook"
mkdir -p "$SNAPSHOT_DIR"

# Path-only, sorted. Status codes aren't needed — only "did this path's
# dirty-state change" matters for the comparison in the stop hook.
git status --porcelain 2>/dev/null | sed -E 's/^.{3}//' | sort > "$SNAPSHOT_DIR/$AGENT_ID.start"

exit 0
