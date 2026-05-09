#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd)"
ext_dir="$repo_root/extensions/compaction-title"

if [ ! -f "$ext_dir/index.ts" ]; then
  echo "SKIP: $ext_dir/index.ts does not exist. Run scripts/01-scaffold-compaction-title-extension.sh first." >&2
  exit 0
fi

pi --no-session --no-extensions -e "$ext_dir" --list-models no-such-model >/tmp/pi-compaction-title-load.out 2>/tmp/pi-compaction-title-load.err
cat /tmp/pi-compaction-title-load.out
cat /tmp/pi-compaction-title-load.err >&2

echo "PASS: compaction-title extension loaded successfully"
