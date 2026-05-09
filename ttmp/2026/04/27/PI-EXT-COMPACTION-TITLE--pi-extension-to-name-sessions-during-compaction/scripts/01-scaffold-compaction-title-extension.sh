#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd)"
ext_dir="$repo_root/extensions/compaction-title"

if [ -f "$ext_dir/index.ts" ]; then
  echo "compaction-title already exists at $ext_dir"
  echo "This ticket's Option A implementation is source-controlled there."
  exit 0
fi

mkdir -p "$ext_dir"
cat > "$ext_dir/README.md" <<'MD'
# compaction-title extension

TODO: copy the Option A implementation from the PI-EXT-COMPACTION-TITLE design guide.
MD

cat > "$ext_dir/index.ts" <<'TS'
import { compact, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function compactionTitleExtension(_pi: ExtensionAPI): void {
  // TODO: implement Option A from the ticket design guide.
  // Use session_before_compact, call compact() with appended title instructions,
  // parse ## Session Title, and store it with pi.setSessionName().
  void compact;
}
TS

echo "Wrote placeholder $ext_dir/index.ts"
