---
Title: Investigation diary
Ticket: PI-EXT-LAUNCHER
Status: active
Topics:
    - pi
    - extensions
    - tui
    - skills
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: docs/pi-tui-ui-authoring-guide.md
      Note: Step 2 documents real /px implementation notes (commit ca10f75)
    - Path: extensions/_shared/registry.ts
      Note: Implementation diary core registry
    - Path: extensions/_shared/ui/extension-launcher.ts
      Note: Step 2 polished /px modal UI (commit ca10f75)
    - Path: extensions/launcher/index.ts
      Note: |-
        Implementation diary launcher command
        Step 2 passes requestRender into launcher modal (commit ca10f75)
    - Path: ttmp/2026/05/09/PI-EXT-LAUNCHER--shared-pi-extension-library-and-launcher/design-doc/01-shared-extension-library-launcher-analysis-design-and-implementation-guide.md
      Note: Primary guide produced for this ticket
ExternalSources: []
Summary: Chronological diary for shared Pi extension library and launcher implementation.
LastUpdated: 2026-05-09T19:05:00-04:00
WhatFor: Use to resume or review the shared launcher implementation work.
WhenToUse: When continuing PI-EXT-LAUNCHER or auditing the initial shared registry/launcher implementation.
---



# Diary

## Goal

This diary records the creation of a shared Pi extension library and minimal launcher architecture. The first implementation registers all local extensions into a shared registry and adds a `/px` fuzzy-search launcher that prints the selected extension name.

## Step 1: Create ticket, design shared architecture, and implement launcher v0

I created the `PI-EXT-LAUNCHER` docmgr ticket, inventoried current extension commands, read the Pi extension/TUI docs, and implemented a minimal shared library. The implementation intentionally stops at a proof of architecture: the launcher can discover registered extensions and select one, but it does not yet execute extension-specific actions.

This gives us a place to grow shared UI kit components, helper functionality, and a common launcher without breaking any existing top-level commands.

### Prompt Context

**User prompt (verbatim):** "Ok, here's what I want to do to start:

- add a share library
- register all our extensions to a launcher
- the launcher for now just allows us to fuzzy search a list of the extensions, and then prints out its name. That's just to get the architecture going.

Create a new ticket with docmgr, and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.


As you research, things we want shared:
- UI kit
- helper functionality
- common launcher"

**Assistant interpretation:** Create a new docmgr ticket, write an intern-ready design/implementation guide, implement the first shared extension registry and launcher, register all local extensions, and upload the documentation bundle to reMarkable.

**Inferred user intent:** The user wants to start consolidating a growing local Pi extension suite with a shared library and launcher while preserving documentation and handoff quality.

**Commit (code):** pending at time of diary entry.

### What I did

- Created ticket `PI-EXT-LAUNCHER`.
- Added a design document and this diary.
- Added implementation tasks.
- Inventoried existing extension commands with:

```bash
rg -n "registerCommand\(" extensions -S
```

- Read Pi TUI documentation for custom components and overlays.
- Added shared registry:

```text
extensions/_shared/registry.ts
```

- Added shared launcher UI component:

```text
extensions/_shared/ui/extension-launcher.ts
```

- Added launcher extension:

```text
extensions/launcher/index.ts
```

- Updated all local extensions to call `registerPiExtension(...)`.
- Updated `.pi/settings.json` to load all local extensions and the launcher.
- Validated extension loading with:

```bash
timeout 20 pi --list-models >/tmp/pi-launcher-load.out 2>/tmp/pi-launcher-load.err
```

### Why

The repository had accumulated many useful extension commands, but no shared entrypoint or common extension metadata layer. A minimal registry and launcher gives us a stable place to build shared UI kit and helper functionality without a disruptive rewrite.

### What worked

