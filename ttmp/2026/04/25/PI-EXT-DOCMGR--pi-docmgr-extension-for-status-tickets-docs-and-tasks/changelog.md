# Changelog

## 2026-04-25

Added a `docmgr-debug` command and changed the footer to show open-ticket counts as `open x/y` so tmux smoke tests can verify the resolved workspace root and loaded ticket total more easily.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/docmgr/index.ts — Added the debug widget command
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/docmgr/state.ts — Footer now shows open/total ticket counts
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/playbook/01-pi-docmgr-extension-implementation-guide.md — Updated smoke-test commands and debug workflow

## 2026-04-25

- Created the PI-EXT-DOCMGR ticket workspace and set the v1 scope to status, tickets, docs, and tasks.
- Drafted the design doc, implementation guide, and diary with ASCII mockups for the planned Pi UI.
- Seeded the first implementation tasks for the shared docmgr adapter, status bar, ticket browser, docs browser, and task browser.

## 2026-04-25

Drafted the first v1 design and implementation guide for the Pi docmgr extension, with ASCII UI mockups for the status bar, ticket browser, close dialog, docs browser, and task browser.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/design-doc/01-pi-docmgr-extension-design.md — Primary design artifact for the first extension slice
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/playbook/01-pi-docmgr-extension-implementation-guide.md — Implementation sequence and validation checklist
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/reference/01-diary.md — Chronological setup notes and review guidance


## 2026-04-25

Validated the workspace with docmgr doctor and uploaded the bundled ticket docs to reMarkable at /ai/2026/04/25/PI-EXT-DOCMGR.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/changelog.md — Records the validation and delivery step
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/index.md — Ticket overview for the uploaded bundle


## 2026-04-25

Expanded the implementation backlog into detailed Pi-extension tasks covering the CLI adapter, snapshot/state model, status bar, ticket browser, close dialog, docs browser, tasks browser, shortcuts, error handling, and smoke tests.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/tasks.md — Detailed implementation backlog for the first extension slice


## 2026-04-25

Added three docmgr smoke-test tickets so the browser UI can be debugged more easily: one for border rendering, one for Escape handling, and one for docs-preview behavior.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR-TEST-BORDER--docmgr-extension-border-smoke-test/index.md — Border smoke-test ticket
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR-TEST-ESC--docmgr-extension-escape-smoke-test/index.md — Escape smoke-test ticket
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR-TEST-DOCS--docmgr-extension-docs-smoke-test/index.md — Docs-preview smoke-test ticket


## 2026-04-25

Implemented the docmgr Pi extension v1 with a structured CLI adapter, status snapshot/footer, ticket/docs/tasks browsers, close flow, shortcuts, and a smoke-test playbook. Verified the extension loads in Pi and reproduced/fixed a getMarkdownTheme import issue during tmux smoke testing (commit 64459d1).

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/docmgr/docmgr-cli.ts — Structured docmgr command adapter (commit 64459d1)
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/docmgr/index.ts — Extension orchestration and UI entrypoint (commit 64459d1)
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/25/PI-EXT-DOCMGR--pi-docmgr-extension-for-status-tickets-docs-and-tasks/playbook/01-pi-docmgr-extension-implementation-guide.md — Smoke-test checklist and validation notes (commit 64459d1)


## 2026-04-25

Implemented the docmgr Pi extension v1, including the structured CLI adapter, status bar, ticket/docs/tasks browsers, close flow, and tmux smoke-test validation.

