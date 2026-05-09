---
Title: Beautiful TUI Experiences in Pi Agent
Ticket: TUI-EXPERIENCES
Status: active
Topics:
    - pi
    - tui
    - extensions
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
      Note: Public extension API documentation
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md
      Note: Public TUI documentation and component usage patterns
    - Path: ../../../../../../../../others/llms/pi/nicobailon/pi-interactive-shell/index.ts
      Note: Nico interactive shell extension entrypoint and overlay/widget integration
    - Path: ../../../../../../../../others/llms/pi/nicobailon/pi-interactive-shell/overlay-component.ts
      Note: Nico terminal overlay component implementation
    - Path: ../../../../../../../../others/llms/pi/nicobailon/pi-messenger/overlay.ts
      Note: Nico tabbed messenger overlay implementation
    - Path: ../../../../../../../../others/llms/pi/nicobailon/pi-powerline-footer/index.ts
      Note: Nico custom editor/footer/widget/header implementation
    - Path: ../../../../../../../../others/llms/pi/nicobailon/pi-skill-palette/index.ts
      Note: Nico compact overlay picker pattern
    - Path: ../../../../../../../../others/llms/pi/pi-mono/packages/coding-agent/src/core/extensions/types.ts
      Note: ExtensionUIContext API contract
    - Path: ../../../../../../../../others/llms/pi/pi-mono/packages/coding-agent/src/modes/interactive/interactive-mode.ts
      Note: Runtime implementation of ctx.ui custom UI
    - Path: ../../../../../../../../others/llms/pi/pi-mono/packages/tui/src/tui.ts
      Note: Core Component
ExternalSources: []
Summary: Analysis and implementation guide for rich terminal UI extensions in pi-agent, grounded in pi-mono and nicobailon's extensions.
LastUpdated: 2026-04-27T11:17:03.275772515-04:00
WhatFor: Onboard an intern to build polished, robust TUI experiences for pi-agent extensions.
WhenToUse: Use before designing overlays, custom editors, widgets, footers, message renderers, or interactive tools in pi.
---











# Beautiful TUI Experiences in Pi Agent

## Executive Summary

Pi is not just a prompt loop. It is a terminal application whose UI is intentionally exposed to extensions. A pi extension can add modal dialogs, persistent widgets, a custom footer, startup headers, overlays, raw keyboard handling, custom editors, tool call renderers, and complete mini-apps. The built-in pi TUI is built around a small `Component` contract from `@mariozechner/pi-tui`, while the extension runtime exposes higher-level entry points through `ctx.ui`.

The key design insight is that beautiful TUI experiences in pi should be composed in layers:

1. **Use the high-level `ctx.ui` APIs first** for common workflows: `select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, and `setWidget`.
2. **Use `ctx.ui.custom()` for focused modal or overlay workflows** that need keyboard navigation, async completion, custom layout, or a domain-specific interaction model.
3. **Use `setFooter`, `setHeader`, and `setEditorComponent` sparingly** for global chrome changes because they modify the primary pi shell experience.
4. **Use renderers for persistence and replay** when the UI represents session history, tool calls, or custom messages.
5. **Treat every component as a small terminal renderer**: every `render(width)` line must fit the width, state changes must call `tui.requestRender()`, caches must be invalidated, timers must be disposed, and keyboard handling must respect pi's global interaction model.

Nico Bailon's extensions show three mature patterns:

- `pi-interactive-shell` builds a full terminal-in-terminal overlay backed by a PTY, including background sessions, attach/detach, hands-free mode, throttled rendering, and session status widgets.
- `pi-messenger` builds a chat/coordination overlay with tabs, unread state, keyboard navigation, persistent status, and agent-to-agent messaging.
- `pi-powerline-footer` customizes the editor, footer, widgets, header, startup overlay, and working messages to create a cohesive shell skin.

For a new intern, the safest path is to start with built-in components like `SelectList`, `SettingsList`, `Text`, `Box`, `Markdown`, `DynamicBorder`, and `BorderedLoader`, then graduate to custom components only when the interaction model demands it.

## Problem Statement and Scope

The requested outcome is a detailed guide for creating beautiful TUI experiences in pi-agent. The guide must answer:

- What is pi's TUI system?
- What extension APIs are available?
- How do existing high-quality third-party extensions use those APIs?
- What code paths in pi matter for implementation?
- What patterns should an intern copy?
- What mistakes should they avoid?
- How should a new TUI extension be designed, implemented, tested, and maintained?

This document focuses on **pi-agent extension TUI experiences**. It does not attempt to redesign pi's renderer or replace `@mariozechner/pi-tui`; it describes how to build on the current system.

In scope:

- `@mariozechner/pi-tui` component contract.
- `ctx.ui` extension API in `@mariozechner/pi-coding-agent`.
- Custom overlays and editor replacement.
- Persistent widgets, status/footer/header customization.
- Custom tool result rendering and custom message rendering.
- Lessons from Nico Bailon's extensions under `/home/manuel/code/others/llms/pi/nicobailon`.
- Implementation plan for a polished extension.

Out of scope:

- Web UI integrations except where they affect TUI design.
- Provider/model internals except where they expose status to the UI.
- Non-interactive print mode behavior except compatibility notes.

## Mental Model: The Pi TUI Stack

Pi's terminal experience can be understood as four concentric layers.

```text
┌─────────────────────────────────────────────────────────────────┐
│ User extension code                                              │
│ - registers commands/tools/events                                │
│ - calls ctx.ui.*                                                 │
│ - returns Component objects                                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│ Extension UI context                                             │
│ - select/confirm/input/editor/notify                             │
│ - custom overlays and replacement components                     │
│ - setStatus/setWidget/setFooter/setHeader/setEditorComponent      │
│ Evidence: packages/coding-agent/src/core/extensions/types.ts:108 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│ InteractiveMode                                                  │
│ - owns editor, chat, footer, widgets, overlays                   │
│ - translates extension UI requests into concrete components       │
│ Evidence: packages/coding-agent/src/modes/interactive/            │
│           interactive-mode.ts:1596                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│ @mariozechner/pi-tui                                             │
│ - Component render tree                                          │
│ - focus and keyboard routing                                     │
│ - differential terminal rendering                                │
│ - overlay positioning and terminal cursor support                │
│ Evidence: packages/tui/src/tui.ts:17, :214, :518, :750           │
└─────────────────────────────────────────────────────────────────┘
```

### The `Component` contract

Every serious TUI feature eventually reduces to the same contract:

```ts
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

