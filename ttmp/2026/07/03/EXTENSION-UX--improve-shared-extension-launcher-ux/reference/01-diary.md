---
Title: Diary
Ticket: EXTENSION-UX
Status: active
Topics:
    - pi-extensions
    - tui
    - extensions
    - prompts
    - dashboard
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/_shared/ui/extension-launcher.ts
      Note: Main investigated source file for launcher UX behavior
    - Path: ttmp/2026/07/03/EXTENSION-UX--improve-shared-extension-launcher-ux/design-doc/01-shared-extension-ux-improvement-guide.md
      Note: Primary design deliverable recorded by the diary
ExternalSources: []
Summary: Chronological investigation diary for the shared extension UX improvement design ticket.
LastUpdated: 2026-07-03T12:35:00-07:00
WhatFor: Use to continue or review the EXTENSION-UX investigation and implementation planning work.
WhenToUse: When resuming the shared launcher, docs, and prompto UX improvement work.
---


# Diary

## Goal

This diary records the investigation and design work for improving the shared Pi extension UX. It captures what was inspected, why the design is shaped the way it is, and how a future implementation pass should validate the changes.

## Step 1: Create the ticket and map the affected UI surfaces

The goal of this step was to turn the requested UX issues into a durable docmgr ticket and identify the concrete files that control the shared launcher, docs viewer, action picker, and prompto insertion path. The main finding is that the reported issues are not isolated bugs; they are consequences of state being local to short-lived modal components and of fixed-height rendering in components that only receive width.

I created the `EXTENSION-UX` ticket, added the primary design guide and diary documents, then inspected the shared UI components and prompto integration. The resulting design guide explains the current architecture and proposes implementation phases for state restoration, wraparound navigation, fuzzy filtering, scrollable details/docs, dynamic height, and prompto insertion shortcuts.

### Prompt Context

**User prompt (verbatim):** "Improvement I would like in the common framework:

- when I go into the help or so of a plugin, and then press back, I'm back at the top of the list. 
- when I am in the list at the top and I press up, I would like to wrap around
- when I / and then search for prompto or whatever, it should filter down fuzzy style too
- I can't seem to scroll the help pane in the top view, to see for example the list of commands. Try to expand the dialogue vertically more based on screen size, and maybe offer some shift-arrow or so navigation to scroll the right pane.
- allow a keyboard shortcut or so to drop a prompto even if we are not at the beginning of the prompt for the /command.

Create a new docmgr ticket to improve the extensions.

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Create a new docmgr ticket for shared extension UX improvements, investigate the relevant code, write an intern-ready design/implementation guide, store it in the ticket, and upload the ticket docs to reMarkable.

**Inferred user intent:** Preserve the requested UX fixes in a durable implementation guide so a future coding pass can make the shared extension framework more keyboard-friendly without rediscovering the architecture.

### What I did

