---
title: "Diary"
doc_type: reference
ticket: CMD-PALETTE
status: active
topics: [extensions, tui, ux, command-palette, launcher]
---

# Diary

## Goal

Capture the analysis and design phase for the Command Palette Completer extension.

## Step 1: Analysis and Design Document

Created the ticket and wrote a comprehensive analysis/design/implementation guide for the command palette feature. The document covers the current system, the problem, the API design, TUI overlay design, file layout, migration examples, data flow diagrams, testing strategy, and implementation checklist.

### Prompt Context

**User prompt (verbatim):** "Extend our extension framework to have a "command palette completer" so that I can type a keyboard shortcut and then get a list of menu choices each with a key to click, and then potential submenus with actions or wahtever the extension decides, that way I can register things like "/response-view" as <shortcut> (ctrl-shift-p per default) r v for navigating menu -> responses extension -> view action. Create a new docmgr ticket for that and analyze the situation and Create a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable. Keep a diary as you work. Wait for me to review the guide first."

**Assistant interpretation:** Create a docmgr ticket, analyze the existing extension framework, and write a detailed intern-ready design guide for a command palette feature with hierarchical keyboard-driven navigation.

**Inferred user intent:** The user wants a thorough design document before any implementation begins, so they can review the approach and ensure the design is right before code is written.

### What I did
- Read the extension framework guide, TUI authoring guide, registry types, launcher, action-picker, and several existing extensions
- Created docmgr ticket `CMD-PALETTE`
- Created design doc at `design/01-analysis-and-design-command-palette-completer.md`
- Created this diary at `reference/01-diary.md`
- Related 9 source files to the ticket

### Why
The user wants a command palette similar to VS Code's `Ctrl+Shift+P` that allows fast hierarchical keyboard-driven action invocation without navigating the full `/px` launcher flow.

### What worked
- The existing extension framework's contribution model (actions, docs, settings, widgets) made it natural to add a new `palette` field
- The `registerShortcut()` API (used by session-tagger and docmgr) provides the global keyboard entry point
- The TUI overlay pattern from ExtensionLauncher and ActionPicker gives a proven rendering model

### What didn't work
- N/A (design phase, no code errors)

### What I learned
- The `registerShortcut` API uses string key IDs like `"ctrl+shift+t"` or `Key.ctrlAlt("t")` constants
- Extensions that want both actions and palette items can share the same handler functions
- Key conflict resolution at the root level is a real concern when many extensions register palette items

### What was tricky to build
- Designing the key-assignment algorithm to be deterministic yet flexible (explicit overrides → title-based auto → sequential fallback)
- Deciding between reusing `actions` vs adding a separate `palette` field — chose separate for hierarchy support and decoupling

### What warrants a second pair of eyes
- The `PaletteActionContext` interface — does it need more fields?
- Whether `registerShortcut` supports runtime re-registration for the configurable shortcut setting
- The overlay anchor `top-center` — needs verification that Pi's overlay system supports non-center anchoring

### What should be done in the future
- Upload the design document to reMarkable after user review
- Implement the feature following the Phase 1–5 checklist in the design doc
- Update the shared extension framework guide with palette documentation

### Code review instructions
- Read `design/01-analysis-and-design-command-palette-completer.md` end-to-end
- Verify the `PaletteItem` interface covers all use cases (leaf, submenu, no-op)
- Check the key conflict resolution strategy in the migration examples (Part 6)
- Validate the data flow diagram (Part 7) against the actual launcher code

### Technical details
- Ticket path: `ttmp/2026/05/26/CMD-PALETTE--command-palette-completer-keyboard-driven-hierarchical-action-menu-for-pi-extensions/`
- Design doc: `design/01-analysis-and-design-command-palette-completer.md`
- Related files: 9 source files from the extension framework

## Step 2: Implement Phases 1–4 (Core types, TUI overlay, extension wiring, migration)

