---
title: "Analysis and Design: Command Palette Completer"
doc_type: design
ticket: CMD-PALETTE
status: active
topics: [extensions, tui, ux, command-palette, launcher]
---

# Command Palette Completer — Analysis, Design & Implementation Guide

## Goal

This document is a self-contained, intern-ready guide to understanding, designing, and implementing a **Command Palette Completer** for the Pi extension framework. It covers the current system architecture, the problem the command palette solves, a detailed API design with pseudocode, TUI rendering contracts, file-level implementation plan, and testing strategy.

After reading this document, an intern should be able to:

1. Explain how Pi extensions currently register capabilities and how users discover them.
2. Describe what a command palette is and why it improves the current `/px` launcher workflow.
3. Read the TypeScript interfaces for palette contributions and implement the registration and runtime layers.
4. Build the TUI overlay component that renders the palette and handles keyboard-driven hierarchical navigation.
5. Wire the palette into the existing extension framework without breaking any existing extension.

---

## Part 1: The World Before the Command Palette

### 1.1 How extensions work today

Every Pi extension calls `registerPiExtension()` from `extensions/_shared/registry.ts`. This function takes a `PiExtensionRegistration` object that describes what the extension contributes:

- **`actions`** — named verbs like "Show status" or "Reset state"
- **`docs`** — help pages the user can read
- **`settings`** — configuration (schema-based or custom TUI)
- **`widgets`** — dashboard/status bar cards
- **`commands`** — legacy slash commands like `/px`, `/tag`

The registry is a global `Map<string, PiExtensionRegistration>` keyed by extension ID. Anyone can call `listPiExtensions()` to get all registered extensions sorted alphabetically.

```text
extension module
  └─ registerPiExtension({ id, name, actions, docs, settings, widgets })
       └─ global registry Map
            ├─ /px launcher (ExtensionLauncher component)
            ├─ ActionPicker (per-extension action chooser)
            ├─ DocViewer, SettingsView, DashboardOverlay
            └─ status bar / dashboard rendering
```

**Key files:**

| File | Role |
|------|------|
| `extensions/_shared/registry.ts` | The `PiExtensionRegistration` interface and the global registry. |
| `extensions/launcher/index.ts` | The `/px` command handler, overlay orchestration, and result dispatch. |
| `extensions/_shared/ui/extension-launcher.ts` | `ExtensionLauncher` — the two-pane modal TUI component. |
| `extensions/_shared/ui/action-picker.ts` | `ActionPicker` — the per-extension action selector modal. |

### 1.2 How users currently navigate

The `/px` launcher is the main discovery surface. When the user types `/px`, a modal overlay appears:

```text
╭────────────────────────────── Pi Extensions ──────────────────────────────╮
│ Search: / to filter                                                        │
│                                                                            │
│ 11 extensions · / search · Enter run · a actions · ? docs · s settings     │
├───────────────────────────────┬────────────────────────────────────────────┤
│ GROUP                         │ DETAILS                                    │
│                               │                                            │
│  ▸ Compaction                 │ Compaction Meter                           │
│    ● Compaction Meter         │ Shows remaining context tokens...          │
│      compact-meter · cm       │                                            │
├───────────────────────────────┴────────────────────────────────────────────┤
│ Tip: press / to search                                                     │
╰────────────────────────────────────────────────────────────────────────────╯
```

The interaction model is modal:

| Key | Action |
|-----|--------|
| `/` | Enter search mode |
| `Enter` | Run default action on selected extension |
| `a` | Open action picker for selected extension |
| `?` | Open docs for selected extension |
| `s` | Open settings for selected extension |
| `d` | Open dashboard overlay |
| `Esc` | Close |

When the user presses `a`, a **second** overlay opens — the `ActionPicker` — which shows the list of actions for that extension. The user must then arrow-key to the desired action and press `Enter`.

### 1.3 The pain point

To invoke a specific action today, the user must:

1. Type `/px` (or remember the shortcut).
2. Arrow-key or search to find the extension.
3. Press `a` to open the action picker.
4. Arrow-key to find the action.
5. Press `Enter`.

That is **at minimum 4 keystrokes** plus navigation time. For frequently used actions — like "view the last response" or "tag this moment" — this is too slow. Power users want **two or three keystrokes from anywhere** to trigger any registered action.

The user's example makes this concrete:

> I can register things like "/response-view" as `<shortcut>` (ctrl-shift-p) → `r` → `v` for navigating menu → responses extension → view action.

This is the classic **command palette** pattern found in VS Code (`Ctrl+Shift+P`), Sublime Text, and JetBrains IDEs.

---

## Part 2: What is a Command Palette?

### 2.1 Definition

A command palette is a **keyboard-driven hierarchical menu** that appears on a global shortcut and lets the user drill down to any registered action through a series of single-key presses. Each level of the hierarchy shows a list of items, each annotated with a **key hint** — a single character the user can press to select that item.

The key insight is that the palette is **not a search bar**. It is a **decision tree** where each key press narrows the choice. The user does not need to type full words or remember exact command names. They press one key per level.

### 2.2 Visual mockup

When the user presses `Ctrl+Shift+P`, a compact overlay appears at the top of the terminal:

```text
╭─ Command Palette ──────────────────────────────────────────────╮
│  c  Compaction          r  Responses          s  Session       │
│  d  Docs & Tickets      p  Pinned Skills      e  Environment  │
│  l  Launcher            k  Kanban Demo        x  Extensions    │
╰────────────────────────────────────────────────────────────────╯
```

