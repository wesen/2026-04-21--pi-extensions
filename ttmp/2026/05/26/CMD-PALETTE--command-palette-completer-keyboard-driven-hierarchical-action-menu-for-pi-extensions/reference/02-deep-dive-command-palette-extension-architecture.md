---
Title: 'Deep Dive: Command Palette Extension Architecture'
Ticket: CMD-PALETTE
Status: active
Topics:
    - extensions
    - tui
    - ux
    - command-palette
    - launcher
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/command-palette/index.ts
      Note: Command palette extension entry point, shortcut handling, debug logging, and overlay invocation.
    - Path: extensions/_shared/ui/command-palette.ts
      Note: CommandPaletteOverlay component, keyboard model, rendering, stack navigation, and execution result contract.
    - Path: extensions/_shared/ui/palette-keys.ts
      Note: Palette key assignment and filtering helpers.
    - Path: extensions/_shared/registry.ts
      Note: Shared extension registry and PaletteItem contribution contract.
    - Path: extensions/launcher/index.ts
      Note: Launcher integration that opens the same command palette overlay from /px.
    - Path: docs/pi-shared-extension-framework-guide.md
      Note: Developer guide for registering actions, docs, settings, widgets, and palette contributions.
ExternalSources:
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md: Pi extension API documentation for commands, shortcuts, lifecycle events, and custom UI."
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md: Pi TUI component and overlay documentation."
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/keybindings.md: Pi keybinding syntax and built-in action defaults."
Summary: Deep architecture report for the command palette extension, its shared registry integration, UI component internals, shortcut pipeline, and developer extension patterns.
LastUpdated: 2026-05-28T13:40:00-04:00
WhatFor: Teach developers how the command palette extension is built and how to extend it safely.
WhenToUse: Read before adding palette contributions, changing palette shortcut behavior, refactoring the shared registry, or debugging palette overlays.
---

# Deep Dive: Command Palette Extension Architecture

## 1. Purpose of This Report

This report explains the command palette extension as an architecture, not only as a shortcut-driven UI. The goal is to show how a Pi extension contributes commands, actions, documentation, and palette items to a shared registry; how the command palette collects those contributions; how the palette overlay represents hierarchy; how keyboard input drives navigation and execution; and how the shortcut pipeline opens the overlay safely in real terminals.

The command palette is one part of a larger local extension framework. The framework asks each extension to describe its capabilities in a common registration object. The launcher uses that object for discovery. The dashboard uses it for ambient widgets. The command palette uses it for fast keyboard execution. Understanding the palette therefore requires understanding both the palette extension and the registry that feeds it.

## 2. The Design Goal

The `/px` launcher is optimized for discovery. It shows extensions, actions, docs, settings, and dashboard entry points. A user can search, inspect descriptions, and choose what to run. That is the right interface when the user is learning what exists.

The command palette is optimized for repeated invocation. It should take very few keystrokes to run a known extension action. It is hierarchical because each extension owns a submenu, and each submenu can contain nested action groups. It is key-driven because the user should not need to type a full command name or scan a long flat list.

The user-facing model is:

```text
Ctrl+Shift+Alt+N
  └─ root: extensions
       ├─ a  Agent Env →
       ├─ c  Compaction Meter →
       ├─ d  Docmgr →
       ├─ p  Pinned Skills →
       └─ r  Response Viewer →

press p
  └─ Pinned Skills submenu
       ├─ p  Preview prompt block
       ├─ s  Settings
       └─ r  Reload skills
```

The developer-facing model is:

```ts
registerPiExtension({
  id: "my-extension",
  name: "My Extension",
  palette: [
    { id: "open", title: "Open", key: "o", run: async (ctx) => open(ctx) },
    {
      id: "config",
      title: "Configuration",
      key: "c",
      children: [
        { id: "settings", title: "Settings", key: "s", run: async (ctx) => openSettings(ctx) },
      ],
    },
  ],
});
```

The palette extension should not know the details of `my-extension`. It only needs the contribution tree and the action callback.

## 3. File Map

The command palette crosses a small set of files. Each file has a specific responsibility.

