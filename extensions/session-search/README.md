# Session Search

Search for strings in tool call arguments and results across your Pi session history. Navigate to match points to fork the conversation.

## Commands

- `/session-search [query]` — Open the search overlay
- `/session-search myFunction` — Search for "myFunction" immediately

## Features

- Searches tool call **arguments** (file paths, content, commands)
- Searches tool **results** (file content returned by read, output from bash)
- Shows chronological match list with turn numbers and timestamps
- **Navigate** to match points to rewind the session
- **Fork** from match points to create new sessions
- **Regex mode** — toggle with `r` for JavaScript regex search

## Key bindings (in search overlay)

| Key | Action |
|-----|--------|
| Up/Down | Move selection |
| Enter | Navigate to match (rewind session) |
| f | Fork from match (new session) |
| r | Toggle regex/plain search mode |
| Tab | Cycle detail: compact -> expanded -> full |
| / | Enter search mode / clear query |
| Ctrl+U | Clear query |
| Backspace | Delete last search character |
| ? | Toggle help |
| Esc | Close |

## Regex mode

Press `r` to toggle between plain substring search and regex mode. In regex mode:

- The query is treated as a JavaScript regular expression
- Matching is case-insensitive (the `i` flag is used)
- Invalid regex patterns show an error in the header
- Examples:
  - `function\s+\w+` — matches function declarations
  - `import.*from` — matches import statements
  - `TODO|FIXME|HACK` — matches multiple markers

## How navigation works

When you select a match and press Enter, the extension finds the **parent user message** for the tool call and navigates to it using `ctx.navigateTree()`. This rewinds the session to that point and places the user's original prompt in the editor for re-submission, creating a new branch.

When you press `f`, the extension calls `ctx.fork()` instead, creating a new session file with the conversation up to the match point.

## Limitations

- Currently searches only the **current branch** (not compacted regions or other branches)
- Compacted entries are not included in the search (the JSONL file still contains them, but the scanner doesn't read it by default)
- Very large tool results are truncated to ~10KB for display