Evidence:

- `packages/tui/src/tui.ts:17` defines `Component`.
- `packages/tui/src/tui.ts:23` defines `render(width): string[]`.
- `packages/tui/src/tui.ts:28` defines optional `handleInput(data)`.
- `packages/tui/src/tui.ts:52` defines the related `Focusable` interface.

Important implications:

- Rendering is **pull-based**. The TUI calls `render(width)` when it needs lines.
- Interaction is **focus-based**. The focused component receives keyboard input through `handleInput`.
- Re-rendering is **explicit**. After state changes, call `tui.requestRender()`.
- Component output is **terminal text**, not DOM nodes. You are responsible for width, wrapping, ANSI styles, and cleanup.
- `invalidate()` must clear render caches and rebuild theme-colored content if needed.

### Focus and IME support

A component that shows a cursor should implement `Focusable` and emit `CURSOR_MARKER` at the cursor position when focused. This lets pi place the real terminal cursor correctly, which matters for IME candidate windows in CJK input methods.

Copy this pattern for any custom input:

```ts
class MySearchBox implements Component, Focusable {
  focused = false;

  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    return [truncateToWidth(`Search: ${before}${marker}${cursor}${after}`, width)];
  }

  handleInput(data: string) {
    // mutate text
  }

  invalidate() {}
}
```

### Rendering and width discipline

The rule is simple and non-negotiable: **no rendered line may exceed the width passed to `render(width)`**.

Use these utilities:

- `visibleWidth(str)` for terminal display width that ignores ANSI escapes.
- `truncateToWidth(str, width, ellipsis?)` for safe truncation.
- `wrapTextWithAnsi(str, width)` for styled word wrapping.

Nico's extensions consistently use this rule:

- `pi-interactive-shell/overlay-component.ts:4` imports `truncateToWidth` and `visibleWidth`.
- `pi-interactive-shell/overlay-component.ts:1032` implements `render(width)` and truncates rows.
- `pi-messenger/overlay.ts:5` imports the same utilities.
- `pi-powerline-footer/index.ts:3` imports `visibleWidth` for responsive footer layout.

## Current-State Architecture in Pi

### `@mariozechner/pi-tui`

The TUI package provides the low-level renderer and components.

Key files:

- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/tui.ts`
  - `Component`, `Focusable`, `CURSOR_MARKER`.
  - `TUI` class and overlay machinery.
  - Keyboard routing and input listeners.
- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/components/select-list.ts`
  - `SelectList`, the canonical navigable list component.
- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/components/settings-list.ts`
  - `SettingsList`, the canonical settings/toggle selector.
- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/components/editor.ts`
  - Multi-line input editor and autocomplete integration.
- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/components/markdown.ts`
  - Markdown rendering for rich result display.
- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/components/image.ts`
  - Terminal image rendering for supported terminals.

Core APIs:

```ts
new Text(content, paddingX, paddingY, bgFn?)
new Box(paddingX, paddingY, bgFn?)
new Container().addChild(component)
new Spacer(lines)
new Markdown(markdown, paddingX, paddingY, markdownTheme)
new SelectList(items, maxVisible, selectListTheme, layoutOptions?)
new SettingsList(items, maxVisible, settingsTheme, onChange, onClose, opts?)
```

### Extension UI API

`ExtensionUIContext` is the bridge between extensions and the interactive UI. The API lives at:

- `/home/manuel/code/others/llms/pi/pi-mono/packages/coding-agent/src/core/extensions/types.ts:108`

Important methods:

```ts
select(title, options, opts?): Promise<string | undefined>
confirm(title, message, opts?): Promise<boolean>
input(title, placeholder?, opts?): Promise<string | undefined>
editor(title, prefill?): Promise<string | undefined>
notify(message, type?): void
onTerminalInput(handler): () => void
setStatus(key, text | undefined): void
setWorkingMessage(message?): void
setWidget(key, contentOrFactory | undefined, options?): void
setFooter(factory | undefined): void
setHeader(factory | undefined): void
custom(factory, options?): Promise<T>
setEditorComponent(factory | undefined): void
```

Evidence:

- `types.ts:110` exposes `select`.
- `types.ts:113` exposes `confirm`.
- `types.ts:116` exposes `input`.
- `types.ts:134` exposes `setWidget`.
- `types.ts:147` exposes `setFooter`.
- `types.ts:221` exposes `setEditorComponent`.

### Interactive mode implementation

Interactive mode owns the live component tree and implements the extension API.

Key file:

- `/home/manuel/code/others/llms/pi/pi-mono/packages/coding-agent/src/modes/interactive/interactive-mode.ts`

Important regions:

- `interactive-mode.ts:1444` resets extension-owned UI on reload/session shutdown.
- `interactive-mode.ts:1509` implements custom footer replacement.
- `interactive-mode.ts:1598` creates the `ExtensionUIContext` object.
- `interactive-mode.ts:1621` wires `setWidget`.
- `interactive-mode.ts:1622` wires `setFooter`.
- `interactive-mode.ts:1630` wires `setEditorComponent`.
- `interactive-mode.ts:1828` implements custom editor replacement.
- `interactive-mode.ts:1905` implements `ctx.ui.custom()`.

The critical implementation detail for `ctx.ui.custom()` is:

```ts
const result = await ctx.ui.custom<T>(
  (tui, theme, keybindings, done) => component,
  { overlay: true, overlayOptions: { width: "70%", anchor: "center" } }
);
```

What happens internally:

1. Pi saves the current editor text.
2. Pi calls your factory with `tui`, `theme`, `keybindings`, and a `done(result)` callback.
3. If `overlay: true`, pi calls `this.ui.showOverlay(component, overlayOptions)`.
4. If not overlay, pi replaces the editor component with your component and focuses it.
5. When you call `done(result)`, pi hides the overlay or restores the editor.
6. Pi resolves the promise returned by `ctx.ui.custom()`.
7. Pi calls `dispose()` on the component if it exists.

This means `ctx.ui.custom()` is the natural fit for:

- Modal pickers.
- Search dialogs.
- Wizards.
- Transient dashboards.
- Terminal-in-terminal overlays.
- Confirmation prompts that need richer layout than `confirm()`.
- Games or demos.

### Lifecycle and cleanup

Pi resets extension UI on session changes/reload. However, the extension is still responsible for cleaning up external resources:

- Timers and intervals.
- File watchers.
- PTYs or child processes.
- Event bus subscriptions.
- Background queues.
- Overlay-specific references.

Evidence:

- `interactive-mode.ts:1444` calls `resetExtensionUI()`.
- Nico's `pi-interactive-shell/index.ts:218` cleans up background widget and PTYs on session shutdown.
- Nico's `pi-powerline-footer/index.ts:647` returns a custom footer with `dispose: unsub`.

## Analysis of Nico Bailon's TUI Extensions

### Pattern 1: `pi-interactive-shell` as a full terminal overlay

Primary files:

- `/home/manuel/code/others/llms/pi/nicobailon/pi-interactive-shell/index.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-interactive-shell/overlay-component.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-interactive-shell/pty-session.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-interactive-shell/session-manager.ts`

What it does:

- Registers an LLM-callable tool named `interactive_shell`.
- Starts a PTY process for a command.
- Shows the PTY output inside an overlay.
- Sends most user keypresses directly to the PTY.
- Supports scrolling, detach/background, kill, output transfer, hands-free mode, and attach.
- Shows persistent background session status with `ctx.ui.setWidget()`.

Important evidence:

- `pi-interactive-shell/index.ts:139` defines `setupBackgroundWidget`.
- `pi-interactive-shell/index.ts:165` calls `ctx.ui.setWidget("bg-sessions", ...)`.
- `pi-interactive-shell/index.ts:477` and `:681` open overlays through `ctx.ui.custom()`.
- `pi-interactive-shell/index.ts:506` and `:707` pass `overlay: true` plus percentage width/maxHeight.
- `pi-interactive-shell/overlay-component.ts:21` defines `InteractiveShellOverlay implements Component, Focusable`.
- `overlay-component.ts:80` derives PTY columns/rows from terminal dimensions.
- `overlay-component.ts:931` implements keyboard routing.
- `overlay-component.ts:1032` renders the framed overlay.

Why this design is good:

- The overlay owns the domain-specific state machine (`running`, `hands-free`, `detach-dialog`, `exited`).
- The extension entrypoint owns command/tool registration and lifecycle.
- The PTY abstraction isolates terminal emulation from UI layout.
- The background widget solves discoverability after a shell is detached.
- Non-blocking modes let the agent continue while long-running commands proceed.

Important implementation details to copy:

