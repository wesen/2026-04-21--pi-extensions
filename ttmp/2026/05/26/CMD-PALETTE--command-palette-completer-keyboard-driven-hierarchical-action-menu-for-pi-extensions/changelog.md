# Changelog

## 2026-05-26

- Initial workspace created


## 2026-05-26

Step 1: Created analysis and design document for Command Palette Completer (12-part intern-ready guide)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/26/CMD-PALETTE--command-palette-completer-keyboard-driven-hierarchical-action-menu-for-pi-extensions/design/01-analysis-and-design-command-palette-completer.md — Main design document
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/26/CMD-PALETTE--command-palette-completer-keyboard-driven-hierarchical-action-menu-for-pi-extensions/reference/01-diary.md — Diary


## 2026-05-27

Step 2: Implemented phases 1–4 — registry types, TUI overlay, extension wiring, 7 extension migrations (commits c60af37..9b8a6ef)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts — Added PaletteItem types and collectPaletteItems()
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/command-palette.ts — New — CommandPaletteOverlay TUI component
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/palette-keys.ts — New — key assignment algorithm
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/command-palette/index.ts — New — extension entry point with Ctrl+Shift+P


## 2026-05-27

Step 3: Interactive testing in tmux, fixed root-level grouping bug (commit 9910469)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/command-palette.ts — Fixed root level to group by extension with auto-keys from names


## 2026-05-27

Step 4: Phase 5 polish — /px integration (p key), framework guide Section 8, global extension enable, kanban/hello-world removal (commits 83d0982, f2ac6b2)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/docs/pi-shared-extension-framework-guide.md — Added Section 8 Command Palette
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/extension-launcher.ts — Added palette result kind and p key handler
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/launcher/index.ts — Added openPaletteFromLauncher function


## 2026-05-27

Step 5: Fixed Ctrl+Shift+P shortcut race by moving primary handling to raw terminal input listener (commit 26470fa)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/.pi/settings.json — Removed project command-palette entry because palette is globally enabled
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/command-palette/index.ts — Raw terminal listener consumes Ctrl+Shift+P before editor input handling


## 2026-05-27

Step 6: Buffered first navigation keys during palette overlay mount to fix kitty/tmux Ctrl+Shift+P race (commit 330d267)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/command-palette/index.ts — Buffers replayable input while paletteOpen && !paletteInputReady and replays after onHandle focus


## 2026-05-27

Step 7: Fixed remaining Ctrl+Shift+P mount delay by scheduling palette open outside raw input callback (commit f281c73)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/command-palette/index.ts — Added paletteOpenScheduled and setImmediate scheduleOpenPalette()


## 2026-05-27

Step 8: Forced full redraw after shortcut overlay mount so Ctrl+Shift+P alone paints immediately (commit 54ebee2)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/command-palette.ts — requestRender callback now accepts force flag
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/command-palette/index.ts — Calls requestRender(true) after onHandle focus and buffered input replay


## 2026-05-27

Step 9: Prevented buffered CSI-u Escape (ESC[27u) from cancelling palette immediately after mount (commit 508d316)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/command-palette/index.ts — shouldReplayOpeningInput now uses narrow literal-key whitelist

