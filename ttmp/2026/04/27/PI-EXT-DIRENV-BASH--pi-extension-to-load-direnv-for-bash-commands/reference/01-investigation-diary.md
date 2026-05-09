---
Title: Investigation diary
Ticket: PI-EXT-DIRENV-BASH
Status: active
Topics:
    - pi-extensions
    - tooling
    - environment
    - direnv
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash/index.ts
    - /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash/direnv.ts
ExternalSources: []
Summary: "Chronological diary for the direnv-bash Pi extension implementation."
LastUpdated: 2026-04-27T10:00:00-04:00
WhatFor: "Use this to resume or audit the implementation work."
WhenToUse: "Read before continuing this ticket or debugging the extension."
---

# Investigation diary

## Goal

Record what was built, what was tested, and what remains to do for `PI-EXT-DIRENV-BASH`.

## Context

The user requested a Pi extension that sources/uses direnv for bash commands, with a docmgr ticket, detailed intern-facing documentation, tmux testing, and reMarkable upload.

## Timeline

### 2026-04-27 — Ticket creation

Created docmgr ticket:

```bash
docmgr ticket create-ticket \
  --ticket PI-EXT-DIRENV-BASH \
  --title "Pi extension to load direnv for bash commands" \
  --topics pi-extensions,tooling,environment,direnv
```

Workspace:

```text
ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands
```

### 2026-04-27 — Pi extension API review

Read Pi extension docs from:

```text
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
```

Relevant findings:

- `tool_call` events can mutate `event.input.command` before the built-in bash tool executes.
- `user_bash` events can return custom operations and can wrap `createLocalBashOperations()`.
- The docs explicitly show examples of prepending shell setup with `source ~/.profile` and `direnv`-like shell wrappers.
- This allows us to avoid overriding the built-in `bash` tool.

### 2026-04-27 — Implementation

Added extension files:

```text
extensions/direnv-bash/index.ts
extensions/direnv-bash/direnv.ts
extensions/direnv-bash/README.md
```

Design choices:

- `direnv.ts` owns pure helper functions and internal self-tests.
- `index.ts` owns Pi event handlers and commands.
- Default mode is best-effort.
- Strict mode is available.
- Quiet mode is available.
- Idempotence markers prevent duplicate preambles.

### 2026-04-27 — Load validation

Ran:

```bash
pi --no-session --no-extensions -e ./extensions/direnv-bash --list-models nonexistent-model-filter
```

Result:

```text
No models matching "nonexistent-model-filter"
```

Exit code was 0, which validates that Pi can load the extension module.

### 2026-04-27 — Ticket scripts

Created scripts:

```text
ttmp/.../scripts/01-standalone-direnv-preamble-test.sh
ttmp/.../scripts/02-tmux-pi-direnv-bash-smoke.sh
```

The first script verifies direnv shell semantics with a temporary `.envrc`.

The second script starts a tmux session, loads Pi with the extension through `-e`, and verifies direnv export/eval behavior inside the tmux pane.

### 2026-04-27 — Test run

Ran:

```bash
./ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/01-standalone-direnv-preamble-test.sh
./ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/02-tmux-pi-direnv-bash-smoke.sh
```

Observed output included:

```text
PASS: direnv export bash loaded PI_DIRENV_BASH_TEST_VALUE=loaded-from-direnv
PASS: pi loaded extensions/direnv-bash and direnv exported env inside tmux
```

### 2026-04-27 — Installation

Installed for Pi auto-discovery by symlink:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash ~/.pi/agent/extensions/direnv-bash
```

Verified:

```text
/home/manuel/.pi/agent/extensions/direnv-bash -> /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash
```

## Quick Reference

Current extension commands:

```text
/direnv-bash
/direnv-bash on
/direnv-bash off
/direnv-bash quiet
/direnv-bash no-quiet
/direnv-bash strict
/direnv-bash no-strict
/dbash
/direnv-bash-self-test
```

## Usage Examples

In a project with `.envrc`:

```bash
echo 'export EXAMPLE_FROM_DIRENV=ok' > .envrc
direnv allow .
```

In Pi, ask the agent to run:

```bash
printf '%s\n' "$EXAMPLE_FROM_DIRENV"
```

Expected result:

```text
ok
```

## Issues and caveats

- The implemented tests validate module loading and shell semantics, but they do not force an LLM to call the bash tool because that would depend on model availability and cost.
- Default mode lets the command continue if direnv is missing or not allowed. Use `/direnv-bash strict` for hard failures.

## Next steps

- Optionally add persistence for quiet/strict/enabled settings.
- Optionally add a `/direnv-status` command that shells out to `direnv status` in `ctx.cwd`.
- Run `/reload` in an already-open Pi TUI session to activate the installed symlink.
