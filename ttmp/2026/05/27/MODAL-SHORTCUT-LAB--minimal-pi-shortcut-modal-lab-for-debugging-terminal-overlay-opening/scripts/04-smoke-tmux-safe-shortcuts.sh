#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/home/manuel/code/wesen/2026-04-21--pi-extensions}"
SESSION="${SESSION:-modal-lab-safe-shortcuts}"
LOG="/tmp/pi-modal-shortcut-lab.log"
EXTENSION="$REPO_ROOT/extensions/modal-shortcut-lab/index.ts"

rm -f "$LOG"
tmux kill-session -t "$SESSION" 2>/dev/null || true
PI_MODAL_SHORTCUT_LAB_DEBUG=1 tmux new-session -d -s "$SESSION" -x 120 -y 40 \
  "cd '$REPO_ROOT' && PI_MODAL_SHORTCUT_LAB_DEBUG=1 pi --no-extensions --no-session -e '$EXTENSION'"

sleep "${STARTUP_SLEEP:-5}"

# Kitty CSI-u examples for proposed safe palette shortcuts.
# Ctrl+Shift+Alt+N: codepoint n=110, shifted N=78, modifier (shift|alt|ctrl)+1 = 8.
tmux send-keys -t "$SESSION" -l $'\e[110:78;8u'
sleep "${AFTER_KEY_SLEEP:-0.5}"

echo '--- pane after Ctrl+Shift+Alt+N ---'
tmux capture-pane -t "$SESSION" -p -S -25 | grep -A 12 'Modal Shortcut Lab' || true

# Close the modal, then try Ctrl+Space. Kitty CSI-u for Ctrl+Space is ESC[32;5u.
tmux send-keys -t "$SESSION" -l $'\e[27u'
sleep 0.2
tmux send-keys -t "$SESSION" -l $'\e[32;5u'
sleep "${AFTER_KEY_SLEEP:-0.5}"

echo '--- pane after Ctrl+Space ---'
tmux capture-pane -t "$SESSION" -p -S -25 | grep -A 12 'Modal Shortcut Lab' || true

echo '--- matched raw inputs ---'
python3 - <<'PY'
import json
from pathlib import Path
log = Path('/tmp/pi-modal-shortcut-lab.log')
if not log.exists():
    print('no log')
    raise SystemExit
for line in log.read_text().splitlines():
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        continue
    if event.get('event') in {'raw.input', 'schedule.fire', 'open.start', 'open.done'}:
        if event.get('event') != 'raw.input' or event.get('matchesSafeCandidate') or event.get('matchesCtrlSpace'):
            print(json.dumps(event, ensure_ascii=False))
PY

echo '--- log tail ---'
tail -160 "$LOG" || true

if [[ "${KEEP_SESSION:-0}" != "1" ]]; then
  tmux kill-session -t "$SESSION" 2>/dev/null || true
fi
