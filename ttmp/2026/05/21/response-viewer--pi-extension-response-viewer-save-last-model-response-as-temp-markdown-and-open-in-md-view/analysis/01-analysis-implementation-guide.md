---
Title: Analysis & Implementation Guide
Type: analysis
Topics: pi-extension, response, viewer, markdown
Status: active
Intent: long-term
---

# Analysis & Implementation Guide: response-viewer Extension

## Goal

Build a Pi extension (`response-viewer`) that captures the last model (assistant) response, saves it as a temporary Markdown file, and opens it with `md-view view XXX.md` so the user can read long responses in a nicely rendered browser environment.

## Problem Statement

When Pi produces long responses (code reviews, analysis guides, documentation drafts), reading them in the terminal is suboptimal. The user wants a single action to "pop out" the last response into a browser-based Markdown viewer (`md-view`) for comfortable reading with syntax highlighting, proper formatting, and scroll/navigation.

## Existing Code to Leverage

### response-capture extension

- **Path**: `extensions/response-capture/`
- **What it does**: Captures assistant responses via `pi.on("turn_end", ...)`, stores them in `state.lastResponse`, can save to `.pi/response-capture/` or import into docmgr tickets.
- **Key types**: `CapturedResponse`, `ResponseCaptureState`
- **Key functions**: `captureResponse()`, `extractAssistantText()`, `saveCapturedResponse()`
- **Pattern**: Listens to `turn_end` event, filters for `assistant` role, extracts text blocks from `message.content`.

### markdown-recent-viewer extension

- **Path**: `extensions/markdown-recent-viewer/`
- **What it does**: Browses Markdown files from session edit/write history and opens them with `md-view view`.
- **Key function**: `openWithMdView(pi, ctx, state, item)` — calls `pi.exec("md-view", ["view", ...args, item.path])`.
- **Pattern for md-view integration**: Uses `pi.exec()` with a 15-second timeout.

### Shared extension framework

- **Path**: `extensions/_shared/registry.ts`
- **Pattern**: `registerPiExtension()` with `id`, `name`, `description`, `actions`, `docs`, `settings`, `widgets`.

## Design Decisions

### 1. Where to save the temp file

**Decision**: Use `$TMPDIR/pi-response-viewer/` with timestamped filenames.

**Rationale**:
- `response-capture` saves to `.pi/response-capture/` in the project directory — that's for persistent captures, not throwaway viewing.
- The user's intent is quick viewing, not archiving. A temp directory is semantically correct.
- Using `os.tmpdir()` ensures the files live in `/tmp` (or OS equivalent) and get cleaned up automatically.
- A `pi-response-viewer/` subdirectory avoids filename collisions with other temp files.
- Overwrite a single `last-response.md` each time so `md-view` live-reload shows the latest.

**Implementation**: Save both `last-response.md` (always overwritten) and a timestamped copy for history. The default view action opens `last-response.md`.

### 2. How to capture the response

**Decision**: Listen to `pi.on("turn_end", ...)` and extract text from assistant messages, following the same pattern as `response-capture`.

**Rationale**: The `turn_end` event provides the complete assistant message after all tool calls and streaming are done. This is the most reliable hook.

### 3. How to invoke md-view

**Decision**: Use `pi.exec("md-view", ["view", path])` following the `markdown-recent-viewer` pattern.

**Rationale**: `pi.exec()` runs the command as a child process, which is exactly what we need. The `md-view` daemon auto-starts if not running, and opens the file in the default browser.

### 4. Extension ID and commands

**Decision**:
- Extension ID: `response-viewer`
- Commands: `/rv` (short, easy to type), `/response-view` (descriptive)
- Default action: Save and open last response
- Additional actions: Preview response text, Open last saved file, Clear temp files

### 5. Settings

**Decision**: Schema settings for:
- `openDark` (boolean): Pass `--dark` to md-view
- `noReload` (boolean): Pass `--no-reload` to md-view
- `autoOpen` (boolean): Automatically open every new response (default: false)
- `tempDir` (string): Override temp directory (default: OS tmpdir)
- `browser` (string): Browser command (default: md-view default)

### 6. Dashboard widget

**Decision**: A status bar widget showing the last response capture state (turn number, character count, whether a file is saved).

## Architecture

```
extensions/response-viewer/
  index.ts        # Registration, commands, event handlers, actions
  response.ts     # Capture logic, temp file management, md-view invocation
  README.md       # User-facing docs
```

### Data flow

```
turn_end event
  → extract assistant text
  → store in state.lastResponse
  → (if autoOpen) save to temp + open md-view
  → update status bar widget

User runs /rv or /response-view
  → save last response to temp markdown file
  → call md-view view <path>
  → notify user

User runs /rv-preview
  → show preview in terminal (first N chars)
```

### Temp file format

```markdown
---
Title: "Pi Response — Turn N"
Source: pi-response-viewer
Model: provider/model-id
SessionId: abc123
CapturedAt: 2026-05-21T10:00:00.000Z
---

# Pi Response — Turn N

[Full response text here]
```

The YAML frontmatter is for metadata. The Markdown body is the response text rendered as-is.

## Implementation Tasks

See tasks.md for the ordered task list.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `md-view` not installed | Check with `which md-view` on first use, give clear error |
| Very long responses (100k+ chars) | Still save; md-view handles large files fine |
| Temp dir cleanup | Single `last-response.md` gets overwritten; optional cleanup action |
| Non-UTF8 content | Pi responses are always text, so no issue |
| `pi.exec` timeout | 15s timeout as per markdown-recent-viewer pattern |

## Validation

1. `timeout 20 pi --list-models` — extension loads without errors
2. `/reload` + `/px` — extension appears in launcher
3. `/rv` — saves and opens last response
4. `/rv-preview` — shows preview in terminal
5. Settings via `/px` → `s` on response-viewer
6. Status bar widget shows state
