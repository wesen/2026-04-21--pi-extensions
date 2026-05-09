---
Title: Extension Actions Settings Status Docs and Dashboard Design Guide
Ticket: PI-EXT-ACTIONS-DASHBOARD
Status: active
Topics:
    - pi
    - extensions
    - tui
    - settings
    - dashboard
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: docs/pi-tui-ui-authoring-guide.md
      Note: Existing guide for implementing the proposed TUI views
    - Path: extensions/_shared/registry.ts
      Note: Current registry contract and proposed contribution API target
    - Path: extensions/_shared/ui/extension-launcher.ts
      Note: Current launcher modal to extend with actions/docs/settings intents
    - Path: extensions/kanban-demo/index.ts
      Note: Pilot extension for dashboard widget contribution
    - Path: extensions/launcher/index.ts
      Note: /px orchestration point for invoking registered callbacks
    - Path: extensions/pinned-skills/index.ts
      Note: Pilot extension for actions settings docs and status widgets
    - Path: extensions/tui-showcase/index.ts
      Note: Reference examples for SettingsList SelectList and custom widgets
ExternalSources: []
Summary: Design for extending the local Pi extension registry with callbacks, actions, docs, settings, status widgets, and configurable dashboards.
LastUpdated: 2026-05-09T19:20:00-04:00
WhatFor: Use this as the implementation guide for the next generation shared Pi extension contribution registry.
WhenToUse: When adding launcher callbacks, settings UIs, documentation popovers, status-bar widgets, or dashboard layouts to local Pi extensions.
---


# Extension Actions Settings Status Docs and Dashboard Design Guide

## Executive summary

The local Pi extension suite already has the seed of a shared extension platform: extensions call `registerPiExtension(...)`, a process-global registry stores metadata, and `/px` fuzzy-searches the registered extensions. The next step is to make that registry a real contribution system. Extensions should be able to contribute actions, settings, documentation, and dashboard widgets without each extension inventing its own commands, status rows, and configuration UI.

This design proposes a layered architecture:

1. **Contribution registry**: extend `extensions/_shared/registry.ts` from extension metadata into a typed registry of actions, docs, settings providers, and dashboard widgets.
2. **Launcher action execution**: teach `/px` to show and invoke registered extension actions rather than only printing the selected extension name.
3. **Settings framework**: support both schema-driven settings forms and custom settings components.
4. **Documentation viewer**: allow extensions to register help/docs that can be opened from the launcher with `?` or via an action.
5. **Dashboard system**: unify status text, short status, and richer dashboard cards under one widget model with variants such as `short`, `compact`, `card`, and `detail`.
6. **Layout/config persistence**: add a dashboard layout engine that can arrange registered widgets into status-bar, above-editor, below-editor, and overlay dashboard views, with global/project config saved to disk.

The design keeps the first implementation incremental. It does not require changes to Pi core. It can be built entirely in the local extension shared library by using existing Pi APIs such as `ctx.ui.custom()`, `ctx.ui.setStatus()`, `ctx.ui.setWidget()`, and `ctx.ui.setFooter()`.

## Problem statement and scope

### User-facing goal

The user wants extensions that register themselves to provide richer launcher-facing capabilities:

- custom actions and callbacks,
- status callbacks,
- short status callbacks for the footer/status bar,
- generic settings forms from a schema,
- custom settings views from extension-provided widgets,
- registered documentation that can be shown with `?`,
- dashboard widgets,
- a layout engine that groups widgets into configurable dashboard views,
- save/load support for dashboard configuration.

### Engineering goal

The engineering goal is to avoid a growing set of unrelated top-level commands and ad hoc status/widget implementations. Instead, extensions should declare contributions through one stable shared API. The launcher and dashboard can then discover those contributions and provide consistent UI.

### Non-goals for the first implementation

The first implementation should not require modifying Pi core. It should also not attempt to build a full plugin marketplace or remote extension protocol. All callbacks are in-process TypeScript function references stored in the shared registry.

The first implementation should not replace all existing commands. Existing commands remain compatibility entrypoints. The launcher becomes the preferred discovery and orchestration surface.

## Current-state analysis

### Shared registry exists but only stores basic metadata

The current registry type is small:

```ts
export interface PiExtensionRegistration {
  id: string;
  name: string;
  description: string;
  commands?: string[];
  tags?: string[];
  run?: (ctx: ExtensionCommandContext) => Promise<void> | void;
}
```

Evidence:

- `extensions/_shared/registry.ts:1-10` defines `PiExtensionRegistration`.
- `extensions/_shared/registry.ts:16-23` stores registry state on `globalThis` via `Symbol.for("wesen.pi.extensions.registry.v1")`.
- `extensions/_shared/registry.ts:26-40` exposes `registerPiExtension`, `unregisterPiExtension`, `listPiExtensions`, and `clearPiExtensionRegistry`.

The `run` callback already exists, so the current design can support a default action without a type change. However, the launcher does not call it yet.

### Launcher selects extensions but does not invoke actions

The current `/px` command opens the launcher and notifies the selected extension:

```ts
const selected = await ctx.ui.custom(...);
if (!selected) return;
ctx.ui.notify(`Selected extension: ${selected.name} (${selected.id})`, "info");
```

Evidence:

