# Pi TUI UI Authoring Guide

This guide explains how to write user interfaces for Pi extensions using `@mariozechner/pi-tui`, with a special focus on turning a sketched hierarchy such as YAML into working TypeScript.

The short version: Pi UIs are not React/JSX. The runtime contract is simpler and lower-level: a component renders terminal lines (`string[]`) and optionally handles keyboard input. You can still build a component hierarchy, either by using the built-in widget classes (`Container`, `Box`, `Text`, `Spacer`, `Markdown`, etc.) or by creating your own small layout layer that turns declarative nodes into `string[]`.

## Table of contents

- [Mental model](#mental-model)
- [Where UIs appear in extensions](#where-uis-appear-in-extensions)
- [The core `Component` contract](#the-core-component-contract)
- [Two ways to build a hierarchy](#two-ways-to-build-a-hierarchy)
- [Built-in widget hierarchy](#built-in-widget-hierarchy)
- [Custom modal components](#custom-modal-components)
- [Mapping YAML hierarchy to TypeScript](#mapping-yaml-hierarchy-to-typescript)
- [A small declarative layout layer](#a-small-declarative-layout-layer)
- [Worked example: extension launcher modal](#worked-example-extension-launcher-modal)
- [Keyboard input and state](#keyboard-input-and-state)
- [Width, wrapping, and ANSI safety](#width-wrapping-and-ansi-safety)
- [Theming](#theming)
- [Patterns from existing extensions](#patterns-from-existing-extensions)
- [Recommended file structure](#recommended-file-structure)
- [Checklist](#checklist)

## Mental model

Pi terminal UI components are line renderers:

```ts
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

A component receives the available terminal width and returns one string per rendered terminal row. Each returned line must be no wider than `width` in terminal display cells. ANSI escape sequences are allowed, but visible width must still fit.

This is closer to immediate-mode UI than browser DOM UI:

```text
state + terminal width -> render() -> string[]
keyboard input -> handleInput() -> mutate state -> request render
```

However, you can still organize UI as a hierarchy:

```yaml
LauncherModal:
  Header:
    SearchInput:
  Body:
    ExtensionListPane:
    DetailsPane:
  Footer:
```

The key is deciding whether that hierarchy is represented by built-in `@mariozechner/pi-tui` components or by your own render helpers.

## Where UIs appear in extensions

Pi extensions typically create UI in four places.

### 1. Interactive command overlay

Use this for slash-command modals such as `/px`, `/skill`, `/pinned-skills menu`.

```ts
pi.registerCommand("px", {
  description: "Open extension launcher",
  handler: async (_args, ctx) => {
    const result = await ctx.ui.custom<string | null>(
      (tui, theme, keybindings, done) =>
        new MyModal(tui, theme, done),
      {
        overlay: true,
        overlayOptions: {
          anchor: "center",
          width: "85%",
          maxHeight: "80%",
          margin: 1,
        },
      },
    );

    if (result) ctx.ui.notify(`Selected ${result}`, "info");
  },
});
```

### 2. Message renderer

Use this to render custom session entries.

```ts
pi.registerMessageRenderer("my-entry", (message, options, theme) => {
  const root = new Container();
  root.addChild(new Text(theme.fg("accent", "My Entry"), 0, 0));
  root.addChild(new Text(String(message.content), 1, 0));
  return root;
});
```

### 3. Tool renderer

Custom tools can return `Component` instances from `renderCall` and `renderResult`.

```ts
renderResult(result, options, theme, context) {
  const root = new Container();
  root.addChild(new Text(theme.fg("success", "Done"), 0, 0));
  root.addChild(new Markdown(result.content[0]?.text ?? "", 0, 0, getMarkdownTheme()));
  return root;
}
```

### 4. Status widgets

For compact one-line or few-line status displays, use `ctx.ui.setWidget()` or `ctx.ui.setStatus()`.

```ts
ctx.ui.setStatus("my-ext", "Ready");
ctx.ui.setWidget("my-ext", ["\x1b[2mMy extension is active\x1b[0m"]);
```

## The core `Component` contract

A custom component class looks like this:

```ts
import { Key, matchesKey, truncateToWidth, type Component, type TUI } from "@mariozechner/pi-tui";

class PickerModal implements Component {
  private selected = 0;

  constructor(
    private tui: TUI,
    private done: (value: string | null) => void,
    private items: string[],
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.done(null);
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.selected = Math.min(this.selected + 1, this.items.length - 1);
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.selected = Math.max(this.selected - 1, 0);
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      this.done(this.items[this.selected] ?? null);
      return;
    }
  }

  render(width: number): string[] {
    return this.items.map((item, i) => {
      const prefix = i === this.selected ? "> " : "  ";
      return truncateToWidth(prefix + item, width, "…");
    });
  }

  invalidate(): void {
    // Clear cached render output here if you cache any.
  }
}
```

Important rules:

- `render(width)` must be pure-ish: read state, produce rows.
- `handleInput(data)` mutates state and calls `tui.requestRender()` when the component should redraw.
- `done(value)` closes a `ctx.ui.custom()` prompt and resolves the awaiting promise.
- `invalidate()` should clear cached lines if your component caches rendered output.
- If you create timers, file watchers, or subprocesses, implement `dispose()` even though it is not part of the minimal interface; Pi will dispose overlay components when closed.

## Two ways to build a hierarchy

There are two practical hierarchy styles.

### Style A: Built-in widget tree

Use built-ins when the layout is mostly vertical and not heavily interactive:

```yaml
Container:
  children:
    Text: "Header"
    Spacer: 1
    Box:
      children:
        Markdown: body
```

This maps directly to:

```ts
const root = new Container();
root.addChild(new Text("Header", 0, 0));
root.addChild(new Spacer(1));

const box = new Box(1, 1, (s) => theme.bg("customMessageBg", s));
box.addChild(new Markdown(body, 0, 0, getMarkdownTheme()));
root.addChild(box);

return root;
```

### Style B: Custom modal with render helpers

Use this for rich overlays with search, selection, scrolling, multiple panes, borders, and a footer:

```yaml
LauncherModal:
  Header:
  Body:
    left: ExtensionListPane
    right: DetailsPane
  Footer:
```

This maps to helper methods:

```ts
class LauncherModal implements Component {
  render(width: number): string[] {
    const w = Math.max(72, Math.min(width, 110));
    return [
      this.renderTopBorder(w),
      ...this.renderHeader(w),
      this.renderDivider(w),
      ...this.renderBody(w),
      this.renderDivider(w),
      ...this.renderFooter(w),
      this.renderBottomBorder(w),
    ];
  }

  private renderHeader(width: number): string[] { return []; }
  private renderBody(width: number): string[] { return []; }
  private renderFooter(width: number): string[] { return []; }
  private renderListPane(width: number): string[] { return []; }
  private renderDetailsPane(width: number): string[] { return []; }

  invalidate(): void {}
}
```

Most complex Pi modal examples use Style B because the final output is easier to control as fixed-width rows.

## Built-in widget hierarchy

Import primitives from `@mariozechner/pi-tui`:

```ts
import {
  Box,
  Container,
  Markdown,
  Spacer,
  Text,
  type Component,
  type Widget,
} from "@mariozechner/pi-tui";
```

The commonly used widgets are:

- `Text`: multiline wrapped text with optional padding and background function.
- `Container`: vertical stack of child components.
- `Box`: padded container with optional background styling.
- `Spacer`: vertical blank space.
- `Markdown`: markdown rendering with syntax/theme support.
- `Image`: inline image rendering in supported terminals.
- `SelectList`, `SettingsList`, `Input`, and `Editor` where available in the installed TUI package.

A static panel might be:

```ts
function renderExtensionDetails(ext: ExtensionInfo, theme: Theme): Component {
  const root = new Container();

  root.addChild(new Text(theme.fg("accent", theme.bold(ext.name)), 0, 0));
  root.addChild(new Spacer(1));
  root.addChild(new Text(ext.description, 0, 0));

  if (ext.commands.length) {
    root.addChild(new Spacer(1));
    root.addChild(new Text(theme.fg("dim", "Commands"), 0, 0));
    for (const command of ext.commands) {
      root.addChild(new Text(`  /${command}`, 0, 0));
    }
  }

  return root;
}
```

This is easy to author, but less convenient for a two-pane bordered modal because built-ins mostly stack vertically. For horizontal splits and precise borders, write render helpers.

## Custom modal components

A modal component usually owns:

- input state (`query`, cursor position, selected index),
- derived state (`filtered` items),
- scroll state,
- render helpers,
- close callback (`done`).

Skeleton:

```ts
class SearchModal<T> implements Component {
  private query = "";
  private selected = 0;
  private scroll = 0;
  private filtered: T[];

  constructor(
    private tui: TUI,
    private theme: Theme,
    private items: T[],
    private done: (result: T | null) => void,
  ) {
    this.filtered = items;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return this.done(null);
    if (matchesKey(data, Key.enter)) return this.done(this.filtered[this.selected] ?? null);

    if (matchesKey(data, Key.down)) {
      this.selected = Math.min(this.selected + 1, this.filtered.length - 1);
      this.ensureSelectedVisible();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.selected = Math.max(this.selected - 1, 0);
      this.ensureSelectedVisible();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      this.query = this.query.slice(0, -1);
      this.recomputeFilter();
      this.tui.requestRender();
      return;
    }

    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.query += data;
      this.recomputeFilter();
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    const w = Math.max(64, Math.min(width, 110));
    return renderModalFrame({
      width: w,
      title: "Search",
      header: this.renderHeader(w - 4),
      body: this.renderBody(w - 4),
      footer: this.renderFooter(w - 4),
      theme: this.theme,
    });
  }

  invalidate(): void {}

  private recomputeFilter(): void {
    this.filtered = fuzzyFilter(this.items, this.query);
    this.selected = 0;
    this.scroll = 0;
  }

  private ensureSelectedVisible(): void {
    // Keep selected item inside the visible window.
  }
}
```

## Mapping YAML hierarchy to TypeScript

A YAML sketch should be treated as a UI blueprint, not as runtime syntax unless you build a parser. The most useful mapping is:

| YAML node | TypeScript implementation |
| --- | --- |
| `LauncherModal` | `class LauncherModal implements Component` |
| `props` | constructor arguments and constants |
| `Header` | `private renderHeader(innerWidth): string[]` |
| `SearchInput` | `query` state + row rendering + keyboard handling |
| `Body` | `private renderBody(innerWidth): string[]` |
| `layout: horizontal-split` | `hjoin(leftRows, rightRows, leftWidth, rightWidth)` |
| `ExtensionListPane` | `private renderListPane(width): string[]` |
| `DetailsPane` | `private renderDetailsPane(width): string[]` |
| `repeat` | `.map(...)` or a loop with scrolling |
| `selected` | compare item index to `this.selected` |
| `Footer` | `private renderFooter(innerWidth): string[]` |
| `when` | `if (...) lines.push(...)` |

Example YAML:

```yaml
LauncherModal:
  props:
    title: "Pi Extensions"
    overlay: true
    width: "85%"
  children:
    Header:
      children:
        SearchInput:
          value: query
        HelpText: "Enter open · Esc close · ↑↓ navigate"
    Body:
      layout: horizontal-split
      children:
        ExtensionListPane:
          width: 36
          children:
            GroupList:
              groupBy: primaryTag
        DetailsPane:
          grow: 1
    Footer:
      children:
        MatchSummary:
```

Equivalent class shape:

```ts
class LauncherModal implements Component {
  private query = "";
  private selected = 0;

  render(width: number): string[] {
    const modalWidth = Math.max(74, Math.min(width, 112));
    const innerWidth = modalWidth - 4;

    return frame({
      width: modalWidth,
      title: "Pi Extensions",
      sections: [
        this.renderHeader(innerWidth),
        this.renderBody(innerWidth),
        this.renderFooter(innerWidth),
      ],
      theme: this.theme,
    });
  }

  private renderHeader(width: number): string[] {
    return [
      row(`Search  ${this.query || dim("type to filter")}`, width),
      row(`${this.filtered.length} extensions · Enter open · Esc close · ↑↓ navigate`, width),
    ];
  }

  private renderBody(width: number): string[] {
    const leftWidth = 34;
    const rightWidth = width - leftWidth - 3;
    return hsplit(
      this.renderListPane(leftWidth),
      this.renderDetailsPane(rightWidth),
      { leftWidth, rightWidth },
    );
  }

  private renderFooter(width: number): string[] {
    return [
      row(this.query || "Tip: type to filter extensions", width),
      row(`matched: ${this.filtered.map((e) => e.name).join(", ")}`, width),
    ];
  }

  invalidate(): void {}
}
```

## A small declarative layout layer

If you want the YAML hierarchy to feel directly implementable, add a tiny local UI kit. It does not need to be a full framework. It can be a set of `RenderNode` objects that compile to lines.

### Minimal types

```ts
export interface RenderContext {
  width: number;
  theme: Theme;
}

export interface RenderNode {
  render(ctx: RenderContext): string[];
}
```

### Primitive nodes

```ts
export function text(value: string): RenderNode {
  return {
    render: ({ width }) => [truncateToWidth(value, width, "…")],
  };
}

export function vstack(children: RenderNode[], gap = 0): RenderNode {
  return {
    render(ctx) {
      const lines: string[] = [];
      children.forEach((child, index) => {
        if (index > 0) lines.push(...Array(gap).fill(""));
        lines.push(...child.render(ctx));
      });
      return lines;
    },
  };
}

export function hsplit(left: RenderNode, right: RenderNode, leftWidth: number): RenderNode {
  return {
    render(ctx) {
      const gutter = " │ ";
      const rightWidth = Math.max(1, ctx.width - leftWidth - visibleWidth(gutter));
      const leftRows = left.render({ ...ctx, width: leftWidth });
      const rightRows = right.render({ ...ctx, width: rightWidth });
      const height = Math.max(leftRows.length, rightRows.length);
      const rows: string[] = [];

      for (let i = 0; i < height; i++) {
        const l = padToWidth(leftRows[i] ?? "", leftWidth);
        const r = padToWidth(rightRows[i] ?? "", rightWidth);
        rows.push(l + gutter + r);
      }
      return rows;
    },
  };
}
```

### Modal node

```ts
export function modal(title: string, child: RenderNode): RenderNode {
  return {
    render(ctx) {
      const inner = Math.max(1, ctx.width - 2);
      const childRows = child.render({ ...ctx, width: inner - 2 });
      return [
        topBorder(ctx.width, title),
        ...childRows.map((line) => `│ ${padToWidth(line, inner - 2)} │`),
        bottomBorder(ctx.width),
      ];
    },
  };
}
```

### Use it inside a Pi component

```ts
class LauncherModal implements Component {
  render(width: number): string[] {
    const tree = modal(
      "Pi Extensions",
      vstack([
        this.headerNode(),
        separatorNode(),
        hsplit(this.listNode(), this.detailsNode(), 34),
        separatorNode(),
        this.footerNode(),
      ]),
    );

    return tree.render({ width: Math.min(width, 112), theme: this.theme });
  }

  private headerNode(): RenderNode {
    return vstack([
      text(`Search  ${this.query || "type to filter"}`),
      text(`${this.filtered.length} extensions · Enter open · Esc close · ↑↓ navigate`),
    ]);
  }

  invalidate(): void {}
}
```

This gives you a React-ish authoring model without fighting the Pi renderer. You still return `string[]` at the boundary.

## Worked example: extension launcher modal

Target sketch:

```text
╭────────────────────────────── Pi Extensions ──────────────────────────────╮
│ Search  compact█                                                           │
│                                                                            │
│  11 extensions  ·  Enter open  ·  Esc close  ·  ↑↓ navigate                │
├───────────────────────────────┬────────────────────────────────────────────┤
│ GROUP                         │ DETAILS                                    │
│                               │                                            │
│  ▸ Compaction                 │ Compaction Meter                           │
│    ● Compaction Meter         │ Shows remaining context tokens before      │
│      compact-meter · cm       │ automatic compaction and exposes status    │
│                               │ commands.                                  │
├───────────────────────────────┴────────────────────────────────────────────┤
│ compact                                                                    │
│ matched: Compaction Meter, Compaction Title                                │
╰────────────────────────────────────────────────────────────────────────────╯
```

A clean implementation is a single interactive component plus small pure rendering helpers.

### Data model

```ts
interface LauncherItem {
  id: string;
  name: string;
  description?: string;
  commands: string[];
  tags: string[];
}

interface GroupedItem {
  kind: "group" | "item";
  group: string;
  item?: LauncherItem;
  itemIndex?: number;
}
```

### State model

```ts
class ExtensionLauncher implements Component {
  private query = "";
  private cursor = 0;
  private scroll = 0;
  private filtered: LauncherItem[];

  constructor(
    private tui: TUI,
    private theme: Theme,
    private items: LauncherItem[],
    private done: (selected: LauncherItem | null) => void,
  ) {
    this.filtered = items;
  }
}
```

### Render decomposition

```text
ExtensionLauncher.render(width)
  ├─ compute modal width and pane widths
  ├─ renderHeader(innerWidth)
  ├─ renderSplitBody(leftWidth, rightWidth)
  │   ├─ renderGroupedList(leftWidth)
  │   └─ renderDetails(rightWidth)
  └─ renderFooter(innerWidth)
```

### Example methods

```ts
private renderBody(innerWidth: number): string[] {
  const leftWidth = 31;
  const rightWidth = innerWidth - leftWidth - 1;
  const left = this.renderGroupedList(leftWidth);
  const right = this.renderDetails(rightWidth);
  return joinColumns(left, right, leftWidth, rightWidth, "│");
}

private renderGroupedList(width: number): string[] {
  const rows: string[] = [sectionHeader("GROUP", width), ""];
  const grouped = groupExtensions(this.filtered);

  for (const group of grouped) {
    rows.push(truncateToWidth(`  ▸ ${group.name}`, width, "…"));

    for (const item of group.items) {
      const index = this.filtered.indexOf(item);
      const selected = index === this.cursor;
      const marker = selected ? "●" : "○";
      rows.push(truncateToWidth(`    ${marker} ${item.name}`, width, "…"));
      rows.push(truncateToWidth(`      ${item.tags.join(" · ") || item.id}`, width, "…"));
      rows.push("");
    }
  }

  return rows;
}

private renderDetails(width: number): string[] {
  const item = this.filtered[this.cursor];
  if (!item) return [sectionHeader("DETAILS", width), "", "No match"];

  const rows = [sectionHeader("DETAILS", width), "", this.theme.fg("accent", item.name)];
  rows.push(...wrapTextWithAnsi(item.description || "No description.", width));

  if (item.commands.length) {
    rows.push("", this.theme.fg("dim", "Commands"));
    for (const command of item.commands) rows.push(`  /${command}`);
  }

  if (item.tags.length) {
    rows.push("", this.theme.fg("dim", "Tags"), `  ${item.tags.join("  ")}`);
  }

  rows.push("", this.theme.fg("dim", "Registered as"), `  ${item.id}`);
  return rows.map((line) => truncateToWidth(line, width, "…"));
}
```

### Open from an extension command

```ts
pi.registerCommand("px", {
  description: "Open extension launcher",
  handler: async (_args, ctx) => {
    const selected = await ctx.ui.custom<LauncherItem | null>(
      (tui, theme, _keybindings, done) =>
        new ExtensionLauncher(tui, theme, getRegisteredExtensions(), done),
      {
        overlay: true,
        overlayOptions: {
          anchor: "center",
          width: "85%",
          maxHeight: "80%",
          margin: 1,
        },
      },
    );

    if (selected) {
      ctx.ui.notify(`Selected extension: ${selected.name} (${selected.id})`, "info");
    }
  },
});
```

## Keyboard input and state

Use `matchesKey()` and `Key` rather than comparing raw escape sequences.

```ts
import { Key, matchesKey } from "@mariozechner/pi-tui";

handleInput(data: string): void {
  if (matchesKey(data, Key.escape)) return this.done(null);
  if (matchesKey(data, Key.enter)) return this.done(this.currentItem());
  if (matchesKey(data, Key.up)) return this.move(-1);
  if (matchesKey(data, Key.down)) return this.move(1);
  if (matchesKey(data, Key.ctrl("u"))) return this.clearQuery();
  if (matchesKey(data, Key.backspace)) return this.deleteChar();

  if (data.length === 1 && data.charCodeAt(0) >= 32) {
    this.query += data;
    this.applyFilter();
    this.tui.requestRender();
  }
}
```

Recommended modal keymap:

| Key | Behavior |
| --- | --- |
| `Esc` | close/cancel |
| `Enter` | accept selected item |
| `↑` / `↓` | move selection |
| `PageUp` / `PageDown` | optional fast scroll |
| `Home` / `End` | optional first/last item |
| `Backspace` | delete one query character |
| `Ctrl+U` | clear query |
| printable char | append to query |

Always clamp selection after filtering:

```ts
private applyFilter(): void {
  this.filtered = fuzzyFilter(this.items, this.query);
  this.cursor = Math.min(this.cursor, Math.max(0, this.filtered.length - 1));
  if (this.queryChangedByTyping) this.cursor = 0;
  this.ensureVisible();
}
```

## Width, wrapping, and ANSI safety

Terminal UI breaks if rows are too wide. Use the TUI helpers:

```ts
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
```

Rules:

- Use `visibleWidth()` instead of `.length` when a string may contain ANSI codes or wide Unicode characters.
- Use `truncateToWidth(value, width, "…")` for single-line rows.
- Use `wrapTextWithAnsi(value, width)` for paragraphs with ANSI styling.
- Pad by visible width, not string length.
- Every rendered row from `render(width)` must fit `width`.

Useful helpers:

```ts
function padToWidth(value: string, width: number): string {
  const current = visibleWidth(value);
  if (current >= width) return truncateToWidth(value, width, "…");
  return value + " ".repeat(width - current);
}

function joinColumns(
  leftRows: string[],
  rightRows: string[],
  leftWidth: number,
  rightWidth: number,
  divider = "│",
): string[] {
  const height = Math.max(leftRows.length, rightRows.length);
  const rows: string[] = [];

  for (let i = 0; i < height; i++) {
    rows.push(
      padToWidth(leftRows[i] ?? "", leftWidth) +
      divider +
      padToWidth(rightRows[i] ?? "", rightWidth),
    );
  }

  return rows;
}
```

## Theming

The theme object passed into `ctx.ui.custom()` factories and renderers provides helpers such as:

```ts
const title = theme.fg("accent", theme.bold("Pi Extensions"));
const muted = theme.fg("dim", "Enter open · Esc close");
const selected = theme.bg("selectedBg", theme.fg("text", row));
```

Common foreground roles:

- `text`
- `accent`
- `muted`
- `dim`
- `success`
- `error`
- `warning`
- `border`
- `borderAccent`
- `borderMuted`
- `customMessageLabel`
- `toolTitle`
- `toolOutput`

Common background roles:

- `selectedBg`
- `customMessageBg`
- `toolPendingBg`
- `toolSuccessBg`
- `toolErrorBg`

Best practices:

- Do not hard-code 256-color ANSI unless you need a very specific style.
- Prefer semantic theme roles (`accent`, `dim`, `selectedBg`).
- Build themed strings during `render()`, not once in the constructor, so theme changes work.
- If you cache rendered strings, clear the cache in `invalidate()`.

## Patterns from existing extensions

### `tui-showcase`

The showcase is a custom overlay component. It uses a `Component` class, local state, `handleInput()`, and a set of render helper methods. It demonstrates the core pattern for rich interactive UIs:

```text
TuiShowcaseOverlay
  handleInput()
  render()
    frame()
    renderTabs()
    renderBody()
      renderPalette()
      renderComponents()
      renderForm()
      renderDashboard()
      renderMarkdown()
      renderHelp()
```

Takeaway: for complex overlays, express hierarchy as TypeScript render methods.

### Nico's `pi-skill-palette`

The skill palette uses a single custom modal component with manually rendered borders, search input, filtered rows, selected marker, and footer hints.

Pattern:

```text
SkillPaletteComponent
  state:
    allSkills
    filtered
    selected
    query
  handleInput()
  updateFilter()
  render()
    title border
    search row
    divider
    list rows
    footer
```

Takeaway: manual string rendering gives precise control over modal layout.

### Nico's `pi-subagents`

The chain clarification UI is a larger wizard component. It has many render modes and helper methods such as model selection, thinking-level selection, skills selection, agent config, parallel tasks, and summary.

Takeaway: keep one stateful component for a wizard, but split each screen into focused render methods.

### Nico's message/tool renderers

For non-interactive output, Nico's extensions use real widget trees:

```ts
const c = new Container();
c.addChild(new Text(header, 0, 0));
c.addChild(new Spacer(1));
c.addChild(new Text(task, 0, 0));
c.addChild(new Markdown(output, 0, 0, mdTheme));
return c;
```

Takeaway: built-in component trees are ideal for static or vertically stacked output.

## Recommended file structure

For one-off simple UI:

```text
extensions/my-extension/index.ts
```

For an extension with one modal:

```text
extensions/my-extension/index.ts
extensions/my-extension/ui.ts
```

For reusable UI across extensions:

```text
extensions/_shared/ui/
  frame.ts          # borders, rows, separators
  layout.ts         # hsplit, vstack, padding, clipping
  fuzzy.ts          # fuzzy scoring and filtering
  modal.ts          # common modal frame node/component helpers
  checklist.ts      # reusable checklist modal
  launcher.ts       # app-specific launcher component
```

Suggested boundary:

- `index.ts`: extension registration, command handlers, business actions.
- `ui.ts`: component classes and UI state.
- `_shared/ui/*.ts`: pure layout/rendering helpers and reusable components.

## Implementation notes from the `/px` launcher

The current `/px` launcher follows the render-helper hierarchy described above. Its YAML sketch maps to methods in `extensions/_shared/ui/extension-launcher.ts`:

```text
ExtensionLauncher
  handleInput()
  render()
    renderSearchLine()
    renderHelpLine()
    renderSplitBody()
      buildListRows()
      renderDetails()
    renderFooter()
```

It also uses a few low-level helpers that are worth extracting if more modals need the same layout:

```text
borderTop()
borderBottom()
splitBorder()
frameRow()
padToWidth()
groupExtensions()
primaryGroup()
```

Two practical details matter in interactive overlays:

1. Pass `requestRender: () => tui.requestRender()` from the `ctx.ui.custom()` factory into the component.
2. Centralize state changes through a small method such as `markDirty()` that calls both `invalidate()` and `requestRender()`.

Example:

```ts
const selected = await ctx.ui.custom(
  (tui, theme, _keybindings, done) => new ExtensionLauncher({
    extensions,
    theme,
    done,
    requestRender: () => tui.requestRender(),
  }),
  {
    overlay: true,
    overlayOptions: { width: "85%", maxHeight: "80%", minWidth: 70, margin: 1 },
  },
);
```

This keeps keyboard input responsive even if the hosting TUI does not automatically redraw after every key event.

## Checklist

Before shipping a Pi TUI component:

- [ ] `render(width)` never returns lines wider than `width`.
- [ ] ANSI strings are measured with `visibleWidth()`, not `.length`.
- [ ] Long text uses `truncateToWidth()` or `wrapTextWithAnsi()`.
- [ ] `handleInput()` covers `Esc`, `Enter`, arrows, and text editing keys.
- [ ] State changes call `tui.requestRender()` or otherwise trigger redraw.
- [ ] Selection is clamped after filtering.
- [ ] Scroll position keeps selected row visible.
- [ ] `invalidate()` clears caches.
- [ ] Themed strings are rebuilt after theme changes.
- [ ] Timers/resources are cleaned up in `dispose()` if used.
- [ ] Overlay options set sane `width`, `maxHeight`, `anchor`, and `margin`.
- [ ] The UI works at narrow widths or hides/degrades gracefully.

## Practical recommendation

For the `/px` launcher and similar extension UIs, use this layered approach:

1. Build a normal `Component` class for keyboard state and lifecycle.
2. Inside `render(width)`, call helper methods that mirror the YAML hierarchy.
3. Extract shared helpers for frame, rows, columns, wrapping, and fuzzy lists.
4. If the helpers become repetitive, introduce a tiny `RenderNode` layer so YAML-like sketches map directly to `modal(vstack([...]))` code.

This keeps the implementation compatible with Pi's TUI contract while giving authors a component-system-like way to design and build rich terminal UIs.
