#!/usr/bin/env bash
# 04-prototype-alert.sh
# Shell prototype of the exact alert sequence the pi extension will perform on
# each turn_end. Building this first lets us validate device behaviour
# (priority arbitration, clear semantics, timing) without writing any
# TypeScript. The extension's runner module is a direct port of this script.
#
# Usage:
#   scripts/04-prototype-alert.sh                 # full alert: show, hold, clear
#   scripts/04-prototype-alert.sh --prepare-only  # only create+compile assets
#
# Env: BUSYBAR_ADDR (default 10.0.4.20), BUSYBAR_TOKEN (optional)
set -euo pipefail

TICKET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSET_DIR="$TICKET_DIR/sources/alert-assets"
mkdir -p "$ASSET_DIR"

ADDR="${BUSYBAR_ADDR:-10.0.4.20}"
APP_NAME="pi-turn-alert"
HOLD_SECONDS=3
PRIORITY=60   # above idle apps, below a user's priority-100 takeover apps
PATTERN="spinner"
DISPLAY="front"
FPS=12
FRAMES=12

TOKEN_ARGS=()
if [ -n "${BUSYBAR_TOKEN:-}" ]; then
  TOKEN_ARGS=(--token "$BUSYBAR_TOKEN")
fi

ZIP="$ASSET_DIR/alert_${DISPLAY}.zip"
ANIM="$ASSET_DIR/alert_${DISPLAY}.anim"

echo "[1/3] Building alert asset ($PATTERN, $DISPLAY, ${FRAMES}f @ ${FPS}fps)"
if [ ! -f "$ANIM" ]; then
  busybar create \
    --pattern "$PATTERN" \
    --display "$DISPLAY" \
    --frames "$FRAMES" \
    --fps "$FPS" \
    --output "$ZIP" \
    --compile-output "$ANIM" \
    --format jsonl
else
  echo "      cached: $ANIM"
fi

echo "[2/3] Inspecting asset"
busybar inspect --input "$ANIM" --format json \
  --output-fields width,height,fps,color_mode,bytes,frames

if [ "${1:-}" = "--prepare-only" ]; then
  echo "Prepared assets only (--prepare-only). Done."
  exit 0
fi

echo "[3/3] Show → hold ${HOLD_SECONDS}s → clear"
busybar show \
  --input "$ANIM" \
  --addr "$ADDR" \
  "${TOKEN_ARGS[@]}" \
  --application-name "$APP_NAME" \
  --display "$DISPLAY" \
  --priority "$PRIORITY" \
  --loop

sleep "$HOLD_SECONDS"

busybar clear \
  --addr "$ADDR" \
  "${TOKEN_ARGS[@]}" \
  --application-name "$APP_NAME"

echo "Alert cycle complete."
