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
RelatedFiles:
    - Path: extensions/markdown-recent-viewer/README.md
      Note: User-facing docs (commit c5c1ce7)
    - Path: extensions/markdown-recent-viewer/history.ts
      Note: Session-history edit/write extractor for Markdown files (commit c5c1ce7)
    - Path: extensions/markdown-recent-viewer/index.ts
      Note: Extension registration
    - Path: extensions/markdown-recent-viewer/ui.ts
      Note: TUI picker overlay for recent Markdown files (commit c5c1ce7)
ExternalSources: []
Summary: Implementation diary for the markdown recent viewer extension
LastUpdated: 2026-05-13T00:00:00-04:00
WhatFor: Track design and implementation of markdown-recent-viewer
WhenToUse: Read before resuming MDVIEW-001
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

## Step 3: Implement extension

Implemented the `markdown-recent-viewer` extension using the corrected session-history design. The extension registers with the shared framework, extracts successful `edit`/`write` tool calls for Markdown files, shows them in a TUI picker, and opens the selected file with `md-view view`.

### Prompt Context

**User prompt (verbatim):** "go ahead"

**Assistant interpretation:** Implement the MDVIEW-001 extension from the corrected design, validate, and keep ticket bookkeeping current.

**Inferred user intent:** Move from design to working extension code.

**Commit (code):** c5c1ce7 — "feat(markdown-recent-viewer): add session-history markdown picker"

### What I did
- Created `extensions/markdown-recent-viewer/history.ts` with session-history extraction.
- Created `extensions/markdown-recent-viewer/ui.ts` with a keyboard-driven TUI picker.
- Created `extensions/markdown-recent-viewer/index.ts` with shared framework registration, settings, commands, picker wiring, and `md-view view` invocation.
- Created `extensions/markdown-recent-viewer/README.md`.
- Validated with `timeout 20 pi --list-models` (exit code 0).
- Checked off tasks 1-5.

### Why
The corrected requirement is session-history based. Implementation needed to join assistant tool-call arguments with successful tool-result messages so the picker lists only files the agent actually edited/wrote.

### What worked
- Load validation passed on first run.
- TUI picker follows existing custom component patterns: stateful input handling, `render(width)`, `matchesKey`, `truncateToWidth`, and `tui.requestRender()`.
- The extractor uses `getBranch()` by default, so it reflects the active conversation path.

### What didn't work
- No runtime failures yet; smoke test still pending.

### What I learned
- `write` and `edit` target paths live in assistant `toolCall.arguments.path`, while execution success lives in later `toolResult` messages. The extractor needs a pending map keyed by `toolCallId`.
- `timeout 20 pi --list-models` is enough to catch TypeScript/import issues for the new multi-file extension.

### What was tricky to build
- The TUI result loop supports a `refresh` action by closing and reopening the picker with rebuilt items. This avoids trying to pass mutable item state into an already-open component.
- The extractor de-duplicates by normalized absolute path, keeping the newest successful edit/write occurrence.

### What warrants a second pair of eyes
- Whether hidden missing files should be the default; it keeps Enter reliable but may hide useful history.
- Whether current branch only should remain default for users who navigate/fork sessions.

### What should be done in the future
- Symlink into `~/.pi/agent/extensions` and smoke test with tmux.
- Exercise the picker after creating/editing a Markdown file in the live session.

### Code review instructions
- Start with `history.ts:getRecentMarkdownItems()` and verify tool-call/tool-result correlation.
- Review `ui.ts:RecentMarkdownPicker` for keyboard behavior and rendering bounds.
- Review `index.ts:openWithMdView()` for argv construction and error notification.

### Technical details
- Commands: `/markdown-recent-viewer`, `/md-recent`
- Default settings: max 50 results, `.md,.markdown`, current branch only, hide missing files, no dark/no-reload flags.
- md-view command: `md-view view [--dark] [--no-reload] <absolute path>`

## Step 4: Symlink and smoke test

Symlinked the extension into the local Pi extensions directory and ran a live tmux smoke test. The picker correctly found a Markdown file created by a `write` tool call in the same session and opened it with `md-view` when Enter was pressed.

### Prompt Context

**User prompt (verbatim):** (see Step 3)

**Assistant interpretation:** Finish deployment and prove the implemented extension works in a real Pi session.

**Inferred user intent:** Ensure the feature is not only load-valid but usable interactively.

### What I did
- Created symlink: `~/.pi/agent/extensions/markdown-recent-viewer -> /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/markdown-recent-viewer`.
- Re-ran `timeout 20 pi --list-models` after symlink; exit code 0.
- Started Pi in tmux session `mdview-smoke`.
- Verified startup `[Extensions]` includes `markdown-recent-viewer`.
- Asked the live Pi agent to use the `write` tool to create `/tmp/mdview-smoke.md`.
- Ran `/md-recent`.
- Verified the picker showed exactly `/tmp/mdview-smoke.md` from session edit/write tool history.
- Pressed Enter and verified notification: `Opened /tmp/mdview-smoke.md with md-view`.
- Checked off all tasks.

### Why
This validates the corrected source-of-truth behavior: a file becomes “recent” because of a successful session `write` tool call, not because of filesystem mtime.

### What worked
- The live write-tool-created Markdown file appeared in the picker.
- Enter-to-open invoked `md-view view` successfully.
- Alias command `/md-recent` works.

### What didn't work
- N/A — smoke test passed.

### What I learned
- The extension's overlay can appear over prior conversation text in tmux capture, but the framed picker remains readable enough for smoke testing.
- The session-history extractor works with actual persisted live session messages, not just inferred type shapes.

### What was tricky to build
- The smoke test needed a real `write` tool call inside the tmux Pi session. Creating a file with shell outside Pi would not prove the session-history extractor.

### What warrants a second pair of eyes
- Whether the picker should remain open after opening a file, to allow opening multiple recent files in sequence. Current behavior opens one file and closes.

### What should be done in the future
- Optional: add a `noBrowser` setting for smoke tests/headless use.

### Code review instructions
- Reproduce with tmux: ask Pi to write a Markdown file, run `/md-recent`, press Enter.

### Technical details
- Smoke file: `/tmp/mdview-smoke.md`
- Expected picker row: `write  /tmp/mdview-smoke.md`
- Success notification: `Opened /tmp/mdview-smoke.md with md-view`
