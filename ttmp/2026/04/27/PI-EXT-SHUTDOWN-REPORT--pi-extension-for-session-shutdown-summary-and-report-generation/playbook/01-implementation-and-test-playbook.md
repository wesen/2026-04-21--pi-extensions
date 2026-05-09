---
Title: Implementation and test playbook
Ticket: PI-EXT-SHUTDOWN-REPORT
Status: active
Topics:
    - pi-extensions
    - documentation
    - tooling
    - agent
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ttmp/2026/04/27/PI-EXT-SHUTDOWN-REPORT--pi-extension-for-session-shutdown-summary-and-report-generation/scripts/01-scaffold-shutdown-report-extension.sh
      Note: Creates proposed shutdown-report extension
    - Path: ttmp/2026/04/27/PI-EXT-SHUTDOWN-REPORT--pi-extension-for-session-shutdown-summary-and-report-generation/scripts/02-smoke-test-shutdown-report-extension.sh
      Note: Smoke-tests extension loading
ExternalSources: []
Summary: Repeatable implementation and validation plan for a shutdown-report Pi extension.
LastUpdated: 2026-04-27T11:10:00-04:00
WhatFor: Use this when implementing and testing the shutdown-report extension.
WhenToUse: Run when source files exist under extensions/shutdown-report.
---


# Implementation and test playbook

## Purpose

This playbook describes how to implement and validate a Pi extension that generates a shutdown summary/report before finishing or switching sessions.

## Environment Assumptions

Repository root:

```text
/home/manuel/code/wesen/2026-04-21--pi-extensions
```

Proposed extension path:

```text
extensions/shutdown-report
```

Required commands:

- `pi`
- `bash`
- `rg`

## Commands

Create the extension directory:

```bash
cd /home/manuel/code/wesen/2026-04-21--pi-extensions
mkdir -p extensions/shutdown-report
```

After implementation, smoke-test extension loading:

```bash
pi --no-session --no-extensions -e ./extensions/shutdown-report --list-models no-such-model
```

Expected output:

```text
No models matching "no-such-model"
```

Install for auto-discovery:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/shutdown-report ~/.pi/agent/extensions/shutdown-report
```

Reload Pi:

```text
/reload
```

Check state:

```text
/shutdown-report
```

Generate a report immediately:

```text
/shutdown-report-now
```

Expected:

- a Markdown file appears under `.pi/shutdown-reports/`;
- `/shutdown-report` shows a report path and generated timestamp;
- session JSONL contains `customType: "shutdown-report-state"`.

Test guided finish flow:

```text
/finish-session
```

Expected:

- waits for idle;
- asks if no report exists;
- generates selected artifact;
- calls `ctx.shutdown()`.

Test cancellable switch guard:

```text
/new
```

Expected in `ask` mode:

- user is prompted if no report exists;
- choosing cancel prevents the switch.

Inspect persisted state:

```bash
rg 'shutdown-report-state|shutdown report|session_shutdown' \
  ~/.pi/agent/sessions/--home-manuel-code-wesen-2026-04-21--pi-extensions--/*.jsonl
```

## Exit Criteria

The extension is ready when:

- Pi loads it with exit code 0;
- `/shutdown-report` shows state;
- `/shutdown-report-now` writes a Markdown report;
- report metadata is stored in the session;
- `/finish-session` generates missing reports before shutdown;
- `/new` can be cancelled if the user chooses not to leave without a report;
- `session_shutdown` does not block reloads or surprise the user.

## Failure Modes

### Prompt appears during reload

Ignore `event.reason === "reload"` in `session_shutdown`.

### User cannot cancel exit

That is expected for `session_shutdown`. Use `/finish-session` and `session_before_switch` for cancellable flows.

### No UI available

If `ctx.hasUI` is false, do not prompt. Use the configured mode:

- `off`: do nothing;
- `auto-summary`: write minimal summary;
- `ask`: record missing report metadata only.

### Duplicate reports

Check `state.reportGenerated` and `state.reportPath` before writing a new report. Offer `/shutdown-report-now --force` later if overwrite/regeneration is needed.