```ts
let overlayOpen = false;

if (overlayOpen) {
  return { content: [{ type: "text", text: "Overlay already open." }] };
}

overlayOpen = true;
try {
  const result = await ctx.ui.custom<Result>(
    (tui, theme, _kb, done) => new MyOverlay(tui, theme, options, done),
    {
      overlay: true,
      overlayOptions: {
        width: "80%",
        maxHeight: "80%",
        anchor: "center",
        margin: 1,
      },
    },
  );
  return summarize(result);
} finally {
  overlayOpen = false;
}
```

Pitfalls to avoid:

- Do not allow two overlays to control the same PTY at once.
- Do not re-render on every byte without throttling; Nico uses `debouncedRender()` in the overlay.
- Do not forget to resize subprocess terminal dimensions when overlay width/height changes.
- Do not forget to unregister or kill background sessions on shutdown.

### Pattern 2: `pi-messenger` as an agent coordination overlay

Primary files:

- `/home/manuel/code/others/llms/pi/nicobailon/pi-messenger/index.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-messenger/overlay.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-messenger/crew-overlay.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-messenger/store.ts`

What it does:

- Provides agent-to-agent messaging and coordination.
- Shows unread counts/status in pi's footer/status area.
- Opens a tabbed overlay for agents, crew, direct chats, and broadcast.
- Supports keyboard navigation with tab/shift-tab/arrow/home/end/enter/backspace.
- Uses persistent storage and periodic UI refresh.

Important evidence:

- `pi-messenger/index.ts:232` calls `ctx.ui.setStatus("messenger", ...)`.
- `pi-messenger/index.ts:444` registers `/messenger`.
- `pi-messenger/index.ts:470` opens `MessengerOverlay` through `ctx.ui.custom()`.
- `pi-messenger/index.ts:475` uses `overlay: true`.
- `pi-messenger/overlay.ts:42` defines `MessengerOverlay implements Component, Focusable`.
- `pi-messenger/overlay.ts:112` handles keyboard input.
- `pi-messenger/overlay.ts:299` renders the overlay.

Why this design is good:

- It separates persistence (`store.ts`) from presentation (`overlay.ts`).
- It uses `setStatus()` for ambient awareness and an overlay for detailed action.
- It limits the overlay's width (`readonly width = 80`) and renders a predictable chat surface.
- It uses keyboard conventions that terminal users expect.

Important implementation details to copy:

```ts
class MessengerOverlay implements Component, Focusable {
  readonly width = 80;
  focused = false;

  handleInput(data: string) {
    if (matchesKey(data, "escape")) return this.done();
    if (matchesKey(data, "tab")) this.cycleTab(1);
    if (matchesKey(data, "shift+tab")) this.cycleTab(-1);
    if (matchesKey(data, "up")) this.scroll(1);
    if (matchesKey(data, "down")) this.scroll(-1);
    if (matchesKey(data, "enter")) this.sendMessage();
    this.tui.requestRender();
  }

  render(width: number): string[] {
    return drawTabsAndMessages(Math.min(width, this.width));
  }
}
```

Pitfalls to avoid:

- Avoid mixing storage mutation and line rendering in the same method.
- Clear unread counts only when the user actually views a tab.
- Always call `requestRender()` after navigation or text changes.
- Be careful with stale caches; Nico uses `cachedAgents` and invalidates when needed.

### Pattern 3: `pi-powerline-footer` as full shell chrome customization

Primary files:

- `/home/manuel/code/others/llms/pi/nicobailon/pi-powerline-footer/index.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-powerline-footer/segments.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-powerline-footer/presets.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-powerline-footer/welcome.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-powerline-footer/working-vibes.ts`

What it does:

- Replaces the default editor rendering with a custom powerline-style status bar.
- Replaces the footer with an empty footer while using footer data inside the editor.
- Adds widgets for secondary status rows and notification-like statuses.
- Adds a startup welcome header or overlay.
- Customizes working messages during agent/tool activity.
- Tracks git state and invalidates status layout on branch changes.

Important evidence:

- `pi-powerline-footer/index.ts:553` calls `ctx.ui.setEditorComponent(...)`.
- `pi-powerline-footer/index.ts:559` wraps `editor.handleInput` to dismiss welcome UI.
- `pi-powerline-footer/index.ts:606` computes responsive layout during editor render.
- `pi-powerline-footer/index.ts:639` calls `ctx.ui.setFooter(...)`.
- `pi-powerline-footer/index.ts:655` calls `ctx.ui.setWidget("powerline-secondary", ...)`.
- `pi-powerline-footer/index.ts:682` calls `ctx.ui.setWidget("powerline-status", ...)`.
- `pi-powerline-footer/index.ts:721` calls `ctx.ui.setHeader(...)`.
- `pi-powerline-footer/index.ts:761` calls `ctx.ui.custom(...)` for a welcome overlay.
- `pi-powerline-footer/index.ts:812` passes overlay options for centering.

Why this design is powerful:

- It demonstrates that pi extensions can deeply customize the shell without forking pi.
- It uses composition: editor override + footer data + widgets + overlay + events.
- It treats terminal width as a responsive layout problem.

