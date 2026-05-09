---
Title: Shared extension library launcher analysis design and implementation guide
Ticket: PI-EXT-LAUNCHER
Status: active
Topics:
    - pi
    - extensions
    - tui
    - skills
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
      Note: Extension command and UI API reference
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md
      Note: Custom TUI component and overlay reference
    - Path: .pi/settings.json
      Note: Project config loading launcher and registered extensions
    - Path: extensions/_shared/registry.ts
      Note: Shared extension registration library
    - Path: extensions/_shared/ui/extension-launcher.ts
      Note: Shared fuzzy-search launcher TUI component
    - Path: extensions/launcher/index.ts
      Note: Launcher extension and /px command
ExternalSources: []
Summary: Design and implementation guide for a shared Pi extension library, registration registry, UI kit direction, and minimal fuzzy-search launcher.
LastUpdated: 2026-05-09T18:30:00-04:00
WhatFor: Use when continuing the shared Pi extension launcher/library work.
WhenToUse: When adding shared UI helpers, registering extensions with the launcher, or migrating top-level extension commands into a common architecture.
---


# Shared extension library launcher analysis design and implementation guide

## Executive Summary

This ticket starts a shared architecture for the local Pi extensions in this repository. The immediate implementation is intentionally small: add a shared library, register extensions into a common registry, and add a `/px` launcher that fuzzy-searches registered extensions and prints the selected extension name. The purpose is to prove the architecture without yet replacing every top-level command or building a full action runner.

The repository currently contains many independent extensions. They register many top-level slash commands and each owns its own UI/config/status patterns. That works for isolated experiments, but it does not scale well as the extension collection grows. A shared library gives the extensions common building blocks:

- a registry for extension metadata,
- a common launcher UI,
- reusable UI kit components,
- shared helper functionality for config, status, commands, and future action registration.

The implementation added in this phase creates:

```text
extensions/_shared/registry.ts
extensions/_shared/ui/extension-launcher.ts
extensions/launcher/index.ts
```

and wires all current extensions to call `registerPiExtension(...)` at load time.

## Problem Statement

The extension directory has become a collection of useful but independent tools. Current examples include `pinned-skills`, `docmgr`, `compaction-meter`, `compaction-title`, `session-summary`, `response-capture`, `agent-env`, `direnv-bash`, `kanban-demo`, and `tui-showcase`.

A command inventory shows the problem clearly:

```text
docmgr, docmgr-refresh, docmgr-debug, docmgr-tickets, docmgr-docs, docmgr-tasks, docmgr-close
compact-meter, cm
compaction-title, ctitle, compaction-title-self-test
response-preview, response-save, response-import, response-import-last
agent-env, ae, agent-env-toggle, ae-toggle, agent-env-self-test
direnv-bash, dbash, direnv-bash-self-test
kanban
tui-demo
summary, summary-toggle, summary-logs, summary-debug
pinned-skills
```

The user experience cost is that users must remember many command names and aliases. The engineering cost is duplicated UI code and inconsistent command/status/config behavior.

This ticket starts the migration toward a common extension layer without breaking existing commands.

## Current-State Architecture

### Pi extension primitives

Pi extensions are TypeScript modules exporting a default factory that receives `ExtensionAPI`. The Pi docs show that an extension can register commands, tools, shortcuts, flags, event handlers, and UI (`docs/extensions.md:152-179`). Commands are registered with `pi.registerCommand()` and can interact with users through `ctx.ui` (`docs/extensions.md:1338-1370`).

Custom UI is built with `ctx.ui.custom()`; it accepts a component and can be shown as an overlay (`docs/extensions.md:2285-2341`). Components implement a simple interface with `render(width)`, optional `handleInput(data)`, and `invalidate()` (`docs/tui.md:1-35`).

These APIs make a launcher extension straightforward:

1. register a `/px` command,
2. read registered extension metadata from a shared registry,
3. open an overlay component,
4. return the selected item,
5. show a notification with the selected extension name.

### Existing local extension shape

Most extensions currently have this structure:

```text
extensions/<name>/index.ts
extensions/<name>/README.md
extensions/<name>/<helpers>.ts
```

They are loaded from project `.pi/settings.json` by path. For example, the current settings now include all local extensions plus the launcher.

### Why a shared singleton registry works here

All local extensions run in the same Pi extension runtime process. A shared imported module can hold process-local state. The registry uses a `Symbol.for(...)` key on `globalThis` so that even if module paths are reloaded in slightly different ways, the registry state remains discoverable in the same process:

```ts
const REGISTRY_KEY = Symbol.for("wesen.pi.extensions.registry.v1");
```

