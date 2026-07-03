# Changelog

## 2026-07-03

- Initial workspace created


## 2026-07-03

Created intern-ready design guide for shared extension launcher UX improvements and recorded investigation diary.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/03/EXTENSION-UX--improve-shared-extension-launcher-ux/design-doc/01-shared-extension-ux-improvement-guide.md — Primary guide
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/03/EXTENSION-UX--improve-shared-extension-launcher-ux/reference/01-diary.md — Investigation diary


## 2026-07-03

Validated EXTENSION-UX docs with docmgr doctor and uploaded the bundle to reMarkable at /ai/2026/07/03/EXTENSION-UX.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/03/EXTENSION-UX--improve-shared-extension-launcher-ux/design-doc/01-shared-extension-ux-improvement-guide.md — Uploaded guide bundle


## 2026-07-03

Committed prompto picker/template work as 02ef4e5 and expanded EXTENSION-UX tasks into phase-level implementation tracking.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/prompto/ui/picker.ts — Prompto picker commit 02ef4e5
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/03/EXTENSION-UX--improve-shared-extension-launcher-ux/tasks.md — Expanded phase tracking


## 2026-07-03

Phase 1: implemented launcher state snapshots, restored selection after docs/actions/settings, and added wraparound list navigation (commit df23e9e).

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/extension-launcher.ts — State snapshot and wraparound implementation
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/launcher/index.ts — Threads launcher state through nested overlay returns


## 2026-07-03

Phase 2: replaced launcher search scoring with tokenized chunk-based fuzzy matching over extension/action/doc/palette metadata (commit 6f542ae).

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/extension-launcher.ts — Chunked fuzzy search implementation


## 2026-07-03

Phase 3: added scrollable launcher details, fallback detail-scroll keys, dynamic launcher/doc viewer heights, and taller launcher overlay (commit c0e1461).

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/doc-viewer.ts — Dynamic docs viewer body rows
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/extension-launcher.ts — Scrollable details and dynamic launcher body rows
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/launcher/index.ts — Taller launcher overlay options

