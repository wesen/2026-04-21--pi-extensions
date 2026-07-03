# Tasks

## TODO


- [x] Map prompto architecture (discovery, rendering, scripts, config)
- [x] Map pi extension API surface (commands, UI/modal forms, prompt submission)
- [x] Write analysis/design/implementation guide (intern-level)
- [x] Maintain investigation diary
- [x] Relate key files, changelog, doctor validation
- [x] Upload bundle to reMarkable
- [x] Design doc updated: no legacy support, JSONL plugins, LLM prefill (2026-07-03)
- [x] P1: Create extensions/prompto/ skeleton (index.ts, types.ts) with registerPiExtension + pi.registerCommand('prompto')
- [x] P1: types.ts — PromptTemplate, TemplateField, PrefillSpec, Value, config types (design doc §7.2)
- [x] P1: config.ts — read/write ~/.pi/agent/prompto.json (submitDefault, allowProjectPlugins, prefillMaxTokens)
- [x] P1: store.ts — two-layer scan (<cwd>/.pi/prompts, ~/.pi/agent/prompts), name/group derivation, project-wins collision, session cache, rescan()
- [x] P1: template.ts — YAML frontmatter parse + strict {{name}} / flat {{#if}} renderer (unknown placeholder throws)
- [x] P1: run.ts — orchestration with dialog-fallback form (ui.input/select/confirm/editor per field)
- [x] P1: submit paths — setEditorText default, submit:auto via sendUserMessage (deliverAs:followUp when not idle)
- [x] P1: /prompto reload + getArgumentCompletions from store cache
- [x] P1: register in .pi/settings.json; load smoke test (timeout 20 pi --list-models)
- [x] P1: starter templates in .pi/prompts/: docmgr/create-ticket (with fields) + demo/greeting
- [x] P1: unit tests for template.ts renderer (all field types, #if truthy/equality, unknown placeholder, defaults)
- [x] P2: ui/form.ts — PromptFormComponent: frame/scroll/dirty-tracking (pinned-skills/ui.ts patterns), per-type row editing (tui-showcase patterns)
- [x] P2: form keyboard model — tab/arrows focus, space toggle, enter submit/next, esc cancel; required-field validation with footer error
- [x] P2: text fields via nested ctx.ui.editor — verify nested overlay behavior in modal-shortcut-lab first; fallback to in-form Editor widget if broken
- [x] P2: ui/picker.ts — SelectList-based template chooser with filter-as-you-type
- [x] P2: swap run.ts from dialog fallback to openForm/openPicker; tmux end-to-end test (fill form, verify editor text)
- [x] P2: width/ANSI safety pass + pre-ship checklist from pi-tui-ui-authoring-guide.md:1050-1065
- [x] P3: prefill.ts — runPrefill via complete() + modelRegistry.getApiKeyAndHeaders + BorderedLoader (selective-compaction pattern)
- [x] P3: prefill JSON contract — strict system prompt (single JSON object, allowed keys only) + defensive parseJsonObject (fences, prose, type mismatches)
- [x] P3: wire prefill.when variants (before-form, after-required two-pass) into run.ts
- [x] P3: soft-fail paths (no model/key, abort, garbage) -> unprefilled form + warning notify
- [x] P3: add prefill block to docmgr/create-ticket template; verify proposed title lands editable in form
- [x] P3: unit tests for parseJsonObject (clean/fenced/prose-embedded JSON, wrong types, extra keys, empty)
- [x] P4: plugin.ts — describePlugin (--describe, 5s timeout, JSONL parse, junk lines skipped) + renderViaPlugin (stdin request, 60s timeout, log/prompt/error frames)
- [x] P4: store integration — exec-bit classification, allowProjectPlugins gate with warning, per-session describe cache
- [x] P4: reference plugins in examples/ — python multi-template (computed ticket-number choices) + bash single-template
- [x] P4: docs/plugin-protocol.md registered as extension doc contribution
- [x] P4: plugin contract tests — happy path, error frame, junk stdout, timeout, nonzero exit, stderr noise
- [x] P5: palette items per template + launcher run action via _shared registry
- [x] P5: autocomplete polish (titles as descriptions, project layer ranked first); collision warnings in /prompto reload
- [ ] P5: two-pane picker with body preview; docs/authoring.md template guide
- [x] P5: value memory in <cwd>/.pi/prompto-state.json merged under prefill proposals
- [ ] Acceptance: dogfood docmgr/create-ticket (LLM-prefilled title) to create a real ticket
