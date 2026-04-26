---
Title: Compaction meter implementation guide
Ticket: PI-EXT-COMPACTION-METER
Status: active
Topics:
    - pi-extensions
    - compaction
    - tokens
    - tooling
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: >
  Implementation guide for a Pi extension that shows remaining tokens before automatic compaction in the status bar.
LastUpdated: 2026-04-26T14:20:00-04:00
---

# Compaction meter implementation guide

## Executive Summary

Build a Pi extension named `compaction-meter` that displays the approximate number of tokens remaining before Pi's automatic compaction threshold is reached. The extension should use Pi's `ctx.getContextUsage()` API for current token usage, read the effective compaction reserve-token setting from global and project settings files, and publish a compact status-bar string through `ctx.ui.setStatus()`.

The user-facing status should answer one simple question while the agent is running:

> How far am I from compaction?

A typical status-bar value should look like:

```text
compact:42.1k left
```

When compaction is disabled, unknown, or already due, the status should make that explicit:

```text
compact:off
compact:? left
compact:due 1.2k over
```

## Problem Statement

Pi already has automatic context compaction. The relevant built-in rule is:

```text
compact when contextTokens > contextWindow - compaction.reserveTokens
```

The default `compaction.reserveTokens` is `16384`, and the model supplies the `contextWindow`. Pi exposes current usage through `ctx.getContextUsage()`, but the normal footer does not directly show "tokens until compaction" as a status item.

This makes long-running sessions harder to steer. The user may want to know whether a session has enough space for another large file read, whether a manual compaction is imminent, or whether a planned response might cross the threshold.

## Proposed Solution

Create `extensions/compaction-meter/` with three source files:

```text
extensions/compaction-meter/
├── index.ts    # Pi event handlers and slash commands
├── meter.ts    # arithmetic and formatting
├── settings.ts # effective compaction settings reader
└── README.md   # usage and limitations
```

The extension should:

1. Read global settings from `~/.pi/agent/settings.json`.
2. Read project settings from `<cwd>/.pi/settings.json`.
3. Merge only the `compaction` block, with project values overriding global values.
4. Use defaults when settings are absent:
   - `enabled: true`
   - `reserveTokens: 16384`
   - `keepRecentTokens: 20000`
5. Call `ctx.getContextUsage()` to get:
   - `tokens`
   - `contextWindow`
   - `percent`
6. Compute:

```text
threshold = max(0, contextWindow - reserveTokens)
remaining = threshold - tokens
```

7. Publish status under a stable key:

```typescript
ctx.ui.setStatus("compaction-meter", statusText)
```

8. Add diagnostic commands:
   - `/compact-meter`
   - `/cm`

## Design Decisions

### Use `ctx.getContextUsage()` as the source of truth for tokens

The extension should not parse session files or reimplement Pi's token estimation. Pi already exposes context usage in the extension context. That method returns `undefined` if usage is unavailable and `tokens: null` when usage is unknown.

### Read settings files instead of importing Pi internals

`ExtensionContext` does not currently expose `SettingsManager`. Deep-importing Pi's private `SettingsManager` would couple the extension to internal module layout. Reading the documented JSON settings files is simpler and compatible with the documented settings model.

This has one limitation: command-line setting overrides are not visible to this extension. The README should state that the meter follows global/project settings files.

### Status bar text should be short

The footer is shared with other extensions. The status string should fit in a narrow terminal. Detailed numbers belong in `/compact-meter`.

Recommended status strings:

| Condition | Status |
|---|---|
| Compaction disabled | `compact:off` |
| Usage unavailable | `compact:? left` |
| Remaining >= 0 | `compact:42.1k left` |
| Remaining < 0 | `compact:due 1.2k over` |

### Update opportunistically

The extension should update on events where context usage may have changed or the displayed model/settings may matter:

- `session_start`
- `model_select`
- `turn_start`
- `turn_end`
- `message_end`
- `session_compact`

`turn_end` and `message_end` are the most important because assistant usage is only accurate after a model response.

## Alternatives Considered

### Parse session files manually

Rejected. It duplicates Pi's own context assembly and token-estimation behavior.

### Import `SettingsManager` from Pi internals

Rejected for v1. It would provide exact merged settings, but it relies on internal package paths. The documented settings file locations are sufficient for this extension.

### Replace the entire footer

Rejected. Pi already offers `ctx.ui.setStatus()` for small status items. Replacing the footer would conflict with other extensions and create unnecessary UI ownership.

## Implementation Plan

1. Create `extensions/compaction-meter/settings.ts`.
   - Define defaults.
   - Read global/project JSON settings.
   - Merge `compaction` fields defensively.
2. Create `extensions/compaction-meter/meter.ts`.
   - Define `MeterSnapshot`.
   - Compute threshold and remaining tokens.
   - Format short status and detailed diagnostics.
3. Create `extensions/compaction-meter/index.ts`.
   - Maintain last snapshot and last settings warning.
   - Register event handlers to refresh the status bar.
   - Register `/compact-meter` and `/cm` commands.
4. Create `extensions/compaction-meter/README.md`.
5. Validate by loading Pi in print/no-session mode and invoking `/compact-meter`.
6. Install a symlink under `~/.pi/agent/extensions/compaction-meter` for interactive use.
7. Validate in tmux if possible.
8. Update docmgr tasks, changelog, and file relationships.

## Open Questions

- Should a future Pi API expose effective compaction settings directly on `ExtensionContext`?
- Should the meter optionally warn when under a configurable threshold, such as `< 10k left`?
- Should a future version render a custom footer segment with colors or progress bars?

## References

- Pi settings docs: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/settings.md`
- Pi extension types: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`
- Pi compaction implementation: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/compaction/compaction.js`
