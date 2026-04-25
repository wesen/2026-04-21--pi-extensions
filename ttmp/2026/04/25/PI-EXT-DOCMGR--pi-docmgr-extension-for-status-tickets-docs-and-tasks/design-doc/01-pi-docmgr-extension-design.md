---
Title: Pi docmgr extension design
Ticket: PI-EXT-DOCMGR
Status: active
Topics:
    - tooling
    - documentation
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
      Note: Pi extension lifecycle and UI/session APIs used by the proposed extension
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md
      Note: Pi TUI component and width-aware rendering guidance used by the screens
    - Path: ../../../../../../../../../.pi/agent/skills/docmgr/SKILL.md
      Note: Defines the docmgr CLI surface that this extension wraps
    - Path: ../../../../../../../../../.pi/agent/skills/docmgr/references/docmgr.md
      Note: Documents the ticket
ExternalSources: []
Summary: Architecture for a Pi extension that surfaces docmgr status, ticket/doc/task browsers, and a ticket close dialog.
LastUpdated: 2026-04-25T10:29:57.01622369-04:00
WhatFor: ""
WhenToUse: ""
---


# Pi docmgr extension design

## Executive Summary

This ticket defines the first slice of a Pi extension that makes `docmgr` visible and operable from inside Pi.

The initial scope is intentionally small:

1. show `docmgr` workspace status in the Pi status bar,
2. browse tickets and close a selected ticket from a dialog,
3. browse docs and open a rendered preview,
4. browse tasks and toggle checkboxes.

The extension is **not** trying to replace the full `docmgr` CLI. It is a thin Pi-native shell around the commands the workflow uses most often. The design keeps the CLI as the source of truth and uses structured output where possible so the extension does not depend on fragile human-formatted parsing.

## Problem Statement

`docmgr` already provides the workspace plumbing we want: ticket creation and listing, document addition and search, task bookkeeping, changelog updates, and validation. The problem is that the workflow still requires leaving Pi to inspect the current workspace, remember the current ticket, and run repetitive `docmgr` commands by hand.

For small iterative work, that breaks concentration. The user needs a quick way to answer questions such as:

- Which `ttmp` workspace is active?
- How many tickets are open right now?
- What was the last ticket I touched?
- Which docs exist for the current ticket?
- Which tasks are still open, and can I toggle them without dropping into the shell?

The requested extension should make those answers available without turning Pi into a general-purpose docs IDE.

## Scope

### In scope for v1

- Status bar showing:
  - configured `ttmp` root,
  - number of open tickets,
  - last manipulated ticket if known.
- Ticket browser:
  - list tickets,
  - select a ticket,
  - open a close dialog for the selected ticket.
- Docs browser:
  - list docs,
  - preview the selected doc.
- Tasks browser:
  - list tasks,
  - toggle checkboxes.

### Out of scope for v1

- Creating or renaming tickets.
- Editing doc frontmatter.
- Adding related files.
- Importing external sources.
- Generating docs from Pi session summaries.
- Full-text search UI.
- Graph visualization of related files.
- Direct SQLite export / API server integration.

Those features are good future candidates, but they would make the first slice larger than necessary.

## Current-State Analysis

`docmgr` exposes the underlying data we need through a small set of commands:

- `docmgr status --summary-only` prints the configured root and workspace counts.
- `docmgr ticket tickets` lists ticket workspaces with columns including ticket, title, status, topics, path, and last-updated time.
- `docmgr doc list` lists individual docs with ticket, doc type, title, status, topics, path, and last-updated time.
- `docmgr task list` lists checkbox tasks from a ticket’s `tasks.md` file.
- `docmgr ticket close` updates status, optionally intent, and appends a changelog entry.

The skill docs also show that `docmgr` supports structured output via `--with-glaze-output`, which is important for an extension. That means the extension can prefer JSON or CSV-style structured output instead of scraping terminal formatting.

On the Pi side, the extension APIs already provide the primitives needed for this UI:

- `ctx.ui.setStatus()` for a footer/status-bar indicator.
- `ctx.ui.setWidget()` or `ctx.ui.custom()` for persistent or modal UI.
- `ctx.ui.confirm()` and `ctx.ui.select()` for simple dialogs.
- `ctx.sessionManager.getSessionId()` / `getSessionFile()` for session-scoped state.
- `ctx.sessionManager.appendCustomEntry()` for metadata that should persist but not enter the model context.

The combination is enough to build a Pi-native docmgr dashboard without touching the docmgr internals.

## Proposed Solution

### High-level architecture