- `extensions/launcher/index.ts:16-39` registers `/px` and opens `ExtensionLauncher`.
- `extensions/launcher/index.ts:36-37` currently prints the selected extension instead of invoking a callback.

The UI already passes `requestRender` into the component so the modal can redraw after keyboard input:

- `extensions/launcher/index.ts:24-34`
- `extensions/_shared/ui/extension-launcher.ts:4-12`
- `extensions/_shared/ui/extension-launcher.ts:138-140`

### Launcher UI is a good place to add actions and docs

The launcher component is already organized around search, filtered rows, and details:

- `extensions/_shared/ui/extension-launcher.ts:49-96` handles keyboard input.
- `extensions/_shared/ui/extension-launcher.ts:98-130` renders the framed modal.
- `extensions/_shared/ui/extension-launcher.ts:161-167` fuzzy-filters registered extensions.
- `extensions/_shared/ui/extension-launcher.ts:170-180` renders the search/help header.

This structure can evolve into a two-mode or three-pane launcher:

```text
Extension mode        Action mode          Help mode
---------------       ------------         ---------
search extensions ->  select action   ->   ? opens docs for selected thing
```

### Existing extensions use status text directly

Several extensions use `ctx.ui.setStatus()` manually:

- `pinned-skills` wraps `ctx.ui.setStatus(...)` in `setStatus()` at `extensions/pinned-skills/index.ts:57-60`.
- `kanban-demo` updates status in `updateUi()` and `installWidget()` at `extensions/kanban-demo/index.ts:434-446`.
- `tui-showcase` sets status in `installChrome()` at `extensions/tui-showcase/index.ts:538-540`.
- `compaction-meter`, `compaction-title`, `agent-env`, `direnv-bash`, and `response-capture` also call `ctx.ui.setStatus()`.

Pi core exposes status text as extension status entries in the footer data provider:

- `dist/core/extensions/types.d.ts:78` declares `setStatus(key, text)`.
- `dist/core/footer-data-provider.d.ts:25-29` exposes `getExtensionStatuses()`.

This means status is currently a flat string map keyed by extension key. That is simple, but it does not support richer layout, widgets, priorities, visibility, or multiple variants.

### Existing extensions use widgets directly

`kanban-demo` shows a richer component widget below the editor:

```ts
ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => {
  widgetTui = tui;
  return new KanbanWidget(theme, () => board ?? ensureBoard(ctx.cwd));
}, { placement: "belowEditor" });
```

Evidence:

- `extensions/kanban-demo/index.ts:439-446`

`tui-showcase` installs header, footer, and above/below editor widgets:

- `extensions/tui-showcase/index.ts:528-535` clears custom UI chrome.
- `extensions/tui-showcase/index.ts:538-550` installs status, header, footer, and widgets.

Pi core supports these primitives:

- `dist/core/extensions/types.d.ts:93-97` declares `setWidget()` with string arrays or component factories.
- `dist/core/extensions/types.d.ts:98-107` declares `setFooter()` and explains that it receives `FooterDataProvider`.
- `dist/core/extensions/types.d.ts:108-109` declares `setHeader()`.

These primitives are enough to build a dashboard manager in the extension layer.

### Existing settings examples are local and ad hoc

`tui-showcase` demonstrates `SettingsList` with hard-coded items and a callback:

- `extensions/tui-showcase/index.ts:481-515` builds a `SettingsList` demo.
- `extensions/tui-showcase/index.ts:492-504` passes setting items and an `(id, value)` callback.

Pi core itself has a more complete settings selector implementation in its compiled source. It builds `SettingItem[]`, maps each item to a callback, and supports submenus:

- `dist/modes/interactive/components/settings-selector.js:1` imports `SettingsList`.
- `dist/modes/interactive/components/settings-selector.js:262-329` constructs the `SettingsList` and dispatches changes.

The local extension suite can reuse the same pattern for extension settings, but it needs a registry-level schema so `/px settings` can discover and open every extension's settings in one consistent way.

## Gap analysis

### Gap 1: The registry has no action list

The registry has an optional `run` callback, but no named actions. A single callback is not enough for extensions such as `pinned-skills`, which already have multiple useful operations: list, preview, open menu, edit config, clear, on/off.

### Gap 2: Status and widgets are disconnected

`ctx.ui.setStatus()` is a footer string. `ctx.ui.setWidget()` is a placed component or lines. They are different APIs, even though both are really dashboard contributions. The new design should treat status-bar text as a `short` variant of a dashboard widget.

### Gap 3: Settings are not discoverable

Extensions can create their own settings views, but the launcher cannot discover them. There is no typed schema for generic forms, and no standard callback contract for applying changes.

### Gap 4: Docs are not launcher-visible

Documentation exists in README files and ticket docs, but extensions do not register docs with the launcher. The user wants `?` or a similar key to open contextual docs.

### Gap 5: Dashboard layout is not configurable

Widgets can be placed above or below the editor, but there is no shared layout config that says which widgets appear in the status bar, dashboard overlay, or editor chrome. There is also no persistence for user layout preferences.

## Proposed architecture

### High-level design

The current registry should evolve from this:

```text
PiExtensionRegistration
  id
  name
  description
  commands
  tags
  run?
```

to this:

```text
PiExtensionRegistration
  metadata
  actions[]
  docs[]
  settings?
  widgets[]
```

