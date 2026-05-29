# Changelog

## 2026-05-29

- Initial workspace created


## 2026-05-29

Created UMANS-GLM-COMPACTION ticket, documented likely thinking/reasoning_effort conflict root cause, and recorded configuration workarounds plus durable fix plan.

### Related Files

- /home/manuel/.pi/agent/npm/node_modules/pi-provider-umans/index.ts — Provider compat and hook evidence
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts — Extension path likely responsible for initial compaction-title failure


## 2026-05-29

Patched compaction-title so its Umans GLM title-generation compaction call disables thinking and avoids the invalid thinking/reasoning_effort pair; documented the behavior and smoke-tested extension loading.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/README.md — User-facing explanation of Umans behavior
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts — Compatibility guard and compaction details flag
