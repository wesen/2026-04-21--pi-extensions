---
Title: Cache Trace Extension Design and Implementation Guide
Ticket: PI-EXT-CACHE-TRACE
Status: active
Topics:
    - pi-extensions
    - tokens
    - tui
    - agent
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: docs/pi-shared-extension-framework-guide.md
      Note: Repository extension framework guidance
    - Path: docs/pi-shared-extension-framework-guide.md:Repository-specific guide for registerPiExtension, actions, docs, widgets, and palette items.
    - Path: docs/pi-tui-ui-authoring-guide.md
      Note: TUI component guidance
    - Path: docs/pi-tui-ui-authoring-guide.md:Repository-specific guide for custom Pi TUI overlays and rendering constraints.
    - Path: extensions/_shared/registry.ts:Shared extension contribution contract used by every extension.
    - Path: extensions/cache-trace/index.ts
      Note: Extension registration
    - Path: extensions/cache-trace/index.ts:Extension registration, hooks, commands, timeline cards, and status widget.
    - Path: extensions/cache-trace/plot.ts
      Note: Local ASCII plotting helper
    - Path: extensions/cache-trace/plot.ts:Small local ASCII plotting helper used by the modal.
    - Path: extensions/cache-trace/state.ts
      Note: Cache trace state
    - Path: extensions/cache-trace/state.ts:Cache trace data model, event normalization, persistence reconstruction, and cache-event classification.
    - Path: extensions/cache-trace/ui.ts
      Note: Interactive TUI modal for cache plots and query
    - Path: extensions/cache-trace/ui.ts:Interactive modal for plots, record browsing, request inspection, and filtering.
ExternalSources:
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md:Pi extension lifecycle hooks, provider hooks, message renderers, and command APIs.
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md:Session entry and AssistantMessage usage schema.
Summary: Design and implementation guide for Cache Trace, a Pi extension that records LLM cache usage snapshots, displays timeline cards, and opens an ASCII plot/query modal.
LastUpdated: 2026-05-30T12:20:00-04:00
WhatFor: Use when maintaining or extending Cache Trace, or when learning how Pi lifecycle hooks expose cache usage and provider-request behavior.
WhenToUse: Before modifying extensions/cache-trace, adding provider-specific cache analysis, changing its UI, or debugging cache hits/misses in Pi sessions.
---


# Cache Trace Extension Design and Implementation Guide

## Executive Summary

Cache Trace is a Pi extension that makes LLM prompt-cache behavior visible while a coding session runs. After each finalized assistant LLM call, it records normalized usage (`input`, `output`, `cacheRead`, `cacheWrite`, total cost), provider-request counts, tool counts, context-window usage, and a best-effort cache classification. It then adds a concise timeline card and updates a status widget. A slash command opens a TUI modal with ASCII plots and searchable records.

The first implementation is in `extensions/cache-trace/` and was committed as `823a3ef8bf6a77c9c38cc628b3a3103d9beefe14` (`Add cache trace extension`). The extension is intentionally conservative: it does not modify context or provider payloads, and it treats cache clears/misses as inferences because Pi only receives normalized provider usage after a response is complete.

## Problem Statement and Scope

The user wants to understand how provider prompt caching behaves inside Pi sessions:

- when cache hits and misses happen,
- when cache clears appear after compaction, retries, or context changes,
- whether a stable prefix survives multiple retries or tool-use loops,
- how many LLM calls happen inside one user-facing response,
- how many provider HTTP requests happen before one assistant message,
- how cache reads/writes evolve over time.

Pi already shows aggregate token/cache usage in the footer, but that view is not a timeline and does not explain per-call behavior. Cache Trace fills that gap by recording per-assistant-message snapshots and provider-request counts.

Out of scope for v1:

- exact provider-internal cache key inspection,
- exact failed retry usage if the provider never reports it,
- modifying provider payloads to force cache behavior,
- heavy external chart dependencies.

## Current-State Architecture Evidence

### Shared extension framework

All local extensions must register through `registerPiExtension()`. The shared registry contract defines actions, docs, settings, widgets, and palette contributions in `extensions/_shared/registry.ts` lines 17-153. This matters because Cache Trace must be discoverable through `/px`, the command palette, and dashboard/status widgets rather than being only a slash command.

Relevant observed contract:

```ts
// extensions/_shared/registry.ts
export interface PiExtensionAction { id: string; title: string; run: PiExtensionActionHandler; }
export interface PiExtensionDoc { id: string; title: string; path?: string; markdown?: string; }
export interface PiDashboardWidget { id: string; title: string; render(...): PiDashboardRendered; }
```