Implemented the command palette in four focused commits, one per design phase. All phases pass `pi --list-models` load checks.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build the command palette following the design document, committing at each phase.

**Inferred user intent:** Working implementation that can be tested interactively via Ctrl+Shift+P.

**Commit (code):** c60af37 — "feat(palette): add PaletteItem types to registry and key-assignment algorithm"
**Commit (code):** 4c9423d — "feat(palette): add CommandPaletteOverlay TUI component"
**Commit (code):** 81e37d1 — "feat(palette): add command-palette extension entry point"
**Commit (code):** 9b8a6ef — "feat(palette): add palette contributions to 7 existing extensions"
**Commit (docs):** 4e3a3fc — "docs(CMD-PALETTE): add design guide and diary"

### What I did
- Phase 1: Added `PaletteItem`, `PaletteActionHandler`, `PaletteActionContext` to registry.ts; added `palette?` field to `PiExtensionRegistration`; added `collectPaletteItems()`; created `palette-keys.ts` with `assignKeys()` and `filterKeyedItems()`
- Phase 2: Created `CommandPaletteOverlay` component with stack-based navigation, key-driven drill-down, search mode, breadcrumb borders
- Phase 3: Created `extensions/command-palette/index.ts` — registers Ctrl+Shift+P shortcut, `/palette` command, extension metadata
- Phase 4: Added `palette` fields to 7 extensions: response-viewer, session-tagger, pinned-skills, docmgr, compaction-meter, compaction-title, agent-env

### Why
Each phase was a self-contained, load-check-passing unit that could be tested independently before building on top of it.

### What worked
- The design doc's phased approach translated cleanly to commits
- `pi --list-models` caught no issues at any phase boundary
- Key assignment algorithm handles conflicts gracefully (compaction-title got `o` since `c` was taken by compaction-meter)
- docmgr uses `k` for tasks (not `t`, which was taken by tickets)

### What didn't work
- N/A — all phases loaded and compiled without errors

### What I learned
- agent-env uses `e` for its key (env injection toggle) which is clean
- The docmgr tasks key `k` (not `t`) avoids root-level conflict with session-tagger's `t` (quick tag)

### What was tricky to build
- The `RootKeyedItem` extending `KeyedPaletteItem` with an `extension` field — needed because `assignKeys()` returns bare items but the overlay needs to know which extension owns each item
- Scroll clamping in the overlay — simplified to a basic version for now

### What warrants a second pair of eyes
- The overlay `anchor: "center"` — the design says "top-center" but Pi may not support that anchor value; should test interactively
- Search mode interaction with key-matching — if search is active and a key matches, the key match wins; is that the right priority?

### What should be done in the future
- Interactive smoke testing with `/reload` and Ctrl+Shift+P
- Phase 5 polish: settings for configurable shortcut, framework guide update, add `p` key to `/px` launcher
- Upload updated design doc to reMarkable

### Code review instructions
- Start at `extensions/_shared/registry.ts` — new types after the widget types
- Then `extensions/_shared/ui/palette-keys.ts` — pure algorithm
- Then `extensions/_shared/ui/command-palette.ts` — TUI component
- Then `extensions/command-palette/index.ts` — extension wiring
- Spot-check the `palette` additions in the 7 migrated extensions

### Technical details
- New files: `extensions/_shared/ui/palette-keys.ts`, `extensions/_shared/ui/command-palette.ts`, `extensions/command-palette/index.ts`
- Modified: `registry.ts` (types + helper), 7 extension files (palette field)
- Load check: all pass

## Step 3: Testing and Bug Fixes

Tested the command palette interactively in tmux and found two issues that needed fixing.

### Prompt Context

**User prompt (verbatim):** "test in tmux"

**Assistant interpretation:** Test the command palette extension interactively in a live Pi session.

**Inferred user intent:** Verify the implementation works end-to-end with real keyboard input.

**Commit (code):** 9910469 — "fix(palette): root level groups by extension, not flat actions"

