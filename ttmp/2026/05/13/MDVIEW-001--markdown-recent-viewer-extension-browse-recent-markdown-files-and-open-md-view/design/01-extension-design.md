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
Summary: "Design for a Pi extension that lists recently edited markdown files and opens them with md-view view"
LastUpdated: 2026-05-13T00:00:00-04:00
WhatFor: "Implementation reference for the markdown-recent-viewer extension"
WhenToUse: "Read before implementing or modifying the recent markdown viewer extension"
---

# Markdown Recent Viewer Extension Design

## Goal

Create a Pi extension using the shared extension framework that displays a selectable list of recently edited or written Markdown files. When the user selects one and presses Enter, the extension runs:

```bash
md-view view /path/to/file.md
```

`md-view view` starts the md-view daemon automatically if needed and opens the rendered Markdown file in a browser.

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

> 2026-05-13 09:42  ttmp/.../reference/01-diary.md
  2026-05-13 09:30  docs/pi-testing-guide.md
  2026-05-12 22:10  extensions/image-qa/README.md

Enter open  ↑/↓ select  / search  Esc close  r refresh
```

Behavior:

- Sort Markdown files by `mtime` descending.
- Show a bounded result list (default 50).
- Support keyboard navigation: up/down, page up/down, home/end.
- Press Enter to run `md-view view <selected-file>`.
- Press `r` to rescan.
- Press `/` to filter by substring/fuzzy text.
- Press Esc to close.

## File Discovery

Scanner should search from `ctx.cwd` by default.

Include:

- `**/*.md`
- `**/*.markdown`

Exclude common heavy/noisy directories:

- `.git/`
- `node_modules/`
- `dist/`, `build/`, `coverage/`
- `.next/`, `.turbo/`, `.cache/`

Implementation options:

1. Use Node APIs (`fs/promises`, recursive directory walk) for portability and direct mtime access.
2. Optionally use `find` via `pi.exec` later if performance becomes an issue.

Recommended v1: Node recursive walk with exclusions and a `maxScanFiles` safety limit.

## Settings

Use schema settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `root` | string | `.` | Directory to scan, relative to cwd or absolute. |
| `maxResults` | number | `50` | Maximum files shown in picker. |
| `maxScanFiles` | number | `5000` | Safety limit for scanned markdown files. |
| `includeExtensions` | string | `.md,.markdown` | Comma-separated extensions to include. |
| `openDark` | boolean | `false` | Pass `--dark` to `md-view view`. |
| `noReload` | boolean | `false` | Pass `--no-reload` to `md-view view`. |

## Extension Contributions

- `registerPiExtension({ id: "markdown-recent-viewer", ... })`
- Default `run` action opens the picker.
- Named actions:
  - `open` — open picker
  - `refresh` — rescan and show status
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
  scanner.ts     # recursive markdown scan and ranking
  ui.ts          # RecentMarkdownPicker component
  README.md      # user-facing docs
```

Picker component contract:

```ts
interface RecentMarkdownItem {
  path: string;
  relativePath: string;
  mtimeMs: number;
  size: number;
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
- Return/notify stderr if `code !== 0`.
- `md-view view` opens a browser by default; do not block waiting for long-running daemon behavior beyond the command exit.

## Validation Plan

1. `timeout 20 pi --list-models` passes.
2. Symlink extension into `~/.pi/agent/extensions/markdown-recent-viewer`.
3. Start Pi in tmux.
4. Verify startup `[Extensions]` includes `markdown-recent-viewer`.
5. Run `/markdown-recent-viewer` and verify picker opens.
6. Select a known `.md` file and press Enter.
7. Verify `md-view view` opens/prints successfully.
8. Verify settings load via `/px` → Markdown Recent Viewer → `s`.

## Open Questions

- Should the scanner include files outside `ctx.cwd` such as Obsidian vault notes? v1 should scan `ctx.cwd` only unless the `root` setting is changed.
- Should “recently written” track files created by Pi in this session? v1 uses filesystem mtime, which is simpler and good enough.
- Should the picker preview file contents? Not in v1; keep it fast and focused.
