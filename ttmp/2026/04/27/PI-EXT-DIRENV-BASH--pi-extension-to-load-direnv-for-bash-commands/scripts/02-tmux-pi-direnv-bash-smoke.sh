#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../../../" && pwd)"
extension_path="$repo_root/extensions/direnv-bash"
session="pi-direnv-bash-smoke-$$"
log_file="${TMPDIR:-/tmp}/pi-direnv-bash-smoke-$session.log"
workdir="$(mktemp -d)"
cleanup() {
  tmux kill-session -t "$session" >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

if ! command -v tmux >/dev/null 2>&1; then
  echo "FAIL: tmux is not installed" >&2
  exit 1
fi
if ! command -v pi >/dev/null 2>&1; then
  echo "FAIL: pi is not on PATH" >&2
  exit 1
fi
if ! command -v direnv >/dev/null 2>&1; then
  echo "SKIP: direnv is not installed" >&2
  exit 0
fi

cat > "$workdir/.envrc" <<'ENVRC'
export PI_DIRENV_BASH_TEST_VALUE="loaded-inside-tmux"
ENVRC
(
  cd "$workdir"
  direnv allow . >/dev/null
)

# The tmux command does two things:
# 1. load the extension through pi without asking an LLM for a turn;
# 2. run the same direnv export/eval shell pattern in a tmux pane cwd.
tmux new-session -d -s "$session" -c "$workdir" \
  "{
     pi --no-session --no-extensions -e '$extension_path' --list-models no-such-model
     if command -v direnv >/dev/null 2>&1; then
       __pi_direnv_export=\"\$(direnv export bash)\"
       __pi_direnv_status=\$?
       if [ \$__pi_direnv_status -eq 0 ]; then
         eval \"\$__pi_direnv_export\"
       fi
       unset __pi_direnv_export __pi_direnv_status
     fi
     printf 'TMUX_DIRENV_VALUE=%s\n' \"\${PI_DIRENV_BASH_TEST_VALUE:-missing}\"
   } >'$log_file' 2>&1; printf '\nEXIT=%s\n' \"\$?\" >>'$log_file'"

for _ in $(seq 1 100); do
  if grep -q '^EXIT=' "$log_file" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

cat "$log_file"
if ! grep -q '^EXIT=0$' "$log_file"; then
  echo "FAIL: pi extension load or direnv shell check failed in tmux" >&2
  exit 1
fi
if ! grep -q '^TMUX_DIRENV_VALUE=loaded-inside-tmux$' "$log_file"; then
  echo "FAIL: direnv value was not loaded inside tmux" >&2
  exit 1
fi

echo "PASS: pi loaded extensions/direnv-bash and direnv exported env inside tmux"