The shared library should own these subsystems:

```text
extensions/_shared/
  registry.ts                 # contribution contracts and global registry
  launcher/
    launcher.ts               # /px command orchestration
    extension-launcher.ts     # existing extension picker UI
    action-launcher.ts        # action picker/details mode
    doc-viewer.ts             # markdown/help overlay
  settings/
    schema.ts                 # settings schema types
    settings-view.ts          # generic SettingsList-backed schema renderer
    custom-settings.ts        # custom view adapters
  dashboard/
    schema.ts                 # widget + layout config types
    layout.ts                 # inline/grid/stack layout engine
    manager.ts                # install status/footer/widgets from registry
    config.ts                 # global/project dashboard config
    components.ts             # dashboard overlay and status-bar footer component
  ui/
    frame.ts                  # borders, row helpers
    layout.ts                 # hsplit/vstack/padding helpers
    fuzzy.ts                  # fuzzy matching shared by launchers
```

The first implementation can keep files smaller and fewer, but these boundaries should guide refactoring.

### Runtime flow diagram

```text
extension load
  ├─ pinned-skills/index.ts
  │   └─ registerPiExtension({ actions, settings, docs, widgets })
  ├─ kanban-demo/index.ts
  │   └─ registerPiExtension({ actions, widgets })
  └─ docmgr/index.ts
      └─ registerPiExtension({ actions, docs, widgets })

user opens /px
  └─ launcher lists registry extensions
      ├─ Enter on extension
      │   ├─ if default action exists: run it
      │   └─ else open action picker or notify
      ├─ ? on extension: open registered docs
      └─ s on extension: open settings view

session starts or registry changes
  └─ dashboard manager reads registered widgets + dashboard config
      ├─ installs status-bar/footer dashboard
      ├─ installs above/below editor dashboards
      └─ exposes /px dashboard overlay
```

## API design

### 1. Extension registration

Keep `registerPiExtension(...)` as the single obvious entrypoint.

```ts
export interface PiExtensionRegistration {
  id: string;
  name: string;
  description: string;
  commands?: string[];
  tags?: string[];

  /** Default action when user presses Enter on the extension. */
  run?: PiExtensionActionHandler;

  /** Named actions displayed by the launcher. */
  actions?: PiExtensionAction[];

  /** Contextual documentation opened with ? or Help actions. */
  docs?: PiExtensionDoc[];

  /** Generic schema-driven settings or custom settings view. */
  settings?: PiExtensionSettingsContribution;

  /** Dashboard/status/footer/overlay widgets. */
  widgets?: PiDashboardWidget[];
}
```

The `run` field remains for backwards compatibility and as the default action. Named `actions[]` should be preferred for new capabilities.

### 2. Action callbacks

```ts
export interface PiExtensionActionContext {
  ctx: ExtensionCommandContext;
  extension: PiExtensionRegistration;
  action: PiExtensionAction;
  closeLauncher(): void;
  openLauncher(): Promise<void>;
  openDocs(docId?: string): Promise<void>;
  openSettings(): Promise<void>;
  refreshDashboard(): void;
}

export type PiExtensionActionHandler = (
  ctx: ExtensionCommandContext,
  actionCtx?: PiExtensionActionContext,
) => Promise<void> | void;

export interface PiExtensionAction {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  tags?: string[];
  shortcutHint?: string;
  dangerous?: boolean;
  default?: boolean;
  run: PiExtensionActionHandler;
}
```

Example registration:

```ts
registerPiExtension({
  id: "pinned-skills",
  name: "Pinned Skills",
  description: "Pins selected full skill instructions into the system prompt.",
  commands: ["pinned-skills"],
  tags: ["skills", "prompt", "context"],
  actions: [
    {
      id: "menu",
      title: "Open checklist",
      description: "Select pinned skills in a TUI checklist.",
      default: true,
      run: async (ctx) => openPinnedSkillsChecklist(ctx),
    },
    {
      id: "preview",
      title: "Preview prompt block",
      description: "Show the prompt block that will be injected next turn.",
      run: async (ctx) => previewPinnedSkills(ctx),
    },
  ],
});
```

Launcher behavior:

```ts
async function runSelectedExtension(selected: PiExtensionRegistration, ctx: ExtensionCommandContext) {
  const defaultAction = selected.actions?.find((a) => a.default) ?? selected.actions?.[0];

  if (selected.run) {
    await selected.run(ctx);
    return;
  }

  if (defaultAction && selected.actions?.length === 1) {
    await defaultAction.run(ctx, makeActionContext(selected, defaultAction, ctx));
    return;
  }

  if (selected.actions?.length) {
    const action = await openActionPicker(selected, ctx);
    if (action) await action.run(ctx, makeActionContext(selected, action, ctx));
    return;
  }

  ctx.ui.notify(`Selected extension: ${selected.name} (${selected.id})`, "info");
}
```

### 3. Documentation registration

Docs should be lazy-loadable so large markdown files do not permanently sit in memory.

```ts
export interface PiExtensionDoc {
  id: string;
  title: string;
  description?: string;
  tags?: string[];

  /** Inline markdown, useful for short help. */
  markdown?: string;

  /** Path to a markdown file. Loader reads it when opened. */
  path?: string;

  /** Lazy loader for generated docs. */
  load?: (ctx: ExtensionCommandContext) => Promise<string> | string;
}
```

