---
Title: Investigation diary
Ticket: PI-EXT-ACTIONS-DASHBOARD
Status: active
Topics:
    - pi
    - extensions
    - tui
    - settings
    - dashboard
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/_shared/dashboard/manager.ts
      Note: Step 2 dashboard bridge
    - Path: extensions/_shared/registry.ts
      Note: |-
        Current registry evidence for Step 1
        Step 2 contribution contracts (commit 13bb60d)
    - Path: extensions/_shared/ui/action-picker.ts
      Note: Step 2 generic action picker
    - Path: extensions/_shared/ui/dashboard-overlay.ts
      Note: Step 2 dashboard overlay
    - Path: extensions/_shared/ui/doc-viewer.ts
      Note: Step 2 docs viewer
    - Path: extensions/_shared/ui/settings-view.ts
      Note: Step 2 generic settings view
    - Path: extensions/agent-env/index.ts
      Note: Step 2 pilot schema settings
    - Path: extensions/kanban-demo/index.ts
      Note: Step 2 pilot dashboard card
    - Path: extensions/launcher/index.ts
      Note: |-
        Current launcher callback invocation gap
        Step 2 launcher orchestration (commit 13bb60d)
    - Path: extensions/pinned-skills/index.ts
      Note: Step 2 pilot actions docs settings widget
    - Path: ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/design-doc/01-extension-actions-settings-status-docs-and-dashboard-design-guide.md
      Note: Primary design produced in Step 1
ExternalSources: []
Summary: Chronological investigation diary for the extension actions, settings, docs, status, and dashboard design ticket.
LastUpdated: 2026-05-09T19:25:00-04:00
WhatFor: Use this to resume or review the PI-EXT-ACTIONS-DASHBOARD design work.
WhenToUse: When implementing launcher callbacks, registered docs, extension settings, or dashboard widgets.
---



# Diary

## Goal

This diary records the investigation and design work for turning the local Pi extension registry into a richer contribution system. The design covers extension actions, documentation, schema/custom settings, status callbacks, short status callbacks, dashboard widgets, layout configuration, and persistence.

## Step 1: Create ticket and design the contribution registry architecture

I created a new docmgr ticket for the next shared-extension-platform increment and wrote a design guide aimed at a new intern. The guide starts from the current registry and launcher implementation, then proposes typed contribution APIs for actions, docs, settings, and dashboard widgets.

The design intentionally keeps the first implementation incremental. It recommends proving callbacks and docs first, adding schema/custom settings next, and only then building the dashboard layout manager and persisted dashboard config.

### Prompt Context

**User prompt (verbatim):** "Ok let's create design for:

- register status callback
- register short status callback (thing the stuff we have in the statuc bar)
- build a generic settings configurator so that an extension provides a settings schema, and gets a callback
- custom generic settings view so that an extension can directly provide its own widgets.
- register doc so it can be shown with ? or something
- regiter dashboard widgets so that we can build custom widgets (actually, make status / short status use the same widget argument, since the status bar is kind of a small dashboard). We should probably use some kind of layout engine to group them into a view, and save/load the dashboard config.

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Create a new ticket and write an intern-ready design guide for extending the shared Pi extension registry with actions, settings, docs, status/dashboard widgets, layout, and persistence, then upload the ticket bundle to reMarkable.

**Inferred user intent:** The user wants the launcher/shared-library work to evolve into a coherent extension contribution platform rather than a collection of ad hoc commands and UI hooks.

**Commit (code):** N/A — design-only step.

### What I did

- Loaded the ticket/reMarkable workflow instructions.
- Created ticket `PI-EXT-ACTIONS-DASHBOARD` with topics `pi,extensions,tui,settings,dashboard`.
- Added a design document:
  - `ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/design-doc/01-extension-actions-settings-status-docs-and-dashboard-design-guide.md`
- Added this investigation diary:
  - `ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/reference/01-investigation-diary.md`
- Added tasks for architecture mapping, API design, guide writing, validation, and upload.
- Inspected current registry, launcher, status, widget, and settings patterns with:

```bash
rg -n "export interface PiExtensionRegistration|registerPiExtension|listPiExtensions|ExtensionLauncher|setStatus|setWidget|registerMessageRenderer|ctx\.ui\.custom|SettingsList|SelectList|class .* implements Component|class .*Component" extensions docs -S
```