Why this design is risky:

- Replacing the editor is invasive. If the custom editor mishandles keybindings, it can break core pi behavior.
- Monkey-patching `editor.render` and `editor.handleInput` is powerful but brittle.
- Status and footer data can become stale if caches are not invalidated on every relevant event.

Safe intern guidance:

- Do not start with `setEditorComponent()` unless the goal is explicitly to change the editor.
- If you do use it, instantiate `CustomEditor`, preserve `super.handleInput`, and preserve app keybindings.
- Test `/model`, Ctrl+C, Escape, paste, autocomplete, and multi-line input after any editor replacement.

### Pattern 4: `pi-skill-palette` as a focused picker

Primary file:

- `/home/manuel/code/others/llms/pi/nicobailon/pi-skill-palette/index.ts`

What it does:

- Registers `/skill`.
- Opens a centered overlay picker.
- Queues the selected skill for the next message.
- Shows status and widget indicators for queued state.

Important evidence:

- `pi-skill-palette/index.ts:749` opens an overlay with `ctx.ui.custom()`.
- `pi-skill-palette/index.ts:755` uses `{ overlay: true, overlayOptions: { anchor: "center", width: 70 } }`.
- `pi-skill-palette/index.ts:760` calls `ctx.ui.setStatus("skill", ...)`.
- `pi-skill-palette/index.ts:761` calls `ctx.ui.setWidget("skill", ...)`.

This is the best starter pattern for a new intern: a contained custom overlay, a simple state result, and a small persistent widget.

## Rich TUI Possibilities in Pi

### 1. Modal picker

Use when the user must choose one item.

API:

```ts
const choice = await ctx.ui.select("Pick model", ["A", "B", "C"]);
```

Use `ctx.ui.custom()` plus `SelectList` when you need descriptions, search, preview panes, or custom layout.

### 2. Confirmation gate

Use when an action is risky.

```ts
const ok = await ctx.ui.confirm("Danger", "Run destructive command?");
if (!ok) return;
```

Use custom overlay if you need a diff preview, command preview, or multi-option decision.

### 3. Inline status

Use `ctx.ui.setStatus(key, text)` for short ambient state in the footer/status area.

```ts
ctx.ui.setStatus("deploy", theme.fg("accent", "deploy: staging"));
ctx.ui.setStatus("deploy", undefined);
```

Good for:

- Current mode.
- Active background sessions.
- Agent identity.
- Queued skill/template.
- Connected/disconnected integration state.

### 4. Persistent widget

Use `ctx.ui.setWidget()` when the user needs visible persistent context near the editor.

```ts
ctx.ui.setWidget("todo", (_tui, theme) => ({
  render(width) {
    return todos.map(todo => truncateToWidth(` ${todo.done ? "✓" : "○"} ${todo.text}`, width));
  },
  invalidate() {},
}), { placement: "belowEditor" });
```

Good for:

- Background jobs.
- Queued skill.
- Task progress.
- Mode-specific hints.
- A compact dashboard.

### 5. Overlay mini-app

Use `ctx.ui.custom(..., { overlay: true })` for interactive mini-apps.

Good for:

- Search palettes.
- Chat overlays.
- Terminal sessions.
- Review dashboards.
- Multi-step wizards.
- Games.

### 6. Editor replacement

Use `ctx.ui.setEditorComponent()` only for primary input UX changes.

Good for:

- Vim/Emacs mode.
- Prompt builders.
- Form-based input.
- Powerline editor skins.
- Domain-specific command input.

Danger zone:

- You must preserve app-level keybindings.
- You must preserve text when switching back.
- You must handle paste and autocomplete.
- You must preserve `onSubmit` and `onChange`.

### 7. Custom footer/header

Use `setFooter()` and `setHeader()` for shell chrome.

Good for:

- Powerline status bars.
- Startup dashboards.
- Current workspace overview.
- Extension status aggregation.

### 8. Message and tool renderers

Use custom renderers when the UI is part of the session history, not just a live interaction.

Good for:

- Custom tool call/result display.
- Custom agent messages.
- Persistent cards for artifacts.
- Rich summaries or compact progress records.

## Design Principles for Beautiful Pi TUI

### Principle 1: Build from stable primitives

Prefer built-ins before custom drawing:

- `SelectList` for lists.
- `SettingsList` for toggles.
- `BorderedLoader` for cancellable async work.
- `Text`, `Box`, `Container`, `Spacer`, `Markdown` for content.
- `DynamicBorder` for pi-themed borders.

### Principle 2: Separate state, effects, and rendering

A component should ideally have three kinds of methods:

```ts
class MyOverlay implements Component {
  // State mutation and effects
  handleInput(data: string): void;
  private submit(): void;
  private refreshData(): Promise<void>;

  // Pure-ish rendering
  render(width: number): string[];
  private renderHeader(width: number): string;
  private renderRows(width: number): string[];

  // Cleanup/cache
  invalidate(): void;
  dispose(): void;
}
```

Avoid doing file IO or network calls inside `render(width)`.

### Principle 3: Treat width as an input, not a constant