Launcher keys:

| Key | Behavior |
| --- | --- |
| `?` | Open docs for selected extension. If multiple docs exist, show doc picker. |
| `Shift+?` or `F1` | Open launcher help. |
| `d` | Optional explicit docs mode if `?` conflicts in some terminals. |

Doc viewer implementation:

```ts
class ExtensionDocViewer implements Component {
  private scroll = 0;

  constructor(
    private title: string,
    private markdown: string,
    private done: () => void,
  ) {}

  handleInput(data: string) {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.backspace)) this.done();
    if (matchesKey(data, Key.down)) this.scroll++;
    if (matchesKey(data, Key.up)) this.scroll = Math.max(0, this.scroll - 1);
  }

  render(width: number): string[] {
    return renderFramedMarkdown(this.title, this.markdown, width, this.scroll);
  }

  invalidate() {}
}
```

Docs should appear in the details pane as well:

```text
Docs
  ? Overview
  ? Configuration
  ? Troubleshooting
```

### 4. Settings schema contribution

The schema-driven settings path should cover common field types and provide a single `onApply` callback.

```ts
export type PiSettingValue = string | number | boolean | string[] | null;
export type PiSettingsValues = Record<string, PiSettingValue>;

export interface PiSettingsFieldBase {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
  defaultValue?: PiSettingValue;
  secret?: boolean;
  advanced?: boolean;
}

export type PiSettingsField =
  | (PiSettingsFieldBase & { type: "boolean" })
  | (PiSettingsFieldBase & { type: "string"; placeholder?: string; multiline?: boolean })
  | (PiSettingsFieldBase & { type: "number"; min?: number; max?: number; step?: number })
  | (PiSettingsFieldBase & { type: "select"; options: PiSettingsOption[] })
  | (PiSettingsFieldBase & { type: "multiselect"; options: PiSettingsOption[] })
  | (PiSettingsFieldBase & { type: "path"; mode?: "file" | "directory" | "either" });

export interface PiSettingsOption {
  value: string;
  label: string;
  description?: string;
}

export interface PiSettingsSection {
  id: string;
  title: string;
  description?: string;
  fields: PiSettingsField[];
}

export interface PiSettingsSchema {
  version: number;
  title?: string;
  description?: string;
  sections: PiSettingsSection[];
}
```

The contribution contract:

```ts
export interface PiSchemaSettingsContribution {
  kind: "schema";
  schema: PiSettingsSchema | ((ctx: ExtensionCommandContext) => Promise<PiSettingsSchema> | PiSettingsSchema);
  load(ctx: ExtensionCommandContext): Promise<PiSettingsValues> | PiSettingsValues;
  validate?(values: PiSettingsValues, ctx: ExtensionCommandContext): Promise<PiSettingsValidationResult> | PiSettingsValidationResult;
  onChange?(change: PiSettingsChange, values: PiSettingsValues, ctx: ExtensionCommandContext): Promise<void> | void;
  onApply(values: PiSettingsValues, ctx: ExtensionCommandContext): Promise<void> | void;
  onCancel?(ctx: ExtensionCommandContext): Promise<void> | void;
}

export interface PiSettingsChange {
  fieldId: string;
  oldValue: PiSettingValue;
  newValue: PiSettingValue;
}

export interface PiSettingsValidationResult {
  ok: boolean;
  errors?: Array<{ fieldId?: string; message: string }>;
  warnings?: Array<{ fieldId?: string; message: string }>;
}
```

The generic configurator maps fields to `SettingsList` items where possible:

```ts
function settingsFieldToSettingItem(field: PiSettingsField, values: PiSettingsValues): SettingItem {
  return {
    id: field.id,
    label: field.label,
    description: field.description,
    currentValue: String(values[field.id] ?? field.defaultValue ?? ""),
    values: valuesForField(field),
    submenu: needsSubmenu(field) ? makeSubmenu(field) : undefined,
  };
}
```

Generic view flow:

```text
open settings
  ├─ load schema
  ├─ load current values
  ├─ render SettingsList
  ├─ on field change
  │   ├─ update local draft
  │   ├─ call onChange? for preview/eager update
  │   └─ validate field or full draft
  ├─ Ctrl+S / Enter on Apply
  │   ├─ validate draft
  │   ├─ call onApply(draft)
  │   └─ refresh status/dashboard
  └─ Esc
      ├─ call onCancel?
      └─ close without apply
```

### 5. Custom settings view contribution

Some extensions need custom controls, previews, or complex multi-step flows. They should be able to provide a component factory directly.

```ts
export interface PiCustomSettingsContribution {
  kind: "custom";
  title?: string;
  description?: string;
  open(options: PiCustomSettingsOpenOptions): Promise<void> | void;
}

export interface PiCustomSettingsOpenOptions {
  ctx: ExtensionCommandContext;
  tui: TUI;
  theme: Theme;
  done: () => void;
  requestRender: () => void;
}

export type PiExtensionSettingsContribution =
  | PiSchemaSettingsContribution
  | PiCustomSettingsContribution;
```

The launcher opens custom settings like this:

