# Changelog

## 2026-07-23

- Initial workspace created


## 2026-07-23

Created the intern-facing session-context analysis/design/implementation guide, prompt/API reference, and investigation diary. The design proves that agent-env PI_AGENT_* exports are Bash-child metadata, not automatic model context, and specifies before_agent_start plus current input-transform injection.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/index.ts — Evidence for child-process-only PI_AGENT_* injection
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/23/PI-EXT-SESSION-CONTEXT--session-context-statistics-in-pi-prompts/design-doc/01-session-context-statistics-prompt-injection-analysis-design-and-implementation-guide.md — Primary design and implementation guide
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/23/PI-EXT-SESSION-CONTEXT--session-context-statistics-in-pi-prompts/reference/02-prompt-and-api-reference.md — Prompt examples and current Pi API contract


## 2026-07-23

Validated the ticket with docmgr doctor, completed a dry-run bundle conversion, and uploaded the design guide, prompt/API reference, and investigation diary to reMarkable at /ai/2026/07/23/PI-EXT-SESSION-CONTEXT.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/23/PI-EXT-SESSION-CONTEXT--session-context-statistics-in-pi-prompts/reference/01-investigation-diary.md — Delivery record and validation commands


## 2026-07-23

Implemented session-context: active-branch statistics, separate context-window and total-session prompt numbers, bounded system/input prompt injection, commands/settings/status widget, self-tests, and agent-env capability event-bus integration. Added project loading and README documentation.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/index.ts — Capability event emitted for prompt-aware extensions
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/session-context/index.ts — Session-context extension runtime and prompt hooks
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/session-context/snapshot.ts — Statistics aggregation and prompt-number semantics


## 2026-07-23

Updated the guide and prompt reference with separate current-context-window and total-session prompt numbers, then refreshed the reMarkable bundle after implementation.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/23/PI-EXT-SESSION-CONTEXT--session-context-statistics-in-pi-prompts/design-doc/01-session-context-statistics-prompt-injection-analysis-design-and-implementation-guide.md — Updated implementation status and prompt-number semantics
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/07/23/PI-EXT-SESSION-CONTEXT--session-context-statistics-in-pi-prompts/reference/02-prompt-and-api-reference.md — Updated prompt-number examples


## 2026-07-23

Migrated session-summary input reminders to Pi's current input API: interactive/RPC sources are transformed through event.text and action:transform, extension-generated input passes through, and images are preserved.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/session-summary/README.md — Documented current input behavior
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/session-summary/index.ts — Compatibility repair for current Pi input events