### What I did
- Started Pi in tmux, tested `/palette` command
- Found duplicate key error: both compaction-meter and pinned-skills wanted `c` at root level
- Fixed `buildRootPaletteItems` to group items by extension and create one submenu per extension (instead of a flat list of all actions)
- Removed inline descriptions from item rows (were too wide for terminal)
- Added `→` marker for submenu items
- Added command-palette and session-tagger to `.pi/settings.json`
- Retested: all flows work

### Why
The original design had the root level as a flat list of all extension actions, which caused key conflicts and didn't match the user's mental model of navigating "extension → action".

### What worked
- `/palette` opens the overlay correctly
- Drilling into extensions works (e.g., `d` → Docmgr shows 4 actions)
- Going back with `←` works
- Executing leaf actions works (e.g., `a` → `e` toggles agent-env)
- `Ctrl+Shift+P` shortcut works
- Breadcrumb titles update correctly

### What didn't work
- First attempt: root-level items had duplicate explicit keys (both compaction-meter `c` and pinned-skills `c`) — `assignKeys` threw an error at registration time
- First design: flat root level showed 15 items instead of 7 grouped extensions
- Descriptions in item rows overflowed the overlay width

### What I learned
- The root level should always be extension-grouped, not a flat action list
- `assignKeys` is correct to throw on duplicate explicit keys, but the root level needs a different strategy: auto-assign from extension names, not from item keys
- Pi overlays in tmux can be tricky to test because keystrokes may leak to the underlying Pi session

### What was tricky to build
- The `buildRootPaletteItems` function needed to restructure the flat `collectPaletteItems()` output into per-extension submenus. The key insight was that root-level keys should come from extension names, not from the items' own `key` fields.

### What warrants a second pair of eyes
- The `assignKeys` call in `activate()` for child items — it still throws on duplicate explicit keys. This is fine for extension authors (they control their own items), but the error message could be more helpful.

### What should be done in the future
- Phase 5 polish: settings for configurable shortcut, framework guide update, `/px` integration
- Add search mode testing
- Test with more extensions and edge cases

### Code review instructions
- Focus on `buildRootPaletteItems` in `command-palette.ts` — the grouping logic
- Test: `/palette`, drill into an extension, go back, execute a leaf action

### Technical details
- Commit: 9910469
- `.pi/settings.json` now includes `command-palette` and `session-tagger` extensions

## Step 4: Phase 5 Polish

Completed all remaining polish tasks: /px integration, framework guide update, final smoke test.

### Prompt Context

**User prompt (verbatim):** "go ahead"

**Assistant interpretation:** Continue with Phase 5 polish — settings, /px integration, guide update.

**Inferred user intent:** Finish the implementation to a shippable state.

**Commit (code):** 83d0982 — "feat(palette): add 'p' key to /px launcher to open command palette"
**Commit (docs):** f2ac6b2 — "docs: add command palette section to extension framework guide"

### What I did
- Added `palette` result kind to ExtensionLauncherResult, `p` key handler in /px
- Added `openPaletteFromLauncher` function to launcher/index.ts
- Updated help line in /px to show `p palette`
- Added Section 8 (Command Palette) to the framework guide with full documentation
- Updated registry table, checklist, reading list, and central diagram
- Renumbered sections 9–15
- Enabled command-palette globally in ~/.pi/agent/settings.json
- Removed kanban-demo and hello-world-thinking.ts

### Why
The /px launcher is the discovery surface and should have a quick path to the palette.

### What worked
- /px `p` key wiring was straightforward following the existing pattern
- The guide update fit naturally as Section 8

### What didn't work
- N/A

### What I learned
- The /px help line wraps at narrow widths; the `p palette` entry fits

### What was tricky to build
- Keeping section renumbering consistent in the guide

### What warrants a second pair of eyes
- The guide's palette section could use a screenshot-style example

### What should be done in the future
- Upload updated design doc to reMarkable