The compaction-meter extension demonstrates the expected pattern: it registers metadata and widgets at lines 40-74, then updates status on session/model/turn/message/compaction events at lines 76-98. Cache Trace follows the same ambient-widget pattern.

### Pi lifecycle hooks relevant to cache behavior

The Pi extension API exposes the hooks needed for this feature:

```text
agent_start        start grouping one user-facing agent run
turn_start         know the current assistant turn index
before_provider_request  count provider requests and inspect payload shape
after_provider_response  record HTTP status and response headers
message_end        read finalized assistant usage
session_compact    mark possible post-compaction cache clear
tool_execution_end count tools inside the agent run
```

The Pi docs state that `message_end` fires for finalized user, assistant, and toolResult messages and may replace a message. We only observe assistant messages and do not replace them. The docs also state that `before_provider_request` is mainly useful for debugging provider serialization and cache behavior, which is exactly this extension's use case.

### Usage schema

The session-format docs define `AssistantMessage.usage` as:

```ts
interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}
```

Cache Trace stores only the normalized scalar fields it needs. This avoids coupling the UI to provider-specific raw response shapes.

### Existing TUI patterns

The TUI authoring guide says custom components should implement:

```ts
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  invalidate(): void;
}
```

`extensions/session-search/ui.ts` lines 36-117 show a local example of a modal component with state, cached render lines, filtering, and synchronous scans. Cache Trace uses the same style: one component owns tab state, query text, selection, scrolling, and render caches.

### Session persistence

The session-manager type docs define `CustomEntry` as an extension-specific entry that does not participate in LLM context. Cache Trace appends one `custom` entry per snapshot so records can be reconstructed on reload. It also emits visible custom messages for timeline display; those are intentionally short because Pi custom messages participate in context.

## Gap Analysis

| Requested capability | Existing behavior before this ticket | Cache Trace behavior |
| --- | --- | --- |
| Timeline result after each LLM call | Footer aggregate only; no per-call card | `message_end` sends a compact custom-rendered card |
| See cache hits/misses/clears | Manual inference from aggregate usage | Classifies `hit`, `miss`, `write-only`, `clear-suspected`, `unknown` |
| Plot cache behavior | No extension-specific chart | Modal renders local ASCII plots and sparklines |
| Query cache behavior | No cache-specific search | Modal filter searches record id/provider/model/event/notes |
| Count LLM calls in one response | Not obvious in UI | `agentRunId.callIndexInAgent` groups assistant calls by agent run |
| Count provider retry/request behavior | Not visible | `before_provider_request` and `after_provider_response` are counted |
| Persist trace across reload | Not available | Custom session entries store snapshots outside LLM context |

## Proposed Architecture

```text
Pi runtime
  ├─ lifecycle hooks
  │   ├─ before_provider_request ─┐
  │   ├─ after_provider_response ─┼─> CacheTraceState
  │   ├─ tool_execution_end ──────┤
  │   ├─ session_compact ─────────┤
  │   └─ message_end(assistant) ──┘
  │                                  ├─ append custom persistence entry
  │                                  ├─ send compact timeline custom message
  │                                  └─ update status widget
  └─ user command `/cache-trace`
       └─ CacheTraceOverlay
            ├─ overview plot
            ├─ record table
            ├─ provider request/response table
            └─ help/limitations
```

### File-level responsibilities

- `extensions/cache-trace/index.ts`
  - extension registration,
  - slash commands and palette actions,
  - lifecycle hook wiring,
  - custom message renderer,
  - timeline card emission,
  - status widget updates.

- `extensions/cache-trace/state.ts`
  - `CacheTraceRecord`, provider request/response record types,
  - normalization of `AssistantMessage.usage`,
  - cache-event classification,
  - session reload reconstruction from custom entries,
  - concise snapshot formatting.

- `extensions/cache-trace/ui.ts`
  - interactive modal component,
  - tabs (`overview`, `records`, `requests`, `help`),
  - filtering and selection state,
  - ANSI-width-safe layout.

- `extensions/cache-trace/plot.ts`
  - small local ASCII plotting library,
  - sparkline rendering,
  - sampled multi-series line/scatter plot rendering,
  - fixed-width row padding helpers.

- `extensions/cache-trace/README.md`
  - user-facing command and key reference registered in `/px` docs.

## Data Model