The user presses `r` to drill into the Responses extension:

```text
╭─ Responses ────────────────────────────────────────────────────╮
│  v  View last response                                        │
│  c  Copy to clipboard                                         │
│  s  Save to file                                              │
│  ← Back    Esc Close                                          │
╰────────────────────────────────────────────────────────────────╯
```

The user presses `v` to execute "View last response." Total keystrokes from anywhere: **Ctrl+Shift+P**, **r**, **v** — three inputs, zero navigation, zero search.

### 2.3 How this differs from the current `/px` launcher

| Aspect | `/px` Launcher (current) | Command Palette (new) |
|--------|--------------------------|-----------------------|
| Trigger | `/px` command | Global shortcut (`Ctrl+Shift+P`) |
| Navigation | Arrow keys + search | Single-key drills |
| Depth | Flat list → second overlay | Hierarchical levels |
| Speed | 4+ keystrokes | 2–3 keystrokes |
| Visual | Large two-pane modal | Compact single-line-group overlay |
| Use case | Discovery and exploration | Fast invocation of known actions |
| Extensibility | Via `registerPiExtension()` actions | Via new `palette` contribution |

The palette does **not** replace `/px`. The launcher is for discovery. The palette is for speed. They coexist.

### 2.4 Submenu semantics

An extension can provide multiple **levels** of submenu items. The simplest case is two levels:

```text
Level 1:  r → Responses
Level 2:  v → View last response    (leaf — executes action)
```

But an extension could have deeper trees:

```text
Level 1:  d → Docs & Tickets
Level 2:  b → Browse tickets       (leaf)
           o → Open doc
Level 3:  i → Open by ID           (leaf)
           r → Recent docs          (leaf)
```

The framework does not impose a depth limit, but in practice three levels is the practical maximum for terminal UX. Each level is an array of `PaletteItem` entries. A `PaletteItem` is either a **leaf** (triggers an action) or a **submenu** (contains child `PaletteItem[]`).

### 2.5 Key assignment

Key hints are **single printable characters** (`a`–`z`, `0`–`9`). The framework auto-assigns keys from the first unique character of each item's `title`, but extensions can override with an explicit `key` field.

If two items want the same key, the second one gets the next available character from its title. If all title characters are taken, the framework falls back to sequential `a`, `b`, `c`… assignment.

Key assignment is **deterministic and stable** as long as the registered items don't change. This means a user can build muscle memory: `Ctrl+Shift+P` → `r` → `v` will always mean "Responses → View."

---

## Part 3: API Design

### 3.1 New types in `registry.ts`

The palette introduces three new interfaces and one new field on `PiExtensionRegistration`.

```ts
// ── extensions/_shared/registry.ts ──

/**
 * A single item in the command palette hierarchy.
 * - If `children` is present, this is a submenu.
 * - If `run` is present (and no `children`), this is a leaf action.
 * - If both are absent, the item is a no-op placeholder (rare).
 */
export interface PaletteItem {
  /** Machine-readable ID. Must be unique within its sibling array. */
  id: string;

  /** Human-readable label shown in the palette row. */
  title: string;

  /** Optional one-paragraph description for the details area. */
  description?: string;

  /**
   * Explicit key override. Must be a single printable character (a–z, 0–9).
   * If omitted, the framework auto-assigns from the title.
   */
  key?: string;

  /** Tags for search/filter within the palette. */
  tags?: string[];

  /** Child items — makes this a submenu. */
  children?: PaletteItem[];

  /**
   * Action handler for leaf items.
   * Receives the standard ExtensionCommandContext plus palette context.
   */
  run?: PaletteActionHandler;
}

/**
 * Handler for a palette leaf action.
 */
export type PaletteActionHandler = (
  ctx: ExtensionCommandContext,
  paletteContext: PaletteActionContext,
) => Promise<void> | void;

/**
 * Context passed to every palette action handler.
 */
export interface PaletteActionContext {
  /** The extension that owns this palette item. */
  extension: PiExtensionRegistration;

  /** The full path of IDs from root to the selected leaf. */
  path: string[];

  /** Close the palette overlay (if still open). */
  close(): void;
}
```

### 3.2 New field on `PiExtensionRegistration`

Add a `palette` field alongside the existing `actions`, `docs`, `settings`, and `widgets`:

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

  // ── NEW ──
  /**
   * Command palette contribution.
   * Each entry becomes a top-level item in the palette menu.
   * Entries can be leaves (with `run`) or submenus (with `children`).
   */
  palette?: PaletteItem[];
}
```

### 3.3 Why a separate `palette` field instead of reusing `actions`?

You might ask: *why not just auto-generate palette items from the existing `actions` array?*

Three reasons:

1. **Hierarchy.** `actions` are a flat list. The palette needs trees. An extension like `docmgr` might want `d → browse`, `d → open → by-id`, `d → open → recent`. You can't express that with flat actions.

2. **Key control.** Palette keys are single characters that must be globally unique across all extensions at the same level. Actions don't have key hints. Adding key hints to actions would pollute an interface that serves other purposes (the `/px` action picker, scripting).

3. **Decoupling.** Not every action belongs in the palette (e.g., "Reset state" is dangerous and should require the explicit `/px` flow). And not every palette item maps to an action (e.g., a submenu). Keeping them separate lets extension authors curate what appears in each surface.

Extensions that want to share logic between palette items and actions can call the same handler function from both:

```ts
const handleView = async (ctx) => { /* ... */ };