| File | Responsibility |
| --- | --- |
| `extensions/command-palette/index.ts` | Registers the command palette extension, shortcut entry points, raw terminal listener, debug command, and `openPalette()` pipeline. |
| `extensions/_shared/ui/command-palette.ts` | Defines `CommandPaletteOverlay`, builds root extension submenus, renders the overlay, handles keyboard input, and returns `PaletteResult`. |
| `extensions/_shared/ui/palette-keys.ts` | Assigns single-key hints to sibling palette items and filters items by query. |
| `extensions/_shared/registry.ts` | Defines `PiExtensionRegistration`, `PaletteItem`, `PaletteActionHandler`, and `collectPaletteItems()`. |
| `extensions/launcher/index.ts` | Opens the same command palette overlay from the `/px` launcher when the user presses `p`. |
| `docs/pi-shared-extension-framework-guide.md` | Explains how extension authors contribute actions, docs, settings, widgets, and palette items. |

The architecture is intentionally small. Most of the behavior comes from consistent contracts and from keeping the registry independent of any one UI surface.

## 4. The Shared Registry Contract

Every extension in this repository calls `registerPiExtension()` from `extensions/_shared/registry.ts`. The registration object is the extension’s public contribution record.

```ts
export interface PiExtensionRegistration {
  id: string;
  name: string;
  description: string;
  commands?: string[];
  tags?: string[];
  run?: PiExtensionActionHandler;
  actions?: PiExtensionAction[];
  docs?: PiExtensionDoc[];
  settings?: PiExtensionSettingsContribution;
  widgets?: PiDashboardWidget[];
  palette?: PaletteItem[];
}
```

The palette-specific part is `palette?: PaletteItem[]`.

```ts
export interface PaletteItem {
  id: string;
  title: string;
  description?: string;
  key?: string;
  tags?: string[];
  children?: PaletteItem[];
  run?: PaletteActionHandler;
}
```

A `PaletteItem` is either a submenu or a leaf action. A submenu has `children`. A leaf has `run`. The type permits both, but the UI treats `children` as dominant: if `children` is present, activation enters the submenu. If no children exist and `run` exists, activation closes the overlay and executes the action.

The action handler receives the normal command context plus palette-specific metadata:

```ts
export type PaletteActionHandler = (
  ctx: ExtensionCommandContext,
  paletteContext: PaletteActionContext,
) => Promise<void> | void;

export interface PaletteActionContext {
  extension: PiExtensionRegistration;
  path: string[];
  close(): void;
}
```

The `path` is the list of item IDs from the extension root to the selected leaf. It gives actions enough context to know how they were invoked without hard-coding UI state into the action handler.

The registry stores registrations in a process-wide symbol slot:

```ts
const REGISTRY_KEY = Symbol.for("wesen.pi.extensions.registry.v1");
```

This avoids requiring direct imports between unrelated extensions. The command palette can call `collectPaletteItems()` and receive all registered palette contributions:

```ts
export function collectPaletteItems(): Array<{ extension: PiExtensionRegistration; item: PaletteItem }> {
  return listPiExtensions().flatMap((ext) =>
    (ext.palette ?? []).map((item) => ({ extension: ext, item })),
  );
}
```

The registry does not render UI. It does not assign shortcut keys. It does not execute actions. It provides a typed list of extension-owned contributions.

## 5. Root Palette Construction

The command palette groups all contributions by owning extension. At the root level, each extension becomes a submenu. This preserves the ownership boundary: root items are extensions, nested items are the actions that extension contributed.

The function `buildRootPaletteItems()` performs that transformation in `extensions/_shared/ui/command-palette.ts`.

```ts
export function buildRootPaletteItems(
  paletteItems: Array<{ extension: PiExtensionRegistration; item: PaletteItem }>,
): RootKeyedItem[] {
  const byExtension = new Map<string, { extension: PiExtensionRegistration; items: PaletteItem[] }>();

  for (const { extension, item } of paletteItems) {
    const group = byExtension.get(extension.id) ?? { extension, items: [] };
    group.items.push(item);
    byExtension.set(extension.id, group);
  }

  // Each extension becomes one root submenu.
}
```

The root entry created for each extension is itself a `PaletteItem`:

```ts
const rootItem: PaletteItem = {
  id: extension.id,
  title: extension.name,
  description: extension.description,
  children: items,
};
```

