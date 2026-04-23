# Changelog

## 2026-04-23

- Initial workspace created
- Wrote `design/analysis.md`: system architecture, event flow, design decisions, schema design, edge cases, and comparison to previous extension
- Wrote `design/implementation.md`: complete implementation guide with minimal working extension, production-quality enhanced version, testing instructions, and future enhancements
- Wrote `reference/api-cheatsheet.md`: quick reference for events, types, regex patterns, and widget API used by this extension
- Wrote `playbooks/setup-and-test.md`: step-by-step commands to scaffold, run, and test the extension
- Key design decision: parse at `turn_end` on complete message rather than buffering `message_update` tokens — much simpler and more robust
- Implemented `~/.pi/agent/extensions/session-summary.ts` (168 lines): full enhanced version with session statistics, `/summary` and `/summary-toggle` commands, multiple summary detection via `matchAll`, truncation, and safety cleanups