```ts
await ctx.ui.custom<void>(
  (tui, theme, _kb, done) => {
    const component = extension.settings.open({
      ctx,
      tui,
      theme,
      done,
      requestRender: () => tui.requestRender(),
    });
    return component;
  },
  { overlay: true, overlayOptions: { width: "85%", maxHeight: "85%", margin: 1 } },
);
```

If `open()` returns a promise but no component, it can run its own nested UI. If it returns a component, the shared launcher owns overlay lifecycle.

### 6. Dashboard widget contribution

Status text and dashboard cards should use one widget model. The status bar is just the `short` dashboard zone.

```ts
export type PiDashboardZone =
  | "statusBar"
  | "aboveEditor"
  | "belowEditor"
  | "dashboardOverlay"
  | "extensionDetails";

export type PiDashboardVariant = "short" | "compact" | "card" | "detail";

export interface PiDashboardRenderContext {
  ctx: ExtensionContext;
  tui?: TUI;
  theme: Theme;
  zone: PiDashboardZone;
  variant: PiDashboardVariant;
  width: number;
  height?: number;
  requestRender?: () => void;
}

export type PiDashboardRendered =
  | string
  | string[]
  | Component
  | ((tui: TUI, theme: Theme) => Component & { dispose?(): void });

export interface PiDashboardWidget {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  defaultZone?: PiDashboardZone;
  defaultVariant?: PiDashboardVariant;
  defaultVisible?: boolean;
  priority?: number;
  minWidth?: number;
  maxWidth?: number;
  refresh?: PiDashboardRefreshPolicy;
  render: (renderCtx: PiDashboardRenderContext) => PiDashboardRendered | Promise<PiDashboardRendered>;
}

export type PiDashboardRefreshPolicy =
  | { kind: "manual" }
  | { kind: "interval"; ms: number }
  | { kind: "event"; events: string[] }
  | { kind: "onRender" };
```

Example: convert `pinned-skills` status into a widget:

```ts
registerPiExtension({
  id: "pinned-skills",
  name: "Pinned Skills",
  widgets: [
    {
      id: "status",
      title: "Pinned Skills Status",
      defaultZone: "statusBar",
      defaultVariant: "short",
      priority: 40,
      render: ({ ctx, theme, variant }) => {
        const text = formatPinnedSkillsStatus(loadCurrentState(ctx), variant);
        return variant === "short" ? text : [theme.fg("accent", "Pinned Skills"), text];
      },
    },
  ],
});
```

Example: convert `kanban-demo` widget into a dashboard widget:

```ts
registerPiExtension({
  id: "kanban-demo",
  name: "Kanban Demo",
  widgets: [
    {
      id: "board",
      title: "Kanban Board",
      defaultZone: "belowEditor",
      defaultVariant: "card",
      minWidth: 60,
      render: ({ ctx, theme }) => new KanbanWidget(theme, () => loadBoard(ctx.cwd)),
    },
  ],
});
```

### 7. Dashboard layout config

Dashboard layout should be persisted in global and project config. Project config overrides global config by widget ID.

Recommended paths:

```text
~/.pi/agent/dashboard.json
.pi/dashboard.json
```

Schema:

```ts
export interface PiDashboardConfig {
  version: 1;
  zones: Record<PiDashboardZone, PiDashboardZoneConfig>;
}

export interface PiDashboardZoneConfig {
  layout: "inline" | "stack" | "grid" | "columns";
  enabled: boolean;
  items: PiDashboardLayoutItem[];
}

export interface PiDashboardLayoutItem {
  widget: string; // "extensionId.widgetId"
  visible: boolean;
  variant?: PiDashboardVariant;
  order?: number;
  width?: number | "auto" | `${number}%`;
  height?: number | "auto";
  column?: number;
  row?: number;
}
```

Example:

```json
{
  "version": 1,
  "zones": {
    "statusBar": {
      "enabled": true,
      "layout": "inline",
      "items": [
        { "widget": "compaction-meter.status", "visible": true, "variant": "short", "order": 10, "width": 18 },
        { "widget": "pinned-skills.status", "visible": true, "variant": "short", "order": 20, "width": 24 },
        { "widget": "direnv-bash.status", "visible": true, "variant": "short", "order": 30, "width": 18 }
      ]
    },
    "belowEditor": {
      "enabled": true,
      "layout": "stack",
      "items": [
        { "widget": "kanban-demo.board", "visible": false, "variant": "card", "order": 10 }
      ]
    },
    "dashboardOverlay": {
      "enabled": true,
      "layout": "grid",
      "items": [
        { "widget": "compaction-meter.status", "visible": true, "variant": "card", "order": 10 },
        { "widget": "kanban-demo.board", "visible": true, "variant": "card", "order": 20 }
      ]
    }
  }
}
```

### 8. Layout engine

The layout engine should accept rendered widgets, zone constraints, and config, then return lines or components appropriate for Pi UI APIs.

Core types:

```ts
export interface DashboardLayoutInput {
  zone: PiDashboardZone;
  width: number;
  height?: number;
  widgets: ResolvedDashboardWidget[];
  config: PiDashboardZoneConfig;
  theme: Theme;
}

export interface ResolvedDashboardWidget {
  key: string; // "extensionId.widgetId"
  registration: PiExtensionRegistration;
  widget: PiDashboardWidget;
  rendered: string[];
  config: PiDashboardLayoutItem;
}
```