- Captured line-numbered evidence from key files with `nl -ba`, including:
  - `extensions/_shared/registry.ts`
  - `extensions/launcher/index.ts`
  - `extensions/_shared/ui/extension-launcher.ts`
  - `extensions/pinned-skills/index.ts`
  - `extensions/kanban-demo/index.ts`
  - `extensions/tui-showcase/index.ts`
- Inspected Pi extension UI type declarations for `setStatus`, `setWidget`, `setFooter`, and `custom`.
- Wrote the design guide with API sketches, runtime diagrams, pseudocode, implementation phases, testing strategy, risks, and file references.
- Validated the ticket with:

```bash
docmgr doctor --ticket PI-EXT-ACTIONS-DASHBOARD --stale-after 30
```

- Uploaded the ticket bundle to reMarkable with:

```bash
remarquee upload bundle \
  ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/index.md \
  ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/design-doc/01-extension-actions-settings-status-docs-and-dashboard-design-guide.md \
  ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/reference/01-investigation-diary.md \
  ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/tasks.md \
  ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/changelog.md \
  --name "PI EXT ACTIONS DASHBOARD" \
  --remote-dir "/ai/2026/05/09/PI-EXT-ACTIONS-DASHBOARD" \
  --toc-depth 2 \
  --non-interactive 2>&1
```

### Why

The previous launcher work introduced a common registry and `/px`, but it only registered extension metadata and selected extension names. The requested feature set requires a broader contribution model so extensions can expose behavior and UI to the launcher in a discoverable and consistent way.

The design also avoids prematurely replacing Pi core APIs. It uses existing extension-layer primitives and proposes a migration path from direct `ctx.ui.setStatus()`/`ctx.ui.setWidget()` calls to unified dashboard widgets.

### What worked

- The current registry already has a `run` callback field, so the default action concept can be implemented with a small launcher change.
- Existing extensions provide concrete pilot cases:
  - `pinned-skills` for actions, docs, schema settings, custom settings, and status widgets.
  - `kanban-demo` for dashboard card widgets.
  - `tui-showcase` for `SettingsList`, `SelectList`, header/footer, and widget examples.
- Pi's existing `ExtensionUIContext` APIs are sufficient for an extension-layer implementation.

### What didn't work

- No implementation was attempted in this step, so there were no code-level failures.
- The first `docmgr doctor` run warned that `dashboard` and `settings` were unknown topic vocabulary values. I fixed that with:

```bash
docmgr vocab add --category topics --slug dashboard --description "Dashboard widgets and configurable dashboard layouts"
docmgr vocab add --category topics --slug settings --description "Configuration schemas and settings UIs"
```

- The main limitation discovered is architectural: the current status and widget APIs are useful but disconnected, so the new design needs a shared dashboard abstraction rather than just more wrapper helpers.

### What I learned

- `ctx.ui.setStatus()` feeds a flat extension status map that custom footers can read through `FooterDataProvider`.
- `ctx.ui.setWidget()` already accepts both static lines and component factories, making it a good backend for dashboard zones.
- Core Pi settings use the same general pattern the local extension platform can adopt: convert schema-ish setting items into `SettingsList` rows and dispatch changes through callbacks.

### What was tricky to build

The tricky design issue was unifying status, short status, and dashboard widgets without making the first implementation too large. The solution in the guide is to model all of them as dashboard widgets with variants such as `short`, `compact`, `card`, and `detail`. The status bar becomes the `short` dashboard zone rather than a special unrelated API.

Another tricky issue is reload safety. Callback-based registries store function references, so stale callbacks can survive if an extension disappears during reload. The guide recommends adding registry generations later so old registrations can be swept safely.

### What warrants a second pair of eyes

- Whether dashboard status should first bridge through `ctx.ui.setStatus("dashboard", ...)` or immediately replace the footer with `ctx.ui.setFooter()`.
- Whether settings should apply on each field change or require an explicit Apply action by default.
- Whether `?` should open docs directly or switch the launcher details pane into a help mode.
- Whether dashboard config should be global-first with project overrides, or project-first with global fallback.

### What should be done in the future

