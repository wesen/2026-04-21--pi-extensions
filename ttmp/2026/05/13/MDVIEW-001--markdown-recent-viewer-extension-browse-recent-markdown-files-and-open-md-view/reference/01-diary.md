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

## Step 2: Correct source of recent files

Updated the design after user correction: the extension should not scan the filesystem or sort by modification time. It should inspect the Pi session history for successful `edit` and `write` tool calls that targeted Markdown files, then sort those files by actual edit/write occurrence order.

### Prompt Context

**User prompt (verbatim):** "no, we should look for edit / write tool calls in the session history, and use that for recent files, sorted by order of editing."

**Assistant interpretation:** Revise the ticket/design so “recent files” means Markdown files touched by Pi’s edit/write tools in this session, ordered by tool execution history, rather than files recently modified on disk.

**Inferred user intent:** Make the extension reflect the agent’s actual work in the current session and avoid noisy filesystem scans.

### What I did
- Rewrote the design doc around session-history extraction.
- Replaced the filesystem scanner task with a session-history extractor task.
- Documented the extraction algorithm:
  - read `ctx.sessionManager.getBranch()`
  - collect assistant `toolCall` blocks for `edit`/`write`
  - correlate with successful `toolResult` messages by `toolCallId`
  - include only `.md`/`.markdown` paths
  - de-duplicate by normalized absolute path, newest occurrence wins
- Removed scanner settings (`root`, `maxScanFiles`) from the design.
- Added session-history-specific settings (`currentBranchOnly`, `hideMissingFiles`).

### Why
Filesystem `mtime` answers a different question: “what changed on disk recently?” The requested UX is “what Markdown files did the agent edit/write recently in this session?” Session tool history is the precise source of truth for that.

### What worked
- Pi type docs confirm assistant messages contain `ToolCall` blocks with `name`, `id`, and `arguments`; tool result messages include `toolCallId`, `toolName`, `isError`, and `timestamp`.
- The implementation can use `ctx.sessionManager.getBranch()` to reflect the active conversation branch.

### What didn't work
- The original design overreached with filesystem scanning and mtime sorting. That would surface unrelated docs and miss the semantic ordering the user wants.

### What I learned
- For “recent work done by Pi,” session history is usually a better data source than the filesystem.
- To avoid listing failed writes, the extractor should correlate tool calls with successful tool results rather than trusting assistant tool-call intent alone.

### What was tricky to build
- The subtlety is that the target path lives in the assistant `toolCall.arguments`, while success/failure lives in a later `toolResult` message. The extractor must join those by `toolCallId`.

### What warrants a second pair of eyes
- Whether `getBranch()` should be the default instead of `getEntries()`. The design currently recommends current branch only.
- Whether to hide missing files or display them with a marker.

### What should be done in the future
- Implement `history.ts` around this corrected algorithm.

### Code review instructions
- Review `design/01-extension-design.md`, especially “Session History Extraction,” before implementing.
- Verify implementation tests successful edit/write correlation, failed tool result exclusion, markdown extension filtering, and de-duplication.

### Technical details
- Tool call source shape: `{ type: "toolCall", id, name, arguments }`
- Tool result source shape: `{ role: "toolResult", toolCallId, toolName, isError, timestamp }`
- Extension should resolve relative paths against `ctx.cwd`.