Each extension calls:

```ts
registerPiExtension({
  id: "pinned-skills",
  name: "Pinned Skills",
  description: "...",
  commands: ["pinned-skills"],
  tags: ["skills", "prompt", "context"],
});
```

The launcher reads:

```ts
listPiExtensions()
```

and displays the returned metadata.

## Proposed Architecture

### Phase 1 architecture implemented now

```text
┌─────────────────────────────┐
│ extension factory loads      │
│ pinned-skills/docmgr/etc.    │
└──────────────┬──────────────┘
               │ registerPiExtension(...)
               ▼
┌─────────────────────────────┐
│ extensions/_shared/registry  │
│ global singleton Map         │
└──────────────┬──────────────┘
               │ listPiExtensions()
               ▼
┌─────────────────────────────┐
│ extensions/launcher          │
│ /px command                  │
└──────────────┬──────────────┘
               │ ctx.ui.custom overlay
               ▼
┌─────────────────────────────┐
│ ExtensionLauncher component  │
│ fuzzy search + details pane  │
└─────────────────────────────┘
```

The first launcher does not run actions yet. It only proves registration and selection by printing:

```text
Selected extension: Pinned Skills (pinned-skills)
```

### Future architecture

The natural next step is to upgrade the registry from extension metadata to action metadata:

```ts
interface PiExtensionAction {
  extensionId: string;
  id: string;
  title: string;
  description: string;
  group?: string;
  keywords?: string[];
  run(ctx: ExtensionCommandContext): Promise<void> | void;
}
```

Then `/px` can fuzzy-search actions rather than only extensions.

## Shared Library Components

### `extensions/_shared/registry.ts`

Purpose: process-local extension metadata registry.

Current API:

```ts
export interface PiExtensionRegistration {
  id: string;
  name: string;
  description: string;
  commands?: string[];
  tags?: string[];
  run?: (ctx: ExtensionCommandContext) => Promise<void> | void;
}

export function registerPiExtension(registration: PiExtensionRegistration): void;
export function unregisterPiExtension(id: string): void;
export function listPiExtensions(): PiExtensionRegistration[];
export function clearPiExtensionRegistry(): void;
```

Key design choices:

- Registration by stable `id` so reloads overwrite older entries rather than duplicating them.
- `commands` is metadata only for now.
- Optional `run` anticipates the future action system but is not used by the first launcher.
- Global singleton state avoids separate registry instances during reload/module-cache edge cases.

### `extensions/_shared/ui/extension-launcher.ts`

Purpose: reusable fuzzy-search overlay component for registered extensions.

Features:

- typed filter input,
- simple fuzzy scoring,
- arrow-key navigation,
- details pane with description, commands, and tags,
- Enter selects,
- Escape cancels,
- line-width safety through `truncateToWidth()` and `wrapTextWithAnsi()`.

Controls:

```text
type       fuzzy search
↑/↓        move
Backspace  edit filter
Ctrl+U     clear filter
Enter      select
Esc        cancel
```

### `extensions/launcher/index.ts`

Purpose: top-level launcher extension.

It registers itself and one command:

```ts
pi.registerCommand("px", {
  description: "Open the shared Pi extension launcher",
  handler: async (_args, ctx) => { ... },
});
```

The handler opens the `ExtensionLauncher` overlay and prints the selected extension name. This intentionally keeps the first version low-risk.

## Extension Registration Inventory

All current extensions now register metadata:

| Extension | ID | Commands | Tags |
|---|---|---|---|
| Agent Env | `agent-env` | `agent-env`, `ae`, `agent-env-toggle`, `ae-toggle`, `agent-env-self-test` | bash, environment, metadata |
| Compaction Meter | `compaction-meter` | `compact-meter`, `cm` | compaction, status |
| Compaction Title | `compaction-title` | `compaction-title`, `ctitle`, `compaction-title-self-test` | compaction, session, title |
| Direnv Bash | `direnv-bash` | `direnv-bash`, `dbash`, `direnv-bash-self-test` | bash, direnv, environment |
| Docmgr | `docmgr` | `docmgr`, `docmgr-refresh`, `docmgr-debug`, `docmgr-tickets`, `docmgr-docs`, `docmgr-tasks`, `docmgr-close` | docmgr, tickets, docs, tasks |
| Kanban Demo | `kanban-demo` | `kanban` | demo, tui, kanban |
| Pinned Skills | `pinned-skills` | `pinned-skills` | skills, prompt, context |
| Response Capture | `response-capture` | `response-preview`, `response-save`, `response-import`, `response-import-last` | response, docmgr, capture |
| Session Summary | `session-summary` | `summary`, `summary-toggle`, `summary-logs`, `summary-debug` | summary, prompt, widget |
| TUI Showcase | `tui-showcase` | `tui-demo` | demo, tui, showcase |
| Extension Launcher | `launcher` | `px` | launcher, shared, ui |