Root-level keys are assigned from extension names rather than from the child item `key` fields. This avoids conflicts between different extensions. One extension can use `o` for `Open` inside its submenu, and another extension can also use `o` for its own `Open`, because those items live in different sibling arrays.

## 6. Key Assignment Within a Level

The palette uses one printable key per visible sibling. The helper `assignKeys()` applies a deterministic three-pass algorithm:

1. Use explicit `item.key` values first. If two siblings specify the same explicit key, throw an error.
2. For remaining items, scan the title for the first unused alphanumeric character.
3. For any remaining items, assign from `abcdefghijklmnopqrstuvwxyz0123456789`.

```ts
export function assignKeys(items: PaletteItem[]): KeyedPaletteItem[] {
  const taken = new Set<string>();
  const result: KeyedPaletteItem[] = [];

  // explicit key pass
  // title-derived key pass
  // fallback key pass

  return result;
}
```

The rule is local to a level. That is essential. A palette tree should not require globally unique keys. The key `s` can mean `Settings` inside one extension and `Search` inside another extension because the current stack level determines the active key map.

Filtering is simple substring matching over item ID, title, description, and tags:

```ts
export function filterKeyedItems(items: KeyedPaletteItem[], query: string): KeyedPaletteItem[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(({ item }) => {
    const haystack = [item.id, item.title, item.description ?? "", ...(item.tags ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
```

This is deliberately modest. The palette’s first job is fast invocation of known actions. Full fuzzy ranking can be added later, but the current implementation remains predictable and easy to debug.

## 7. The Command Palette Extension Entry Point

`extensions/command-palette/index.ts` is the extension entry point. It registers itself with the shared framework, contributes an action and documentation, installs lifecycle hooks, registers fallback shortcuts, and exposes slash commands.

The current shortcut default is:

```ts
const DEFAULT_SHORTCUT = "ctrl+shift+alt+n";
```

The extension also supports runtime environment overrides:

```ts
const SHORTCUT_ENV = "PI_COMMAND_PALETTE_SHORTCUT";
const EXTRA_SHORTCUTS_ENV = "PI_COMMAND_PALETTE_EXTRA_SHORTCUTS";
const ACTIVE_SHORTCUTS = configuredShortcuts();
```

This gives three supported configurations:

```bash
# Default
pi

# Replace the default shortcut
PI_COMMAND_PALETTE_SHORTCUT=ctrl+space pi

# Keep the default and add another accepted shortcut
PI_COMMAND_PALETTE_EXTRA_SHORTCUTS=ctrl+space pi
```

The extension registration describes the command palette to the shared launcher:

```ts
registerPiExtension({
  id: "command-palette",
  name: "Command Palette",
  description: "Keyboard-driven hierarchical action menu for fast extension invocation.",
  commands: ["palette"],
  tags: ["palette", "launcher", "navigation"],
  run: async (ctx) => openPalette(ctx),
  actions: [
    {
      id: "open",
      title: "Open command palette",
      description: "Open the hierarchical command palette overlay.",
      default: true,
      run: async (ctx) => openPalette(ctx),
    },
  ],
  docs: [...],
});
```

The command palette is itself a registered extension. This means it appears in `/px`, can have documentation, and can be invoked through the same action mechanism it provides for other extensions.

## 8. Shortcut Configuration and Matching

The environment parsing is intentionally small:

```ts
function configuredShortcuts(): KeyId[] {
  const primary = normalizeShortcut(process.env[SHORTCUT_ENV]) ?? DEFAULT_SHORTCUT;
  return uniqueShortcuts([primary, ...parseShortcutList(process.env[EXTRA_SHORTCUTS_ENV])]);
}

function parseShortcutList(value: string | undefined): KeyId[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map(normalizeShortcut)
    .filter((shortcut): shortcut is KeyId => Boolean(shortcut));
}
```

`KeyId` is the type used by `@mariozechner/pi-tui` for strings such as `ctrl+space`, `ctrl+shift+alt+n`, and `escape`. The environment path casts strings to `KeyId` after normalization. That is acceptable for a developer override because invalid strings simply never match. A user-facing settings UI should validate values and report errors.

