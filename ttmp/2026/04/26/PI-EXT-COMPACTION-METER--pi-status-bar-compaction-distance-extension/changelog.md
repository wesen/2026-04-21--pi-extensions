# Changelog

## 2026-04-26

- Initial workspace created


## 2026-04-26

Implemented compaction-meter extension. It reads documented Pi compaction settings, computes contextWindow - reserveTokens - currentTokens from ctx.getContextUsage(), publishes compact status text via ctx.ui.setStatus, and adds /compact-meter plus /cm diagnostics. Smoke validation passed with pi -e ./extensions/compaction-meter --no-session --no-tools -p '/compact-meter'; symlink installed under ~/.pi/agent/extensions/compaction-meter.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-meter/index.ts — Registers extension lifecycle handlers and slash commands
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-meter/meter.ts — Contains meter arithmetic and formatting
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-meter/settings.ts — Reads effective global/project compaction settings


## 2026-04-26

Validated compaction-meter in tmux. Pi startup listed compaction-meter among loaded extensions, /compact-meter reported 183,616 tokens until compaction for a 200,000-token context window with the default 16,384-token reserve, and the footer displayed compact:184k left.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-meter/index.ts — Interactive validation exercised command registration and status-bar updates