registerPiExtension({
  id: "response-viewer",
  actions: [{ id: "view", title: "View", run: handleView }],
  palette: [{ id: "view", title: "View last response", key: "v", run: handleView }],
});
```

### 3.4 Registry helpers for the palette

Add helper functions to `registry.ts`:

```ts
/**
 * Collect all palette items from all extensions into a flat list
 * of { extension, item } pairs. Used by the palette TUI to build
 * the root level.
 */
export function collectPaletteItems(): Array<{
  extension: PiExtensionRegistration;
  item: PaletteItem;
}> {
  return listPiExtensions().flatMap((ext) =>
    (ext.palette ?? []).map((item) => ({ extension: ext, item })),
  );
}
```

### 3.5 Auto-key assignment algorithm

The framework assigns keys deterministically. The algorithm:

```pseudocode
function assignKeys(items: PaletteItem[]): Map<PaletteItem, string> {
  taken = empty set
  result = empty map

  // Pass 1: honor explicit key overrides
  for item in items:
    if item.key is defined:
      normalized = lowercase(item.key)
      assert normalized is single printable char
      assert normalized not in taken   // throw on conflict
      taken.add(normalized)
      result.set(item, normalized)

  // Pass 2: auto-assign from title
  for item in items:
    if item already has a key: continue
    for char in lowercase(item.title):
      if char is alphanumeric and char not in taken:
        taken.add(char)
        result.set(item, char)
        break

  // Pass 3: fallback sequential assignment
  for item in items:
    if item already has a key: continue
    for char in ['a', 'b', 'c', ..., 'z', '0', '1', ..., '9']:
      if char not in taken:
        taken.add(char)
        result.set(item, char)
        break

  return result
}
```

This runs once when the palette overlay opens (or on registration). It does not re-run on every keypress.

---

## Part 4: TUI Overlay Design

### 4.1 Component contract

The palette overlay is a `Component` from `@mariozechner/pi-tui`. It follows the same contract as `ExtensionLauncher` and `ActionPicker`:

```ts
class CommandPaletteOverlay implements Component {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
}
```

The component is opened through `ctx.ui.custom()` with overlay options:

```ts
const result = await ctx.ui.custom<PaletteResult>(
  (tui, theme, _keybindings, done) =>
    new CommandPaletteOverlay({
      items: collectPaletteItems(),
      theme,
      done,
      requestRender: () => tui.requestRender(),
    }),
  {
    overlay: true,
    overlayOptions: {
      anchor: "top-center",   // appears at top of screen like VS Code
      width: "90%",
      maxHeight: "40%",       // compact, not a full-screen modal
      minWidth: 60,
      margin: 0,
    },
  },
);
```

### 4.2 Internal state model

```ts
interface CommandPaletteState {
  /** Navigation stack. stack[0] = root, stack[last] = current level. */
  stack: PaletteLevel[];

  /** Current query string (for fuzzy search within a level). */
  query: string;

  /** Whether the user is in search mode. */
  searchActive: boolean;

  /** Cursor position for arrow-key navigation. */
  cursor: number;

  /** Scroll offset for the current level. */
  scroll: number;
}

interface PaletteLevel {
  /** Title shown in the border for this level. */
  title: string;

  /** Items at this level, with their assigned keys. */
  items: Array<{
    extension: PiExtensionRegistration;
    item: PaletteItem;
    key: string;
  }>;
}
```

The **stack** is the core data structure. When the user presses a key that matches a submenu item, a new `PaletteLevel` is pushed onto the stack. When the user presses `Backspace` or `←`, the top level is popped. When the user presses a key that matches a leaf item, the leaf's `run` handler is called and the palette closes.

### 4.3 Keyboard mapping

| Key | Action |
|-----|--------|
| `a`–`z`, `0`–`9` | If the character matches a visible item's key, activate that item. If no match and search is active, append to query. |
| `Esc` | Close the palette (return `null`). |
| `Backspace` | If in search mode with a query, delete last char. If query is empty, go up one level (pop stack). If at root, close. |
| `←` (Left arrow) | Go up one level (pop stack). At root, do nothing. |
| `↑` / `↓` | Move cursor (for arrow-key fallback navigation). |
| `Enter` | Activate the item at cursor position. |
| `/` | Toggle search mode on/off. |

The key design principle: **single-key drill-down is the primary interaction**. Arrow keys are a secondary fallback for accessibility and for when there are many items.

### 4.4 Rendering strategy

The palette renders as a compact bordered box. At any given time it shows the items at the **current stack level**:

```text
╭─ Command Palette ─ Responses ──────────────────────────────────╮
│                                                                │
│  v  View last response                                         │
│  c  Copy response to clipboard                                 │
│  s  Save response to file                                      │
│                                                                │
│  ← Back    Esc Close    / Search                               │
╰────────────────────────────────────────────────────────────────╯
```

The border title shows the breadcrumb path (e.g., "Command Palette ─ Responses ─ Open"). The body shows each item with its key hint highlighted. The footer shows available actions.

### 4.5 Render pseudocode

```pseudocode
function render(width):
  modalWidth = clamp(width, 60, 120)
  innerWidth = modalWidth - 4   // minus borders

  level = stack.top()
  lines = []

  // Border top with breadcrumb title
  breadcrumb = stack.map(level => level.title).join(" ─ ")
  lines.push(topBorder(modalWidth, breadcrumb))

  // Blank separator
  lines.push(frameRow("", innerWidth))

  // Items
  visibleItems = level.items
  if searchActive and query:
    visibleItems = fuzzyFilter(visibleItems, query)

  for i, entry in visibleItems:
    marker = (i == cursor) ? "▸" : " "
    keyHint = theme.bold(theme.fg("accent", entry.key))
    title = entry.item.title
    desc = truncate(entry.item.description, innerWidth - 6 - len(title))
    row = f"  {marker} {keyHint}  {title}  {theme.dim(desc)}"
    lines.push(frameRow(row, innerWidth))

  // Blank separator
  lines.push(frameRow("", innerWidth))

  // Footer
  footer = "← Back    Esc Close"
  if searchActive:
    footer = f"Search: {query}█    Esc close search"
  else:
    footer += "    / Search"
  lines.push(frameRow(theme.dim(footer), innerWidth))

  // Border bottom
  lines.push(bottomBorder(modalWidth))

  return lines
