# Writing Pi Extensions with the Shared Framework

This guide teaches the local shared extension framework in this repository. It is written for an intern who already knows TypeScript, but has not yet built a Pi extension here. By the end, you should understand not just which fields to fill in, but why the framework is shaped the way it is and how to extend it without creating another pile of unrelated slash commands.

The central idea is simple: an extension should register what it contributes. It may contribute actions, documentation, settings, dashboard widgets, and the older compatibility slash commands. The launcher and dashboard discover those contributions through one shared registry.

```text
extension module
  └─ registerPiExtension({ metadata, actions, docs, settings, widgets, palette })
       └─ shared registry
            ├─ /px launcher
            ├─ action picker
            ├─ command palette (Ctrl+Shift+Alt+N)
            ├─ docs viewer
            ├─ settings views
            └─ dashboard/status widgets
```

The framework lives under `extensions/_shared/`. Pilot extensions such as `pinned-skills`, `agent-env`, `compaction-meter`, and `kanban-demo` show the current style.

## 1. Why the shared framework exists

A Pi extension can register commands directly with `pi.registerCommand(...)`. That works, and existing extensions still do it for compatibility. But command-only extension design does not scale well. Once every extension exposes five or six top-level commands, users must remember command names, aliases, and subcommands. The UI becomes a vocabulary quiz.

The shared framework changes the shape of the problem. Instead of asking each extension to invent its own UI, the extension describes its capabilities in a common form. The launcher can then display those capabilities consistently.

Compare the two models:

| Model | Extension author writes | User discovers through | Problem |
| --- | --- | --- | --- |
| Command-only | `/my-ext`, `/my-ext-toggle`, `/my-ext-status`, `/my-ext-settings` | Memory or docs | Command sprawl |
| Shared contribution | `actions`, `docs`, `settings`, `widgets` | `/px` | One common UI surface |

The goal is not to remove commands. Commands are still useful for scripting and muscle memory. The goal is to make commands no longer be the only doorway into an extension.

## 2. The smallest possible extension

A minimal extension exports a default function and registers metadata.

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";

export default function myExtension(pi: ExtensionAPI): void {
  registerPiExtension({
    id: "my-extension",
    name: "My Extension",
    description: "Demonstrates the shared extension framework.",
    commands: ["my-extension"],
    tags: ["demo"],
  });

  pi.registerCommand("my-extension", {
    description: "Show extension status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("My Extension is installed.", "info");
    },
  });
}
```

This is enough for `/px` to list the extension. It is not enough for `/px` to do something useful when the extension is selected. For that, add a default action.

## 3. The registry contract

The shared registry is defined in `extensions/_shared/registry.ts`. This is the main contract extension authors should know.

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
}
```

Each field has a different purpose:

| Field | Purpose | Shown in `/px`? | Invoked by framework? |
| --- | --- | --- | --- |
| `id` | Stable machine name. Used as registry key. | Yes | Yes |
| `name` | Human-readable display name. | Yes | No |
| `description` | One-paragraph explanation. | Yes | No |
| `commands` | Compatibility slash commands. | Yes | No |
| `tags` | Search and grouping hints. | Indirectly | No |
| `run` | Default action when selected. | Yes | Yes |
| `actions` | Named callbacks. | Yes | Yes |
| `docs` | Help pages. | Yes | Yes |
| `settings` | Schema or custom settings view. | Yes | Yes |
| `widgets` | Dashboard/status cards. | Dashboard | Yes |
| `palette` | Command palette items. | Yes (via `p` key) | Yes |

The `id` must be stable. If you rename it, user dashboard config and saved layout entries may no longer match. Treat it like a database primary key.

## 4. Actions: the verb layer

Actions are what the extension can do. A command such as `/pinned-skills preview` becomes a launcher action called `Preview prompt block`. The callback still receives a normal `ExtensionCommandContext`, so it can notify the user, open custom UI, write files, or call other extension APIs.

