---
Title: Extension Design
Ticket: MDVIEW-001
Status: active
Topics:
    - pi-extension
    - markdown
    - tui
    - tools
    - md-view
DocType: design
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design for a Pi extension that lists Markdown files edited/written in the current session and opens them with md-view view"
LastUpdated: 2026-05-13T00:00:00-04:00
WhatFor: "Implementation reference for the markdown-recent-viewer extension"
WhenToUse: "Read before implementing or modifying the recent markdown viewer extension"
---

# Markdown Recent Viewer Extension Design

## Goal

Create a Pi extension using the shared extension framework that displays a selectable list of Markdown files recently edited or written by the agent in the **current Pi session history**. When the user selects one and presses Enter, the extension runs:

```bash
md-view view /path/to/file.md
```

`md-view view` starts the md-view daemon automatically if needed and opens the rendered Markdown file in a browser.

## Key Correction: Use Session Tool History, Not Filesystem mtime

“Recently edited / written” means: files that appear in successful `edit` or `write` tool calls in the current session history, sorted by the order in which those edits/writes happened.

Do **not** scan the filesystem and sort by `mtime`. Filesystem mtime is noisy and can surface unrelated markdown files. The extension should show what the agent actually touched in this conversation/session.

## User Experience

Primary command/action:

```text
/markdown-recent-viewer
```

or select **Markdown Recent Viewer** from `/px`.

The extension opens a centered TUI overlay:

```text
Markdown Recent Viewer
Search: _

> 09:42  write  ttmp/.../reference/01-diary.md
  09:30  edit   docs/pi-testing-guide.md
  22:10  write  extensions/image-qa/README.md

Enter open  ↑/↓ select  / search  Esc close  r refresh
```

Behavior:

- Read the current branch/session history via `ctx.sessionManager.getBranch()` (preferred) or `getEntries()` if whole-session behavior is desired.
- Extract successful `edit` and `write` tool calls targeting Markdown files.
- Sort by edit/write occurrence order, newest first.
- De-duplicate by normalized absolute path, keeping the most recent occurrence.
- Show a bounded result list (default 50).
- Support keyboard navigation: up/down, page up/down, home/end.
- Press Enter to run `md-view view <selected-file>`.
- Press `r` to rebuild the list from session history.
- Press `/` to filter by substring/fuzzy text.
- Press Esc to close.

## Session History Extraction

Pi session entries expose messages through `ctx.sessionManager`. Relevant shapes:

```ts
// Assistant messages contain tool calls.
interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
}

// Tool result messages confirm execution success/failure.
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  isError: boolean;
  timestamp: number;
}
```

Extraction algorithm:

1. Get the current branch entries: `const entries = ctx.sessionManager.getBranch()`.
2. Walk entries in chronological branch order.
3. Collect assistant message content blocks where:
   - `block.type === "toolCall"`
   - `block.name === "edit" || block.name === "write"`
   - `typeof block.arguments.path === "string"`
   - path extension is `.md` or `.markdown`
4. Build a `Map<toolCallId, PendingMarkdownWrite>`.
5. When encountering a tool result message:
   - `message.role === "toolResult"`
   - `message.toolName === "edit" || message.toolName === "write"`
   - `message.isError === false`
   - `pendingById.has(message.toolCallId)`
6. Add/update the item for that file, using the tool result timestamp/order as the edit/write occurrence.
7. Return unique files sorted by latest occurrence descending.

Why correlate tool calls with tool results?

- Tool call arguments tell us the target path.
- Tool result tells us whether the operation actually succeeded.
- Sorting by tool result order/timestamp reflects when the file was really edited/written.

## Path Handling

- Resolve relative tool paths against `ctx.cwd`.
- Normalize absolute paths with `path.resolve(...)`.
- Display paths relative to `ctx.cwd` when possible.
- Only include `.md` and `.markdown` by default.
- If a file no longer exists, either hide it by default or show it with a “missing” marker; v1 should hide missing files to keep Enter behavior reliable.

## Settings

Use schema settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `maxResults` | number | `50` | Maximum files shown in picker. |
| `includeExtensions` | string | `.md,.markdown` | Comma-separated extensions to include. |
| `currentBranchOnly` | boolean | `true` | Use `getBranch()` rather than all session entries. |
| `openDark` | boolean | `false` | Pass `--dark` to `md-view view`. |
| `noReload` | boolean | `false` | Pass `--no-reload` to `md-view view`. |
| `hideMissingFiles` | boolean | `true` | Hide files that no longer exist. |

Removed from the earlier design:

- `root` — not needed because source is session history, not filesystem scanning.
- `maxScanFiles` — not needed because there is no filesystem scan.

## Extension Contributions

- `registerPiExtension({ id: "markdown-recent-viewer", ... })`
- Default `run` action opens the picker.
- Named actions:
  - `open` — open picker
  - `list` — notify a compact text list of recent Markdown files
- Docs: `extensions/markdown-recent-viewer/README.md`
- Settings: schema settings above
- Compatibility slash commands:
  - `/markdown-recent-viewer`
  - `/md-recent`

## TUI Component Design

Files:

```text
extensions/markdown-recent-viewer/
  index.ts       # registration, commands, settings, md-view invocation
  history.ts     # extract recent Markdown files from edit/write tool history
  ui.ts          # RecentMarkdownPicker component
  README.md      # user-facing docs
```

Picker item contract:

```ts
interface RecentMarkdownItem {
  path: string;              // absolute normalized path
  relativePath: string;      // relative to ctx.cwd where possible
  toolName: "edit" | "write";
  toolCallId: string;
  timestamp: number;         // tool result timestamp, when available
  entryId: string;           // session entry id for the tool result
  occurrence: number;        // monotonically increasing order in branch walk
}

interface PickerResult {
  action: "open" | "cancel";
  item?: RecentMarkdownItem;
}
```

`index.ts` opens the picker with `ctx.ui.custom(...)`, then runs `md-view view` for the selected item.

## md-view Invocation

Base command:

```ts
const args = ["view", selected.path];
if (state.openDark) args.splice(1, 0, "--dark");
if (state.noReload) args.splice(1, 0, "--no-reload");
await pi.exec("md-view", args, { cwd: ctx.cwd, timeout: 15000 });
```

Important:

- Use `pi.exec("md-view", args, ...)`, not shell string interpolation.
- Notify stderr/stdout if `code !== 0`.
- `md-view view` opens a browser by default; do not block waiting for long-running daemon behavior beyond the command exit.

## Validation Plan

1. `timeout 20 pi --list-models` passes.
2. Symlink extension into `~/.pi/agent/extensions/markdown-recent-viewer`.
3. Start Pi in tmux.
4. Verify startup `[Extensions]` includes `markdown-recent-viewer`.
5. In the session, create or edit a known `.md` file using `write`/`edit` tool calls.
6. Run `/markdown-recent-viewer` and verify the picker shows that file at/near the top.
7. Select it and press Enter.
8. Verify `md-view view` opens/prints successfully.
9. Verify failed edit/write tool calls do not appear.
10. Verify non-Markdown edit/write tool calls do not appear.

## Open Questions

- Should the picker include all session entries (`getEntries()`) or only the active branch (`getBranch()`)? v1 should default to current branch because it reflects the currently visible conversation path.
- Should failed edit/write calls appear with an error marker? v1 should hide failed calls.
- Should files edited by shell commands (e.g. `cat > file.md`) be included? v1 should not; the requirement is specifically edit/write tool calls.
