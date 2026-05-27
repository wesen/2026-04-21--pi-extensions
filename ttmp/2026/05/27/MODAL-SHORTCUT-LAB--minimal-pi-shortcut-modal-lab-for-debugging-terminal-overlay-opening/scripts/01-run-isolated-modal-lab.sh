#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/home/manuel/code/wesen/2026-04-21--pi-extensions}"
EXTENSION="$REPO_ROOT/extensions/modal-shortcut-lab/index.ts"

cd "$REPO_ROOT"
export PI_MODAL_SHORTCUT_LAB_DEBUG="${PI_MODAL_SHORTCUT_LAB_DEBUG:-1}"
exec pi --no-extensions --no-session -e "$EXTENSION"