```ts
registerPiExtension({
  id: "my-extension",
  name: "My Extension",
  description: "Demonstrates launcher actions.",
  run: async (ctx) => showStatus(ctx),
  actions: [
    {
      id: "status",
      title: "Show status",
      description: "Display current extension state.",
      default: true,
      run: async (ctx) => showStatus(ctx),
    },
    {
      id: "reset",
      title: "Reset state",
      description: "Clear saved state for this extension.",
      dangerous: true,
      run: async (ctx) => resetState(ctx),
    },
  ],
});
```

The `run` field is the simple default action. If `run` exists, `/px` can call it directly when the user presses Enter on the extension. The `actions` array gives the user a menu of named operations, opened with `a` in the launcher.

The key points to internalize:

- Actions are user-facing verbs. Name them with phrases such as `Open menu`, `Preview prompt`, or `Reset board`.
- The `id` is a stable machine name. Use kebab-case and do not change it casually.
- The `title` is the display label. It can change as the UI wording improves.
- The `default` action should be safe and unsurprising. Do not make a destructive operation the default.

## 5. Documentation: the help layer

Docs let the launcher answer "what is this?" without sending the user to a README. Pressing `?` on an extension opens its registered documentation.

```ts
registerPiExtension({
  id: "my-extension",
  name: "My Extension",
  description: "Demonstrates registered docs.",
  docs: [
    {
      id: "overview",
      title: "Overview",
      markdown: "# My Extension\n\nThis extension demonstrates registered docs.",
    },
    {
      id: "troubleshooting",
      title: "Troubleshooting",
      path: "docs/my-extension-troubleshooting.md",
    },
  ],
});
```

A doc can be inline markdown, a file path, or a lazy loader.

```ts
export interface PiExtensionDoc {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  markdown?: string;
  path?: string;
  load?: (ctx: ExtensionCommandContext) => Promise<string> | string;
}
```

Use inline markdown for short help. Use `path` for longer docs that already live in `docs/`. Use `load` when the documentation depends on runtime state.

A good extension doc starts with the user's question. It does not begin with implementation details. For example:

```markdown
# Pinned Skills

Pinned Skills keeps selected full skill instructions loaded in prompt context.
Use it when you want a small set of skills to always be available without
re-selecting them every turn.
```

Then explain commands, settings, and gotchas.

## 6. Settings: schema or custom view

Settings contributions come in two forms. Use a schema when the settings are ordinary fields. Use a custom view when the user needs a specialized UI.

```ts
export type PiExtensionSettingsContribution =
  | PiSchemaSettingsContribution
  | PiCustomSettingsContribution;
```

### 6.1 Schema settings

Schema settings are best for booleans, selects, and small numeric choices. The shared settings view turns the schema into a `SettingsList`.

```ts
settings: {
  kind: "schema",
  schema: {
    version: 1,
    title: "Agent Env Settings",
    description: "Configure PI_AGENT_* environment injection.",
    sections: [
      {
        id: "main",
        title: "Main",
        fields: [
          {
            id: "enabled",
            label: "Enabled",
            type: "boolean",
            description: "Inject PI_AGENT_* variables into bash commands.",
          },
        ],
      },
    ],
  },
  load: () => ({ enabled: state.enabled }),
  onApply: (values, ctx) => {
    state.enabled = values.enabled === true;
    ctx.ui.notify(`agent-env ${state.enabled ? "enabled" : "disabled"}`, "info");
  },
}
```

The schema view is deliberately modest. It handles common controls and gives the extension an `onApply` callback. If you need a picker, preview pane, or multi-step flow, write a custom view.

### 6.2 Custom settings

Custom settings return a TUI component directly. This is the right path for rich widgets such as the pinned-skills checklist.

```ts
settings: {
  kind: "custom",
  title: "Pinned Skills settings",
  description: "Open the pinned skills checklist.",
  open: ({ ctx, theme, done, requestRender }) => {
    return new PinnedSkillsChecklist({
      items: getAvailableSkillList(pi, lastSkills),
      selectedNames: readConfig(ctx.cwd).config.skills,
      theme,
      requestRender,
      done: async (selected) => {
        if (selected) savePinnedSkills(ctx.cwd, selected);
        done();
      },
    });
  },
}
```

The important detail is that `open` returns the component. Do not call `ctx.ui.custom()` from inside the settings component factory unless you are deliberately opening a nested modal. Let the launcher own the overlay lifecycle.

