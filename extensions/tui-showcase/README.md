# tui-showcase

A grab-bag Pi extension that demonstrates rich TUI techniques for future extension design.

## What it showcases

- Focused overlay mini-apps with keyboard navigation.
- ANSI 256-color palettes and swatches.
- Responsive cards, progress bars, badges, sparklines, and tables.
- Fake form/settings surfaces.
- Markdown rendering in an overlay.
- `SelectList` and `SettingsList` usage.
- Persistent above/below-editor widgets.
- Custom header, footer, status, and editor chrome.
- Custom message rendering.
- Custom tool call/result rendering.
- Animated components with proper `dispose()` cleanup.

## Usage

Load it with Pi:

```bash
pi -e ./extensions/tui-showcase/index.ts
```

Or symlink/copy it into a Pi extension directory and run `/reload`:

```bash
mkdir -p ~/.pi/agent/extensions/tui-showcase
ln -sf "$PWD/extensions/tui-showcase/index.ts" ~/.pi/agent/extensions/tui-showcase/index.ts
```

Commands:

| Command | What it does |
| --- | --- |
| `/tui-demo` | Opens the main showcase overlay. |
| `/tui-demo chrome` | Toggles custom header/footer/widgets/editor skin. |
| `/tui-demo reset` | Restores default Pi UI chrome. |
| `/tui-demo palette` | Opens a `SelectList` palette picker. |
| `/tui-demo settings` | Opens a `SettingsList` demo. |
| `/tui-demo markdown` | Opens a Markdown component demo. |
| `/tui-demo message` | Sends a custom-rendered session message. |

Tool:

- `tui_demo_card` — callable by the agent to demonstrate custom tool call/result renderers.

Example prompt:

```text
Call the tui_demo_card tool with title "Build Status", body "All systems are glowing", palette "sunset".
```

## Design notes

This extension is intentionally a demo, not a product workflow. Use it as a visual pattern library when designing real extensions:

- Copy the overlay shape for command palettes and dashboards.
- Copy the widget/status pattern for background state.
- Copy the renderer pattern for durable session cards.
- Be careful with the custom editor and footer: these are powerful but invasive.

Run `/tui-demo reset` before continuing normal work if you enabled chrome mode.
