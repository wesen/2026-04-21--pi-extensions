# Changelog

## 2026-05-21

- Initial workspace created


## 2026-05-21

Tasks 1-2: Scaffolded response.ts and index.ts with capture/save/open logic (commit 1247f6c)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/index.ts — Extension registration
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/response.ts — Core capture and md-view integration


## 2026-05-21

Tasks 3-4: Added response picker UI, schema settings, dashboard widget. Redesigned to accumulate all responses with picker (commit 00d8aae)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/index.ts — Settings
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/ui.ts — ResponsePicker TUI component


## 2026-05-21

Tasks 5-6: Added README.md, cleaned up unused export, validated with pi --list-models (commit 5384d4d, 3c0d7e5)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/README.md — User-facing docs


## 2026-05-21

Fix: Read responses from session history (getResponsesFromSession) instead of in-memory accumulator — responses survive /reload and are available before extension loaded (commit e359eae)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/index.ts — Simplified
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/response.ts — Session history reader replacing turn_end accumulator

