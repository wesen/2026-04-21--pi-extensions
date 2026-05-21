# Response Viewer

Save any assistant response from this Pi session as a temporary Markdown file and open it in **md-view** for comfortable reading in your browser.

## What it does

Every time Pi produces an assistant response, Response Viewer captures it. You can then browse all captured responses in a scrollable picker, select one, and it gets saved to a temp Markdown file and opened with `md-view view` — rendered with syntax highlighting, proper formatting, and full browser navigation.

## Commands

| Command | Description |
|---------|-------------|
| `/rv` | Open the response picker (browse all captured responses) |
| `/response-view` | Alias for `/rv` |
| `/rv-last` | Save and open the most recent response directly (no picker) |
| `/rv-preview` | Preview the most recent response in the terminal |
| `/rv-reopen` | Re-open the last saved file in md-view |

## Picker

The `/rv` picker shows all assistant responses from the current session, most recent first:

- **Turn** — which turn the response belongs to
- **Time** — when it was captured
- **Chars** — character count (e.g. 1.2K, 15.3K)
- **Model** — which model produced it
- **Preview** — first line of the response text

Keys:

- `↑/↓` — navigate
- `PgUp/PgDn` — jump by 10
- `Enter` — save and open selected response in md-view
- `/` — search (filters by response text, model name, turn number)
- `Esc` — close

## Actions (via /px)

From the `/px` launcher, Response Viewer provides:

- **Browse responses** (default) — opens the picker
- **Open last response** — opens most recent directly
- **Preview last response** — terminal preview
- **Re-open last saved file** — re-opens the file without re-saving

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `openDark` | boolean | false | Pass `--dark` to md-view for a dark theme |
| `noReload` | boolean | false | Pass `--no-reload` to disable live reload |
| `autoOpen` | boolean | false | Automatically open every new response in md-view |
| `browser` | string | "" | Browser command override (e.g. `google-chrome`). Empty = default |

Access via `/px` → select Response Viewer → `s` for settings.

## How it works

1. On `turn_end`, the extension captures the assistant message text
2. When you select a response, it writes a Markdown file with YAML frontmatter to `$TMPDIR/pi-response-viewer/`
3. Two files are written: `last-response.md` (always overwritten, for live-reload) and a timestamped copy for history
4. `md-view view <path>` opens the file in your browser

## Status bar

When installed, the extension shows a status bar entry like:

```
rv:3turns/last:5/chars:2.3K/saved
```

## Requirements

- [md-view](https://github.com/go-go-golems/md-view) must be installed and in your PATH

## Relationship to other extensions

- **response-capture** — saves responses persistently to `.pi/response-capture/` and imports into docmgr tickets. Response Viewer is for quick viewing; response-capture is for archiving.
- **markdown-recent-viewer** — browses Markdown files edited/written by tool calls. Response Viewer focuses on assistant response text specifically.