```ts
interface CacheTraceRecord {
  id: number;
  timestamp: number;
  agentRunId: number;
  turnIndex: number | null;
  callIndexInAgent: number;
  provider: string;
  model: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    costTotal: number;
  };
  contextTokens: number | null;
  contextPercent: number | null;
  providerRequestCount: number;
  providerResponseCount: number;
  toolResultCount: number;
  cacheEvent: "hit" | "miss" | "write-only" | "clear-suspected" | "unknown";
  notes: string[];
}
```

Important invariants:

- `agentRunId` increments on `agent_start`.
- `callIndexInAgent` increments on each assistant `message_end` with usage.
- `providerRequestCount` is the delta of provider requests since the last assistant snapshot.
- A `custom` session entry persists the full record.
- A visible custom message stores an empty content string and puts the record in `details`, so the renderer can show the card without adding cache text to LLM context.

## Cache Classification Rules

The classification is intentionally a heuristic. It does not claim to know provider cache internals.

```text
if cacheRead > 0:
  event = hit
else if cacheWrite > 0:
  event = write-only
else if previous cacheRead > 0:
  event = clear-suspected
else:
  event = miss

if session_compact happened since previous snapshot and cacheRead == 0:
  event = clear-suspected
```

Interpretation guidance for interns:

- `hit` means the provider reported cache-read tokens.
- `write-only` means the provider wrote cacheable prompt tokens but did not report a read.
- `miss` means no cache-read/write tokens were reported.
- `clear-suspected` means the extension saw a drop from a previous hit to zero, or compaction happened before the next zero-read snapshot.
- `providerRequestCount > 1` means Pi attempted more than one provider request before one assistant message; this can indicate retries or provider-level replay behavior.

## Runtime Flow Pseudocode

### Startup/reload

```ts
on session_start(ctx):
  for entry in ctx.sessionManager.getEntries():
    if entry.type == "custom" and entry.customType == "cache-trace-event":
      state.records.push(entry.data)
  updateStatus(latestRecord)
```

### Provider request/response observation

```ts
on before_provider_request(event):
  state.requestIndexInAgent += 1
  state.providerRequests.push({
    timestamp: now(),
    agentRunId,
    turnIndex,
    payloadKind: typeof event.payload,
    messageCount: event.payload.messages?.length,
    toolCount: event.payload.tools?.length,
  })

on after_provider_response(event):
  state.providerResponses.push({ status: event.status, headers: event.headers })
```

### Assistant snapshot

```ts
on message_end(event, ctx):
  if event.message.role != "assistant" or !event.message.usage:
    return

  record = normalizeUsageAndClassify(event.message.usage)
  pi.appendEntry("cache-trace-event", record)
  enqueueTimelineMessageWhenIdle({ content: "", details: record })
  ctx.ui.setStatus("cache-trace", formatStatus(record))
```

### Modal opening

```ts
command /cache-trace:
  if no interactive UI:
    notify(text report)
  else:
    ctx.ui.custom((tui, theme, _, done) => new CacheTraceOverlay({ tui, theme, state, done }))
```

## ASCII Plotting Design

The user asked for a nice ASCII plotting library. Because this repository has no package manifest and existing extensions avoid local npm dependencies, v1 uses a small local plotting module with a library-like API:

```ts
sparkline(values, width): string
plotSeries([{ label, values, marker }], { width, height }): string[]
cacheTracePlot(records, width, height): string[]
```

This avoids dependency installation while keeping plotting code isolated. If the repo later gains package management, `plot.ts` can be swapped for an external package such as `asciichart` behind the same functions.

## API References

### `registerPiExtension()`

Cache Trace contributes:

- `run`: default action opens the modal.
- `actions`: open, status, clear.
- `palette`: fast open/status actions.
- `docs`: `extensions/cache-trace/README.md`.
- `widgets`: status bar summary.

### `pi.registerCommand()`

Commands:

```text
/cache-trace          open modal
/cache-trace status   show latest text report
/cache-trace clear    clear in-memory records
/ct-cache             alias
```

### `pi.registerMessageRenderer()`

Custom renderer type:

```ts
const CACHE_TRACE_CUSTOM_TYPE = "cache-trace-snapshot";
```

The renderer displays a concise timeline card. In expanded mode it adds notes.

### `pi.appendEntry()`

Persistence type:

```ts
const CACHE_TRACE_ENTRY_TYPE = "cache-trace-event";
```

These entries do not participate in LLM context and are used to reconstruct state after reload.

## Implementation Phases

### Phase 1 — Ticket and analysis

- Create docmgr ticket `PI-EXT-CACHE-TRACE`.
- Read repository extension/TUI guides.
- Inspect relevant existing extensions (`compaction-meter`, `session-summary`, `session-search`, `markdown-recent-viewer`).
- Read Pi extension/session API references.

