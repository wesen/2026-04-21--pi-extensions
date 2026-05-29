# Response Viewer

Save any assistant response from this Pi session as a temporary Markdown file and open it in **md-view** for comfortable reading in your browser.

## What it does

Every time Pi produces an assistant response, Response Viewer captures it. You can then browse all captured responses in a scrollable picker, select one, and it gets saved to a temp Markdown file and opened with `md-view view` — rendered with syntax highlighting, proper formatting, and full browser navigation.

Generated Markdown now includes an orientation header: YAML frontmatter for tools plus a short human-readable context section before the response body. The frontmatter uses absolute paths; the rendered Markdown context uses relative links.

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

## Metadata in generated Markdown

Each saved response starts with YAML frontmatter containing:

- Session id, response entry id, turn index, and human turn number
- Capture timestamp
- Model provider/id/name
- Absolute paths for `last-response.md` and the timestamped history copy
- Previous-turn document context grouped into generated documents and read documents

After the frontmatter, the Markdown body begins with a short **Context metadata** section. This section repeats the important session/model details for humans and links to documents from the previous turn.

Path rules:

- **YAML frontmatter:** file paths are absolute for reliable machine indexing.
- **Markdown body:** document links are relative to the generated response Markdown file.
- Missing files are shown as missing instead of silently rendered as normal links.

“Previous turn” means successful relevant `read`, `write`, and `edit` tool results that happened after the previous assistant text response and before the selected response. Response Viewer currently records Markdown-like documents (`.md`, `.markdown`, `.mdx`).

## How it works

1. Response Viewer reconstructs assistant responses from the current session branch
2. When you select a response, it computes temp output paths under `$TMPDIR/pi-response-viewer/`
3. It scans the previous-turn session window for successful document `read`, `write`, and `edit` tool results
4. It writes Markdown with metadata-rich YAML frontmatter and a readable context section
5. Two files are written: `last-response.md` (always overwritten, for live-reload) and a timestamped copy for history
6. `md-view view <path>` opens the stable `last-response.md` file in your browser

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