Matching is centralized:

```ts
function matchPaletteShortcut(data: string): KeyId | undefined {
  return ACTIVE_SHORTCUTS.find((shortcut) => matchesKey(data, shortcut));
}
```

Every raw terminal input event is compared against the configured list. The debug log records the raw string, the matched shortcut, and the active shortcut list. This makes shortcut failures diagnosable without reading code.

## 9. The Raw Terminal Listener

The raw listener is installed during `session_start` because it needs `ctx.ui`:

```ts
pi.on("session_start", async (_event, ctx) => {
  registerTerminalShortcut(ctx);
});

pi.on("session_shutdown", async () => {
  terminalShortcutUnsubscribe?.();
  terminalShortcutUnsubscribe = undefined;
});
```

The listener consumes the opening key before the editor sees it:

```ts
function registerTerminalShortcut(ctx: ExtensionContext): void {
  terminalShortcutUnsubscribe?.();
  terminalShortcutUnsubscribe = ctx.ui.onTerminalInput((data) => {
    const matchedShortcut = matchPaletteShortcut(data);

    if (matchedShortcut) {
      scheduleOpenPalette(ctx as ExtensionCommandContext, `raw-terminal-shortcut:${matchedShortcut}`);
      return { consume: true };
    }

    if (paletteOpenScheduled || (paletteOpen && !paletteInputReady)) {
      // buffer or consume mount-window input
      return { consume: true };
    }

    return undefined;
  });
}
```

This listener is not a general keybinding system. It has one purpose: detect configured palette-open shortcuts and protect the mount window while the overlay is being created. It should return `undefined` for unrelated input so the normal TUI path continues.

The cleanup in `session_shutdown` is required. Pi reloads extensions and replaces sessions. A raw listener from an old runtime must not continue consuming input after the extension instance that installed it has been torn down.

## 10. Registered Shortcut Fallback

The extension also registers the same shortcuts through `pi.registerShortcut()`:

```ts
for (const shortcut of ACTIVE_SHORTCUTS) {
  pi.registerShortcut(shortcut, {
    description: `Open command palette (${shortcutDisplay(shortcut)})`,
    handler: async (ctx) => {
      await openPalette(ctx as ExtensionCommandContext, `registered-shortcut-fallback:${shortcut}`);
    },
  });
}
```

The fallback handles edge cases where the raw terminal listener is not yet installed. The raw listener is still preferred because it can consume the key before editor processing. The fallback is useful immediately after reload and in any context where registered shortcuts are active but the raw listener has not run its `session_start` setup.

The duplicate registration does not open two palettes because the raw listener consumes the input first when it is active. If the raw listener is absent, the registered shortcut path can open the palette.

## 11. The Open Pipeline

Once a shortcut or command requests the palette, execution flows through three functions:

```text
scheduleOpenPalette(ctx, source)
  └─ openPalette(ctx, source)
       └─ openPaletteOnce(ctx, source)
            ├─ collectPaletteItems()
            ├─ buildRootPaletteItems(items)
            ├─ ctx.ui.custom(... CommandPaletteOverlay ...)
            └─ run selected PaletteItem handler
```

`scheduleOpenPalette()` protects against duplicate opens and moves the actual UI work out of the raw input callback:

```ts
function scheduleOpenPalette(ctx: ExtensionCommandContext, source: string): void {
  if (paletteOpen || paletteOpenScheduled) return;
  pendingOpeningInputs = [];
  paletteOpenScheduled = true;
  setImmediate(() => {
    paletteOpenScheduled = false;
    void openPalette(ctx, source);
  });
}
```

`openPalette()` is the reentrancy guard:

```ts
async function openPalette(ctx: ExtensionCommandContext, source = "unknown"): Promise<void> {
  if (paletteOpen) return;
  paletteOpen = true;
  paletteInputReady = false;
  try {
    await openPaletteOnce(ctx, source);
  } finally {
    paletteOpen = false;
    paletteInputReady = false;
    pendingOpeningInputs = [];
  }
}
```

`openPaletteOnce()` does the actual work:

```ts
const paletteItems = collectPaletteItems();
const rootItems = buildRootPaletteItems(paletteItems);

const result = await ctx.ui.custom<PaletteResult>(
  (tui, theme, _keybindings, done) => {
    overlay = new CommandPaletteOverlay(rootItems, {
      theme,
      done,
      requestRender: (force = false) => tui.requestRender(force),
      debug: (event, details) => debugLog(event, { source, ...details }),
    });
    return overlay;
  },
  { overlay: true, overlayOptions: {...}, onHandle: ... },
);
```

The result is either cancel or execute:

```ts
export type PaletteResult =
  | { kind: "execute"; extension: PiExtensionRegistration; item: PaletteItem; path: string[] }
  | { kind: "cancel" };
```

If the result is execute, the extension calls the selected item’s handler:

```ts
if (result.kind === "execute" && result.item.run) {
  await result.item.run(ctx, {
    extension: result.extension,
    path: result.path,
    close: () => {},
  });
}
```

The palette is already closed when the handler runs. The `close` callback is still part of the action context so the contract can support future variants where an action might run before the overlay is closed.

## 12. The Overlay Component State Model

`CommandPaletteOverlay` is a custom TUI component. It owns its navigation and render state:

```ts
export class CommandPaletteOverlay implements Component {
  private stack: PaletteLevel[];
  private cursor = 0;
  private query = "";
  private searchActive = false;
  private pathIds: string[] = [];
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;
  private renderCount = 0;
}
```

The central state variable is `stack`. Each stack frame is a palette level:

```ts
interface PaletteLevel {
  title: string;
  items: RootKeyedItem[];
}
```

The root stack contains one level titled `Command Palette`. Activating a submenu pushes a new level. Going back pops a level. `pathIds` mirrors the stack for action metadata: it records the machine IDs of the selected path.

Search is local to the current level. This is important because a single-character key means “activate the matching item” when search is inactive, but means “append to search query” when search is active and no key match is used.

The render cache is width-sensitive. If the same width is rendered again and the component has not invalidated, it returns the cached lines. Any state change calls `markDirty()`, which clears the cache and requests a render.

```ts
private markDirty(): void {
  this.invalidate();
  this.options.requestRender?.();
}
```

This keeps the overlay responsive without recomputing frame strings unnecessarily.

## 13. Keyboard Model Inside the Overlay

The overlay uses `matchesKey()` for semantic keys and direct string matching for printable shortcut keys.

The main input rules are:

| Input | Behavior |
| --- | --- |
| `Esc` | Close the palette, or exit search mode if search is active. |
| `/` | Enter search mode for the current level. |
| `Backspace` | Delete one query character if searching; otherwise go up one level. |
| `Ctrl+U` | Clear the current search query. |
| `Left` | Go up one level. |
| `Up` / `Down` | Move the cursor within the visible items. |
| `Enter` | Activate the selected visible item. |
| single printable character | Activate matching key in the current level; if no match and search is active, append to search. |

The order matters. The component checks Escape before printable handling. It checks `Backspace` before search text. It checks key hints before appending printable characters to a search query. That makes the fast path stable: pressing `p` at the root activates the extension whose root key is `p`; it does not search for `p` unless search mode is active and no key match was found.

Activation is the core state transition:

```ts
private activate(entry: RootKeyedItem): void {
  if (entry.item.children) {
    const childKeyed = assignKeys(entry.item.children);
    const childItems = childKeyed.map((ck) => ({ ...ck, extension: entry.extension }));
    this.stack.push({ title: entry.item.title, items: childItems });
    this.pathIds.push(entry.item.id);
    this.cursor = 0;
    this.query = "";
    this.searchActive = false;
    this.markDirty();
    return;
  }

  if (entry.item.run) {
    this.options.done({
      kind: "execute",
      extension: entry.extension,
      item: entry.item,
      path: [...this.pathIds, entry.item.id],
    });
  }
}
```

The overlay never runs extension code directly. It only returns `PaletteResult`. The owning extension code runs the action after `ctx.ui.custom()` resolves.

## 14. Rendering the Overlay

The overlay renders a fixed-width bordered panel. It computes a modal width from the available width, renders a breadcrumb title from the stack, renders up to fifteen visible rows, renders a footer, and closes the frame.

