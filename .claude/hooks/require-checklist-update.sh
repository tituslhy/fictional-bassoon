#!/bin/bash
# .claude/hooks/require-checklist-update.sh
#
# SubagentStop hook. If this subagent changed any tracked file other than
# REWRITE_TASKS.md, REWRITE_TASKS.md must have changed too — otherwise the
# checklist silently drifts from what actually happened, which defeats the
# entire point of having it as a resume point.
#
# Fails OPEN on anything that looks like a hook-state problem (missing
# snapshot, missing agent_id, jq/git errors) rather than blocking. A hook
# that can get stuck blocking forever is a worse failure than an occasional
# missed enforcement — this is a solo-practitioner backstop, not a CI gate.

INPUT=$(cat)
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')

SNAPSHOT_DIR="/tmp/claude-rewrite-tasks-hook"
BEFORE="$SNAPSHOT_DIR/$AGENT_ID.start"

if [ -z "$AGENT_ID" ] || [ ! -f "$BEFORE" ]; then
  exit 0
fi

AFTER=$(mktemp)
git status --porcelain 2>/dev/null | sed -E 's/^.{3}//' | sort > "$AFTER"

# Paths that are dirty now but weren't in the start snapshot — i.e. what
# this subagent's run actually touched.
NEW_CHANGES=$(comm -13 "$BEFORE" "$AFTER")

rm -f "$BEFORE" "$AFTER"

if [ -z "$NEW_CHANGES" ]; then
  # Nothing new touched — pure investigation, no checklist item to check off.
  exit 0
fi

NON_CHECKLIST=$(echo "$NEW_CHANGES" | grep -v '^REWRITE_TASKS\.md$')
CHECKLIST_TOUCHED=$(echo "$NEW_CHANGES" | grep -c '^REWRITE_TASKS\.md$')

if [ -n "$NON_CHECKLIST" ] && [ "$CHECKLIST_TOUCHED" -eq 0 ]; then
  {
    echo "You changed files but REWRITE_TASKS.md wasn't updated to match:"
    echo "$NON_CHECKLIST"
    echo "Mark the relevant checklist item(s) in REWRITE_TASKS.md — [ ] to"
    echo "[~] if still in progress, [~] to [x] only once protocol-reviewer"
    echo "has actually verified it — before finishing."
  } >&2
  exit 2
fi

exit 0