- `timeout 20 pi --list-models` exited with code `0` after all extensions were registered and `.pi/settings.json` loaded them.
- The registry design is simple: a global singleton `Map` keyed by stable extension ID.
- The launcher UI uses the same TUI patterns proven in `pinned-skills`: overlay, typed filtering, details pane, and line-width-safe rendering.

### What didn't work

- The first attempt to patch `kanban-demo` and `tui-showcase` missed exact text blocks because their local variable declarations differed from the other extensions. I inspected the relevant regions and applied smaller exact edits.

### What I learned

- All extension factories can register metadata at load time without changing their existing behavior.
- Pi's `ctx.ui.custom()` overlay path is enough for a common launcher.
- The initial registry should be extension-level metadata, not action-level execution, to keep the first step low-risk.

### What was tricky to build

The main tricky part was hot reload and duplicate registration. A plain module-level `Map` can duplicate or fragment if reload behavior creates multiple module instances. The registry uses `Symbol.for("wesen.pi.extensions.registry.v1")` on `globalThis` and `Map.set(id, ...)`, so re-registering the same extension overwrites its row.

The second tricky part was keeping the first launcher deliberately limited. It is tempting to build action execution immediately, but the user explicitly asked to print the name for now to get the architecture going.

### What warrants a second pair of eyes

- Whether `globalThis` registry state should be cleared on `/reload`, or whether overwrite-by-ID is enough.
- Whether `.pi/settings.json` should load all demo extensions by default, especially `kanban-demo` and `tui-showcase`.
- Whether the shared registry should live under `_shared/registry.ts` or a more package-like `extensions/shared/` name before this becomes distributable.

### What should be done in the future

- Add a shared action registry so the launcher can run actions.
- Extract `pinned-skills` checklist into a generic shared checklist.
- Add shared config and status helpers.
- Add a `/px status` dashboard.

### Code review instructions

- Start with `extensions/_shared/registry.ts`.
- Then review `extensions/_shared/ui/extension-launcher.ts`.
- Then review `extensions/launcher/index.ts`.
- Spot-check one or two extension registration calls.
- Validate load with `timeout 20 pi --list-models`.
- Manually test with `/reload` then `/px` in an interactive Pi session.

### Technical details

Core registry shape:

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

Launcher command:

```text
/px
```

Validation result:

```text
code=0
```

## Step 2: Polish `/px` into a framed two-pane launcher modal

I used the UI authoring guide's render-helper hierarchy to turn `/px` from a plain list/details view into a framed modal with a search header, grouped extension list, details pane, and footer. The implementation is still intentionally launcher v0: selecting an item reports the selected extension name rather than executing extension actions.

After an early manual test, the search placeholder was adjusted so the cursor appears immediately after `Search:` in the empty state. That makes the placeholder read as a hint instead of looking like text that has already been typed into the input.

### Prompt Context

**User prompt (verbatim):** "Then use it to actually implement the UI for the /px , and update the document as needed. Let me know when I should test to give you feedback, potentially before you get too far."

**Assistant interpretation:** Apply the new UI authoring guide to the real `/px` launcher, update the guide with any implementation lessons, pause for manual feedback before over-polishing, then commit and record the work.

**Inferred user intent:** The user wants the launcher UI to become a practical example of the documented component hierarchy pattern and wants a chance to shape visual polish interactively.

**Commit (code):** ca10f75c2a9b8d15eb012a8ab524cfbaaa0a4f66 — "Improve extension launcher modal UI"

### What I did

- Reworked `extensions/_shared/ui/extension-launcher.ts` around a hierarchy of render helpers:
  - `renderSearchLine()`
  - `renderHelpLine()`
  - `renderSplitBody()`
  - `buildListRows()`
  - `renderDetails()`
  - `renderFooter()`
