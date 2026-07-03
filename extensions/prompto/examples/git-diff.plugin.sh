#!/usr/bin/env bash
# Reference single-template prompto JSONL plugin: current git diff as a prompt.
# The spirit of legacy prompto's git-diff.sh, restated in the plugin protocol.
set -euo pipefail

if [[ "${1:-}" == "--describe" ]]; then
	printf '%s\n' '{"type":"template","name":"git-diff","title":"Review my current git diff","fields":[{"name":"focus","label":"Review focus","type":"choice","choices":["correctness","style","performance"],"default":"correctness"}]}'
	printf '%s\n' '{"type":"end"}'
	exit 0
fi

# render: read one request line, emit the prompt
request="$(head -n 1)"
focus="$(printf '%s' "$request" | sed -n 's/.*"focus":"\([^"]*\)".*/\1/p')"
diff_output="$(git diff --stat && git diff)"
jq -cn --arg focus "${focus:-correctness}" --arg diff "$diff_output" \
	'{type:"prompt", text:("Review the following git diff with a focus on " + $focus + ":\n\n```diff\n" + $diff + "\n```")}'