### Phase 2 — Core extension

- Create `extensions/cache-trace/`.
- Register with the shared framework.
- Add provider/message/tool/agent lifecycle hooks.
- Normalize assistant usage and provider request counts.
- Emit status widget and timeline card.
- Persist records as custom entries.

### Phase 3 — Modal and plots

- Add local ASCII plotting helpers.
- Add a custom TUI modal with tabs.
- Implement record filtering, selection, and provider request/response inspection.
- Keep all rows width-safe with `truncateToWidth()` and visible-width padding.

### Phase 4 — Validation and delivery

- Run `timeout 20 pi -e ./extensions/cache-trace --list-models`.
- Run `timeout 20 pi --list-models` to ensure all extensions still load.
- Run an interactive tmux smoke test.
- Update docmgr tasks, changelog, diary, and relations.
- Upload design bundle to reMarkable.

## Testing Strategy

### Automated load checks

```bash
timeout 20 pi -e ./extensions/cache-trace --list-models
timeout 20 pi --list-models
```

These catch TypeScript/runtime import failures during extension loading.

### Interactive tmux smoke test

```bash
tmux new-session -d -s cache-trace-smoke \
  'cd /home/manuel/code/wesen/2026-04-21--pi-extensions && pi -e ./extensions/cache-trace'
tmux attach -t cache-trace-smoke
```

Manual steps:

1. Send a tiny prompt such as `say ok`.
2. Confirm a Cache Trace timeline card appears after the assistant response.
3. Send a second prompt and confirm a second snapshot appears.
4. Run `/cache-trace`.
5. Verify tabs, plot, filter, records table, and request table render.
6. Run `/cache-trace status`.
7. Run `/cache-trace clear` and verify status changes.

### Code review checklist

- `message_end` must ignore non-assistant messages.
- Provider request deltas must reset after each snapshot.
- Custom timeline cards should keep `content: ""` and render from `details` metadata so they do not add cache text to future LLM context.
- Timeline cards must be sent only after `ctx.isIdle()` is true; sending a custom message while streaming steers/follows up into the active agent and can create feedback turns.
- The modal must not return lines wider than the terminal width.
- The extension must not mutate provider payloads or messages.
- `registerPiExtension({ docs: [{ path: "extensions/cache-trace/README.md" }] })` uses a relative path.

## Risks and Tradeoffs

### Visible custom messages can affect future context

Pi custom messages participate in LLM context through their `content` field. Cache Trace mitigates this by storing the visible card payload in `details` metadata and setting `content` to an empty string. The renderer reads `details`, while the LLM context receives no cache text from the card. Future work should still prefer a first-class non-context transcript card API if Pi adds one.

### Cache clears are inferred

No provider exposes a universal “cache cleared” event through Pi. The extension labels likely clears based on reported cache-read drops and compaction events. These are useful operational signals, not proof.

### Retry usage may be aggregated

Pi normalizes usage on the final assistant message. Provider-request hooks reveal request counts and statuses, but not always usage for failed retries. The modal therefore says “retry or multi-request behavior” rather than claiming exact retry token costs.

### Plotting is local, not external

The local plot helper keeps the repo dependency-free. If a package manifest is added, an external chart library can replace `plot.ts` without changing the modal contract.

## Alternatives Considered

1. **Only status-bar display.** Rejected because the user explicitly asked for timeline records and queryable plots.
2. **Only scanning session history after the fact.** Rejected because provider-request hooks and retry counts are runtime-only unless explicitly persisted.
3. **Full provider payload diffing.** Deferred because payloads can be large and may contain sensitive prompt content. V1 records counts and shape, not payload content.
4. **External plotting dependency.** Deferred because this repository currently has no package manifest; adding one would be disproportionate for the first implementation.

## Open Questions

- Should Cache Trace cards be hidden from LLM context if Pi gains a non-context visible message API?
- Which providers expose useful cache headers that should be parsed in `after_provider_response`?
- Should the extension add export commands (`json`, `csv`, `markdown`) for offline analysis?
- Should record retention be user-configurable via schema settings?

## References

- `extensions/cache-trace/index.ts`
- `extensions/cache-trace/state.ts`
- `extensions/cache-trace/ui.ts`
- `extensions/cache-trace/plot.ts`
- `extensions/cache-trace/README.md`
- `extensions/_shared/registry.ts`
- `docs/pi-shared-extension-framework-guide.md`
- `docs/pi-tui-ui-authoring-guide.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md`