- Implement Phase 1 from the guide: actions and docs in the registry.
- Pilot with `pinned-skills` before adding dashboard persistence.
- Add schema settings after action/docs callbacks are proven.
- Build dashboard widget layout and config only after at least two real widgets use the contribution model.

### Code review instructions

- Start with the design guide's "Current-state analysis" to verify that file references match the current code.
- Review the "API design" section for type shape and callback boundaries.
- Review the "Implementation phases" section for sequencing.
- Validate the ticket with `docmgr doctor --ticket PI-EXT-ACTIONS-DASHBOARD --stale-after 30`.
- Confirm the reMarkable upload command succeeds.
- Upload result: `OK: uploaded PI_EXT_ACTIONS_DASHBOARD.pdf -> /ai/2026/05/09/PI-EXT-ACTIONS-DASHBOARD`.

### Technical details

Primary design doc:

```text
ttmp/2026/05/09/PI-EXT-ACTIONS-DASHBOARD--extension-actions-settings-status-docs-and-dashboard/design-doc/01-extension-actions-settings-status-docs-and-dashboard-design-guide.md
```

Proposed core registry shape:

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

Recommended first implementation phase:

```text
Phase 1: actions + docs in registry, then launcher keys Enter/?/a.
```

## Step 2: Implement contribution callbacks, settings, docs, and dashboard first pass

I implemented the first pass of the contribution platform described in the design guide. The registry now accepts actions, docs, settings contributions, and dashboard widgets; `/px` can route to those contributions; and several existing extensions register pilot contributions.

The implementation deliberately keeps compatibility with the old command/status model. Existing slash commands and direct `ctx.ui.setStatus()` calls still work, while new launcher/dashboard paths provide a migration target.

### Prompt Context

**User prompt (verbatim):** "Add detailed tasks, grouped by phase, then work on them one by one, keeping a diary as you work, and committing at appropriate inervals. 

Do them all, I expect you to be done when I come back. You can verify visual stuff by using tmux."

**Assistant interpretation:** Break the contribution-platform design into phase-grouped implementation tasks, implement the phases end-to-end, keep the diary updated, validate manually where possible, and commit at sensible checkpoints.

**Inferred user intent:** The user wants autonomous implementation of the designed extension contribution system, with durable documentation and commits ready for review when they return.

**Commit (code):** 13bb60d5776ed893f05c8dafeadd405b8acf71ae — "Add extension contribution callbacks and dashboard"

### What I did

- Replaced the short task list with detailed phase-grouped tasks in `tasks.md`.
- Extended `extensions/_shared/registry.ts` with contracts for:
  - actions and action callbacks,
  - docs,
  - schema/custom settings,
  - dashboard widgets,
  - dashboard widget listing/key helpers.
- Updated `extensions/_shared/ui/extension-launcher.ts` so `/px` returns structured intents:
  - select/run,
  - actions,
  - docs,
  - settings,
  - dashboard,
  - cancel.
- Added shared UI components:
  - `extensions/_shared/ui/action-picker.ts`
  - `extensions/_shared/ui/doc-viewer.ts`
  - `extensions/_shared/ui/settings-view.ts`
  - `extensions/_shared/ui/dashboard-overlay.ts`
- Added dashboard helpers:
  - `extensions/_shared/dashboard/config.ts`
  - `extensions/_shared/dashboard/layout.ts`
  - `extensions/_shared/dashboard/manager.ts`
- Reworked `extensions/launcher/index.ts` to:
  - invoke default actions,
  - open action picker with `a`,
  - open docs with `?`,
  - open settings with `s`,
  - open dashboard with `d` or `/px dashboard`,
  - refresh the dashboard after actions/settings.
- Added pilot contributions to:
  - `pinned-skills` — actions, docs, custom settings view, status widget,
  - `compaction-meter` — action, docs, status widget,
  - `agent-env` — actions, docs, schema settings, status widget,
  - `kanban-demo` — actions, docs, dashboard card widget,
  - `launcher` — docs and dashboard zone settings.
- Validated extension loading with:

```bash
timeout 20 pi --list-models >/tmp/pi-list.out 2>/tmp/pi-list.err
```

- Started a tmux smoke test with `pi` and attempted `/px` interaction. This verified that Pi still started, but the captured run submitted `/px` as normal input rather than showing the overlay in the captured pane, so the visual test remains partially inconclusive.