## 7. Dashboard widgets: the ambient layer

Actions are explicit: the user chooses to run them. Dashboard widgets are ambient: they show state while the user works. The same widget model covers short status-bar text and richer dashboard cards.

```ts
widgets: [
  {
    id: "status",
    title: "Pinned Skills Status",
    description: "Shows active pinned skills and injection state.",
    defaultZone: "statusBar",
    defaultVariant: "short",
    priority: 40,
    render: ({ variant }) => {
      if (variant === "short") return "pins:2 injected:yes";
      return [
        "Pinned Skills",
        "Injected this session: yes",
        "Active skills: diary, docmgr",
      ];
    },
  },
]
```

The render callback receives a `PiDashboardRenderContext`:

```ts
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
```

The most common zones are:

| Zone | Meaning | Typical variant |
| --- | --- | --- |
| `statusBar` | Compact text rendered through the dashboard status bridge. | `short` |
| `aboveEditor` | Persistent widget above the editor. | `compact` |
| `belowEditor` | Persistent widget below the editor. | `compact` or `card` |
| `dashboardOverlay` | Full dashboard opened with `/px dashboard`. | `card` or `detail` |

A good widget render function is cheap. It should read current in-memory state and format it. It should not scan large directories or run shell commands on every render.

## 8. Command Palette: the speed layer

Actions are explicit, but the `/px` launcher requires multiple steps to reach them. The command palette is a **keyboard-driven hierarchical menu** for fast invocation of known actions. It opens with `Ctrl+Shift+Alt+N` (or `/palette`) and lets the user drill down with single-key presses. The default avoids Kitty's built-in `Ctrl+Shift+P` key-chord prefix.

```text
Ctrl+Shift+Alt+N
  │
  ▸ a  Agent Env →
    c  Compaction Meter →
    o  Compaction Title →
    d  Docmgr →
    p  Pinned Skills →
    r  Response Viewer →
    s  Session Tagger →
```

Press `r` to enter Response Viewer, then `v` to view the last response. Total: three keystrokes from anywhere.

### 8.1 The palette contribution

Add a `palette` array to your `registerPiExtension()` call. Each `PaletteItem` is either a leaf (with `run`) or a submenu (with `children`):

```ts
registerPiExtension({
  id: "my-extension",
  name: "My Extension",
  // ...
  palette: [
    {
      id: "open",
      title: "Open dashboard",
      key: "o",
      run: async (ctx) => openDashboard(ctx),
    },
    {
      id: "config",
      title: "Configuration",
      key: "c",
      children: [
        { id: "edit", title: "Edit settings", key: "e", run: async (ctx) => editSettings(ctx) },
        { id: "reset", title: "Reset defaults", key: "r", run: async (ctx) => resetSettings(ctx) },
      ],
    },
  ],
});
```

### 8.2 Key assignment