Inline status-bar layout:

```ts
function renderInlineStatus(input: DashboardLayoutInput): string {
  const visible = input.widgets
    .filter((w) => w.config.visible)
    .sort((a, b) => (a.config.order ?? a.widget.priority ?? 100) - (b.config.order ?? b.widget.priority ?? 100));

  const chunks = [];
  let remaining = input.width;
  for (const widget of visible) {
    const requested = resolveWidth(widget.config.width, input.width) ?? widget.widget.maxWidth ?? 20;
    const width = Math.min(requested, remaining);
    if (width <= 4) break;
    chunks.push(truncateToWidth(widget.rendered[0] ?? "", width, "…"));
    remaining -= width + 3; // separator spacing
  }
  return chunks.join(" · ");
}
```

Stack layout:

```ts
function renderStack(input: DashboardLayoutInput): string[] {
  const lines: string[] = [];
  for (const widget of orderedVisibleWidgets(input)) {
    lines.push(...widget.rendered);
    lines.push("");
  }
  return lines.slice(0, input.height ?? lines.length);
}
```

Grid layout:

```ts
function renderGrid(input: DashboardLayoutInput): string[] {
  const columnCount = chooseColumnCount(input.width);
  const columnWidth = Math.floor((input.width - (columnCount - 1) * 3) / columnCount);
  const cards = orderedVisibleWidgets(input).map((widget) => frameCard(widget, columnWidth));
  return packRows(cards, columnCount, columnWidth);
}
```

### 9. Dashboard manager

The dashboard manager connects the registry to Pi UI APIs.

Responsibilities:

1. Read dashboard config from global and project paths.
2. Resolve registered widgets into zone placements.
3. Install status-bar dashboard using `ctx.ui.setFooter()` or `ctx.ui.setStatus()` bridge.
4. Install above/below editor dashboards using `ctx.ui.setWidget()`.
5. Expose a dashboard overlay action from `/px`.
6. Refresh widgets on interval, event, or explicit calls.
7. Clear UI on `session_shutdown`.

Pseudocode:

```ts
export class DashboardManager {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();

  install(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const config = readDashboardConfig(ctx.cwd);

    ctx.ui.setFooter((tui, theme, footerData) =>
      new StatusBarDashboardComponent({
        tui,
        theme,
        footerData,
        config,
        registry: getRegistrySnapshot(),
        ctx,
      }),
    );

    for (const zone of ["aboveEditor", "belowEditor"] as const) {
      const componentFactory = makeZoneWidgetFactory(zone, config, ctx);
      if (componentFactory) ctx.ui.setWidget(`dashboard:${zone}`, componentFactory, { placement: zone });
    }

    this.installRefreshPolicies(ctx);
  }

  refresh(): void {
    // requestRender on known dashboard components
  }

  dispose(ctx: ExtensionContext): void {
    for (const interval of this.intervals.values()) clearInterval(interval);
    this.intervals.clear();
    if (ctx.hasUI) {
      ctx.ui.setFooter(undefined);
      ctx.ui.setWidget("dashboard:aboveEditor", undefined);
      ctx.ui.setWidget("dashboard:belowEditor", undefined);
    }
  }
}
```

Compatibility bridge:

The first implementation can avoid replacing the built-in footer. It can register one compact status string with `ctx.ui.setStatus("dashboard", renderedStatus)`. Later, if we need richer footer control, switch to `ctx.ui.setFooter()`.

```ts
ctx.ui.setStatus("dashboard", renderInlineStatus(...));
```

This bridge is lower-risk because existing extension status strings continue to work while dashboard widgets are introduced.

## Launcher UX design

### Extension details pane

The details pane should show contributions:

```text
Details
  Pinned Skills
  Pins selected full skill instructions into the system prompt.

Actions
  Enter  Open checklist
  a      Choose action...

Settings
  s      Configure pinned skills

Docs
  ?      Overview
         Prompt cache behavior

Widgets
  statusBar: Pinned Skills Status
```

### Keys

| Key | Mode | Behavior |
| --- | --- | --- |
| `Enter` | Extension list | Run default action or open action picker. |
| `a` | Extension list | Open action picker for selected extension. |
| `s` | Extension list | Open settings for selected extension. |
| `?` | Extension list | Open docs for selected extension. |
| `w` | Extension list | Toggle/list widgets for selected extension. |
| `d` | Global | Open dashboard overlay. |
| `Esc` | Any | Close current overlay or go back. |

### Action picker

The action picker can reuse the current two-pane layout:

```text
╭────────────────────────────── Pinned Skills Actions ───────────────────────╮
│ Search: █ type to filter                                                    │
├───────────────────────────────┬────────────────────────────────────────────┤
│ ACTIONS                       │ DETAILS                                    │
│  ● Open checklist             │ Opens the pinned-skills checklist UI.      │
│  ○ Preview prompt block       │ Shows prompt injection preview.            │
│  ○ Edit config                │ Opens config file in editor.               │
╰────────────────────────────────────────────────────────────────────────────╯
```

### Docs viewer

The docs viewer should use the existing TUI `Markdown` component where possible. If the content needs scrolling inside a frame, use the render-helper pattern from `ExtensionLauncher` and `wrapTextWithAnsi()`.

## Implementation phases

### Phase 1: Actions and docs in the registry

