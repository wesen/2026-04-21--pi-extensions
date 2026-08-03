#!/usr/bin/env bash
# 01-capture-busybar-help.sh
# Capture the busybar CLI help surface into the ticket's sources/ directory so
# the design document can quote verbatim, dated reference material instead of
# relying on memory of the CLI.
#
# Usage: scripts/01-capture-busybar-help.sh
set -euo pipefail

TICKET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$TICKET_DIR/sources/busybar-help"
mkdir -p "$OUT_DIR"

stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "# busybar help capture — $stamp" > "$OUT_DIR/CAPTURE-INFO.md"

capture() {
  local name="$1"; shift
  echo "Capturing: busybar $*"
  {
    echo "# busybar $*"
    echo
    echo '```text'
    busybar "$@" 2>&1 || true
    echo '```'
  } > "$OUT_DIR/$name.md"
}

capture busybar-help-all help --all
capture busybar-help-animation-cli help busybar-animation-cli
capture busybar-help-goja help busybar-goja
capture busybar-help-goja-getting-started help busybar-goja-getting-started
capture busybar-create-help create --help
capture busybar-show-help show --help
capture busybar-clear-help clear --help
capture busybar-smoke-help smoke --help
capture busybar-stream-help stream --help
capture busybar-script-help script --help

echo "Done. Files written to $OUT_DIR"
ls -la "$OUT_DIR"
