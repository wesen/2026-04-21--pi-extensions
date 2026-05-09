---
Title: Implementation and test playbook
Ticket: PI-EXT-COMPACTION-TITLE
Status: active
Topics:
    - pi-extensions
    - compaction
    - tokens
    - tooling
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction/scripts/01-scaffold-compaction-title-extension.sh
      Note: Creates proposed extension source
    - Path: ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction/scripts/02-smoke-test-compaction-title-extension.sh
      Note: Loads proposed extension through pi for smoke validation
ExternalSources: []
Summary: Repeatable implementation and validation steps for the proposed compaction-title extension.
LastUpdated: 2026-04-27T10:45:00-04:00
WhatFor: Use this when implementing or smoke-testing the compaction-title extension.
WhenToUse: Run after turning the design into source files or when validating a changed implementation.
---


# Implementation and test playbook

## Purpose

This playbook explains how to turn the `PI-EXT-COMPACTION-TITLE` design into an extension and validate that Pi can load it. It also describes manual checks for verifying that compaction-created session titles are stored correctly.

## Environment Assumptions

Required commands:

- `pi`
- `bash`
- `rg` for session JSONL inspection

Repository root:

```text
/home/manuel/code/wesen/2026-04-21--pi-extensions
```

Ticket workspace:

```text
/home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction
```

The scaffold script writes a proposed implementation to:

```text
/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts
```

## Commands

Go to the repository root:

```bash
cd /home/manuel/code/wesen/2026-04-21--pi-extensions
```

Create the proposed extension scaffold:

```bash
./ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction/scripts/01-scaffold-compaction-title-extension.sh
```

Smoke-test that Pi can load it:

```bash
./ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction/scripts/02-smoke-test-compaction-title-extension.sh
```

Expected output:

```text
No models matching "no-such-model"
PASS: compaction-title extension loaded successfully
```

Install for Pi auto-discovery:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title ~/.pi/agent/extensions/compaction-title
```

Reload Pi:

```text
/reload
```

Manually trigger compaction in a session:

```text
/compact Create a compact summary and a concise session title.
```

Inspect the extension state:

```text
/compaction-title
```

Inspect the session metadata from shell if needed:

```bash
rg '"type":"session_info"|compaction-title-state|"type":"compaction"' \
  ~/.pi/agent/sessions/--home-manuel-code-wesen-2026-04-21--pi-extensions--/*.jsonl
```

## Exit Criteria

The implementation is considered minimally validated when:

- Pi loads `extensions/compaction-title` with exit code 0;
- `/compaction-title` command is available after `/reload`;
- manual `/compact` succeeds;
- session title changes to a useful title after compaction;
- session JSONL contains a `session_info` entry with the generated title;
- session JSONL contains a compaction entry;
- if metadata persistence is enabled, session JSONL contains a `custom` entry with `customType: "compaction-title-state"`.

## Failure Modes

### Pi cannot import the extension

Run:

```bash
pi --no-session --no-extensions -e ./extensions/compaction-title --list-models no-such-model
```

Check stderr for TypeScript import errors. Common causes:

- wrong import path;
- missing export from `@mariozechner/pi-coding-agent`;
- using `complete` from the wrong package;
- syntax error in scaffolded code.

### Compaction still works but title is not set

Possible causes:

- model returned no `<session-title>` tag;
- title sanitizer removed all text;
- extension fell back to default compaction due to auth failure;
- current model has no API key available through `ctx.modelRegistry.getApiKeyAndHeaders()`.

Check `/compaction-title` and the Pi notifications.

### Compaction fails

The extension should catch model errors and return `undefined` to let default compaction run. If compaction fails hard, wrap the custom model call in `try/catch` and verify that the handler falls back to default compaction.

### Session title churns too much

Add or tighten prompt rules:

```text
If the existing title is still accurate, keep it exactly.
Only change the title when the session's true topic has changed or become much clearer.
```

Also consider adding modes: `off`, `suggest`, and `auto`.