Terminals resize. Good components adapt.

- Compute layout on every render or cache by width.
- Use percentages in overlay options for large surfaces.
- Use fixed width only for compact dialogs.
- Truncate with `truncateToWidth()`.
- Measure styled text with `visibleWidth()`.

### Principle 4: Make lifecycle explicit

Every custom component with external resources should support `dispose()`.

```ts
class WatcherWidget implements Component {
  private timer = setInterval(() => this.tui.requestRender(), 1000);

  dispose() {
    clearInterval(this.timer);
  }
}
```

### Principle 5: Design keyboard UX before rendering

Write a keymap first:

```text
Escape       close/cancel
Enter        select/submit
Tab          next pane/tab
Shift+Tab    previous pane/tab
↑/↓          move selection or scroll
Home/End     jump
Ctrl+R       refresh
Ctrl+B       background/detach if long-running
Ctrl+T       transfer result if agent-facing
?            help overlay
```

Then implement it with `matchesKey(data, Key.*)`.

### Principle 6: Leave breadcrumbs in pi's persistent UI

If an overlay can background, queue, or hide state, add a widget or status.

Examples:

- Interactive shell background sessions widget.
- Skill palette queued skill widget.
- Messenger unread count status.

### Principle 7: Do not steal global affordances unnecessarily

If your component is focused, it receives input. Be careful with Escape, Ctrl+C, paste, and app shortcuts. If you replace the editor, delegate to `CustomEditor` for unhandled input.

## Recommended Implementation Blueprint

Suppose an intern is asked to build a new extension called `pi-task-dashboard`, a beautiful overlay for selecting and monitoring tasks.

### Directory layout

```text
.pi/extensions/pi-task-dashboard/
├── index.ts              # extension entrypoint
├── dashboard-overlay.ts  # custom Component
├── task-store.ts         # state/persistence
├── theme.ts              # local style helpers
├── types.ts              # domain types
└── package.json          # dependencies if needed
```

### Entrypoint pseudocode

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DashboardOverlay } from "./dashboard-overlay.js";
import { loadTasks, subscribeTasks } from "./task-store.js";

export default function taskDashboard(pi: ExtensionAPI) {
  let cleanupWidget: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    cleanupWidget?.();
    const unsubscribe = subscribeTasks(() => widgetTui?.requestRender());
    let widgetTui: { requestRender(): void } | undefined;

    ctx.ui.setWidget("task-dashboard", (tui, theme) => {
      widgetTui = tui;
      return new TaskSummaryWidget(theme, loadTasks());
    }, { placement: "belowEditor" });

    cleanupWidget = () => {
      unsubscribe();
      ctx.ui.setWidget("task-dashboard", undefined);
    };
  });

  pi.on("session_shutdown", () => {
    cleanupWidget?.();
    cleanupWidget = undefined;
  });

  pi.registerCommand("tasks", {
    description: "Open task dashboard",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Task dashboard requires interactive mode", "warning");
        return;
      }

      const result = await ctx.ui.custom<TaskAction | null>(
        (tui, theme, keybindings, done) => new DashboardOverlay(tui, theme, keybindings, done),
        {
          overlay: true,
          overlayOptions: {
            width: "80%",
            maxHeight: "80%",
            anchor: "center",
            margin: 1,
            visible: (w, h) => w >= 80 && h >= 20,
          },
        },
      );

      if (result?.type === "insertPrompt") {
        ctx.ui.setEditorText(result.prompt);
      }
    },
  });
}
```

### Overlay component pseudocode

```ts
import type { Component, Focusable, TUI } from "@mariozechner/pi-tui";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";

export class DashboardOverlay implements Component, Focusable {
  focused = false;
  private selected = 0;
  private filter = "";
  private help = false;
  private tasks = loadTasks();

  constructor(
    private tui: TUI,
    private theme: Theme,
    private done: (result: TaskAction | null) => void,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.done(null);
      return;
    }

    if (matchesKey(data, "?")) {
      this.help = !this.help;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.selected = Math.max(0, this.selected - 1);
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.selected = Math.min(this.filteredTasks().length - 1, this.selected + 1);
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      const task = this.filteredTasks()[this.selected];
      this.done({ type: "insertPrompt", prompt: `Work on task ${task.id}: ${task.title}` });
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      this.filter = this.filter.slice(0, -1);
      this.selected = 0;
      this.tui.requestRender();
      return;
    }

    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.filter += data;
      this.selected = 0;
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    const inner = Math.max(10, width - 4);
    const border = (s: string) => this.theme.fg("border", s);
    const accent = (s: string) => this.theme.fg("accent", s);
    const dim = (s: string) => this.theme.fg("dim", s);

    const row = (content: string) =>
      border("│ ") + padToWidth(truncateToWidth(content, inner), inner) + border(" │");

    const lines: string[] = [];
    lines.push(border("╭" + "─".repeat(width - 2) + "╮"));
    lines.push(row(accent("Task Dashboard") + dim("  / type to filter")));
    lines.push(border("├" + "─".repeat(width - 2) + "┤"));