Files:

- `extensions/_shared/registry.ts`
- `extensions/launcher/index.ts`
- `extensions/_shared/ui/extension-launcher.ts`
- new `extensions/_shared/ui/action-launcher.ts`
- new `extensions/_shared/ui/doc-viewer.ts`

Steps:

1. Add `PiExtensionAction`, `PiExtensionDoc`, and settings/widget placeholder types to `registry.ts`.
2. Update `/px` so Enter invokes `selected.run` or the default registered action.
3. Add `?` handling in `ExtensionLauncher` return type, or return a richer selection result:

```ts
export type ExtensionLauncherResult =
  | { kind: "cancel" }
  | { kind: "select"; extension: PiExtensionRegistration }
  | { kind: "docs"; extension: PiExtensionRegistration }
  | { kind: "settings"; extension: PiExtensionRegistration }
  | { kind: "actions"; extension: PiExtensionRegistration };
```

4. Add a docs viewer overlay.
5. Register docs/actions for one pilot extension, preferably `pinned-skills`.

Validation:

```bash
timeout 20 pi --list-models
```

Manual validation:

```text
/reload
/px
?
Enter
```

### Phase 2: Schema-driven settings

Files:

- new `extensions/_shared/settings/schema.ts`
- new `extensions/_shared/settings/generic-settings-view.ts`
- `extensions/_shared/registry.ts`
- `extensions/launcher/index.ts`

Steps:

1. Define settings schema types.
2. Implement schema-to-`SettingsList` adapter.
3. Implement `openExtensionSettings(extension, ctx)`.
4. Register schema settings for one pilot extension.
5. Add launcher key `s` for selected extension settings.

Validation:

- boolean/select fields update draft values,
- apply callback receives typed values,
- validation errors are displayed,
- Esc cancels without applying,
- config file changes are persisted by the extension callback.

### Phase 3: Custom settings views

Files:

- `extensions/_shared/settings/custom-settings.ts`
- extension-specific UI files such as `extensions/pinned-skills/ui.ts`

Steps:

1. Add `kind: "custom"` settings contribution.
2. Allow launcher to open the custom component with `ctx.ui.custom()`.
3. Ensure `requestRender` is passed to custom views.
4. Migrate `pinned-skills` checklist to be available as a custom settings view.

### Phase 4: Dashboard widget registry

Files:

- new `extensions/_shared/dashboard/schema.ts`
- new `extensions/_shared/dashboard/config.ts`
- new `extensions/_shared/dashboard/layout.ts`
- new `extensions/_shared/dashboard/manager.ts`
- `extensions/_shared/registry.ts`

Steps:

1. Add `PiDashboardWidget` contribution types.
2. Implement widget key format: `${extension.id}.${widget.id}`.
3. Implement global/project config read and merge.
4. Implement inline status rendering.
5. Pilot `compaction-meter`, `pinned-skills`, and `kanban-demo` widgets.

### Phase 5: Dashboard layout and config UI

Files:

- new `extensions/_shared/dashboard/dashboard-view.ts`
- new `extensions/_shared/dashboard/dashboard-settings-view.ts`

Steps:

1. Add `/px dashboard` or a launcher action for dashboard overlay.
2. Add widget visibility/order settings.
3. Save layout changes to `.pi/dashboard.json` or global dashboard config.
4. Add reset-to-default and project/global toggle actions.

### Phase 6: Migration and cleanup

Steps:

1. Keep existing `ctx.ui.setStatus()` calls during migration.
2. Add dashboard widgets side-by-side.
3. Once stable, remove redundant direct status/widget installation where appropriate.
4. Update docs and README files.
5. Re-run ticket docs and reMarkable upload.

## Testing strategy

### Unit-level tests or script checks

Even if this repo does not yet have a test harness, small scripts can validate pure functions:

- registry add/list/overwrite behavior,
- dashboard config merge,
- widget key parsing,
- layout line width invariants,
- settings schema validation,
- fuzzy search scoring.

Example line-width invariant:

```ts
for (const line of renderInlineDashboard(input)) {
  assert(visibleWidth(line) <= width);
}
```

### Load validation

Run after each implementation phase:

```bash
timeout 20 pi --list-models
```

This verifies extension load and catches many TypeScript/runtime import failures.

### Manual TUI validation

Manual test script:

```text
/reload
/px
# select an extension with actions
Enter
/px
?
/px
s
/px dashboard
```

Check:

- action callbacks run once,
- docs open and close cleanly,
- settings apply/cancel behavior is correct,
- dashboard/status rows stay width-safe,
- `/reload` does not duplicate stale registry entries,
- session shutdown clears installed widgets/footer overrides.

### Regression concerns

- Existing commands must still work.
- Existing status text should not disappear until migrated.
- Widgets should not leave stale timers after `/reload` or session switch.
- Action callbacks should handle non-interactive mode gracefully by checking `ctx.hasUI` when needed.

## Risks and mitigations

### Risk: stale callback references after reload

Callbacks are function references in a `globalThis` registry. Existing overwrite-by-ID behavior handles extensions that re-register, but if an extension disappears, its old callbacks may remain.

Mitigation:

- Add registry generations.
- On extension load/reload start, call `beginRegistryGeneration()`.
- Each registration records the current generation.
- After loading, call `sweepRegistryGeneration()` to remove old entries.

