---
Title: Tmux test playbook
Ticket: PI-EXT-DIRENV-BASH
Status: active
Topics:
    - pi-extensions
    - tooling
    - environment
    - direnv
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/01-standalone-direnv-preamble-test.sh
      Note: Standalone direnv shell validation
    - Path: ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/02-tmux-pi-direnv-bash-smoke.sh
      Note: Tmux smoke test for extension load and direnv export
ExternalSources: []
Summary: Repeatable commands for validating the direnv-bash extension, including tmux.
LastUpdated: 2026-04-27T10:00:00-04:00
WhatFor: Use this to re-run validation after changing the extension.
WhenToUse: Run after edits to extensions/direnv-bash or when debugging direnv behavior in Pi.
---


# Tmux test playbook

## Purpose

Validate that the `direnv-bash` Pi extension loads successfully and that the direnv export/eval pattern works in tmux.

## Environment Assumptions

Required commands:

- `pi`
- `tmux`
- `direnv`
- `bash`

Repository root:

```text
/home/manuel/code/wesen/2026-04-21--pi-extensions
```

Extension path:

```text
/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash
```

## Commands

From the repository root:

```bash
cd /home/manuel/code/wesen/2026-04-21--pi-extensions
```

Validate Pi can load the extension without starting an LLM turn:

```bash
pi --no-session --no-extensions -e ./extensions/direnv-bash --list-models no-such-model
```

Expected output:

```text
No models matching "no-such-model"
```

Run the standalone direnv shell test:

```bash
./ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/01-standalone-direnv-preamble-test.sh
```

Expected output ends with:

```text
PASS: direnv export bash loaded PI_DIRENV_BASH_TEST_VALUE=loaded-from-direnv
```

Run the tmux smoke test:

```bash
./ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/02-tmux-pi-direnv-bash-smoke.sh
```

Expected output ends with:

```text
TMUX_DIRENV_VALUE=loaded-inside-tmux

EXIT=0
PASS: pi loaded extensions/direnv-bash and direnv exported env inside tmux
```

Install or refresh the symlink for normal Pi use:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash ~/.pi/agent/extensions/direnv-bash
```

In an interactive Pi session, run:

```text
/reload
/direnv-bash
```

Then ask Pi to execute a bash command in a direnv-enabled project, for example:

```bash
printf '%s\n' "$YOUR_DIRENV_VARIABLE"
```

## Exit Criteria

The extension is considered validated when:

- `pi --list-models ... -e ./extensions/direnv-bash` exits 0;
- standalone test prints `PASS`;
- tmux test prints `PASS`;
- `~/.pi/agent/extensions/direnv-bash` points to the source-controlled extension directory.

## Failure Modes

### `direnv is not installed`

Install `direnv` or skip direnv-specific validation. The Pi extension still loads and defaults to best-effort behavior when direnv is missing.

### `.envrc is blocked`

Run `direnv allow .` in the project directory. The extension intentionally does not bypass this gate.

### Pi load fails

Run:

```bash
pi --no-session --no-extensions -e ./extensions/direnv-bash --list-models no-such-model
```

Read stderr for TypeScript import or syntax errors.

### Tmux session is left behind

The smoke script should clean up automatically. If interrupted, remove sessions manually:

```bash
tmux ls
tmux kill-session -t <session-name>
```