- Added a full modal frame with centered title, search row, grouped list/details split, and footer.
- Added extension grouping by inferred domain: compaction, skills, docs, environment, session, demos, launcher, and other.
- Added width-safe helpers for borders, rows, split separators, and ANSI-aware padding.
- Updated `extensions/launcher/index.ts` to pass `requestRender: () => tui.requestRender()` into the modal so input changes redraw reliably.
- Updated `docs/pi-tui-ui-authoring-guide.md` with implementation notes from the real `/px` launcher.
- Applied user feedback to make the empty search line render like `Search: █ type to filter` instead of placing the cursor after the placeholder.
- Validated load behavior with:

```bash
timeout 20 pi --list-models >/tmp/pi-list-models.out 2>/tmp/pi-list-models.err
```

### Why

The previous launcher proved the registry architecture but did not demonstrate the richer component-system-like UI structure the guide described. This change makes `/px` a concrete example of the intended pattern: one stateful `Component` with a YAML-like hierarchy expressed as small render methods.

### What worked

- `timeout 20 pi --list-models` exited with code `0` after the refactor.
- The user manually opened `/px` and reported that the overall modal looked great.
- The render-helper decomposition made the UI easier to adjust after feedback; the search cursor fix only touched `renderSearchLine()`.
- Passing `requestRender` from the `ctx.ui.custom()` factory gives the component an explicit redraw path after keyboard input.

### What didn't work

- The first empty search rendering placed the cursor after the placeholder text:

```text
Search: type to filter█
```

The user pointed out that this made the placeholder look like typed input. I changed it to:

```text
Search: █ type to filter
```

### What I learned

- The documented hierarchy pattern is useful, but for precise terminal layout it should compile to line helpers rather than built-in vertical widgets.
- Placeholder/cursor ordering matters a lot in terminal UIs because there is no native input element styling to distinguish placeholder text from entered text.
- Manual testing is especially valuable for TUI polish; static load validation only catches extension load/runtime syntax issues.

### What was tricky to build

The tricky part was reconciling grouped list rows with cursor-based selection and scrolling. Group headers and subtitle rows are rendered alongside selectable extension rows, so scroll logic cannot assume one visual row per extension. I solved this by building `ListRenderRow` objects where only selectable rows carry `extensionIndex`, then locating the selected visual row before adjusting scroll.

The other sharp edge was width accounting with styled strings. The launcher now pads and truncates with `visibleWidth()` and `truncateToWidth()` so ANSI color sequences do not cause obvious border drift.

### What warrants a second pair of eyes

- The group inference in `primaryGroup()` is heuristic and may misclassify future extensions with overlapping tags.
- The current implementation still keeps frame/layout helpers inside `extension-launcher.ts`; if another modal needs them, they should be extracted into shared `frame.ts` or `layout.ts`.
- The selected row uses accent styling rather than a background fill, so visual emphasis should be reviewed across light/dark themes.

### What should be done in the future

- Extract reusable modal frame and split-pane helpers after one more consumer exists.
- Add action-level launcher entries once the extension-level UX is stable.
- Consider showing command aliases more prominently in the list subtitle instead of tags when that is more useful.

### Code review instructions

- Start with `extensions/_shared/ui/extension-launcher.ts`, especially `render()`, `buildListRows()`, `ensureScroll()`, and `renderSearchLine()`.
- Review `extensions/launcher/index.ts` to verify the `requestRender` callback is passed correctly from `ctx.ui.custom()`.
- Review `docs/pi-tui-ui-authoring-guide.md` for whether the implementation notes match the actual code.
- Validate loading with `timeout 20 pi --list-models`.
- Manually validate with `/reload` then `/px`; test empty search, typed search, `Ctrl+U`, arrows, `Enter`, and `Esc`.

### Technical details

The empty search input now renders with the cursor before the placeholder:

```text
Search: █ type to filter
```

The key implementation pattern is:

```ts
private markDirty(): void {
  this.invalidate();
  this.requestRender?.();
}
```

and the command factory wires it with:

```ts
(tui, theme, _keybindings, done) => new ExtensionLauncher({
  extensions,
  theme,
  done,
  requestRender: () => tui.requestRender(),
})
```