### Code review instructions
- Check /px `p` key in extension-launcher.ts and launcher/index.ts
- Read Section 8 of the framework guide

### Technical details
- Commits: 83d0982, f2ac6b2

## Step 5: Shortcut Race Root-Cause Fix

Investigated the lingering Ctrl+Shift+P bug where the palette did not reliably appear until the next keystroke after certain palette actions. The earlier render-only fixes were incomplete because the real failure mode was not only initial paint; it was the editor-scoped shortcut path racing with focus restoration and input delivery.

### Prompt Context

**User prompt (verbatim):** "Ok, your little brother has lost th sauce, the bug is still there, you should be able to repeat it in tmux? FIgure out where you brother went wrong"

**Assistant interpretation:** Reproduce the shortcut bug more accurately, identify why the prior fix was insufficient, and repair the actual input/focus race.

**Inferred user intent:** Make Ctrl+Shift+P robust after executing palette actions, especially `response-viewer → view`, without the next key leaking into the REPL.

**Commit (code):** 26470fa — "fix(palette): catch Ctrl+Shift+P at raw terminal input layer"

### What I did
- Inspected Pi's interactive shortcut implementation and found extension shortcuts are attached to the default editor (`defaultEditor.onExtensionShortcut`).
- Inspected Pi TUI's raw input listener order and found `ctx.ui.onTerminalInput()` runs before input is sent to the focused component.
- Added a session-level raw terminal input listener for `Ctrl+Shift+P` in `command-palette/index.ts`.
- The raw listener consumes the shortcut and calls `openPalette()` directly, avoiding editor focus races.
- Kept `pi.registerShortcut("ctrl+shift+p")` as a fallback for cases where the raw listener has not registered yet.
- Added a `paletteOpen` guard to prevent duplicate overlays if multiple paths fire.
- Removed `command-palette` from project `.pi/settings.json` now that it is enabled globally.

### Why
The previous fix called `handle.focus()` via `onHandle`, which helps once an overlay exists. It does not solve cases where the editor-scoped shortcut path itself is delayed or focus restoration causes the next key to reach the editor before the overlay captures input. A raw terminal listener consumes the key before the editor sees it.

### What worked
- Fresh tmux session: `Ctrl+Shift+P` opens the palette immediately.
- Palette action path: `r → v`, then `Ctrl+Shift+P`, then immediate `a` enters Agent Env submenu instead of leaking `a` to the REPL.
- Load check passes.

### What didn't work
- The earlier requestRender/focus-only fixes were insufficient because they addressed rendering after overlay creation, not shortcut delivery before overlay creation.

### What I learned
- Pi's `registerShortcut()` extension shortcuts are editor-scoped, not terminal-global.
- `ctx.ui.onTerminalInput()` is the correct hook for shortcuts that must be consumed before editor input handling.
- Tmux tests need to exercise a full action cycle and then the next shortcut, not only the first overlay paint.

### What was tricky to build
- The raw terminal listener has to coexist with the official extension shortcut. The `paletteOpen` guard prevents double-open if both paths ever fire.

### What warrants a second pair of eyes
- Whether `session_start` is always fired after `/reload`; the official shortcut remains as fallback for that case.

### What should be done in the future
- Consider moving this pattern into a shared helper for any extension that needs global keyboard shortcuts independent of editor focus.

### Code review instructions
- Review `registerTerminalShortcut()` and `openPalette()` in `extensions/command-palette/index.ts`.
- Verify that raw terminal input consumes only `Ctrl+Shift+P` and leaves all other keys unchanged.

### Technical details
- Commit: 26470fa

## Step 6: Buffered Input During Overlay Mount

Used the new debug log from the user's real reproduction and found that the first navigation key can arrive in the tiny interval between `custom.factory` and `custom.onHandle`. During that interval, `paletteOpen` is true but the overlay is not mounted/focused yet, so the raw listener previously returned `undefined` for non-shortcut keys and the key went to the editor path.

### Prompt Context

