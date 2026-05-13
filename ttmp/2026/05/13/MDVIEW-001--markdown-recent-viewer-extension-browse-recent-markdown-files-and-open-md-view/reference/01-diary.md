---
Title: Diary
Ticket: MDVIEW-001
Status: active
Topics:
    - pi-extension
    - markdown
    - tui
    - tools
    - md-view
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Implementation diary for the markdown recent viewer extension"
LastUpdated: 2026-05-13T00:00:00-04:00
WhatFor: "Track design and implementation of markdown-recent-viewer"
WhenToUse: "Read before resuming MDVIEW-001"
---

# Diary

## Goal

Track the design and implementation of a Pi extension that lists recently edited Markdown files and opens the selected file with `md-view view`.

## Step 1: Ticket creation and design

Created ticket MDVIEW-001 and wrote the initial design for the Markdown Recent Viewer extension. The design uses the shared extension framework and a focused TUI picker overlay.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to create an extension (using our framework) to:

-> display a list of recently edited / written markdown files and when selecting one and pressing enter, using `md-view view ...` to open a viewer."

**Assistant interpretation:** Create ticket infrastructure and an implementation design for a Pi extension that scans recent Markdown files, shows them in an interactive picker, and opens the selected file with `md-view view`.

**Inferred user intent:** Prepare a tracked implementation task for a convenience extension that makes recent Markdown docs easy to browse/render from inside Pi.

### What I did
- Created docmgr ticket MDVIEW-001
- Read the shared extension framework guide and TUI authoring guide sections relevant to `registerPiExtension()` and modal components
- Checked `md-view --help` and `md-view view --help`
- Added design and diary docs
- Added implementation/validation tasks
- Related the shared extension and TUI docs to the ticket

### Why
The extension needs both framework registration and a custom TUI picker, so the design should capture file layout, scanner behavior, keyboard behavior, settings, and validation before implementation.

### What worked
- `md-view view --help` confirms the needed command: `md-view view [file]`, with useful optional flags `--dark`, `--no-reload`, and `--no-browser`.
- The local shared framework already supports the desired launcher/default-action pattern.

### What didn't work
- N/A — this was ticket setup and design only.

### What I learned
- `md-view view` automatically starts the daemon if needed and opens a browser by default, so the extension only needs to invoke a short command after selection.
- v1 should use filesystem `mtime` for “recently edited / written” rather than maintaining session-local history.

### What was tricky to build
- The design needs to avoid overbuilding: previews, Obsidian-wide search, and session history would be nice, but the requested extension only needs a recent-file picker plus `md-view view`.

### What warrants a second pair of eyes
- The scanner defaults and exclusions: confirm `ctx.cwd` is the right default root and that excluding common heavy dirs is acceptable.
- Whether `md-view view` should include `--dark`/`--no-reload` settings in v1 or stay minimal.

### What should be done in the future
- Implement the extension files.
- Validate with `timeout 20 pi --list-models`.
- Symlink and smoke test in tmux.

### Code review instructions
- Start with `design/01-extension-design.md`, especially User Experience, File Discovery, and md-view Invocation.
- Compare implementation against `docs/pi-tui-ui-authoring-guide.md` for TUI component contract.

### Technical details
- Base invocation: `md-view view /path/to/file.md`
- `md-view view` options confirmed: `--dark`, `--no-browser`, `--no-reload`, `--port`, `--browser`
- Planned extension id: `markdown-recent-viewer`
