#!/usr/bin/env bash
# 02-verify-pi-events.sh
# Verify which pi lifecycle events exist in the installed pi-coding-agent
# package and capture the relevant doc excerpts into sources/. The design doc
# depends on the exact event names and payload fields, so we record evidence
# rather than assume.
#
# Usage: scripts/02-verify-pi-events.sh
set -euo pipefail

TICKET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$TICKET_DIR/sources/pi-events"
mkdir -p "$OUT_DIR"

PI_ROOT="/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent"
DOCS="$PI_ROOT/docs/extensions.md"

echo "pi-coding-agent package root: $PI_ROOT"
if [ -f "$PI_ROOT/package.json" ]; then
  grep -E '"name"|"version"' "$PI_ROOT/package.json" | tee "$OUT_DIR/pi-version.txt"
fi

EVENTS=(turn_start turn_end agent_start agent_end agent_settled session_start session_shutdown session_compact session_tree before_agent_start input message_end tool_call tool_result)

{
  echo "# Event presence check — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  for ev in "${EVENTS[@]}"; do
    if grep -q "\"$ev\"" "$DOCS" 2>/dev/null; then
      echo "- $ev: DOCUMENTED in docs/extensions.md"
    else
      echo "- $ev: NOT FOUND in docs/extensions.md"
    fi
  done
} | tee "$OUT_DIR/event-presence.md"

# Extract the lifecycle diagram and the agent/turn event sections verbatim.
awk '/^#### agent_start \/ agent_end \/ agent_settled/,/^#### message_start/' "$DOCS" \
  | head -n -1 > "$OUT_DIR/section-agent-events.md" || true
awk '/^### Lifecycle/,/^### [A-Z]/' "$DOCS" | head -80 > "$OUT_DIR/section-lifecycle.md" || true

echo
echo "Sources written to $OUT_DIR"
ls -la "$OUT_DIR"