```ts
render(width: number): string[] {
  const modalWidth = Math.max(60, Math.min(width, 120));
  const innerWidth = modalWidth - 4;
  const visible = this.visibleItems();

  const lines = [borderTop(modalWidth, breadcrumb, theme)];
  for (const entry of visibleWindow) {
    lines.push(frameRow(row, innerWidth, theme));
  }
  lines.push(frameRow(footer, innerWidth, theme));
  lines.push(borderBottom(modalWidth, theme));
  return lines.map((line) => truncateToWidth(line, modalWidth, ""));
}
```

The row shape is compact:

```text
▸ p  Pinned Skills →
  r  Response Viewer →
```

The selected marker shows cursor position. The key hint is highlighted. A trailing arrow marks submenus. The footer changes with search mode:

```text
← Back    Esc Close    / Search    ↑↓ Navigate
Search: response█    Esc close search
```

The renderer uses `visibleWidth()` and `truncateToWidth()` to remain ANSI-safe. This matters because the theme functions insert escape sequences. A row that is string-length bounded but not visible-width bounded can corrupt the terminal layout.

## 15. Mount-Window Input Handling

The command palette supports rapid key sequences such as opening the palette and immediately pressing an extension key. The raw listener may observe the second key before the overlay’s `onHandle` callback has marked input ready. The implementation stores those events in `pendingOpeningInputs` only if they are safe to replay.

```ts
if (paletteOpenScheduled || (paletteOpen && !paletteInputReady)) {
  if (shouldReplayOpeningInput(data)) {
    pendingOpeningInputs.push(data);
  }
  return { consume: true };
}
```

The replay policy is intentionally conservative:

```ts
function shouldReplayOpeningInput(data: string): boolean {
  if (data.length === 1 && data >= " " && data !== "\x7f") return true;
  if (data === "\x1b") return true;
  if (data === "\r" || data === "\n") return true;
  if (data === "\x7f" || data === "\b") return true;
  if (data === "\x1b[A" || data === "\x1b[B" || data === "\x1b[C" || data === "\x1b[D") return true;
  return false;
}
```

It does not replay arbitrary CSI-u events. That prevents Kitty key release sequences from being interpreted as fresh overlay commands. A release event that parses as Escape can close the overlay immediately. A modified space release can look like input but not represent deliberate user intent.

After the overlay handle is available, `onHandle` focuses the overlay, marks input ready, replays buffered inputs, and requests renders:

```ts
onHandle: (handle) => {
  handle.focus();
  paletteInputReady = true;
  const buffered = pendingOpeningInputs.splice(0);
  for (const data of buffered) overlay?.handleInput?.(data);
  forceRenderBurst(source, requestRender);
}
```

This is one of the most important internal details. It is what allows a fast sequence like `Ctrl+Shift+Alt+N p` while still protecting the overlay from terminal protocol noise during mounting.

## 16. Debug Logging as an Architecture Feature

The command palette has a debug command:

```text
/palette-debug on
/palette-debug off
/palette-debug clear
/palette-debug tail
/palette-debug status
```

The log path is:

```text
/tmp/pi-command-palette-debug.log
```

Debug logging records events at each phase:

| Event | Meaning |
| --- | --- |
| `terminalShortcut.register` | The raw listener was installed and active shortcuts were recorded. |
| `terminalInput` | A raw input event arrived and was matched or ignored. |
| `terminalInput.bufferBeforeReady` | Input arrived while the overlay was opening and was either buffered or consumed. |
| `scheduleOpenPalette.request` | A shortcut requested a scheduled open. |
| `scheduleOpenPalette.fire` | The scheduled callback started opening the palette. |
| `openPalette.start` | The reentrancy guard allowed an open attempt. |
| `custom.factory` | `ctx.ui.custom()` invoked the overlay factory. |
| `custom.onHandle` | Pi returned an overlay handle; this is where focus and render requests happen. |
| `overlay.render` | The component rendered rows for a specific terminal width. |
| `custom.result` | The custom UI promise resolved with cancel or execute. |

This logging is not incidental. It is part of the operational design. A shortcut bug can occur at the terminal layer, the raw listener, the scheduler, the overlay factory, focus, rendering, or action execution. The log events are named so they map directly to those phases.

## 17. Launcher Integration