**User prompt (verbatim):** "go ahead, i did it, and reprod"

**Assistant interpretation:** Inspect the debug log from the user's live reproduction and apply a targeted fix.

**Inferred user intent:** Make rapid `Ctrl+Shift+P → r → v` navigation robust in kitty/tmux without key leakage.

**Commit (code):** 330d267 — "fix(palette): buffer keys typed while shortcut overlay is mounting"

### What I did
- Read `/tmp/pi-command-palette-debug.log` from the user's reproduction.
- Observed `Ctrl+Shift+P` matched and `custom.factory` ran, then raw `r` arrived before `custom.onHandle`.
- Added `paletteInputReady` and `pendingOpeningInputs` state.
- While `paletteOpen && !paletteInputReady`, the raw listener now consumes replayable keys and buffers them.
- In `onHandle`, after focus, the buffered keys are replayed into `CommandPaletteOverlay.handleInput()` and a render is requested.
- Tested in tmux by sending `Ctrl+Shift+P` and `r` in the same command; the palette opened directly into Response Viewer.

### Why
The raw listener fixed the shortcut delivery layer, but it still let the first non-shortcut key pass through during the overlay mount window. Buffering closes that race.

### What worked
- The debug log clearly showed `terminalInput "r"` before `custom.onHandle`.
- After the fix, the log shows `terminalInput.bufferWhileOpening`, `custom.replayBufferedInput`, and then `overlay.activate` for Response Viewer.
- `Ctrl+Shift+P r v` works even when `r` is sent immediately after the shortcut.

### What didn't work
- Treating the bug as render-only or focus-only missed the pre-mount input window.

### What I learned
- In kitty/tmux, a key press can generate both press and release CSI-u sequences. The press (`"r"`) must be buffered/replayed; release CSI-u sequences should be consumed but not replayed while opening.

### What was tricky to build
- The listener must consume input before the overlay is ready, but stop consuming normal input after the overlay is focused so the overlay can receive keys through the normal TUI focus path.

### What warrants a second pair of eyes
- `shouldReplayOpeningInput()` decides what to buffer. It currently buffers printable single-character keys and standard navigation keys, while consuming but not replaying CSI-u release sequences.

### What should be done in the future
- Keep `/palette-debug` around until the shortcut path is stable across terminal emulators.

### Code review instructions
- Review `registerTerminalShortcut()`, `paletteInputReady`, `pendingOpeningInputs`, and `shouldReplayOpeningInput()` in `extensions/command-palette/index.ts`.
- Test with `Ctrl+Shift+P r v` in kitty/tmux.

### Technical details
- Commit: 330d267

## Step 7: Scheduled Open Outside Raw Input Callback

The user's next log showed that `Ctrl+Shift+P` was recognized and `custom.factory` ran, but `custom.onHandle` did not fire until the user pressed Space. This proved that even the buffered-input fix still opened `ctx.ui.custom()` too early: from inside the raw terminal input callback.

### Prompt Context

**User prompt (verbatim):** "ok but i still need to press a key for th emodal to appear, so something's off there."

**User prompt (verbatim):** "Look at the log now, I recorded Ctrlshiftp, but then had to press \"space\" for the modal to appear."

**Assistant interpretation:** Inspect the fresh debug log and fix the remaining modal mount delay where Ctrl+Shift+P is recognized but the overlay does not mount until later input.

**Inferred user intent:** Make Ctrl+Shift+P alone show the modal immediately, without requiring Space or any other follow-up key.

**Commit (code):** f281c73 — "fix(palette): schedule shortcut open outside raw input callback"

### What I did
- Read the new debug log and observed `Ctrl+Shift+P` matched, `openPaletteOnce.start` ran, and `custom.factory` ran.
- Observed that `custom.onHandle` happened only after the Space input arrived.
- Changed the raw input listener so it no longer calls `openPalette()` directly inside the raw terminal callback.
- Added `paletteOpenScheduled` state.
- Added `scheduleOpenPalette()` that consumes the shortcut and opens the palette from `setImmediate()`.
- Extended buffering to cover both `paletteOpenScheduled` and `paletteOpen && !paletteInputReady`.
- Tested exact kitty CSI-u sequence with no follow-up key; modal appeared immediately.
- Tested exact CSI-u plus immediate `r`; `r` was buffered while scheduled and replayed into the overlay after mount.

