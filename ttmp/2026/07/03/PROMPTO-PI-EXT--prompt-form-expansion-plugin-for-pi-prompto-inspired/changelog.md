# Changelog

## 2026-07-03

- Initial workspace created


## 2026-07-03

Researched prompto (Go tool) and pi extension API; wrote full analysis/design/implementation guide for the prompto pi extension (frontmatter-Markdown templates, three-layer discovery, schema-generated modal form via ctx.ui.custom, setEditorText/sendUserMessage submission, decision records D1-D6, 4-phase plan); maintained investigation diary (Steps 1-3)

### Related Files

- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/ttmp/2026/07/03/PROMPTO-PI-EXT--prompt-form-expansion-plugin-for-pi-prompto-inspired/reference/01-investigation-diary.md — Investigation diary


## 2026-07-03

Validated ticket (docmgr doctor: all checks passed after adding prompts/templates/forms topic slugs) and uploaded design doc + diary bundle to reMarkable at /ai/2026/07/03/PROMPTO-PI-EXT


## 2026-07-03

Design revision per user feedback: dropped all legacy prompto compatibility (no prompto/ dirs, no repo config, no glazed YAML bridge); added self-describing JSONL prompt plugins (describe/render stdio protocol, project-layer trust gate) and LLM prefill of form fields via complete() from pi-ai (selective-compaction pattern, soft-fail, before-form/after-required); restructured to 5 phases; added 34 detailed implementation tasks

### Related Files

- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/ttmp/2026/07/03/PROMPTO-PI-EXT--prompt-form-expansion-plugin-for-pi-prompto-inspired/design-doc/01-prompto-inspired-prompt-form-expansion-extension-for-pi-analysis-design-and-implementation-guide.md — Revised design (§7.7 prefill


## 2026-07-03

Phase 1 implemented (commit 0de1d21): extensions/prompto with two-layer store, dependency-free frontmatter parser (yaml import not testable under bun), strict renderer, dialog-fallback form, /prompto command + reload + autocompletion, starter templates; 30 bun tests pass; tmux e2e verified expansion into editor

### Related Files

- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/frontmatter.ts — Hand-rolled YAML-subset parser (D2-adjacent deviation
- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/run.ts — Command orchestration and dialog-fallback form


## 2026-07-03

Phase 2 implemented (commit 0fe38f9): PromptFormComponent modal form + SelectList picker; nested ui.editor over ui.custom verified working (top design risk resolved); required-field validation, docmgr template e2e via tmux

### Related Files

- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/ui/form.ts — Schema-generated modal form component
- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/ui/picker.ts — Template picker overlay


## 2026-07-03

Phase 3 implemented (commit f061feb): LLM prefill via complete()+BorderedLoader with defensive JSON parsing and both when-variants; verified live (model proposed FROBNICATOR-REFACTOR-PLAN from the goal); 43 bun tests

### Related Files

- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/prefill-parse.ts — Pure JSON-parse/coercion helpers (bun-testable)
- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/prefill.ts — runPrefill runtime half (pi-coupled)


## 2026-07-03

Phase 4 implemented (commit 9e34e55): JSONL plugin subsystem (describe/render protocol, timeouts, junk tolerance, allowProjectPlugins gate), reference python/bash plugins, protocol+authoring docs as /px contributions; 56 bun tests; live plugin e2e verified incl. cwd contract

### Related Files

- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/docs/plugin-protocol.md — Plugin author documentation
- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/plugin-protocol.ts — Pure protocol parsing/validation
- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/plugin.ts — Subprocess client with stream handling


## 2026-07-03

Phase 5 polish (commit 38557c6): /px actions + palette item, project-first autocomplete ranking, per-project value memory in .pi/prompto-state.json (defaults -> remembered -> prefill -> user). Remaining open: two-pane picker preview (38), real-world dogfood acceptance (40)

### Related Files

- /home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/extensions/prompto/state.ts — Per-project value memory

