# Changelog

## 2026-05-29

- Initial workspace created


## 2026-05-29

Created ticket and initial design for response-viewer session/document metadata in generated Markdown.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/markdown-recent-viewer/history.ts — Reference for session-history document discovery
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/response.ts — Primary implementation target for metadata rendering


## 2026-05-29

Added intern implementation guide covering response-viewer architecture, metadata design, previous-turn document discovery, rendering plan, and validation.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/29/RESPONSE-METADATA--add-session-metadata-to-response-view-generated-markdown/design/02-intern-implementation-guide.md — New long-form implementation guide


## 2026-05-29

Uploaded intern implementation guide to reMarkable at /ai/2026/05/29/RESPONSE-METADATA.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/29/RESPONSE-METADATA--add-session-metadata-to-response-view-generated-markdown/design/02-intern-implementation-guide.md — Uploaded guide source


## 2026-05-29

Implemented response-viewer metadata output and validated with smoke script, pi load check, and tmux /rv-last test (commit c5d6db6).

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/README.md — Updated user-facing docs
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/index.ts — Updated save/open call sites
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/response.ts — Metadata renderer and document context implementation
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/29/RESPONSE-METADATA--add-session-metadata-to-response-view-generated-markdown/scripts/01-smoke-response-metadata.ts — Smoke test script


## 2026-05-29

Changed response-viewer body document links to md-view /render?file=<absolute-path> URLs and updated smoke validation (commit 20c04b9).

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/README.md — Documented md-view render link behavior
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-viewer/response.ts — Updated link target generation
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/29/RESPONSE-METADATA--add-session-metadata-to-response-view-generated-markdown/scripts/01-smoke-response-metadata.ts — Updated link assertions

