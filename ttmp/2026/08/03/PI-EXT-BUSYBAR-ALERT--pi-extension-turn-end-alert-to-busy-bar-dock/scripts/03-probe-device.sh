#!/usr/bin/env bash
# 03-probe-device.sh
# Bounded connectivity probe for the BUSY Bar. Fails gracefully (exit 0 with a
# report) when the device is unreachable, so it is safe to run from the design
# workflow without hardware attached.
#
# Usage:
#   scripts/03-probe-device.sh                 # probe default/env address
#   BUSYBAR_ADDR=192.168.0.136 scripts/03-probe-device.sh
set -uo pipefail

TICKET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$TICKET_DIR/sources/device-probe"
mkdir -p "$OUT_DIR"

ADDR="${BUSYBAR_ADDR:-10.0.4.20}"
TOKEN_ARGS=()
if [ -n "${BUSYBAR_TOKEN:-}" ]; then
  TOKEN_ARGS=(--token "$BUSYBAR_TOKEN")
fi

REPORT="$OUT_DIR/probe-$(date -u +%Y%m%dT%H%M%SZ).md"
{
  echo "# BUSY Bar probe — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "- Address: $ADDR"
  echo "- Token: $([ ${#TOKEN_ARGS[@]} -gt 0 ] && echo 'set (from BUSYBAR_TOKEN)' || echo 'not set')"
  echo

  echo "## TCP reachability (port 80, 3s timeout)"
  if timeout 3 bash -c "echo > /dev/tcp/$ADDR/80" 2>/dev/null; then
    echo "REACHABLE"
  else
    echo "UNREACHABLE — device off, different subnet, or wrong address."
    echo
    echo "Stopping probe here; HTTP commands would just hang."
    exit 0
  fi
  echo

  echo "## busybar stream (5s bounded, input events only)"
  timeout 20 busybar stream --addr "$ADDR" "${TOKEN_ARGS[@]}" --duration-seconds 5 --format jsonl 2>&1 || true
  echo

  echo "## busybar smoke (dry capability check is interactive; skipped in probe)"
  echo "Run manually: busybar smoke --addr \"$ADDR\" --application-name pi-turn-alert-probe --priority 50 --step-seconds 2"
} | tee "$REPORT"

echo
echo "Probe report written to $REPORT"
