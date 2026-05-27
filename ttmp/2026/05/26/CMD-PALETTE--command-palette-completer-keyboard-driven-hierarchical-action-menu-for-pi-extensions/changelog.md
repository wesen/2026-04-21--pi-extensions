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