    for (const [i, task] of this.filteredTasks().slice(0, 12).entries()) {
      const selected = i === this.selected;
      const marker = selected ? accent("▶ ") : "  ";
      lines.push(row(marker + taskLine(task, this.theme)));
    }

    lines.push(border("├" + "─".repeat(width - 2) + "┤"));
    lines.push(row(dim("↑↓ move • enter insert prompt • ? help • esc close")));
    lines.push(border("╰" + "─".repeat(width - 2) + "╯"));
    return lines;
  }

  invalidate(): void {
    // Clear width/theme caches if any.
  }

  dispose(): void {
    // Remove timers/watchers if any.
  }
}
```

## API Reference Cheat Sheet

### Extension registration

```ts
export default function (pi: ExtensionAPI) {
  pi.on("session_start", (event, ctx) => {});
  pi.on("session_shutdown", (event, ctx) => {});
  pi.registerCommand("name", { description, handler });
  pi.registerTool({ name, label, description, parameters, execute, renderCall, renderResult });
  pi.registerMessageRenderer("custom-type", renderer);
}
```

### Extension UI

```ts
ctx.ui.notify("message", "info" | "warning" | "error");
ctx.ui.setStatus("key", "text");
ctx.ui.setStatus("key", undefined);
ctx.ui.setWidget("key", ["line 1", "line 2"], { placement: "aboveEditor" });
ctx.ui.setWidget("key", (tui, theme) => component, { placement: "belowEditor" });
ctx.ui.setFooter((tui, theme, footerData) => component);
ctx.ui.setHeader((tui, theme) => component);
ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => customEditor);
ctx.ui.custom((tui, theme, keybindings, done) => component, { overlay: true });
```

### Component utilities

```ts
import {
  Container,
  Text,
  Box,
  Spacer,
  Markdown,
  SelectList,
  SettingsList,
  matchesKey,
  Key,
  visibleWidth,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
```

### Overlay options

```ts
{
  overlay: true,
  overlayOptions: {
    width: "70%",       // or number
    minWidth: 40,
    maxHeight: "80%",
    anchor: "center",  // center, top-left, right-center, etc.
    offsetX: 0,
    offsetY: 0,
    margin: 1,
    visible: (termWidth, termHeight) => termWidth >= 80,
  },
}
```

## Implementation Plan for a New Beautiful TUI Extension

### Phase 1: Define the experience

Deliverables:

- One-paragraph purpose statement.
- Interaction mode: picker, dashboard, wizard, shell, footer skin, or editor replacement.
- Keymap.
- Data model.
- Lifecycle plan.

Questions:

- Is the UI transient or persistent?
- Does it need keyboard focus?
- Does it need to survive session reload?
- Does the LLM need to call it as a tool?
- Does the user need ambient state after it closes?

### Phase 2: Choose the minimal pi API

Decision tree:

```text
Need one simple answer?       → ctx.ui.select/input/confirm
Need rich focused interaction? → ctx.ui.custom(..., overlay: true)
Need persistent small context? → ctx.ui.setWidget
Need footer status?           → ctx.ui.setStatus or setFooter
Need change typing behavior?  → setEditorComponent with CustomEditor
Need history rendering?       → custom tool/message renderer
```

### Phase 3: Build a prototype with built-in components

Start with `Container`, `Text`, `SelectList`, and `DynamicBorder`. Avoid manual box drawing until the interaction is proven.

Validation checklist:

- Opens and closes with Escape.
- Selects with Enter.
- Re-renders after every state change.
- Works at 80 columns.
- Works at 160 columns.
- Does not exceed width.

### Phase 4: Add polish

Add:

- Themed colors from callback `theme`.
- Responsive width/height.
- Help footer.
- Empty states.
- Error states.
- Loading state with cancellation.
- Persistent status/widget if background state exists.

### Phase 5: Add lifecycle cleanup

Add `dispose()` and session shutdown hooks.

```ts
pi.on("session_shutdown", () => {
  cleanup?.();
  cleanup = undefined;
});
```

### Phase 6: Add tests and manual QA

Manual QA commands:

```bash
# Run pi with the extension under development
pi -e ./path/to/extension/index.ts

# Try narrow terminal
# Try wide terminal
# Try theme switch
# Try /reload
# Try /new and /resume
# Try Ctrl+C, Escape, paste, autocomplete
```

Debugging:

```bash
PI_TUI_WRITE_LOG=/tmp/pi-tui.log pi -e ./path/to/extension/index.ts
```

Review the raw ANSI stream if rendering flickers or lines are too wide.

## Testing and Validation Strategy

### Unit-level checks

For pure render helpers:

- Given width 40, every returned line has `visibleWidth(line) <= 40`.
- Given empty data, render an empty state.
- Given long labels, truncate cleanly.
- Given theme changes, `invalidate()` clears caches.

### Component-level checks

Simulate input:

```ts
const c = new DashboardOverlay(fakeTui, fakeTheme, done);
c.handleInput("\x1b[B"); // down
c.handleInput("\r");     // enter
assert(fakeTui.requestRenderCalled);
```

### Interactive manual checks

- Open/close overlay repeatedly.
- Resize terminal while overlay is open.
- Switch theme while component is visible.
- Run `/reload` while widget/footer/header is active.
- Start a new session and verify cleanup.
- Try unsupported print mode and make sure extension degrades.

### Accessibility and usability checks

- Every overlay has help text.
- Escape always exits or backs out.
- The selected row is obvious without relying only on color.
- Critical state is represented with symbols and text.
- Long text truncates, not wraps unpredictably, unless wrapping is deliberate.

## Risks and Alternatives

### Risk: Over-customizing global chrome

Replacing the editor/footer/header can make pi feel broken if keybindings or state are mishandled.

Mitigation:

- Prefer widgets and overlays.
- If replacing the editor, extend `CustomEditor` and delegate unhandled input.
- Provide a command to restore defaults.

### Risk: Render loops and flicker

Calling `requestRender()` too often can cause flicker or CPU overhead.

Mitigation:

- Throttle high-volume streams.
- Batch state updates.
- Avoid timers faster than necessary.
- Cache by width when rendering expensive data.

### Risk: Width bugs

ANSI-styled strings can visually exceed the terminal even if `.length` seems safe.

Mitigation:

- Use `visibleWidth()`.
- Use `truncateToWidth()`.
- Add tests that assert visible width.

### Risk: Stale state after reload/session switch

Extensions are reloaded and UI is reset, but external resources can continue unless cleaned up.

Mitigation:

- Register `session_shutdown` cleanup.
- Implement `dispose()`.
- Avoid global singleton state unless intentionally shared.

### Alternative: Build a web UI

A web UI can be richer visually, but loses tight keyboard integration with pi's terminal flow. Use web UI only when terminal layout is insufficient, or when rendering complex graphics/forms is the main requirement.

### Alternative: Use only text messages

For simple workflows, plain `ctx.ui.notify()` or custom messages are enough. Avoid custom TUI when the interaction is not actually interactive.

## Intern Onboarding Map

Read in this order:

1. `docs/extensions.md` in pi-coding-agent.
2. `docs/tui.md` in pi-coding-agent.
3. `packages/tui/src/tui.ts` for the component contract.
4. `packages/tui/src/components/select-list.ts` for keyboard list behavior.
5. `packages/coding-agent/src/core/extensions/types.ts` for `ctx.ui` API.
6. `packages/coding-agent/src/modes/interactive/interactive-mode.ts` around `createExtensionUIContext()` and `showExtensionCustom()`.
7. `examples/extensions/preset.ts`, `tools.ts`, `qna.ts`, `custom-footer.ts`, `modal-editor.ts`, and `snake.ts`.
8. Nico's `pi-skill-palette` for a small polished overlay.
9. Nico's `pi-messenger` for a tabbed overlay.
10. Nico's `pi-interactive-shell` for advanced async/PTY lifecycle.
11. Nico's `pi-powerline-footer` only after understanding the risks of editor/footer replacement.

## Practical Code Review Checklist

Before merging a TUI extension, verify:

- [ ] Every rendered line is width-safe.
- [ ] Every state-changing key path calls `tui.requestRender()` or closes the UI.
- [ ] Escape behavior is obvious and reliable.
- [ ] Timers/watchers/PTYs are disposed.
- [ ] Widgets/statuses are cleared on shutdown/reload.
- [ ] Overlay cannot be opened twice if that would corrupt state.
- [ ] `ctx.hasUI` is checked for interactive-only behavior.
- [ ] The extension degrades in print/RPC mode.
- [ ] Theme colors come from callback `theme`, not a stale imported singleton.
- [ ] `invalidate()` clears caches and rebuilds themed content.
- [ ] Custom editors preserve app keybindings.
- [ ] The UI is useful at 80 columns.

## References

Pi docs and source:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/tui.ts`
- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/components/select-list.ts`
- `/home/manuel/code/others/llms/pi/pi-mono/packages/tui/src/components/editor.ts`
- `/home/manuel/code/others/llms/pi/pi-mono/packages/coding-agent/src/core/extensions/types.ts`
- `/home/manuel/code/others/llms/pi/pi-mono/packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `/home/manuel/code/others/llms/pi/pi-mono/packages/coding-agent/src/modes/interactive/components/custom-editor.ts`
- `/home/manuel/code/others/llms/pi/pi-mono/packages/coding-agent/src/modes/interactive/components/bordered-loader.ts`
- `/home/manuel/code/others/llms/pi/pi-mono/packages/coding-agent/src/modes/interactive/components/footer.ts`

Nico Bailon extensions:

- `/home/manuel/code/others/llms/pi/nicobailon/pi-interactive-shell/index.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-interactive-shell/overlay-component.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-interactive-shell/pty-session.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-messenger/index.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-messenger/overlay.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-powerline-footer/index.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-powerline-footer/welcome.ts`
- `/home/manuel/code/others/llms/pi/nicobailon/pi-skill-palette/index.ts`

Useful examples:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/preset.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/tools.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/qna.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/custom-footer.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/modal-editor.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/snake.ts`
