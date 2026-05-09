# kanban-demo

A full-featured Pi TUI Kanban task system demo. It is meant as a pattern library for future extensions that need rich task/state interfaces.

## Features

- Persistent JSON board at `.pi/kanban-demo.json`.
- Five-column board: Backlog, Ready, Doing, Review, Done.
- WIP limits for Doing and Review.
- Full-screen overlay board with keyboard navigation.
- Card movement between columns.
- Details pane, filtering, seeded demo tasks, archive/reset actions.
- Persistent below-editor widget with column counts and WIP warnings.
- Footer/status-line integration through `ctx.ui.setStatus()`.
- LLM-callable `kanban_task` tool with custom call/result rendering.

## Usage

```bash
pi -e ./extensions/kanban-demo/index.ts
```

Commands:

| Command | Description |
| --- | --- |
| `/kanban` | Open the Kanban overlay. |
| `/kanban reset` | Reset to the seeded demo board. |
| `/kanban seed` | Alias for reset. |
| `/kanban add <title>` | Add a card to Backlog. |
| `/kanban widget off` | Hide the status widget. |
| `/kanban widget on` | Show the status widget. |

Overlay keys:

| Key | Action |
| --- | --- |
| `←` / `→` | Select previous/next column. |
| `↑` / `↓` | Select card in current column. |
| `Shift+←` / `Shift+→` | Move selected card across columns. |
| `Enter` / `Space` | Toggle details pane. |
| `/` | Filter cards by text, assignee, priority, or tag. |
| `n` | Add a demo card to the current column. |
| `d` | Delete selected card. |
| `a` | Archive all Done cards. |
| `r` | Reset seeded board. |
| `Esc` | Close overlay. |

Tool examples:

```text
Use kanban_task to add a high priority card titled "Build gorgeous confirmation dialog" in the ready column assigned to Mira with tags tui and ux.
```

```text
Use kanban_task to move card 3 to review.
```

## Why this is useful

This demo combines many production extension patterns:

- Overlay for focused work.
- Widget/status for persistent ambient state.
- File-backed state for continuity across sessions.
- Tool API for agent-driven changes.
- Custom renderers so tool results are readable in the transcript.
- WIP warnings to show how domain rules can be reflected in UI chrome.
