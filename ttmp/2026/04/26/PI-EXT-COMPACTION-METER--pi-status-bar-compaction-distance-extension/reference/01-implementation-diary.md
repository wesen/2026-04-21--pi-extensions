---
Title: Compaction meter implementation diary
Ticket: PI-EXT-COMPACTION-METER
Status: active
Topics:
    - pi-extensions
    - compaction
    - tokens
    - tooling
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: >
  Chronological implementation diary for the compaction-meter Pi extension.
LastUpdated: 2026-04-26T14:20:00-04:00
---

# Compaction meter implementation diary

## Step 1 - Ticket and design setup

Created ticket `PI-EXT-COMPACTION-METER` for a status-bar extension that shows how many tokens remain before Pi's automatic compaction threshold.

Research notes:

- `ExtensionContext.getContextUsage()` returns current usage as `{ tokens, contextWindow, percent }`.
- Pi's compaction threshold is `contextWindow - compaction.reserveTokens`.
- Default compaction settings from Pi docs/implementation are:
  - `enabled: true`
  - `reserveTokens: 16384`
  - `keepRecentTokens: 20000`
- Settings files are documented as:
  - global: `~/.pi/agent/settings.json`
  - project: `<cwd>/.pi/settings.json`
- `ExtensionContext` does not expose `SettingsManager`, so v1 will read documented settings files directly instead of deep-importing Pi internals.

Planned implementation files:

- `extensions/compaction-meter/settings.ts`
- `extensions/compaction-meter/meter.ts`
- `extensions/compaction-meter/index.ts`
- `extensions/compaction-meter/README.md`

## Step 2 - Implementation and smoke validation

Implemented `extensions/compaction-meter/` with a small three-module design:

- `settings.ts` reads documented Pi settings files and merges the `compaction` block with project settings overriding global settings.
- `meter.ts` computes `threshold = contextWindow - reserveTokens`, `remaining = threshold - tokens`, and formats both short status text and detailed diagnostics.
- `index.ts` wires Pi lifecycle events to `ctx.ui.setStatus("compaction-meter", ...)` and registers `/compact-meter` plus `/cm`.

Validation performed:

```bash
pi -e ./extensions/compaction-meter --no-session --no-tools -p "/compact-meter"
```

The command exited successfully, confirming the extension loads and the diagnostic command can run in print mode. Installed the extension for interactive Pi sessions via:

```bash
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-meter \
  ~/.pi/agent/extensions/compaction-meter
```

Known limitation recorded in the README: v1 reads global/project settings files, not command-line overrides, because `ExtensionContext` exposes context usage but not the effective `SettingsManager`.

## Step 3 - Interactive tmux validation

Started Pi in tmux with the extension symlink installed and ran `/compact-meter` interactively. Startup listed `compaction-meter` in the loaded extensions, and the footer/status bar showed:

```text
compact:184k left
```

The diagnostic command reported:

```text
Status: compact:184k left
Compaction enabled: yes
Current context tokens: 0
Context window: 200,000
Reserve tokens: 16,384
Compaction threshold: 183,616
Tokens until compaction: 183,616
Usage of compaction threshold: 0.0%
Usage of context window: 0.0%
```

This validates the core user-facing requirement: the status bar shows the token distance to automatic compaction.