- Ran `docmgr status --summary-only` and reviewed existing tickets.
- Created ticket `EXTENSION-UX` with topics `pi-extensions,tui,extensions,prompts,dashboard`.
- Added `design-doc/01-shared-extension-ux-improvement-guide.md` and `reference/01-diary.md`.
- Added workflow tasks for mapping current flows, writing the guide, validating docs, and uploading to reMarkable.
- Read and cross-referenced these implementation files:
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/extension-launcher.ts`
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/doc-viewer.ts`
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/action-picker.ts`
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/launcher/index.ts`
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts`
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/prompto/index.ts`
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/prompto/run.ts`
- Checked Pi core extension API evidence for `pasteToEditor`, `setEditorText`, `getEditorText`, and `registerShortcut`.
- Wrote the primary intern-ready design guide with architecture, evidence, pseudocode, decision records, phased implementation plan, validation checklist, and references.

### Why

- The requested behavior spans multiple shared overlays, so the design needs to explain the shared framework rather than only patching one component.
- The next implementer needs line-anchored evidence for why the launcher resets state, why details cannot scroll, and why prompto currently replaces editor contents.
- The prompto shortcut request depends on Pi's extension UI API, not only on prompto's own files.

### What worked

- The line evidence clearly identifies the reset path: `openDocs()` returns to a fresh `openLauncher(ctx)` call rather than passing saved state.
- The launcher component has a simple state model, so the proposed `ExtensionLauncherState` snapshot is straightforward.
- Pi already exposes `pasteToEditor()` and `registerShortcut()`, so prompto insertion does not require inventing a new editor API.
- The design guide could recommend incremental phases that are independently testable.

### What didn't work

- No code implementation was attempted in this step; this was an analysis/design deliverable.
- The TUI component contract only passes `render(width)`, not height. The design therefore recommends a pragmatic `process.stdout.rows` helper rather than a clean height-aware component API.
- `Shift+Arrow` reliability may vary by terminal, so the design calls out fallback keys as a required implementation detail.

### What I learned

- The shared launcher has one scroll variable for the left list but no independent right-pane scroll state.
- `DocViewer` already supports scrolling, but fixed `bodyRows = 18` means the overlay does not use tall terminals effectively.
- `Prompto` already has a palette entry, but editor-submit templates use `setEditorText()`, so a non-slash insertion workflow should use `pasteToEditor()` instead.

### What was tricky to build

- The main tricky part was separating two similar requests: scrolling the standalone docs viewer and scrolling the right details pane in the top-level launcher. The standalone docs viewer already has scroll input, while the top-level right pane only builds all detail lines and slices them to the body height. The design therefore includes both a dynamic-height improvement for `DocViewer` and a new `detailsScroll` state for `ExtensionLauncher`.
- Another tricky point was prompto insertion. Slash commands only work naturally from the editor command position, but Pi extension shortcuts are dispatched independently of slash command parsing. The design uses `registerShortcut()` for invocation and `pasteToEditor()` for insertion, preserving existing `/prompto` replacement behavior.

### What warrants a second pair of eyes

- The exact prompto shortcut should be checked against Pi's existing keybindings and terminal-reserved chords before implementation.
- The `Shift+Arrow` keybindings should be manually tested in the user's terminal. If they do not decode reliably, the fallback keys should be documented and used as the primary hints.
- The dynamic-height helper should be reviewed for narrow/tiny terminal behavior so modals do not render more lines than the overlay can comfortably display.

### What should be done in the future

- Implement the phases in the design guide.
- Add a short smoke-test playbook after implementation.
- Consider extracting shared fuzzy/list navigation helpers if `ExtensionLauncher`, `ActionPicker`, command palette, and prompto picker continue to converge.

### Code review instructions

- Start with `extensions/launcher/index.ts` to understand control flow between launcher and nested overlays.
- Then review `extensions/_shared/ui/extension-launcher.ts` for state restoration, wraparound, fuzzy search, details scrolling, and dynamic height.
- Review `extensions/_shared/ui/doc-viewer.ts` for dynamic height and scroll hint changes.
- Review `extensions/prompto/index.ts` and `extensions/prompto/run.ts` for shortcut and paste/replace behavior.
- Validate with `timeout 20 pi --list-models`, then manually smoke-test `/reload`, `/px`, docs back behavior, wraparound, search, details scroll, docs scroll, and prompto insertion.

### Technical details

Key evidence gathered:

- `extensions/launcher/index.ts:121-135` reopens the launcher after docs/actions/settings without passing state.
- `extensions/_shared/ui/extension-launcher.ts:45-48` initializes query, cursor, and scroll state to defaults.
- `extensions/_shared/ui/extension-launcher.ts:203-207` clamps movement rather than wrapping.
- `extensions/_shared/ui/extension-launcher.ts:302-345` truncates the details pane to visible rows.
- `extensions/_shared/ui/doc-viewer.ts:25-38` has fixed doc body height.
- `extensions/prompto/run.ts:51-55` chooses `sendUserMessage()` or `setEditorText()` for expanded templates.
- Pi core exposes `pasteToEditor()` and `registerShortcut()`, which support the requested prompto insertion workflow.

## Step 2: Commit prompto picker/template work and expand implementation tracking

This step separated the already-completed prompto work from the upcoming shared framework changes. The prompto commit contains the bordered/fuzzy prompto picker and the three reusable prompto workflow templates, leaving the new `EXTENSION-UX` ticket docs as a separate documentation/work-planning change.

After the prompto commit, I expanded `tasks.md` from three broad checkboxes into phase-level tracking. The new task list mirrors the design guide: Phase 1 for launcher state and wraparound, Phase 2 for fuzzy search, Phase 3 for scrollable/dynamic-height panes, Phase 4 for prompto shortcut paste insertion, and a final validation/delivery phase.

### Prompt Context

**User prompt (verbatim):** "commit prompto stuff, then add detailed tasks for each phase in the new ticket to properly track your changes, and then continue."

**Assistant interpretation:** Commit the prompto picker/templates first, then make the new EXTENSION-UX ticket task list granular enough to track each implementation phase before continuing with code changes.

**Inferred user intent:** Keep git history reviewable and make the ticket useful for tracking incremental implementation, validation, diary, and changelog work.

**Commit (code):** 02ef4e5af5e561ab8eff427bcb2ed5cbaf8a049c — "Prompto: improve template picker and add workflow templates"

### What I did

- Ran `timeout 20 pi --list-models` before committing prompto changes.
- Staged only prompto-related files:
  - `.pi/prompts/obsidian/deep-dive-project-report.md`
  - `.pi/prompts/research/intern-design-guide.md`
  - `.pi/prompts/workflow/implement-with-diary.md`
  - `extensions/prompto/ui/picker.ts`
- Committed those files as `02ef4e5af5e561ab8eff427bcb2ed5cbaf8a049c`.
- Rewrote `ttmp/2026/07/03/EXTENSION-UX--improve-shared-extension-launcher-ux/tasks.md` with detailed phase tasks.

### Why

- The prompto picker/templates were already complete and logically separate from the shared launcher implementation.
- The EXTENSION-UX ticket needed granular tasks before code work so future commits can map cleanly to diary/changelog entries.

### What worked

- The prompto commit was focused and excluded the new ticket docs.
- Validation passed before committing; only existing provider/model warnings appeared.
- The task list now has explicit implementation, validation, commit, diary, and changelog checkpoints for each phase.

### What didn't work

- No implementation phase was completed in this step; this was commit hygiene and ticket planning.

### What I learned

- Keeping prompto picker changes separate avoids mixing a completed UX improvement with the broader shared framework work.
- The phase plan needs explicit doc bookkeeping tasks because the user asked for a detailed diary throughout implementation.

### What was tricky to build

- The main tricky part was choosing the boundary of “prompto stuff.” I kept it to prompto picker UI plus prompt templates and deliberately left the EXTENSION-UX ticket workspace uncommitted for a docs-specific commit after task/diary updates.

### What warrants a second pair of eyes

- Review the prompto commit for whether `.pi/prompts/*` should live in project prompts or personal prompts. They are project-local because the user asked to create prompto templates in this repo.

### What should be done in the future

- Commit the EXTENSION-UX ticket docs after diary/changelog bookkeeping.
- Begin Phase 1 implementation and commit it separately.

### Code review instructions

- Review commit `02ef4e5af5e561ab8eff427bcb2ed5cbaf8a049c` for prompto picker behavior and template wording.
- Validate prompto UI manually with `/reload` then `/prompto`.
- Validate project load with `timeout 20 pi --list-models`.

### Technical details

Validation command and result:

```bash
timeout 20 pi --list-models >/tmp/pi-list-models.out 2>/tmp/pi-list-models.err
# EXIT:0
# Existing warnings only: deprecated umans apiKey env reference and unmatched configured model patterns.
```

## Step 3: Implement launcher state restoration and wraparound navigation

This step implemented the first shared launcher phase. The launcher now carries a typed state snapshot out of the overlay when the user opens docs, actions, settings, the dashboard, or the palette. The launcher command flow can pass that snapshot back into the next launcher instance, so returning from docs/actions/settings restores the previous search, selection, and list scroll instead of starting at the top.

The same code change also updates arrow navigation to wrap through the visible extension list. Pressing `Up` on the first visible extension selects the last visible extension, and pressing `Down` on the last visible extension returns to the first. This makes the launcher behave like a keyboard palette rather than a static list.

### Prompt Context

**User prompt (verbatim):** "commit at appropriat eintervals, keep a detailed diary as you work."

**Assistant interpretation:** Continue the implementation with focused commits and update the diary after each meaningful milestone.

**Inferred user intent:** Make the EXTENSION-UX implementation reviewable and continuation-friendly, with code commits and documentation checkpoints aligned to phases.

**Commit (code):** df23e9ea57e8eb6d213b6967b0fe93be9a2e9b92 — "Launcher: preserve selection state and wrap navigation"

### What I did

- Added `ExtensionLauncherState` in `extensions/_shared/ui/extension-launcher.ts`.
- Added `initialState?: Partial<ExtensionLauncherState>` to `ExtensionLauncherOptions`.
- Hydrated query, search mode, cursor, list scroll, and details scroll from the initial state.
- Added a `snapshot()` helper to capture launcher state before returning results.
- Added state snapshots to launcher results for `select`, `actions`, `docs`, `settings`, `dashboard`, and `palette`.
- Changed `move(delta)` from clamped navigation to modulo wraparound.
- Reset future right-pane `detailsScroll` on selection/query changes so Phase 3 can add actual right-pane scrolling without carrying stale offsets.
- Updated `extensions/launcher/index.ts` so docs/actions/settings reopen `/px` with the previous state.
- Ran `timeout 20 pi --list-models`; it exited `0` with only existing provider/model warnings.
- Committed the Phase 1 code as `df23e9e`.

### Why

- The user's first complaint was that returning from plugin help resets the list to the top. That happened because `handleLauncherResult()` opened a brand-new launcher without any state.
- Wraparound navigation is expected for palette-style keyboard UIs and avoids repeatedly pressing `Down` when the desired item is near the bottom.

### What worked

- The state-threading change was small and localized to `ExtensionLauncher` and `launcher/index.ts`.
- Existing nested overlay flow stayed intact; only the reopen call gained `result.state`.
- The extension load check passed after the type/interface changes.

### What didn't work

- I could not perform an interactive `/px` smoke test from this non-interactive tool context. The task list keeps manual validation open.

### What I learned

- The launcher already had all necessary in-memory state; the missing part was exporting/importing that state across overlay boundaries.
- Adding `detailsScroll` early keeps the state contract compatible with the upcoming scrollable details-pane phase.

### What was tricky to build

- The main sharp edge was result typing. Once launcher results carry state, every result variant that leaves the overlay for another view must include the snapshot, otherwise callers can accidentally lose continuity for one branch. I updated all non-cancel result variants together.
- Another subtle point was query changes: they must reset both left-list scroll and future right-pane scroll. Otherwise a filtered result can inherit a scroll offset from a different selected extension.

### What warrants a second pair of eyes

- Check whether dashboard/palette results should preserve and later restore launcher state if those paths return to the launcher in future changes. They now carry state, but current control flow does not reuse it.
- Review whether `searchActive` should be restored as active after returning from docs, or whether returning to inactive search with the query preserved would feel better. The implementation currently restores the exact state.

### What should be done in the future

- Manually validate `/px` docs-back behavior.
- Continue with Phase 2 fuzzy search.

### Code review instructions

- Start with `extensions/_shared/ui/extension-launcher.ts` and review the `ExtensionLauncherState` type, constructor hydration, `snapshot()`, and `move()`.
- Then review `extensions/launcher/index.ts` to verify `result.state` is threaded only for nested overlays that reopen the launcher.
- Validate with `timeout 20 pi --list-models`, then manually test `/px` → select extension → `?` → `Esc`.

### Technical details

Validation command:

```bash
timeout 20 pi --list-models >/tmp/pi-list-models.out 2>/tmp/pi-list-models.err
# EXIT:0
```