```

### 4.6 Input handling pseudocode

```pseudocode
function handleInput(data):
  // Escape: close or exit search
  if data == ESCAPE:
    if searchActive:
      searchActive = false
      query = ""
      markDirty()
      return
    done(null)  // close palette
    return

  // Search toggle
  if data == "/" and not searchActive:
    searchActive = true
    markDirty()
    return

  // Backspace: delete query char or go up
  if data == BACKSPACE:
    if searchActive and query.len > 0:
      query = query[:-1]
      markDirty()
      return
    if stack.len > 1:
      stack.pop()
      markDirty()
      return
    done(null)  // at root with empty search, close
    return

  // Left arrow: go up one level
  if data == LEFT:
    if stack.len > 1:
      stack.pop()
      markDirty()
    return

  // Up/Down arrows: move cursor
  if data == UP:
    cursor = max(0, cursor - 1)
    markDirty()
    return
  if data == DOWN:
    cursor = min(visibleItems.len - 1, cursor + 1)
    markDirty()
    return

  // Enter: activate item at cursor
  if data == ENTER:
    item = visibleItems[cursor]
    activateItem(item)
    return

  // Printable character: check if it matches a key
  if data is single printable char:
    level = stack.top()
    match = level.items.find(entry => entry.key == data)
    if match:
      activateItem(match)
      return
    // No match — if search active, append to query
    if searchActive:
      query += data
      markDirty()
```

```pseudocode
function activateItem(entry):
  if entry.item.children:
    // Submenu: push new level
    childItems = assignKeys(entry.item.children)
    stack.push({
      title: entry.item.title,
      items: childItems,
    })
    cursor = 0
    scroll = 0
    query = ""
    searchActive = false
    markDirty()
  else if entry.item.run:
    // Leaf: execute action and close
    done({ kind: "execute", extension: entry.extension, item: entry.item })
  else:
    // No-op: ignore
    pass
```

---

## Part 5: File Layout and Implementation Plan

### 5.1 Files to create

```text
extensions/_shared/
  registry.ts                      # MODIFY: add PaletteItem, PaletteActionHandler, PaletteActionContext, collectPaletteItems()
  ui/
    command-palette.ts             # NEW: CommandPaletteOverlay component
    palette-keys.ts                # NEW: assignKeys() algorithm and helpers

extensions/command-palette/
  index.ts                         # NEW: extension entry point — registerPiExtension, shortcut, command
```

### 5.2 Files to modify

| File | Change |
|------|--------|
| `extensions/_shared/registry.ts` | Add `PaletteItem`, `PaletteActionHandler`, `PaletteActionContext` interfaces. Add `palette?` field to `PiExtensionRegistration`. Add `collectPaletteItems()` helper. |
| `extensions/launcher/index.ts` | Optionally add a `p` key to the `/px` launcher to open the palette from there (convenience, not required for MVP). |

### 5.3 New file: `extensions/_shared/ui/palette-keys.ts`

This module implements the deterministic key-assignment algorithm. It is pure (no side effects, no TUI dependency) and easy to unit test.

```ts
// extensions/_shared/ui/palette-keys.ts

import type { PaletteItem } from "../registry";

export interface KeyedPaletteItem {
  item: PaletteItem;
  key: string;
}

/**
 * Assign single-character keys to a list of palette items.
 * Priority: explicit `item.key` → first unique char of title → sequential fallback.
 * Throws if two items specify the same explicit key.
 */
export function assignKeys(items: PaletteItem[]): KeyedPaletteItem[] {
  const taken = new Set<string>();
  const result: KeyedPaletteItem[] = [];

  // Pass 1: explicit overrides
  for (const item of items) {
    if (item.key) {
      const normalized = item.key.toLowerCase();
      if (taken.has(normalized)) {
        throw new Error(
          `Duplicate palette key '${normalized}' on items in same level. ` +
          `Offending item: "${item.title}" (id: ${item.id})`,
        );
      }
      taken.add(normalized);
      result.push({ item, key: normalized });
    }
  }

  // Pass 2: auto-assign from title
  for (const item of items) {
    const existing = result.find((r) => r.item === item);
    if (existing) continue;

    for (const char of item.title.toLowerCase()) {
      if (/[a-z0-9]/.test(char) && !taken.has(char)) {
        taken.add(char);
        result.push({ item, key: char });
        break;
      }
    }
  }

  // Pass 3: sequential fallback
  const fallbackChars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (const item of items) {
    const existing = result.find((r) => r.item === item);
    if (existing) continue;

    for (const char of fallbackChars) {
      if (!taken.has(char)) {
        taken.add(char);
        result.push({ item, key: char });
        break;
      }
    }
  }

  return result;
}