### Why

The design called for a contribution registry rather than more ad hoc top-level commands. Implementing the registry contracts and pilot contributions first gives the launcher real extension callbacks to invoke and gives dashboard/settings/docs code real consumers.

The status/dashboard bridge was implemented without replacing Pi's built-in footer because that is the lowest-risk migration path. It lets dashboard widgets render into a normal extension status entry while old status entries still exist.

### What worked

- `timeout 20 pi --list-models` exited with code `0` after the implementation.
- The registry type remained backwards compatible with existing metadata-only registrations.
- The launcher orchestration is now centralized in `extensions/launcher/index.ts`, which makes actions/docs/settings/dashboard behavior easier to review.
- Pilot extensions demonstrate both schema settings (`agent-env`) and custom settings (`pinned-skills`).
- The dashboard config layer can already read/merge global/project config and write `.pi/dashboard.json`.

### What didn't work

- The tmux `/px` smoke test did not conclusively show the overlay. The captured pane showed Pi startup and then treated `/px` as submitted input, producing normal agent activity. This may be due to timing, duplicate/global extension command conflicts, or how the interactive command system behaves under the automated tmux send sequence.
- No full TypeScript compile command exists in this repository, so `pi --list-models` is the current load validation.

### What I learned

- The existing `run` field was enough to preserve a simple default-action path while adding richer `actions[]`.
- `ctx.ui.custom()` can host all the first-pass generic views, including docs/settings/dashboard overlays.
- The status bar can be treated as a dashboard zone by rendering short widgets into `ctx.ui.setStatus("dashboard", ...)`.
- Schema settings are best for booleans/selects at this stage; custom views remain necessary for rich controls like the pinned-skills checklist.

### What was tricky to build

The tricky part was keeping the custom settings contract flexible without nesting overlays incorrectly. The `pinned-skills` custom settings view now returns a `PinnedSkillsChecklist` component directly instead of opening another `ctx.ui.custom()` from inside the settings factory.

Another tricky point was dashboard rendering. Dashboard widgets can return strings, string arrays, or components, but the status bridge needs line-oriented output. The layout helpers normalize each rendered widget to lines before composing inline, stack, or grid layouts.

### What warrants a second pair of eyes

- The generic settings view is intentionally minimal and should be reviewed before relying on it for string/path editing.
- The dashboard manager installs above/below editor dashboard components even when there may be no visible widgets; verify this does not create blank chrome in all themes/modes.
- The tmux `/px` interaction needs a better repeatable visual test recipe.
- Callback reload safety still relies on overwrite-by-ID; generation sweeping remains future work.

### What should be done in the future

- Add registry generation cleanup for reload/disappearing extension safety.
- Improve doc viewer rendering by embedding or adapting the real `Markdown` component with scroll support.
- Add a per-widget dashboard layout editor rather than only zone toggles.
- Migrate more extensions to registered actions/widgets and eventually remove duplicated direct status strings.

### Code review instructions

- Start with `extensions/_shared/registry.ts` to review the new contribution contracts.
- Review `extensions/launcher/index.ts` for orchestration and callback invocation.
- Review shared UI components under `extensions/_shared/ui/`.
- Review dashboard helpers under `extensions/_shared/dashboard/`.
- Spot-check pilot contributions in `pinned-skills`, `agent-env`, `compaction-meter`, and `kanban-demo`.
- Validate with `timeout 20 pi --list-models`.
- Manually test `/reload`, `/px`, `a`, `?`, `s`, `d`, and `/px dashboard` in a real terminal.

### Technical details

New result type from the launcher modal:

```ts
export type ExtensionLauncherResult =
  | { kind: "select"; extension: PiExtensionRegistration }
  | { kind: "actions"; extension: PiExtensionRegistration }
  | { kind: "docs"; extension: PiExtensionRegistration }
  | { kind: "settings"; extension: PiExtensionRegistration }
  | { kind: "dashboard" }
  | { kind: "cancel" };
```

Dashboard config paths:

```text
~/.pi/agent/dashboard.json
.pi/dashboard.json
```

Validation result:

```text
timeout 20 pi --list-models: exit=0
```