The extension should be split into three layers:

1. **Adapter layer**
   - Runs `docmgr` commands.
   - Parses structured output.
   - Normalizes results into a small TypeScript model.

2. **State layer**
   - Keeps the current workspace snapshot.
   - Persists the last manipulated ticket and UI preferences in custom session entries.
   - Refreshes the snapshot on startup and after successful actions.

3. **UI layer**
   - Renders the status bar.
   - Opens ticket, docs, and tasks browsers.
   - Opens the close dialog.
   - Updates status after each successful operation.

### Suggested file layout

```text
extensions/docmgr/
├── index.ts
├── docmgr-cli.ts
├── state.ts
├── models.ts
└── ui/
    ├── status-bar.ts
    ├── ticket-browser.ts
    ├── ticket-close-dialog.ts
    ├── docs-browser.ts
    └── task-browser.ts
```

### Data model

```ts
type DocmgrWorkspaceSnapshot = {
  root: string;
  openTicketCount: number;
  lastManipulatedTicket?: {
    ticket: string;
    title?: string;
    action: "listed" | "closed" | "docs-opened" | "tasks-toggled";
    timestamp: number;
  };
};

type TicketRecord = {
  ticket: string;
  title: string;
  status: string;
  topics: string[];
  path: string;
  lastUpdated?: string;
};

type DocRecord = {
  ticket: string;
  docType: string;
  title: string;
  status: string;
  path: string;
};

type TaskRecord = {
  index: number;
  checked: boolean;
  text: string;
};
```

### Metadata persistence

The extension should persist only the minimal session-scoped metadata needed to restore the UI state:

- configured `ttmp` root,
- the last manipulated ticket,
- the last selected ticket/doc/task filter,
- the last open browser panel.

This fits Pi’s `appendCustomEntry(customType, data?)` model well. The metadata is stored in the session, not in the conversation context, so it survives reloads but does not consume prompt tokens.

## UI Design

### 1) Status bar

The status bar should be short and stable. It is not a log; it is a glanceable summary.

**Example:**

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ docmgr  root: ttmp  open tickets: 4  last: PI-EXT-DOCMGR (closed 2m ago)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

A more compact single-line footer variant is also acceptable if the terminal width is tight:

```text
docmgr · root ttmp · open 4 · last PI-EXT-DOCMGR
```

The important constraint is that the status must remain width-safe and never wrap into the editor.

### 2) Ticket browser + close dialog

The ticket browser is a selector list with a short metadata preview for the selected ticket.

**Ticket browser mockup:**

```text
┌ Tickets ────────────────────────────────────────────────────────────────────┐
│ ▸ PI-EXT-DOCMGR     active   Pi docmgr extension for status...             │
│   PI-EXT-SESSION    review   Session summary widget                         │
│   PI-EXT-TOOLS      draft    Tooling and command surface                    │
│                                                                             │
│ ↑↓ select  Enter open  c close  d docs  t tasks  Esc back                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

Selecting `c` on a ticket opens the close dialog.

**Close dialog mockup:**

```text
┌ Close ticket ───────────────────────────────────────────────────────────────┐
│ Ticket: PI-EXT-DOCMGR                                                      │
│ Status:  complete                                                          │
│ Intent:  long-term                                                         │
│ Note:    Ticket closed from Pi                                             │
│                                                                            │
│ [ ] Update intent                                                         │
│ [x] Append changelog entry                                                 │
│                                                                            │
│          Cancel                          Close ticket                      │
└────────────────────────────────────────────────────────────────────────────┘
```

The first version can keep the close dialog simple: default to `complete`, add a changelog entry, and confirm before running `docmgr ticket close`.

### 3) Docs browser + preview

The docs browser should list docs for the current ticket or the workspace-wide view, depending on the selected scope.

**Docs browser mockup:**

```text
┌ Docs ───────────────────────────────────────────────────────────────────────┐
│ ▸ design-doc   Pi docmgr extension design                                  │
│   playbook     Pi docmgr extension implementation guide                    │
│   reference    Diary                                                       │
│                                                                            │
│ Preview                                                                    │
│ # Pi docmgr extension design                                              │
│                                                                            │
│ ## Executive Summary                                                       │
│ This ticket defines the first slice...                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

The preview pane should render markdown or plain text. The first cut does not need a full WYSIWYG editor. The main goal is to avoid leaving Pi just to read a doc.

### 4) Tasks browser

The tasks browser should list tasks from `tasks.md` and allow toggling checkboxes.

**Tasks browser mockup:**

