---
Title: Investigation diary
Ticket: PI-EXT-SHUTDOWN-REPORT
Status: active
Topics:
    - pi-extensions
    - documentation
    - tooling
    - agent
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/auto-commit-on-exit.ts
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/shutdown-command.ts
ExternalSources: []
Summary: "Chronological notes for shutdown-report extension analysis."
LastUpdated: 2026-04-27T11:10:00-04:00
WhatFor: "Use this to resume the shutdown-report extension design."
WhenToUse: "Read before implementing exit hooks, finish commands, or report generation."
---

# Investigation diary

## Goal

Analyze whether Pi can run hooks on session exit and design an extension that checks whether a session summary/project report exists, then asks or auto-generates one.

## Context

The user asked whether hooks can be added on exit, and then requested a new docmgr ticket with a detailed intern-facing design and implementation guide plus reMarkable upload.

## Timeline

### 2026-04-27 — Ticket creation

Created:

```bash
docmgr ticket create-ticket \
  --ticket PI-EXT-SHUTDOWN-REPORT \
  --title "Pi extension for session shutdown summary and report generation" \
  --topics pi-extensions,documentation,tooling,agent
```

Workspace:

```text
ttmp/2026/04/27/PI-EXT-SHUTDOWN-REPORT--pi-extension-for-session-shutdown-summary-and-report-generation
```

### 2026-04-27 — API review

Reviewed Pi extension docs and examples:

```text
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/auto-commit-on-exit.ts
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/shutdown-command.ts
```

Findings:

- `session_shutdown` exists and can run async cleanup before runtime teardown.
- `session_shutdown` receives `reason: "quit" | "reload" | "new" | "resume" | "fork"`.
- `session_shutdown` is not cancellable.
- `session_before_switch` is cancellable and should be used for interactive prompts before `/new` or `/resume`.
- Explicit commands can call `ctx.shutdown()` after completing report generation.

### 2026-04-27 — Design conclusion

The extension is feasible, but should not rely only on prompting inside `session_shutdown`. The recommended design is a hybrid:

1. `/finish-session` — explicit, safe, interactive flow.
2. `session_before_switch` — cancellable guard for `/new` and `/resume`.
3. `session_shutdown` — best-effort auto-generation or metadata recording.

## Quick Reference

Important event hooks:

```typescript
pi.on("session_shutdown", async (event, ctx) => {
  // best-effort cleanup/reporting; cannot cancel
});

pi.on("session_before_switch", async (event, ctx) => {
  // can prompt and return { cancel: true }
});
```

Important command API:

```typescript
pi.registerCommand("finish-session", {
  handler: async (_args, ctx) => {
    await ctx.waitForIdle();
    await generateReportIfNeeded(ctx);
    ctx.shutdown();
  },
});
```

State marker:

```typescript
pi.appendEntry("shutdown-report-state", {
  generatedAt,
  reportPath,
  mode,
});
```

## Usage Examples

Proposed user flow:

```text
/finish-session
```

Expected behavior:

1. extension checks whether a report exists;
2. if missing, asks what to generate;
3. writes Markdown report;
4. stores metadata;
5. exits Pi.

Proposed switch guard:

```text
/new
```

Expected behavior in `ask` mode:

1. extension checks report state;
2. if no report exists, asks whether to generate, skip, or cancel;
3. returns `{ cancel: true }` if the user chooses cancel.

## Related

- Design guide: `design/01-analysis-design-and-implementation-guide.md`
- Playbook: `playbook/01-implementation-and-test-playbook.md`