## Implementation Guide for a New Intern

### Step 1: Understand the extension load flow

Each extension is loaded by Pi from `.pi/settings.json`. The project config currently lists extension entrypoints explicitly. On load, each extension factory runs and can immediately register metadata in the shared registry.

Important rule: registration should happen at factory time, before user interaction, so `/px` sees as much as possible.

### Step 2: Add a new extension to the launcher

In the extension's `index.ts`:

```ts
import { registerPiExtension } from "../_shared/registry";

export default function myExtension(pi: ExtensionAPI): void {
  registerPiExtension({
    id: "my-extension",
    name: "My Extension",
    description: "What it does in one clear sentence.",
    commands: ["my-command"],
    tags: ["tag1", "tag2"],
  });

  pi.registerCommand("my-command", { ... });
}
```

If the extension is not in `.pi/settings.json`, add its path.

### Step 3: Use `/px`

Run Pi, then:

```text
/px
```

Type to filter. Select an extension. Version 0 prints the name.

### Step 4: Add shared UI components later

The first shared UI component is `ExtensionLauncher`. The next shared UI kit candidates are:

- checklist overlay extracted from `extensions/pinned-skills/ui.ts`,
- details-list overlay,
- forms/settings overlay,
- command/action launcher,
- status table.

### Step 5: Add helper functionality later

Likely shared helpers:

- config read/write with global/project merge,
- status formatting,
- command group parser,
- action registry,
- logging helper,
- cache-safe prompt epoch helper for prompt-mutating extensions.

## Pseudocode

### Registering extensions

```ts
// extension factory
registerPiExtension({
  id: "compaction-meter",
  name: "Compaction Meter",
  description: "Shows tokens remaining before compaction.",
  commands: ["compact-meter", "cm"],
  tags: ["compaction", "status"],
});
```

### Launcher flow

```ts
pi.registerCommand("px", {
  handler: async (_args, ctx) => {
    const extensions = listPiExtensions();
    const selected = await ctx.ui.custom(
      (_tui, theme, _keys, done) => new ExtensionLauncher({ extensions, theme, done }),
      { overlay: true },
    );
    if (selected) ctx.ui.notify(`Selected extension: ${selected.name}`, "info");
  },
});
```

### Fuzzy scoring

```ts
function scoreExtension(extension, query) {
  if (!query) return 0;
  const haystack = [id, name, description, commands, tags].join(" ").toLowerCase();
  if (haystack.includes(query)) return 1000 - haystack.indexOf(query);
  // otherwise match characters in order
}
```

## Risks and Tradeoffs

### Load order

The launcher can only show extensions that registered before `/px` is invoked. Since all configured extension factories run at startup, this is fine for current usage. If lazy-loaded extensions appear later, they can register then.

### Reload duplicates

The registry uses `Map.set(id, registration)`, so re-registering the same ID overwrites old metadata. This avoids duplicate rows on `/reload`.

### Global singleton state

Using `globalThis` is pragmatic for a local extension suite. If these extensions become a distributed Pi package, this should be revisited and versioned carefully.

### Top-level commands remain

This phase intentionally leaves existing commands intact. The launcher is additive. Future phases can reduce top-level command clutter by moving command verbs behind action registrations.

## Validation Strategy

Low-cost load validation:

```bash
timeout 20 pi --list-models
```

Expected result: exit code `0`.

Manual interactive validation:

```text
/reload
/px
```

Then type a filter such as `skill`, `compact`, or `docmgr`, press Enter, and confirm a notification appears with the selected extension name.

## Future Work

1. Extract `pinned-skills` checklist into `extensions/_shared/ui/checklist.ts`.
2. Add an action registry and let the launcher run actions.
3. Add command group helpers so extensions can reduce top-level verbs.
4. Add shared config and status helpers.
5. Add a `/px status` dashboard for all extension statuses.
6. Migrate one extension at a time to shared actions while keeping compatibility commands.

## References

- Pi extension docs: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`.
- Pi TUI docs: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`.
- Extension API type declarations: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`.
- Local pinned skills checklist precedent: `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/pinned-skills/ui.ts`.
- Shared registry implementation: `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts`.
- Launcher implementation: `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/launcher/index.ts`.