```text
┌ Tasks ───────────────────────────────────────────────────────────────────────┐
│ [ ] Show docmgr status in footer                                            │
│ [ ] Ticket list + close dialog                                              │
│ [ ] Docs list + preview                                                     │
│ [x] Tasks list + toggle                                                     │
│                                                                            │
│ Space/Enter toggle  q back  r refresh                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

## Design Decisions

1. **Structured output first**
   - Prefer `docmgr --with-glaze-output` where available.
   - Avoid brittle parsing of human-formatted tables if there is a machine-readable option.

2. **Keep the last manipulated ticket in session metadata**
   - This gives the status bar a reliable “last touched” value.
   - It also survives Pi reloads and session forks when the workspace state is carried forward.

3. **Use the CLI as the source of truth**
   - The extension should not duplicate workspace logic.
   - It should only orchestrate, parse, and present.

4. **Keep the first release shallow**
   - Browsers list and preview, but do not edit content in place.
   - Close dialog is confirm-driven, not a large form wizard.
   - This keeps the initial surface small and testable.

5. **Persist only session-local state**
   - The extension should not invent a second database.
   - `appendCustomEntry()` is enough for the metadata we need.

## Alternatives Considered

### Parse human-readable docmgr output

Rejected for the first slice. Human output is fine for a terminal, but structured output is safer for an extension.

### Use a docmgr API server

Rejected for v1 because the CLI already exposes what we need and would add deployment complexity.

### Build a full editor inside Pi for docmgr docs

Rejected for v1 because the requested features are browse-and-toggle oriented, not editing-oriented.

### Store state only in memory

Rejected because the status bar needs to remember the last manipulated ticket across reloads and session restarts.

## Implementation Plan

### Phase 1 — Shared adapter and status bar

- Add a small `docmgr` command runner.
- Normalize `status`, `ticket list`, `doc list`, and `task list` responses.
- Render the footer/status bar.
- Persist the last manipulated ticket in session metadata.

### Phase 2 — Ticket browser and close dialog

- Show ticket list.
- Add keyboard shortcuts for close.
- Run `docmgr ticket close` after confirmation.
- Refresh the snapshot and status bar after success.

### Phase 3 — Docs browser and preview

- Show docs for a ticket.
- Render the selected doc preview.
- Add basic open/refresh behavior.

### Phase 4 — Tasks browser and toggle flow

- Show checkbox tasks.
- Toggle with space/enter.
- Refresh the ticket snapshot after a successful toggle.

### Phase 5 — Polish and failure handling

- Empty-state screens.
- Command errors and retry affordances.
- Width testing for small terminals.
- Keybinding hints.

## Testing Strategy

### Command-level tests

- Adapter returns parsed snapshots for sample `docmgr` outputs.
- Ticket list parsing handles titles with spaces.
- Tasks parsing preserves checkbox state.
- Close-dialog flow builds the expected command arguments.

### UI tests

- Status bar renders within narrow widths.
- Ticket browser selection fits in 80-column and 120-column terminals.
- Docs preview truncates safely.
- Tasks toggling updates the visible state.

### Manual validation

- Confirm the footer shows the right root and open-ticket count.
- Confirm the last manipulated ticket survives reload.
- Open a ticket, close it, and verify the changelog entry appears.
- Open a doc and confirm the preview matches the file content.
- Toggle a task and confirm `tasks.md` updates.

## Risks

1. **Parsing drift**
   - Mitigation: prefer structured output and keep human-output parsing as a fallback only.

2. **Multi-terminal width issues**
   - Mitigation: every screen must be width-aware and truncated safely.

3. **Session metadata staleness after forks**
   - Mitigation: refresh the status snapshot on `session_start` and record the current session id along with the last manipulated ticket.

4. **Over-scoping the first release**
   - Mitigation: keep v1 limited to browse/close/view/toggle, not editing or importing.

## Open Questions

1. Should the ticket browser default to all tickets or only active tickets?
2. Should the docs browser default to the current ticket or a workspace-wide list?
3. Should task toggles update `tasks.md` directly or queue a command-like action for confirmation?
4. Should the close dialog allow editing the changelog note, or is the default note enough for v1?

## References

- `/home/manuel/.pi/agent/skills/docmgr/SKILL.md`
- `/home/manuel/.pi/agent/skills/docmgr/references/docmgr.md`
- `/home/manuel/.pi/agent/skills/ticket-research-docmgr-remarkable/SKILL.md`
- `/home/manuel/.pi/agent/skills/remarkable-upload/SKILL.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
- `ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/reference/01-diary.md`
