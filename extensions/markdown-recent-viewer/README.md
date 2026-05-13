# Markdown Recent Viewer

Browse Markdown files that were edited or written by the current Pi session and open the selected file with `md-view view`.

## What counts as “recent”

This extension does **not** scan the filesystem or sort by file modification time. Instead, it reads Pi session history and looks for successful `edit` and `write` tool calls targeting Markdown files.

A file appears in the picker when:

1. The assistant called the `edit` or `write` tool.
2. The tool call had a `path` argument ending in `.md` or `.markdown`.
3. The corresponding tool result succeeded (`isError === false`).
4. The file still exists, unless `hideMissingFiles` is disabled.

Files are sorted by actual edit/write order, newest first. If the same file was touched multiple times, only the latest occurrence is shown.

## Commands

- `/markdown-recent-viewer` — open the picker
- `/md-recent` — alias for `/markdown-recent-viewer`

## Picker keys

| Key | Action |
|-----|--------|
| `Enter` | Open selected file with `md-view view` |
| `↑` / `↓` | Move selection |
| `PageUp` / `PageDown` | Jump selection |
| `/` | Search/filter paths |
| `r` | Refresh from session history |
| `Esc` / `Ctrl+C` | Close |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `maxResults` | `50` | Maximum files shown in the picker. |
| `includeExtensions` | `.md,.markdown` | Comma-separated markdown extensions. |
| `currentBranchOnly` | `true` | Use the active conversation branch instead of all session entries. |
| `hideMissingFiles` | `true` | Hide files that no longer exist on disk. |
| `openDark` | `false` | Pass `--dark` to `md-view view`. |
| `noReload` | `false` | Pass `--no-reload` to `md-view view`. |

Access settings via `/px` → **Markdown Recent Viewer** → `s`.

## Under the hood

When you press Enter, the extension runs:

```bash
md-view view /absolute/path/to/file.md
```

Optional settings may add `--dark` or `--no-reload`.

`md-view view` starts the md-view daemon automatically if needed and opens the rendered Markdown file in a browser.
