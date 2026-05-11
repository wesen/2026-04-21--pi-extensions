# Changelog

## 2026-05-11

- Initial workspace created


## 2026-05-11

Created ticket, initial design doc, diary, and tasks for selective session compaction interpretation validation

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/design/01-selective-session-compaction-extension.md — Initial transformation model and validation questions
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/reference/01-diary.md — Diary entry for ticket creation and interpretation


## 2026-05-11

Added detailed intern-facing analysis, design, and implementation guide for selective compaction with a dedicated prompt and new-session handoff architecture

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/design/02-selective-compaction-intern-implementation-guide.md — Main deliverable for analysis/design/implementation guidance


## 2026-05-11

Updated ticket tasks after design guide: docs review and design marked complete; user workflow validation remains open

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/tasks.md — Task status corrected after guide creation


## 2026-05-11

Implemented selective-compaction extension MVP with shared-framework registration, whole-turn selection, dedicated prompt generation, editable summary/linkage, and new-session creation

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/.pi/settings.json — Extension enabled for project
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/selective-compaction/index.ts — Main extension orchestration
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/selective-compaction/prompt.ts — Dedicated prompt and parser
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/selective-compaction/session.ts — Session partition/copy logic


## 2026-05-11

Marked selective compaction MVP implementation task complete after load validation

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/tasks.md — Implementation task status


## 2026-05-11

Removed placeholder task from selective compaction task list

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/tasks.md — Task hygiene


## 2026-05-11

Added warning when selective compaction runs on a branch that already contains compaction entries

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/selective-compaction/session.ts — Warns about prior compaction entries before selecting a range


## 2026-05-11

Adjusted selective compaction session helper types to use exported SessionMessageEntry rather than a non-exported AgentMessage type

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/selective-compaction/session.ts — Type import cleanup for maintainability