The `/px` launcher also uses the shared command palette UI. In `extensions/launcher/index.ts`, the launcher builds root palette items from registered extension contributions and opens `CommandPaletteOverlay` when the user chooses the palette path. This is important because it means the palette overlay is not hard-wired to one shortcut extension. The overlay is a reusable UI component.

The launcher path and the command-palette shortcut path share the same core component but have different entry responsibilities:

| Entry surface | Responsibility |
| --- | --- |
| `/palette` and `Ctrl+Shift+Alt+N` | Fast global invocation of extension palette actions. |
| `/px` launcher | Discovery-oriented navigation across extensions, docs, actions, settings, and dashboard entries. |
| `CommandPaletteOverlay` | Render and navigate a prepared tree; return execute/cancel result. |

This reuse is the main reason the component lives under `extensions/_shared/ui/` rather than inside `extensions/command-palette/`.

## 18. Extension Author Checklist

When adding a new command-palette contribution:

1. Register the extension through `registerPiExtension()`.
2. Add a `palette` array with stable `id` values.
3. Use short explicit keys only where they improve speed and do not conflict within the same sibling list.
4. Put long explanations in `description`; keep `title` concise.
5. Use `children` for grouped actions and `run` for executable leaves.
6. Keep `run` handlers independent of overlay implementation details.
7. Prefer reusing existing command handlers from palette actions so slash commands and palette actions stay aligned.
8. Add docs in the extension registration if the action needs explanation.

A good palette item is small and stable:

```ts
{
  id: "reload",
  title: "Reload skills",
  description: "Reload pinned skill files from disk.",
  key: "r",
  tags: ["skills", "reload"],
  run: async (ctx) => {
    await reloadPinnedSkills(ctx);
  },
}
```

## 19. Failure Modes

The important failure modes are architectural rather than cosmetic.

| Failure mode | Likely cause | Fix |
| --- | --- | --- |
| Shortcut never opens palette | Terminal or tmux consumed the key; raw listener not installed. | Test with raw key probe; check `/palette-debug status`; use safe default or env override. |
| Palette opens on next keypress | Terminal treats first key as a key-chord prefix. | Avoid terminal-reserved shortcut, as with Kitty `Ctrl+Shift+P`. |
| Palette opens then closes immediately | Key release or buffered Escape-like sequence was replayed. | Narrow `shouldReplayOpeningInput()` and ignore protocol release artifacts. |
| Duplicate palette opens | Press/release or fallback/raw paths both opened. | Keep `paletteOpen` and `paletteOpenScheduled` guards. |
| Action does not run | Overlay returned cancel, item has no `run`, or handler threw. | Inspect `custom.result` and action error logs. |
| Layout corrupts terminal | Rendered lines exceed visible width or ANSI strings were clipped incorrectly. | Use `visibleWidth()` and `truncateToWidth()`. |
| Duplicate keys in submenu | Two siblings specify the same explicit key. | Rename keys or let `assignKeys()` choose one. |

## 20. Source Locations

The implementation is distributed across these files:

- `extensions/command-palette/index.ts` — command registration, shortcut configuration, raw terminal listener, debug commands, and `openPalette()`.
- `extensions/_shared/ui/command-palette.ts` — overlay component, rendering, stack navigation, filtering, and result construction.
- `extensions/_shared/ui/palette-keys.ts` — key assignment and filtering helpers.
- `extensions/_shared/registry.ts` — extension registration and palette contribution types.
- `extensions/launcher/index.ts` — launcher integration that can open the shared palette overlay.
- `docs/pi-shared-extension-framework-guide.md` — author-facing guide for extension contributions.

## 21. Closing Summary

The command palette is a shared extension action surface. Its core architecture is a registry-fed tree, local key assignment, a focused TUI overlay, and action execution after overlay close. The shortcut layer is deliberately outside the overlay component: the entry point handles terminal input, scheduling, environment overrides, and debug logging, while the overlay handles only navigation and result selection.

That separation is the maintainability boundary. Extension authors add contributions through `registerPiExtension()`. The palette UI renders and navigates those contributions. The command palette extension decides when to open the overlay and how to run the selected action. Future changes should preserve those boundaries unless there is a deliberate reason to merge them.