At the root level, keys are auto-assigned from extension names (not from the item's `key` field) to avoid cross-extension conflicts. Within a submenu, each item's `key` field is used. If omitted, the framework assigns the first unique alphanumeric character from the title.

### 8.3 Palette vs actions

| Aspect | Actions | Palette |
|--------|---------|---------|
| Purpose | Discovery via `/px` | Speed via `Ctrl+Shift+Alt+N` |
| Structure | Flat list | Hierarchical tree |
| Keys | No key hints | Single-character key hints |
| Depth | One level | Multiple levels |

Use both. Share handler functions between them:

```ts
const handleOpen = async (ctx) => openDashboard(ctx);

actions: [{ id: "open", title: "Open", run: handleOpen }],
palette: [{ id: "open", title: "Open dashboard", key: "o", run: handleOpen }],
```

### 8.4 Palette interaction model

```text
Ctrl+Shift+Alt+N  open palette
a–z, 0–9         activate matching item (drill into submenu or execute leaf)
← / Backspace  go back one level
Esc            close palette
/              toggle search within current level
↑ / ↓          move cursor (fallback navigation)
Enter          activate item at cursor
```

The palette is for **speed**. The launcher (`/px`) is for **discovery**. They coexist.

## 9. The launcher interaction model

The `/px` launcher is the user's main doorway into the shared framework. Its keys are intentionally modal.

```text
normal mode:
  /       enter search mode
  Enter   run selected extension default action
  a       open selected extension actions
  ?       open selected extension docs
  s       open selected extension settings
  p       open command palette
  d       open dashboard
  Esc     close launcher

search mode:
  letters append to query
  Enter   leave search mode
  Esc     leave search mode
  Ctrl+U  clear query
```

Search is activated with `/` because normal letters now have meaning. If typing immediately searched, pressing `a` could either mean "search for a" or "open actions." A mode switch removes that ambiguity.

When you add an extension, think about what each launcher key should reveal:

- `Enter`: the safest and most common thing the extension does.
- `a`: all meaningful commands as named actions.
- `?`: docs that explain the extension and its gotchas.
- `s`: settings if the user can configure it.
- `p`: command palette for fast keyboard-driven access.
- `d`: dashboard state if it contributes widgets.

## 10. A complete worked example

This example extension has state, actions, docs, schema settings, and a dashboard widget. It is small enough to read in one sitting, but includes every major contribution type.

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";

interface MyState {
  enabled: boolean;
  count: number;
}

export default function counterExtension(pi: ExtensionAPI): void {
  const state: MyState = { enabled: true, count: 0 };

  function statusLine(): string {
    return `counter:${state.enabled ? "on" : "off"} n=${state.count}`;
  }

  registerPiExtension({
    id: "counter-demo",
    name: "Counter Demo",
    description: "Demonstrates the shared extension framework.",
    commands: ["counter-demo"],
    tags: ["demo"],

    run: async (ctx) => {
      state.count++;
      ctx.ui.notify(`Counter is now ${state.count}`, "info");
    },

    actions: [
      {
        id: "increment",
        title: "Increment counter",
        description: "Increase the counter by one.",
        default: true,
        run: async (ctx) => {
          state.count++;
          ctx.ui.notify(`Counter is now ${state.count}`, "info");
        },
      },
      {
        id: "reset",
        title: "Reset counter",
        description: "Set the counter back to zero.",
        run: async (ctx) => {
          state.count = 0;
          ctx.ui.notify("Counter reset", "info");
        },
      },
    ],

    docs: [
      {
        id: "overview",
        title: "Counter Demo overview",
        markdown: "# Counter Demo\n\nA tiny extension that demonstrates actions, settings, and widgets.",
      },
    ],

    settings: {
      kind: "schema",
      schema: {
        version: 1,
        title: "Counter Demo Settings",
        sections: [
          {
            id: "main",
            title: "Main",
            fields: [
              {
                id: "enabled",
                label: "Enabled",
                type: "boolean",
                description: "Allow the counter to increment.",
              },
            ],
          },
        ],
      },
      load: () => ({ enabled: state.enabled }),
      onApply: (values, ctx) => {
        state.enabled = values.enabled === true;
        ctx.ui.notify(`counter-demo ${state.enabled ? "enabled" : "disabled"}`, "info");
      },
    },

    widgets: [
      {
        id: "status",
        title: "Counter Demo Status",
        defaultZone: "statusBar",
        defaultVariant: "short",
        priority: 80,
        render: ({ variant }) => {
          if (variant === "short") return statusLine();
          return ["Counter Demo", `Enabled: ${state.enabled}`, `Count: ${state.count}`];
        },
      },
    ],
  });

  pi.registerCommand("counter-demo", {
    description: "Increment the demo counter",
    handler: async (_args, ctx) => {
      if (!state.enabled) {
        ctx.ui.notify("counter-demo is disabled", "warning");
        return;
      }
      state.count++;
      ctx.ui.notify(`Counter is now ${state.count}`, "info");
    },
  });
}
```

This example shows the pattern: the command remains as a direct entrypoint, while the richer contribution metadata makes the extension discoverable from `/px`.

## 11. File layout for a real extension

Small extensions can live entirely in `index.ts`. Once an extension has a custom UI, split it.

```text
extensions/my-extension/
  index.ts      # registration, commands, event handlers
  state.ts      # state load/save helpers if needed
  ui.ts         # custom Component classes
  README.md     # user-facing extension docs
```

Shared framework files live under:

```text
extensions/_shared/
  registry.ts                 # contribution contracts
  ui/action-picker.ts         # action chooser
  ui/doc-viewer.ts            # docs overlay
  ui/settings-view.ts         # schema settings overlay
  ui/dashboard-overlay.ts     # dashboard overlay
  dashboard/config.ts         # dashboard config read/write
  dashboard/layout.ts         # layout helpers
  dashboard/manager.ts        # status/widget bridge
```

Do not import from another extension's private files unless you are deliberately sharing code. Shared utilities should move into `_shared/`.

## 12. Validation workflow

After changing an extension, run the load check:

```bash
timeout 20 pi --list-models
```

This is not a full test suite, but it catches many extension load errors. Then test interactively:

```text
/reload
/px
```

For a fully contributed extension, test:

```text
/px              # extension appears
/                # search mode works
Enter            # default action works
a                # action picker works
?                # docs open
s                # settings open
d                # dashboard opens
```

If your extension has a direct command, test that too:

```text
/my-extension
```

## 13. Common mistakes

### Mistake: doing expensive work in a dashboard render

Dashboard render callbacks may run often. Keep them cheap. Store snapshots in extension state and render the snapshot.

Bad:

```ts
render: () => scanWholeRepositoryAndFormatStatus()
```

Better:

```ts
render: () => formatStatus(lastSnapshot)
```

### Mistake: opening a nested overlay from a settings factory

A custom settings contribution should usually return a component. Let the launcher own `ctx.ui.custom()`.

Bad:

```ts
open: async ({ ctx }) => {
  await ctx.ui.custom(...);
}
```

Better:

```ts
open: ({ theme, done }) => new MySettingsComponent({ theme, done })
```

### Mistake: using unstable IDs

IDs are for machines. Titles are for humans. If you change a widget ID, dashboard config may stop matching it.

Bad:

```ts
{ id: "status-v2-final-new" }
```

Better:

```ts
{ id: "status" }
```

### Mistake: making destructive actions default

The default action runs on Enter. It should be safe.

Bad:

```ts
{ id: "delete-all", title: "Delete all", default: true, run: deleteAll }
```

Better:

```ts
{ id: "open", title: "Open dashboard", default: true, run: openDashboard }
```

## 14. Checklist for a new extension

Before handing off a new extension, verify these items:

- [ ] The extension calls `registerPiExtension(...)` at load time.
- [ ] The `id` is stable, lowercase, and unique.
- [ ] The `name` and `description` are clear in `/px`.
- [ ] The default `run` action is safe.
- [ ] Named actions have stable IDs and user-facing titles.
- [ ] Docs answer the user's first questions.
- [ ] Settings use schema for simple fields or custom UI for rich controls.
- [ ] Dashboard widgets are cheap to render.
- [ ] Palette items have stable IDs and sensible key hints.
- [ ] Palette leaf actions are safe and non-destructive where possible.
- [ ] Existing slash commands still work if they are part of the public interface.
- [ ] `timeout 20 pi --list-models` passes.
- [ ] `/reload` and `/px` manual smoke tests pass.

## 15. Where to learn from existing code

Read these files in this order:

1. `extensions/_shared/registry.ts` — the contracts.
2. `extensions/launcher/index.ts` — how `/px` invokes contributions.
3. `extensions/_shared/ui/extension-launcher.ts` — the main picker UI.
4. `extensions/_shared/ui/command-palette.ts` — the command palette overlay.
5. `extensions/_shared/ui/palette-keys.ts` — key assignment algorithm.
6. `extensions/command-palette/index.ts` — palette extension wiring.
7. `extensions/pinned-skills/index.ts` — actions, docs, custom settings, widgets, palette, and lifecycle state.
8. `extensions/agent-env/index.ts` — schema settings example.
9. `extensions/compaction-meter/index.ts` — simple palette example.
10. `docs/pi-tui-ui-authoring-guide.md` — how to build custom TUI components.

The framework is intentionally small. Most of its power comes from a convention: extensions describe what they provide, and the shared UI decides how to present it. Follow that convention and your extension will feel like part of the same system.