### Why
Pi's `ctx.ui.custom()` ultimately mounts the overlay via a promise continuation. Calling it directly inside the raw terminal input listener can leave the mount continuation pending until another input event. Scheduling the open outside the input callback gives Pi/TUI a clean event-loop boundary before mounting the custom overlay.

### What worked
- Raw sequence `ESC[112:80;6u` alone now opens the palette without Space.
- Raw sequence `ESC[112:80;6u` followed immediately by `r` opens directly into Response Viewer.
- The debug log now shows `scheduleOpenPalette.fire`, then `custom.onHandle` without requiring a later Space key.

### What didn't work
- Buffering keys during mount was necessary but not sufficient. The overlay still needed to be scheduled outside the raw input callback.

### What I learned
- There are two distinct races: shortcut delivery and overlay mount scheduling. The final design handles both.
- Inputs can arrive while `paletteOpenScheduled` is true but `paletteOpen` is still false; this state must also consume/buffer keys.

### What was tricky to build
- The scheduled-open state must preserve buffered keys across the transition from scheduled to open. `openPalette()` must not clear `pendingOpeningInputs` when it starts, because keys may have already been buffered while scheduled.

### What warrants a second pair of eyes
- The interaction between `paletteOpenScheduled`, fallback `pi.registerShortcut`, and `/palette` command calls. The guards should prevent duplicate opens, but this is now the most stateful part of the extension.

### What should be done in the future
- If this pattern is needed elsewhere, promote it to a shared helper for raw global shortcuts that open `ctx.ui.custom()` overlays.

### Code review instructions
- Review `scheduleOpenPalette()`, the `paletteOpenScheduled` branch in `registerTerminalShortcut()`, and the preservation of `pendingOpeningInputs` in `openPalette()`.
- Test raw kitty CSI-u sequence and fast `Ctrl+Shift+P r` path.

### Technical details
- Commit: f281c73

## Step 8: Forced Redraw After Overlay Mount

The user's follow-up showed that the input path was now correct: `Ctrl+Shift+P r` opened the Response Viewer submenu, meaning shortcut recognition, scheduling, buffering, mount, and replay all worked. But `Ctrl+Shift+P` alone still required another key before the modal was visible. That narrowed the remaining bug to the render flush path.

### Prompt Context

**User prompt (verbatim):** "ok, it's still the same behavior, but ctrl-shift-p and then r does indeed properly open the submenu. So it's a matter of scheduling the graphic update?"

**Assistant interpretation:** Since buffered input works but the modal is not visible until another key, inspect and fix the TUI render scheduling path.

**Inferred user intent:** Make the graphic overlay appear immediately on Ctrl+Shift+P alone, not just process follow-up keys correctly.

**Commit (code):** 54ebee2 — "fix(palette): force full redraw after shortcut overlay mount"

### What I did
- Confirmed Pi TUI supports `requestRender(force?: boolean)`.
- Changed the palette overlay requestRender callback type to accept `force?: boolean`.
- Changed command-palette's onHandle path to call `requestRender(true)` after focus and buffered-input replay.
- Tested exact kitty CSI-u shortcut sequence with no follow-up key; the modal was visible within 150ms in tmux.

### Why
Normal `requestRender()` can be throttled and scheduled. In this shortcut path the overlay state existed, but the screen did not repaint until a later terminal input event. `requestRender(true)` resets prior render state and schedules a next-tick full redraw.

### What worked
- Synthetic kitty CSI-u `ESC[112:80;6u` alone opens the palette without Space in tmux.
- Synthetic kitty CSI-u plus immediate `r` still opens directly into Response Viewer.
- Load check passes.