/**
 * Fuzzy-filter keyed items by query.
 * Simple substring + character-sequence matching.
 */
export function filterKeyedItems(
  items: KeyedPaletteItem[],
  query: string,
): KeyedPaletteItem[] {
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

### 5.4 New file: `extensions/_shared/ui/command-palette.ts`

This is the main TUI component. It follows the same pattern as `ExtensionLauncher` and `ActionPicker`.

```ts
// extensions/_shared/ui/command-palette.ts

import { Key, matchesKey, truncateToWidth, visibleWidth, type Component, type TUI } from "@mariozechner/pi-tui";
import type { PiExtensionRegistration, PaletteItem } from "../registry";
import { assignKeys, filterKeyedItems, type KeyedPaletteItem } from "./palette-keys";

// ── Types ──

export type PaletteResult =
  | { kind: "execute"; extension: PiExtensionRegistration; item: PaletteItem; path: string[] }
  | { kind: "cancel" };

export interface CommandPaletteOptions {
  theme: { fg(color: string, text: string): string; bold(text: string): string };
  done(result: PaletteResult): void;
  requestRender?: () => void;
}

// ── Level stack ──

interface PaletteLevel {
  title: string;
  items: KeyedPaletteItem[];
}

// ── Component ──

export class CommandPaletteOverlay implements Component {
  private stack: PaletteLevel[];
  private cursor = 0;
  private scroll = 0;
  private query = "";
  private searchActive = false;
  private pathIds: string[] = [];

  constructor(private options: CommandPaletteOptions) {
    // Build root level from all registered extensions
    const rootItems = collectAndBuildRootLevel();
    this.stack = [rootItems];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      if (this.searchActive) {
        this.searchActive = false;
        this.query = "";
        this.markDirty();
        return;
      }
      this.options.done({ kind: "cancel" });
      return;
    }

    if (data === "/" && !this.searchActive) {
      this.searchActive = true;
      this.markDirty();
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      if (this.searchActive && this.query) {
        this.query = this.query.slice(0, -1);
        this.cursor = 0;
        this.markDirty();
        return;
      }
      this.goUp();
      return;
    }

    if (matchesKey(data, Key.left)) {
      this.goUp();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.cursor = Math.max(0, this.cursor - 1);
      this.markDirty();
      return;
    }

    if (matchesKey(data, Key.down)) {
      const max = this.visibleItems().length - 1;
      this.cursor = Math.min(max, this.cursor + 1);
      this.markDirty();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      const items = this.visibleItems();
      const entry = items[this.cursor];
      if (entry) this.activate(entry);
      return;
    }

    // Single printable character: check key match first
    if (data.length === 1 && data >= " " && data !== "\x7f") {
      const char = data.toLowerCase();
      const level = this.currentLevel();
      const match = level.items.find((entry) => entry.key === char);
      if (match) {
        this.activate(match);
        return;
      }
      // No key match — append to search if active
      if (this.searchActive) {
        this.query += data;
        this.cursor = 0;
        this.markDirty();
      }
    }
  }

  render(width: number): string[] {
    // ... rendering logic following the pseudocode in Part 4.5
    // Uses borderTop, frameRow, borderBottom helpers
    // Shows breadcrumb, item rows with key hints, footer
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  // ── Private helpers ──

  private currentLevel(): PaletteLevel {
    return this.stack[this.stack.length - 1]!;
  }

  private visibleItems(): KeyedPaletteItem[] {
    const level = this.currentLevel();
    if (!this.searchActive || !this.query) return level.items;
    return filterKeyedItems(level.items, this.query);
  }

  private activate(entry: KeyedPaletteItem): void {
    if (entry.item.children) {
      const childKeyed = assignKeys(entry.item.children);
      this.stack.push({ title: entry.item.title, items: childKeyed });
      this.pathIds.push(entry.item.id);
      this.cursor = 0;
      this.scroll = 0;
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
      return;
    }
    // No-op
  }

  private goUp(): void {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.pathIds.pop();
      this.cursor = 0;
      this.scroll = 0;
      this.query = "";
      this.searchActive = false;
      this.markDirty();
    }
  }

  private markDirty(): void {
    this.invalidate();
    this.options.requestRender?.();
  }
}
```

**Note:** The `KeyedPaletteItem` at the root level needs an `extension` field so the overlay knows which extension owns each item. The actual implementation wraps items:

```ts
interface RootKeyedItem extends KeyedPaletteItem {
  extension: PiExtensionRegistration;
}
```

### 5.5 New file: `extensions/command-palette/index.ts`

This is the extension entry point that registers the global shortcut and wires the overlay.

```ts
// extensions/command-palette/index.ts

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";
import { CommandPaletteOverlay, type PaletteResult } from "../_shared/ui/command-palette";

const DEFAULT_SHORTCUT = "ctrl+shift+p";

export default function commandPaletteExtension(pi: ExtensionAPI): void {
  registerPiExtension({
    id: "command-palette",
    name: "Command Palette",
    description: "Keyboard-driven hierarchical action menu for fast extension invocation.",
    commands: ["palette"],
    tags: ["palette", "launcher", "navigation"],
    actions: [
      {
        id: "open",
        title: "Open command palette",
        description: "Open the hierarchical command palette overlay.",
        default: true,
        run: async (ctx) => openPalette(ctx),
      },
    ],
    docs: [
      {
        id: "overview",
        title: "Command Palette overview",
        markdown: "# Command Palette\n\nPress `Ctrl+Shift+P` to open the palette.\n\nEach item shows a key hint. Press the key to drill into submenus or execute actions.\n\n- `Backspace` or `←` to go back one level.\n- `Esc` to close.\n- `/` to search within the current level.\n\nThe palette is for fast invocation of known actions. Use `/px` for discovery.",
      },
    ],
  });

  // Register the global shortcut
  pi.registerShortcut(DEFAULT_SHORTCUT, {
    description: "Open command palette",
    handler: async (ctx) => openPalette(ctx as ExtensionCommandContext),
  });

  // Register the /palette command as an alternative entry point
  pi.registerCommand("palette", {
    description: "Open the command palette",
    handler: async (_args, ctx) => openPalette(ctx),
  });
}

async function openPalette(ctx: ExtensionCommandContext): Promise<void> {
  const result = await ctx.ui.custom<PaletteResult>(
    (tui, theme, _keybindings, done) =>
      new CommandPaletteOverlay({
        theme,
        done,
        requestRender: () => tui.requestRender(),
      }),
    {
      overlay: true,
      overlayOptions: {
        anchor: "top-center",
        width: "90%",
        maxHeight: "40%",
        minWidth: 60,
        margin: 0,
      },
    },
  );

  if (result.kind === "execute" && result.item.run) {
    await result.item.run(ctx, {
      extension: result.extension,
      path: result.path,
      close: () => {},  // palette already closed
    });
  }
}
```

---

## Part 6: Migration Examples — Adding Palette Items to Existing Extensions

Each existing extension adds a `palette` array to its `registerPiExtension()` call. The handler functions are typically the same ones used by `actions`.

### 6.1 `response-viewer` — two-level palette

```ts
// extensions/response-viewer/index.ts (addition)

registerPiExtension({
  id: "response-viewer",
  name: "Response Viewer",
  // ... existing fields ...

  palette: [
    {
      id: "view",
      title: "View last response",
      key: "v",
      run: async (ctx) => viewLastResponse(ctx),
    },
    {
      id: "copy",
      title: "Copy to clipboard",
      key: "c",
      run: async (ctx) => copyLastResponse(ctx),
    },
    {
      id: "save",
      title: "Save to file",
      key: "s",
      run: async (ctx) => saveLastResponse(ctx),
    },
  ],
});
```

User flow: `Ctrl+Shift+P` → `r` (Responses) → `v` (View).

### 6.2 `docmgr` — three-level palette with submenus

```ts
// extensions/docmgr/index.ts (addition)

registerPiExtension({
  id: "docmgr",
  name: "Docs & Tickets",
  // ... existing fields ...

  palette: [
    {
      id: "browse-tickets",
      title: "Browse tickets",
      key: "b",
      run: async (ctx) => openTicketBrowser(ctx),
    },
    {
      id: "browse-docs",
      title: "Browse docs",
      key: "d",
      children: [
        {
          id: "by-id",
          title: "Open doc by ID",
          key: "i",
          run: async (ctx) => openDocById(ctx),
        },
        {
          id: "recent",
          title: "Recent docs",
          key: "r",
          run: async (ctx) => openRecentDocs(ctx),
        },
      ],
    },
    {
      id: "tasks",
      title: "Task list",
      key: "t",
      run: async (ctx) => openTaskList(ctx),
    },
  ],
});
```

User flow: `Ctrl+Shift+P` → `d` (Docs & Tickets) → `d` (Browse docs) → `r` (Recent docs).

### 6.3 `session-tagger` — single-level palette

```ts
// extensions/session-tagger/index.ts (addition)

registerPiExtension({
  id: "session-tagger",
  name: "Session Tagger",
  // ... existing fields ...

  palette: [
    {
      id: "quick-tag",
      title: "Quick tag",
      key: "t",
      run: async (ctx) => quickTagDialog(pi, ctx),
    },
    {
      id: "browse-tags",
      title: "Browse tags",
      key: "b",
      run: async (ctx) => browseTags(pi, ctx, ""),
    },
  ],
});
```

User flow: `Ctrl+Shift+P` → `s` (Session Tagger) → `t` (Quick tag).

### 6.4 `pinned-skills` — palette with preview

```ts
registerPiExtension({
  id: "pinned-skills",
  name: "Pinned Skills",
  // ... existing fields ...

  palette: [
    {
      id: "menu",
      title: "Open checklist",
      key: "c",
      run: async (ctx) => openPinnedSkillsMenu(ctx),
    },
    {
      id: "preview",
      title: "Preview prompt block",
      key: "p",
      run: async (ctx) => previewPinnedSkills(ctx),
    },
    {
      id: "list",
      title: "List available skills",
      key: "l",
      run: async (ctx) => openAvailableSkillsList(ctx),
    },
  ],
});
```

### 6.5 Root-level key conflict resolution

All extensions register top-level palette items. The root level might look like:

| Extension | Title | Wants key | Assigned key |
|-----------|-------|-----------|-------------|
| command-palette | (no palette items — it IS the palette) | — | — |
| compaction-meter | Compaction | `c` | `c` |
| docmgr | Docs & Tickets | `d` | `d` |
| pinned-skills | Pinned Skills | `p` | `p` |
| response-viewer | Responses | `r` | `r` |
| session-tagger | Session Tagger | `s` | `s` |
| kanban-demo | Kanban Demo | `k` | `k` |
| launcher | Launcher | `l` | `l` |
| agent-env | Environment | `e` | `e` |
| compaction-title | Compact Title | `c` (conflict!) | `o` (from "cOmpact") |

The auto-assignment algorithm handles the conflict: compaction-meter gets `c` (registered first alphabetically), compaction-title falls back to `o` from its title. Extensions that care about their key should set `key` explicitly and document the assignment.

---

## Part 7: Data Flow Diagram

The complete data flow from registration to execution:

```text
┌──────────────────────────────────────────────────────────────────┐
│                    REGISTRATION (load time)                      │
│                                                                  │
│  Extension A ─── registerPiExtension({ palette: [...] }) ────┐  │
│  Extension B ─── registerPiExtension({ palette: [...] }) ────┤  │
│  Extension C ─── registerPiExtension({ palette: [...] }) ────┤  │
│                                                               │  │
│                                          global registry Map  ◄─┘  │
│                                            (id → registration)  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            │  User presses Ctrl+Shift+P
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    OPENING THE PALETTE                            │
│                                                                  │
│  command-palette/index.ts                                        │
│    └─ openPalette(ctx)                                           │
│         └─ ctx.ui.custom<PaletteResult>(                         │
│              (tui, theme, _, done) =>                            │
│                new CommandPaletteOverlay({ theme, done, ... })   │
│            )                                                     │
│                                                                  │
│  CommandPaletteOverlay constructor:                              │
│    └─ collectPaletteItems()   ← reads registry                  │
│    └─ assignKeys()            ← deterministic key assignment    │
│    └─ pushes root PaletteLevel onto stack                       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            │  User presses keys (e.g., r, v)
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    KEYBOARD INTERACTION                           │
│                                                                  │
│  handleInput(data):                                              │
│    ├─ "r" matches root-level item "Responses" (submenu)         │
│    │   └─ push PaletteLevel({ title: "Responses", items: [...] })│
│    │   └─ assignKeys() for children                             │
│    │   └─ markDirty() → requestRender() → render()              │
│    │                                                              │
│    └─ "v" matches child-level item "View last response" (leaf)  │
│        └─ done({ kind: "execute", extension, item, path })       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            │  ctx.ui.custom() resolves
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    EXECUTION                                      │
│                                                                  │
│  openPalette(ctx) receives PaletteResult:                        │
│    └─ result.kind === "execute"                                  │
│    └─ result.item.run(ctx, paletteContext)                       │
│         └─ Extension's handler runs                              │
│         └─ May call ctx.ui.notify(), open overlays, etc.         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Settings and Configuration

### 8.1 Configurable shortcut

The default shortcut is `ctrl+shift+p`. Users should be able to change this. Add a schema settings contribution:

```ts
settings: {
  kind: "schema",
  schema: {
    version: 1,
    title: "Command Palette Settings",
    sections: [{
      id: "main",
      title: "Keyboard Shortcut",
      fields: [{
        id: "shortcut",
        label: "Palette shortcut",
        type: "string",
        description: "Global keyboard shortcut to open the command palette.",
        defaultValue: "ctrl+shift+p",
      }],
    }],
  },
  load: () => ({ shortcut: currentShortcut }),
  onApply: (values, ctx) => {
    currentShortcut = values.shortcut as string;
    ctx.ui.notify(`Command palette shortcut: ${currentShortcut}`, "info");
  },
},
```

**Implementation note:** Pi's `registerShortcut()` is called once at load time. Changing the shortcut at runtime requires unregistering the old shortcut and registering the new one. Check whether the Pi extension API supports `unregisterShortcut()`. If not, the shortcut change takes effect on the next `/reload`.

### 8.2 Configurable overlay position

Add optional settings for the overlay anchor and size:

```ts
fields: [
  // ... shortcut field ...
  {
    id: "anchor",
    label: "Overlay position",
    type: "select",
    options: [
      { value: "top-center", label: "Top center (VS Code style)" },
      { value: "center", label: "Center (modal style)" },
    ],
    defaultValue: "top-center",
  },
],
```

---

## Part 9: Testing Strategy

### 9.1 Unit tests: `palette-keys.ts`

The key assignment algorithm is pure and should have thorough unit tests.

```ts
// Test: explicit keys are respected
expect(assignKeys([
  { id: "a", title: "Alpha", key: "x" },
  { id: "b", title: "Beta", key: "y" },
])).toEqual([
  { item: items[0], key: "x" },
  { item: items[1], key: "y" },
]);

// Test: auto-assign from title
expect(assignKeys([
  { id: "a", title: "View" },
  { id: "b", title: "Copy" },
])).toEqual([
  { item: items[0], key: "v" },  // first unique char of "View"
  { item: items[1], key: "c" },  // first unique char of "Copy"
]);

// Test: conflict resolution falls back to next title char
expect(assignKeys([
  { id: "a", title: "Alpha" },
  { id: "b", title: "Apple" },  // 'a' taken, falls to 'p'... wait 'p' in "Apple"
])).toEqual([
  { item: items[0], key: "a" },
  { item: items[1], key: "p" },
]);

// Test: duplicate explicit key throws
expect(() => assignKeys([
  { id: "a", title: "Alpha", key: "x" },
  { id: "b", title: "Beta", key: "x" },
])).toThrow();

// Test: filterKeyedItems matches by title substring
// Test: filterKeyedItems matches by tag
// Test: empty query returns all items
```

### 9.2 Integration tests: load check

```bash
timeout 20 pi --list-models
```

This catches extension load errors. After adding `palette` fields to existing extensions, this must pass.

### 9.3 Manual smoke tests

```text
1. /reload                     # reload extensions
2. Ctrl+Shift+P               # palette opens
3. Press a key                 # drill into submenu or execute action
4. Press Backspace             # go back one level
5. Press Esc                   # close palette
6. Press /                     # enter search mode
7. Type query                  # items filter
8. Press Esc                   # leave search mode
9. Ctrl+Shift+P → r → v       # full drill-down: Responses → View
10. /px                        # existing launcher still works
11. /palette                   # command entry point works
```

### 9.4 Edge cases to test

- Extension with no `palette` field (should not appear in palette).
- Extension with empty `palette: []` (same).
- Extension with palette items that have no `run` and no `children` (no-op).
- Palette item with `children` where all children are also submenus (deep nesting).
- Two extensions claiming the same explicit `key` at the root level (should throw on registration).
- Very long titles that need truncation.
- Many extensions (20+) so the root level overflows the overlay height and needs scrolling.

---

## Part 10: Implementation Checklist

### Phase 1: Core types and registry (no UI)

- [ ] Add `PaletteItem`, `PaletteActionHandler`, `PaletteActionContext` to `registry.ts`.
- [ ] Add `palette?: PaletteItem[]` field to `PiExtensionRegistration`.
- [ ] Add `collectPaletteItems()` to `registry.ts`.
- [ ] Create `extensions/_shared/ui/palette-keys.ts` with `assignKeys()` and `filterKeyedItems()`.
- [ ] Write unit tests for `assignKeys()`.

### Phase 2: TUI overlay

- [ ] Create `extensions/_shared/ui/command-palette.ts` with `CommandPaletteOverlay`.
- [ ] Implement `render()` with border, breadcrumb, item rows, footer.
- [ ] Implement `handleInput()` with key matching, stack navigation, search.
- [ ] Test rendering at narrow (60 col) and wide (120 col) widths.

### Phase 3: Extension wiring

- [ ] Create `extensions/command-palette/index.ts`.
- [ ] Register `registerPiExtension()` with metadata, actions, docs, settings.
- [ ] Register `pi.registerShortcut("ctrl+shift+p", ...)`.
- [ ] Register `/palette` command.
- [ ] Implement `openPalette()` with `ctx.ui.custom()`.

### Phase 4: Migration of existing extensions

- [ ] Add `palette` to `response-viewer`.
- [ ] Add `palette` to `session-tagger`.
- [ ] Add `palette` to `pinned-skills`.
- [ ] Add `palette` to `docmgr` (with submenus).
- [ ] Add `palette` to other extensions as appropriate.
- [ ] Verify no key conflicts at root level.

### Phase 5: Polish

- [ ] Add settings for shortcut and overlay position.
- [ ] Update `docs/pi-shared-extension-framework-guide.md` with palette documentation.
- [ ] Add palette entry to the `/px` launcher (press `p` to open palette).
- [ ] Final smoke test pass.

---

## Part 11: Reference — Existing File Map

For quick lookup during implementation:

```
extensions/
  _shared/
    registry.ts                 ← MODIFY: add PaletteItem types, palette field, collectPaletteItems()
    ui/
      extension-launcher.ts     ← READ: rendering pattern, border helpers
      action-picker.ts          ← READ: two-pane pattern, key handling
      doc-viewer.ts             ← READ: scrollable content pattern
      settings-view.ts          ← READ: settings pattern
      dashboard-overlay.ts      ← READ: dashboard rendering
      palette-keys.ts           ← CREATE: key assignment algorithm
      command-palette.ts        ← CREATE: CommandPaletteOverlay component
  command-palette/
    index.ts                    ← CREATE: extension entry point
  launcher/
    index.ts                    ← MODIFY: optional `p` key for palette
  response-viewer/
    index.ts                    ← MODIFY: add palette field
  session-tagger/
    index.ts                    ← MODIFY: add palette field
  pinned-skills/
    index.ts                    ← MODIFY: add palette field
  docmgr/
    index.ts                    ← MODIFY: add palette field with submenus
```

---

## Part 12: Glossary

| Term | Definition |
|------|-----------|
| **Palette** | The command palette overlay opened by `Ctrl+Shift+P`. |
| **PaletteItem** | A single entry in the palette hierarchy — either a leaf action or a submenu. |
| **Key hint** | The single character displayed next to each palette item that the user can press to select it. |
| **Level** | One "page" of the palette. The root level shows all extensions; each submenu adds a new level. |
| **Stack** | The navigation stack of levels. Pushed when entering a submenu, popped when going back. |
| **Root level** | The first level shown when the palette opens. Contains one item per extension that contributes palette items. |
| **Leaf** | A palette item with a `run` handler (no `children`). Executing it closes the palette. |
| **Submenu** | A palette item with `children` (no `run`). Selecting it pushes a new level. |
| **Auto-key assignment** | The deterministic algorithm that assigns key hints based on title characters. |
| **Breadcrumb** | The path shown in the overlay border, e.g., "Command Palette ─ Responses". |
| **`/px` launcher** | The existing extension launcher modal, opened with `/px`. Not replaced by the palette. |
| **Registry** | The global `Map<string, PiExtensionRegistration>` that stores all extension contributions. |