### Risk: dashboard rendering becomes too heavy

Widgets can be expensive if they read files or compute status on every render.

Mitigation:

- Require render callbacks to be cheap.
- Add refresh policies and cached snapshots.
- Let widgets explicitly call `refreshDashboard()` after state changes.

### Risk: settings schema becomes too generic

A schema system can become a second application framework if it tries to handle every UI control.

Mitigation:

- Keep the schema small and map it to `SettingsList`.
- Use custom settings views for complex controls.
- Do not force all extensions through schema settings.

### Risk: footer replacement could hide built-in status

Using `ctx.ui.setFooter()` can replace the built-in footer if not carefully implemented.

Mitigation:

- Start with the bridge approach: render dashboard status into `ctx.ui.setStatus("dashboard", ...)`.
- Only switch to `setFooter()` when the dashboard component can preserve built-in footer data through `FooterDataProvider`.

### Risk: too many launcher keys

Actions, docs, settings, dashboard, and widgets can clutter the launcher keymap.

Mitigation:

- Keep primary behavior simple: `Enter` runs default action.
- Use `?` for docs, `s` for settings, `a` for actions.
- Show available keys only when the selected extension supports those contributions.

## Alternatives considered

### Alternative 1: Keep separate top-level commands

Every extension could keep adding commands such as `/pinned-skills menu`, `/docmgr debug`, `/kanban widget on`, and `/tui-demo settings`.

Rejected because it does not solve discovery, does not unify UI, and makes extensions harder to operate from one place.

### Alternative 2: Use Pi core settings/footer APIs directly only

Extensions can already call `ctx.ui.setStatus()`, `ctx.ui.setWidget()`, and `ctx.ui.custom()`.

Rejected as the only abstraction because it leaves all orchestration to individual extensions. The shared launcher cannot discover settings/docs/actions unless those contributions are registered.

### Alternative 3: Store dashboard config in `.pi/settings.json`

The existing `.pi/settings.json` already configures extension loading, so dashboard settings could live there.

Rejected for v1 because dashboard layout is likely to change more often and has a different schema. A dedicated `.pi/dashboard.json` is easier to validate, reset, and eventually edit from the dashboard settings UI.

### Alternative 4: Build a full React-like framework first

The UI authoring guide describes a possible `RenderNode` layer. We could implement that before actions/settings/dashboard.

Rejected for v1 because current launcher/render-helper patterns are sufficient. Extract shared frame/layout helpers as they become duplicated.

## Concrete first implementation checklist

1. Extend `PiExtensionRegistration` with `actions`, `docs`, `settings`, and `widgets` optional fields.
2. Add `PiExtensionAction` and call default actions from `/px`.
3. Add richer `ExtensionLauncherResult` so the modal can return docs/settings/action intents.
4. Add a simple markdown doc viewer and wire `?`.
5. Add schema settings types and a `SettingsList` adapter.
6. Add custom settings contribution support.
7. Add dashboard widget types and config file read/write helpers.
8. Bridge dashboard `short` widgets into `ctx.ui.setStatus("dashboard", ...)`.
9. Add a dashboard overlay after the bridge is stable.
10. Pilot with `pinned-skills`, `compaction-meter`, and `kanban-demo`.

## File references

Key local files:

- `extensions/_shared/registry.ts` — current shared registry and future contribution API home.
- `extensions/launcher/index.ts` — current `/px` orchestration and future callback invocation point.
- `extensions/_shared/ui/extension-launcher.ts` — current launcher modal and future action/docs/settings key handling.
- `extensions/pinned-skills/index.ts` — good pilot for actions, docs, schema settings, custom settings, and status widget.
- `extensions/pinned-skills/ui.ts` — existing checklist component that can become a custom settings view.
- `extensions/kanban-demo/index.ts` — good pilot for dashboard widgets and below-editor widget migration.
- `extensions/tui-showcase/index.ts` — examples for `SelectList`, `SettingsList`, header/footer/widgets, and custom overlays.
- `docs/pi-tui-ui-authoring-guide.md` — local UI authoring guide for implementing the modals and layout helpers.

Pi API references:

- `dist/core/extensions/types.d.ts` — `ExtensionUIContext`, `setStatus`, `setWidget`, `setFooter`, `custom`.
- `dist/core/footer-data-provider.d.ts` — footer data available to custom footer components.
- `dist/modes/interactive/components/settings-selector.js` — core settings selector pattern using `SettingsList`.
- Pi docs: `docs/tui.md` and `docs/extensions.md` in the installed `@mariozechner/pi-coding-agent` package.

## Open questions

1. Should the first dashboard status implementation use `setStatus("dashboard", ...)` or immediately replace the footer with `setFooter()`?
2. Should dashboard config be global-first with project overrides, or project-first with global fallback?
3. Should action callbacks receive only `ExtensionCommandContext`, or a richer action context from the start?
4. Should settings apply on every change by default, or require an explicit Apply action?
5. Should `?` open docs directly or switch the launcher details pane into help mode first?

## Recommended next step

Implement Phase 1 first: actions and docs. It is the smallest step that proves the callback model. After that, implement schema settings for one extension and only then build dashboard layout persistence. This keeps the platform incremental and avoids designing too much UI before there is a second real consumer.
