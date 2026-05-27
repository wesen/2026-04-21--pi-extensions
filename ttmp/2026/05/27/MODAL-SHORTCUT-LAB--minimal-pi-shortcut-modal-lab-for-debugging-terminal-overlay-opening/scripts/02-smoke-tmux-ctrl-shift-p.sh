#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/home/manuel/code/wesen/2026-04-21--pi-extensions}"
SESSION="${SESSION:-modal-lab-smoke}"
LOG="/tmp/pi-modal-shortcut-lab.log"
EXTENSION="$REPO_ROOT/extensions/modal-shortcut-lab/index.ts"

rm -f "$LOG"
tmux kill-session -t "$SESSION" 2>/dev/null || true
PI_MODAL_SHORTCUT_LAB_DEBUG=1 tmux new-session -d -s "$SESSION" -x 120 -y 40 \
  "cd '$REPO_ROOT' && PI_MODAL_SHORTCUT_LAB_DEBUG=1 pi --no-extensions --no-session -e '$EXTENSION'"

sleep "${STARTUP_SLEEP:-5}"
tmux send-keys -t "$SESSION" -l $'\e[112:80;6u'
sleep "${AFTER_KEY_SLEEP:-0.4}"

echo '--- pane excerpt ---'
tmux capture-pane -t "$SESSION" -p -S -25 | grep -A 12 'Modal Shortcut Lab' || true

echo '--- log tail ---'
tail -120 "$LOG" || true

if [[ "${KEEP_SESSION:-0}" != "1" ]]; then
  tmux kill-session -t "$SESSION" 2>/dev/null || true
fi