### What didn't work
- Scheduling the open outside the raw callback fixed mount timing, but not necessarily immediate screen repaint in the user's terminal path.

### What I learned
- The shortcut bug had three layers: raw shortcut delivery, overlay mount scheduling, and graphic redraw flushing.
- A full redraw is appropriate after shortcut-mounted overlays because it happens at user-visible modal boundaries, not every keystroke.

### What was tricky to build
- Avoid forcing redraw on every normal palette keypress. The force redraw is only used once, after `onHandle` focuses the overlay.

### What warrants a second pair of eyes
- Whether `/px` → `p` should also force redraw. It does not use the raw terminal shortcut path, but it now accepts the same `requestRender(force)` callback type.

### What should be done in the future
- If any other overlay opened by raw terminal shortcuts shows delayed paint, use the same scheduled-open + forced-redraw pattern.

### Code review instructions
- Review `requestRender?.(true)` in `extensions/command-palette/index.ts`.
- Review the `CommandPaletteOptions.requestRender` type change in `extensions/_shared/ui/command-palette.ts`.

### Technical details
- Commit: 54ebee2

## Step 9: Do Not Replay Kitty CSI-u Escape During Mount

The latest debug log showed a different failure mode. The overlay rendered correctly when opened, but in one repro the terminal sent `ESC[27u` while the open was still scheduled. `shouldReplayOpeningInput()` used `matchesKey(data, Key.escape)`, which classified `ESC[27u` as Escape. The buffered replay then cancelled the palette immediately after mount.

### Prompt Context

**User prompt (verbatim):** "Ok, reload the log."

**Assistant interpretation:** Inspect the latest debug log and identify why the modal still disappears or appears to require another key.

**Inferred user intent:** Finish diagnosing the terminal-specific behavior by reading the new render and input logs.

**Commit (code):** 508d316 — "fix(palette): do not replay kitty CSI-u Esc during overlay mount"

### What I did
- Read the fresh log and found `ESC[27u` buffered while `paletteOpenScheduled` was true.
- Observed that it was replayed after `onHandle`, immediately triggering `custom.result cancel`.
- Changed `shouldReplayOpeningInput()` so it no longer uses broad `matchesKey()` checks for Escape and navigation during mount.
- It now replays only literal printable single characters, literal `ESC`, literal Enter/Backspace, and classic arrow escape sequences.
- CSI-u sequences such as `ESC[27u` are consumed during mount but not replayed.

### Why
Kitty/tmux can emit CSI-u key events that `matchesKey()` maps to Escape or releases. Replaying those during the mount window can cancel the overlay before it becomes visible.

### What worked
- Simulated `ESC[112:80;6u ESC[27u` now opens the palette and consumes `ESC[27u` without replaying it.
- Render logs show `overlay.render.done` after the fix.

### What didn't work
- The previous `shouldReplayOpeningInput()` was too permissive. It replayed semantically classified Escape instead of only literal Escape.

### What I learned
- Buffering during mount must distinguish between user-intended input and terminal protocol side-channel/release events.
- `matchesKey()` is useful for focused component input, but too broad for deciding which pre-mount events should be replayed.

### What was tricky to build
- A real user pressing Escape immediately during mount should still be supported if the terminal sends literal `\x1b`. CSI-u encoded Escape is treated as protocol noise during the mount window.

### What warrants a second pair of eyes
- The whitelist in `shouldReplayOpeningInput()` should stay narrow. Add only sequences that are confirmed to represent intended user input in the mount window.

### What should be done in the future
- Consider logging whether an event is classified as press/release by the TUI key parser if that API becomes available.

### Code review instructions
- Review `shouldReplayOpeningInput()` in `extensions/command-palette/index.ts`.
- Verify that `ESC[27u` is consumed but not replayed in `/tmp/pi-command-palette-debug.log`.

### Technical details
- Commit: 508d316
