---
Title: Investigation diary
Ticket: PROMPTO-PI-EXT
Status: active
Topics:
    - pi-extensions
    - prompts
    - templates
    - tui
    - forms
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../../.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
      Note: Spot-checked custom/sendUserMessage/InputEvent shapes here
    - Path: extensions/prompto/frontmatter.ts
      Note: Block-scalar rawIndex bug caught in self-review (Step 6)
    - Path: extensions/prompto/run.ts
      Note: Phase-1 dialog fallback implementation (Step 6)
    - Path: prompto/pkg/prompto.go
      Note: Investigated as the legacy behavioral spec
ExternalSources: []
Summary: Chronological record of the PROMPTO-PI-EXT research and design work.
LastUpdated: 2026-07-03T07:39:30-07:00
WhatFor: Understand how the PROMPTO-PI-EXT design was derived, what was investigated, and what remains open.
WhenToUse: When continuing this ticket or reviewing how the design decisions were reached.
---



# Diary

## Goal

Capture the investigation, analysis, and design work for PROMPTO-PI-EXT: a
prompt form expansion extension for pi inspired by the old `prompto` Go tool.
The end deliverable is a long-form intern-ready design/implementation guide
stored in this ticket and uploaded to reMarkable.

## Step 1: Ticket setup and research fan-out

Created the PROMPTO-PI-EXT ticket workspace and kicked off the evidence
gathering. The workspace contains two source trees that matter: `prompto/`
(the legacy Go prompt/template manager we take inspiration from) and
`2026-04-21--pi-extensions/` (the pi extensions monorepo where the new
extension will live, and which hosts the docmgr ttmp root).

Two parallel exploration passes were launched: one mapping prompto's
architecture (discovery, rendering, executable prompts, config), one mapping
the pi extension API surface (registration, slash commands, modal/TUI form
capabilities, prompt submission paths, prior-art extensions).

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to create a prompt form expansion plugin for pi. For that, we are going to take inspiration from ./prompto which was an old go tool to manage prompt template and scripts. For example, I want a prompt to create a docmgr ticket and ask for a project analysis plan, which wuld not only create a modal form that ask me to fill out the goal of the ticket, but also customize, etc... Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Create a docmgr ticket, research both prompto and
the pi extension system, then write a detailed intern-level
analysis/design/implementation guide for a pi extension that expands prompt
templates through interactive modal forms (example use case: a "create docmgr
ticket + project analysis plan" prompt that pops a form asking for the goal
and customization options). Upload the finished docs to reMarkable.

**Inferred user intent:** Get a complete, self-contained onboarding + design
document so that a new engineer (or a future agent session) can implement the
prompto-style form-expansion extension without re-deriving how pi extensions
or prompto work.

### What I did
- `docmgr ticket create-ticket --ticket PROMPTO-PI-EXT --title "Prompt form expansion plugin for pi (prompto-inspired)" --topics pi-extensions,prompts,templates,tui,forms`
- `docmgr doc add` for the design doc (landed in `design-doc/01-...md`) and this diary.
- Added six tracking tasks via `docmgr task add`.
- Launched two thorough exploration agents: prompto architecture map and pi extension API map.

### Why
- The ticket workspace must exist before docs can be attached.
- Both source trees are large; parallel exploration is faster and keeps the main context focused on writing.

### What worked
- Ticket and doc scaffolding created cleanly under `ttmp/2026/07/03/PROMPTO-PI-EXT--...`.

### What didn't work
- N/A so far.

### What I learned
- The docmgr root for this workspace lives inside `2026-04-21--pi-extensions/ttmp` (per `.ttmp.yaml`), so ticket docs sit next to the extension monorepo they describe.
- `docmgr doc add --doc-type design-doc` creates a `design-doc/` directory rather than `design/`.

### What was tricky to build
- N/A (setup only).

### What warrants a second pair of eyes
- N/A (setup only).

### What should be done in the future
- N/A.

### Code review instructions
- Verify ticket scaffolding: `docmgr ticket list | grep PROMPTO-PI-EXT`.

### Technical details
- Ticket path: `ttmp/2026/07/03/PROMPTO-PI-EXT--prompt-form-expansion-plugin-for-pi-prompto-inspired/`

## Step 2: Prompto architecture mapped

The prompto exploration pass completed and returned a full architectural map
of the legacy tool. The essence: prompto is a Go CLI (go-go-golems stack:
clay/glazed/templ/huh) that reads a repository list from
`~/.prompto/config.yaml`, walks each repo's top-level `prompto/` directory,
and exposes every file found there as a named prompt addressed by its
relative path (first path segment = group). Three prompt kinds exist, decided
by file mode and parseability: plain files (contents printed), executables
(run with cwd = repo root, caller cwd in `PROMPTO_PARENT_PWD`, argv forwarded,
stdout captured), and glazed TemplateCommand YAMLs (typed `parameters:` +
Go text/template `template:` block, rendered via glazed).

The load-bearing ideas to carry into the pi extension are the directory
convention, the three-kind polymorphism keyed off exec bit + YAML parse, the
typed parameter schema on template prompts (this is exactly what a modal form
should be generated from), and the executable contract.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Continue research per Step 1 plan.

**Inferred user intent:** (see Step 1)

### What I did
- Ran a thorough exploration agent over `/home/manuel/workspaces/2026-07-03/pi-extension-prompto/prompto`.

### Why
- The design doc must be evidence-based; prompto is the behavioral spec we borrow from.

### What worked
- Complete map with file:line anchors, e.g. `Prompto.Render` at `pkg/prompto.go:35`, discovery walk at `pkg/repository.go:26-119`, template YAML format documented in `pkg/doc/topics/03-creating-promptos.md:104-127`.

### What didn't work
- N/A.

### What I learned
- Template promptos ARE glazed commands: their `parameters:` list (name/type/help/default) is a ready-made form schema — the modal-form idea maps 1:1 onto it.
- Executable promptos rely on a two-directory contract: `c.Dir = repo`, `PROMPTO_PARENT_PWD` = caller cwd (`pkg/prompto.go:38-56`).
- Name resolution is exact-match; template YAMLs lose their extension in the address (`pkg/repository.go:113-118`).

### What was tricky to build
- N/A (research only).

### What warrants a second pair of eyes
- Whether the pi extension should preserve the extension-stripping behavior for template names (potential ambiguity between `foo.yaml` template and `foo.md` plain prompt in the same group).

### What should be done in the future
- N/A.

### Code review instructions
- Cross-check claims against `prompto/pkg/prompto.go` and `prompto/pkg/repository.go`.

### Technical details
- Prompto CLI verbs: `get, list, serve, which, edit, config repositories …` (`cmd/prompto/cmds/commands.go:19-27`).

## Step 3: Pi extension API mapped, key types spot-checked, design doc written

The second exploration pass returned the full pi extension API surface. The
crucial discovery: the authoritative runtime is the renamed fork
`@earendil-works/pi-coding-agent` v0.78.0 (installed at
`~/.pi/agent/npm/node_modules/...`), not the `@mariozechner/pi-coding-agent`
name the extensions import — and there is real API drift (session-summary's
`input` handler uses a legacy event shape). Before writing the design I
spot-checked the three APIs the whole design hinges on directly in
`types.d.ts`: `custom<T>(factory, {overlay, overlayOptions})`,
`sendUserMessage(content, {deliverAs})` ("Always triggers a turn"), and
`InputEvent`/`InputEventResult` (`{action:"transform", text}`). All matched.

With both maps in hand I wrote the full design doc: frontmatter-Markdown
template format with a typed `fields:` schema, three-layer discovery
(project `.pi/prompts/`, global `~/.pi/agent/prompts/`, legacy `prompto/`
repos via `~/.pi/agent/prompto.json`), a schema-generated modal form via
`ctx.ui.custom`, review-before-send default via `setEditorText` with
per-template `submit: auto`, six decision records (D1–D6), a four-phase
file-level implementation plan, and an API appendix table.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Write the design/implementation guide from the
gathered evidence.

**Inferred user intent:** (see Step 1)

### What I did
- Exploration agent over `2026-04-21--pi-extensions/` + the installed pi package types.
- `sed -n '560,590p;835,850p;116,136p' .../types.d.ts` to verify `custom`, `sendUserMessage`, `setEditorText`, `InputEvent` shapes first-hand.
- Wrote `design-doc/01-prompto-inspired-prompt-form-expansion-extension-for-pi-analysis-design-and-implementation-guide.md` (~14 sections).

### Why
- The design's core wiring (modal → values → render → editor/agent) must be typed against the real installed API, not stale imports.

### What worked
- Three strong prior-art extensions cover every UI pattern needed: `tui-showcase` (form tab + overlay opening), `pinned-skills` (production modal + config persistence), `selective-compaction` (multi-step flow).
- `pi.sendUserMessage` and `ctx.ui.setEditorText` are both present, typed, and unused by existing extensions — greenfield but supported.

### What didn't work
- N/A (no code executed beyond reads).

### What I learned
- `.pi/settings.json` `extensions` array (paths relative to the settings file) is the dev-time load mechanism; global installs are symlinks under `~/.pi/agent/extensions/`.
- The monorepo mandates `registerPiExtension()` from `extensions/_shared/registry.ts` for launcher/palette integration, separate from pi runtime hooks.
- `session-summary/index.ts:213-223` demonstrates live API drift between the fork and old imports — pinned as risk #2 in the design doc.

### What was tricky to build
- Deciding the form mechanics: three viable paths (chained dialogs, `SettingsList`, custom `Component`). Resolved as decision record D4 — custom Component for the product, chained dialogs as the Phase-1 stepping stone behind the same call site, so the feature ships value early.

### What warrants a second pair of eyes
- Decision D1 (new frontmatter-Markdown format instead of parsing legacy glazed YAML) — it means existing template YAMLs need conversion; check this matches the user's appetite.
- The nested-overlay assumption for `text` fields (`ui.editor` inside `ui.custom`) is unverified; flagged as the top UX risk.

### What should be done in the future
- Phase 1 implementation per design doc §10; verify nested overlays in `modal-shortcut-lab` before committing to the text-field design.

### Code review instructions
- Read the design doc top to bottom; spot-check §5.2/§12 API claims against `/home/manuel/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`.
- Spot-check §4 prompto claims against `prompto/pkg/prompto.go` and `prompto/pkg/repository.go`.

### Technical details
- Design doc: `design-doc/01-prompto-inspired-prompt-form-expansion-extension-for-pi-analysis-design-and-implementation-guide.md` in this ticket.

## Step 4: Bookkeeping, validation, and reMarkable delivery

Closed out the ticket deliverables: related nine evidence files to the design
doc (prompto core, pi types.d.ts, the three prior-art extensions, registry,
TUI guide), updated the changelog, checked all tasks, ran doctor, and
uploaded the bundle to reMarkable.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Finish ticket bookkeeping and deliver to reMarkable.

**Inferred user intent:** (see Step 1)

### What I did
- `docmgr doc relate` (9 file notes on design doc, 2 on diary), `docmgr changelog update` (2 entries).
- `docmgr doctor --ticket PROMPTO-PI-EXT --stale-after 30` — one warning: topics `prompts`, `templates`, `forms` missing from vocabulary.
- Added the three slugs via `docmgr vocab add`; re-ran doctor: all checks passed.
- `remarquee upload bundle <design-doc> <diary> --name "PROMPTO-PI-EXT Prompt Form Expansion Extension Design" --remote-dir /ai/2026/07/03/PROMPTO-PI-EXT --toc-depth 2 --non-interactive` → `OK: uploaded`.

### Why
- Doctor must pass before upload per the deliverable checklist; vocabulary warnings block that.

### What worked
- Upload succeeded on the first call, no reauth needed.

### What didn't work
- `docmgr task remove --id 1` renumbers subsequent tasks, so a later `task check --id 7` failed with "task id(s) not found: [7]" — re-list tasks after any removal before checking by id.

### What I learned
- `docmgr doc relate` comma-splits file notes, so notes containing commas get truncated in RelatedFiles frontmatter (cosmetic).

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- Implement Phase 1 of the design doc (§10); then dogfood the `docmgr/create-ticket` template as the acceptance test.

### Code review instructions
- `docmgr doctor --ticket PROMPTO-PI-EXT --stale-after 30` should report all checks passed.
- Bundle on device: `/ai/2026/07/03/PROMPTO-PI-EXT/PROMPTO-PI-EXT Prompt Form Expansion Extension Design.pdf`.

### Technical details
- Doctor output after vocab fix: `✅ All checks passed`.

## Step 5: Design revision — drop legacy, add JSONL plugins and LLM prefill

The user reviewed the design and redirected it on four points: no legacy
`prompto/` directory support at all (inspiration only), dynamic prompts as
self-discovering JSONL plugins rather than raw executables, and a new
capability — templates whose fields can be prefilled by the LLM (e.g. a
prefill prompt that proposes a ticket title/number). Revised the design doc
accordingly and added a detailed 34-item phased implementation task list to
the ticket.

Before revising, verified the prefill mechanism first-hand:
`selective-compaction/index.ts` imports `complete` from
`@mariozechner/pi-ai`, gets credentials via
`ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)`, and runs the completion
behind an abortable `BorderedLoader` inside `ctx.ui.custom` — this exact
pattern became design section §7.7 and decision D7.

### Prompt Context

**User prompt (verbatim):** "- no legacy prompto directories
- allow jsonl plugins and not just templates (with self discovery)
- no need for any legacy, this is just inspireed from the old one.
- allow the option for a prompt to be \"prefilled\" by the LLM by itself containing a prompt to fill it (for example, to get a ticket number

Update doc, then add detailed list of tasks to the ticket."

**Assistant interpretation:** Revise the design doc: remove the legacy-repo
discovery layer and all prompto compatibility, add self-describing JSONL
prompt plugins, add per-template LLM prefill of form fields; then populate
the ticket with a detailed implementation task list.

**Inferred user intent:** Make the design match the actual product he wants
(clean pi-native system, extensible via simple stdio plugins, with smart
form prefill) and make the ticket directly executable by an implementer.

### What I did
- Verified `complete()` usage in `selective-compaction/index.ts:100-171`.
- ~20 edits across the design doc: exec summary, goals/non-goals, gap table,
  architecture diagram, template schema (added `PrefillSpec`, `kind:
  "plugin"`), discovery (§7.3 two layers + `allowProjectPlugins`), new §7.7
  (LLM prefill) and §7.8 (JSONL plugin protocol with describe/render frames
  and a 20-line python example), rewrote D1/D6, added D7, updated run/store
  pseudocode, added §8.5 plugin client, re-phased the plan (P3 prefill, P4
  plugins, P5 polish), updated tests/API table/risks.
- Added 34 implementation tasks (P1–P5 + acceptance) via `docmgr task add`.
- Changelog entry + related `selective-compaction/index.ts` to the design doc.

### Why
- User decisions override the earlier proposed decisions (D1 now `accepted`
  with no legacy path; old D6 executable-port design replaced wholesale).

### What worked
- The JSONL plugin idea slots cleanly into the existing store design: the
  exec bit that used to mean "legacy executable" now means "plugin", and
  announced templates reuse the whole form/render pipeline.

### What didn't work
- N/A.

### What I learned
- `complete()` from `@mariozechner/pi-ai` is a bare completion (no tools),
  which cleanly delineates prefill (declarative, model-only) from plugins
  (anything needing file/system access).

### What was tricky to build
- Keeping section cross-references consistent after inserting §7.7/§7.8
  (decision records moved to §7.9, phases renumbered to 5) — swept with grep
  for stale "Phase 3/4", "legacy", and "executable" mentions afterwards.

### What warrants a second pair of eyes
- The JSONL protocol surface (§7.8): frame names (`template`, `end`,
  `render`, `prompt`, `log`, `error`), the two-invocation (no daemon) model,
  and the 5 s/60 s timeouts — cheap to change now, expensive after plugins
  exist.
- The prefill trust posture: proposals always go through the form, never
  straight to submission — confirm this matches expectations.

### What should be done in the future
- Start Phase 1 (tasks 8–18); re-upload the revised bundle to reMarkable if
  a device copy of the new design is wanted (not done in this step to avoid
  clobbering annotations with --force).

### Code review instructions
- Diff-review the design doc against Step 3's version; check §7.7/§7.8/D6/D7.
- Task list: `docmgr task list --ticket PROMPTO-PI-EXT` (items 8–40).

### Technical details
- Prefill evidence: `extensions/selective-compaction/index.ts:137-171`
  (`complete(ctx.model, {systemPrompt, messages}, {apiKey, headers,
  maxTokens, signal})`).

## Step 6: Phase 1 implemented — store, renderer, dialog form (commit 0de1d21)

Implemented Phase 1 of the design: the `extensions/prompto/` skeleton with
types, config, a two-layer template store, a dependency-free YAML-subset
frontmatter parser, the strict `{{…}}` renderer, and a `/prompto` command
whose form is (for now) the sequential-dialog fallback. Verified end-to-end
in an isolated tmux-driven pi session: `/prompto demo/greeting` → input
dialog → choice dialog → "Please greet World.\nAnswer in German." expanded
into the editor with a confirmation notify.

The one significant deviation from the design doc: no `yaml` package import.
pi's jiti loader resolves bare imports (like `typebox` in image-qa) against
pi's own node_modules, but `bun test` cannot (bun ignores NODE_PATH), so the
unit tests would have been unrunnable. Wrote `frontmatter.ts` instead — a
~200-line parser for exactly the subset the template format needs (maps,
block lists of maps, inline arrays, quoted scalars, `|`/`|-` block literals,
comments), with documented non-goals and 15 tests.

### Prompt Context

**User prompt (verbatim):** "already, implement, commit at a ppropriate intervals, and keep a diary as you work (see skill for the format of the diary)"

**Assistant interpretation:** Implement the extension per the revised design,
phase by phase, committing at sensible milestones and diarying each step.

**Inferred user intent:** Working `/prompto` in pi, with a reviewable commit
trail and a continuation-friendly record.

**Commit (code):** 0de1d21 — "Add prompto extension Phase 1: template store, renderer, dialog form"

### What I did
- Created `extensions/prompto/`: `types.ts`, `config.ts`, `frontmatter.ts`,
  `template.ts`, `store.ts`, `run.ts`, `index.ts`, `tests/` (30 bun tests).
- Registered in `.pi/settings.json`; added starter templates
  `.pi/prompts/docmgr/create-ticket.md` and `.pi/prompts/demo/greeting.md`.
- `bun test extensions/prompto/tests/` → 30 pass; `timeout 30 pi
  --list-models` → exit 0.
- tmux e2e in a scratch project with only the prompto extension loaded.

### Why
- Dialog fallback first (design D4) ships a usable feature before the modal
  form exists, behind the same `expandTemplate` call site.

### What worked
- The dialog-fallback flow works exactly as designed on the first
  interactive run: string → `ui.input`, choice → `ui.select`,
  `setEditorText` + notify at the end.

### What didn't work
- `NODE_PATH=... bun test` does NOT resolve pi's nested `yaml` package (bun
  ignores NODE_PATH) — this killed the "import yaml bare" plan and led to
  the hand-rolled parser.
- First run of the docmgr end-to-end renderer test failed: expected
  `"...Done.\n"` but the joined test source has no trailing newline. Test
  expectation fixed, not code.
- Interactive `pi` in this workspace clone dies at startup with a
  pre-existing conflict: globally-registered extensions from the
  `~/code/wesen/2026-04-21--pi-extensions` clone collide with this clone's
  project-listed `tui-showcase` ("Tool tui_demo_card conflicts"). Not caused
  by prompto (`pi --list-models` exits 0). Worked around by e2e-testing from
  a scratch dir whose `.pi/settings.json` loads only prompto.

### What I learned
- pi asks "Trust project folder?" on first interactive run per directory —
  tmux tests must answer it before the editor exists.
- Extensions CAN import pi's dependencies bare at runtime (jiti resolves
  them), but any code that unit tests must touch should stay
  dependency-free.

### What was tricky to build
- The frontmatter block-scalar parser: my first version located block bodies
  by searching for the key line's raw text, which returns the *first*
  occurrence — two identical `prompt: |` lines in sibling list items would
  have read the same block twice. Caught during self-review; fixed by
  carrying `rawIndex` on every tokenized line, and pinned with the
  "identical block scalars in sibling list items stay distinct" test.

### What warrants a second pair of eyes
- `frontmatter.ts` edge cases beyond the tested subset (it throws on
  unsupported constructs by design — verify the error surfaces readably via
  the scan-issue notify path).
- `run.ts` `askField` multichoice fallback (comma-separated input) silently
  drops unknown choices after a warning — acceptable for the throwaway
  fallback, gone in Phase 2.

### What should be done in the future
- Phase 2: real modal form + picker. The global-vs-project extension clone
  conflict deserves a cleanup outside this ticket.

### Code review instructions
- Start at `extensions/prompto/run.ts` (`runPrompto`, `expandTemplate`),
  then `store.ts` (`rescan`) and `template.ts` (`parseTemplate`,
  `renderTemplate`).
- Validate: `bun test extensions/prompto/tests/` (30 pass) and the tmux flow
  from a scratch project (see Technical details).

### Technical details
- e2e scratch setup: `.pi/settings.json` with only the absolute path to
  `extensions/prompto/index.ts`, plus `.pi/prompts/demo/greeting.md`; then
  `tmux new-session -d -x 120 -y 40 -c $SCRATCH`, `send-keys "pi" Enter`,
  answer trust prompt, `send-keys "/prompto demo/greeting" Enter`.

## Step 7: Phase 2 implemented — modal form + picker; nested overlays work (commit 0fe38f9)

Built the real UI: `ui/form.ts` (`PromptFormComponent`, ~330 lines) and
`ui/picker.ts` (`SelectList`-based chooser), and swapped `run.ts` from the
dialog fallback to them. The design's top-ranked UX risk is resolved: **a
nested `ctx.ui.editor` overlay opened from inside a `ctx.ui.custom` overlay
works** — pressing Enter on the "Ticket goal" text row stacked the editor
overlay on top of the form, and the edited value landed back in the form row
(guarded by an `editingText` flag so the form ignores input while the editor
owns the keyboard).

Verified interactively in the scratch project: the full docmgr/create-ticket
form (text + string + multichoice + choice + boolean) rendered and produced
a correctly conditional-rendered prompt ("light" depth line, no reMarkable
line when toggled off); the no-args picker listed both templates with
descriptions; submitting with an empty required goal showed
"required: Ticket goal" in the frame instead of submitting.

### Prompt Context

**User prompt (verbatim):** (see Step 6)

**Assistant interpretation:** Continue with Phase 2 per plan.

**Inferred user intent:** (see Step 6)

**Commit (code):** 0fe38f9 — "Add prompto Phase 2: schema-generated modal form and template picker"

### What I did
- `ui/form.ts`: focus model (fields + button row), per-type input handling,
  inline string/number editing with cursor block, required/number
  validation, themed bordered frame with contextual hint line.
- `ui/picker.ts`: `SelectList` in a container, filter-as-you-type.
- Rewrote `run.ts` (dialog fallback deleted); `bun test` still 30 pass; pi
  load smoke exit 0; tmux e2e for greeting, docmgr, picker, validation.

### Why
- Design D4: custom Component for the product; the fallback was scaffolding.

### What worked
- Nested overlay (`ui.editor` over `ui.custom`) — no focus or render issues
  observed; the risk-mitigation fallback (in-form Editor widget) was not
  needed.
- The pinned-skills frame/dirty-tracking patterns transplanted cleanly.

### What didn't work
- First picker attempt appeared to do nothing: sending `"/prompto" Enter` in
  one tmux keystroke burst races pi's slash-command autocomplete popup,
  which swallows the Enter. Sending the text, sleeping ~1 s, then sending
  Enter separately works. (Same root cause as tmux's own "extended-keys is
  off" warning territory — timing, not code.)

### What I learned
- pi shows command autocomplete as soon as "/prompto" is typed; automated
  drivers must either pause before Enter or send keys in separate bursts.

### What was tricky to build
- Keeping `handleInput` re-entrancy safe around the async nested editor: the
  form must ignore keystrokes while `ui.editor` is open (`editingText`
  flag), and mark itself dirty when the editor resolves so the new value
  renders.

### What warrants a second pair of eyes
- `ui/form.ts` width math (`labelWidth` clamping vs long labels — the
  reMarkable label already ellipsizes at 28 cols; acceptable?).
- Multichoice keyboard model (←→ inner cursor + space) — usable, but worth a
  human feel-check.

### What should be done in the future
- Phase 3 (LLM prefill), Phase 4 (JSONL plugins).

### Code review instructions
- Start at `extensions/prompto/ui/form.ts` (`handleFieldInput`,
  `openTextEditor`, `trySubmit`), then `ui/picker.ts`, then the slimmed
  `run.ts`.
- Validate: `bun test extensions/prompto/tests/`, then the tmux flow from
  Step 6's Technical details (use separate send-keys bursts around Enter).

### Technical details
- Form opens via `ctx.ui.custom(..., { overlay: true, overlayOptions:
  { anchor: "center", width: "85%", maxHeight: "85%", margin: 1 } })`.

## Step 8: Phase 3 implemented — LLM prefill, verified live (commit f061feb)

Implemented `prefill.ts` (runPrefill: `complete()` from pi-ai behind an
abortable `BorderedLoader`, credentials via
`ctx.modelRegistry.getApiKeyAndHeaders`) and `prefill-parse.ts` (pure
helpers: strict system prompt builder, fence/prose-tolerant
`parseJsonObject`, per-type `coerceValue`). `run.ts` gained `collectValues`
with both `when` variants; `after-required` runs a required-fields-only form
pass first so the prefill prompt can reference the goal.

Verified live in the scratch pi session with the docmgr template: pass-1
form showed only "Ticket goal"; on submit the "⠧ Prefilling
docmgr/create-ticket…" loader ran (~10 s on the session's model); the full
form opened with the goal carried over and **Ticket title =
FROBNICATOR-REFACTOR-PLAN** proposed by the model — the motivating use case
working end to end. Final expansion rendered all conditionals correctly.

### Prompt Context

**User prompt (verbatim):** (see Step 6)

**Assistant interpretation:** Continue with Phase 3 per plan.

**Inferred user intent:** (see Step 6)

**Commit (code):** f061feb — "Add prompto Phase 3: LLM prefill of form fields"

### What I did
- `prefill.ts`, `prefill-parse.ts`, `tests/prefill.test.ts` (13 new tests:
  clean/fenced/prose JSON, rejects for array/scalar/garbage/empty, coercion
  matrix per field type); wired `collectValues` into `run.ts`.
- `bun test` → 43 pass; pi load smoke exit 0; live tmux e2e above.

### Why
- Decision D7: extension-side `complete()` keeps the session transcript
  clean and the call abortable; proposals must always pass through the form.

### What worked
- The whole loader-overlay + completion + reopened-form chain worked on the
  first live run, including value carry-over between the two form passes.

### What didn't work
- First `bun test` run errored: `Cannot find module '@mariozechner/pi-ai'` —
  bun cannot resolve pi packages. Fixed by splitting the pure helpers into
  `prefill-parse.ts` (no pi imports) and testing that; `prefill.ts` keeps
  the pi-coupled runtime half. Same lesson as Step 6, now a firm rule:
  anything unit-tested must not import pi packages.

### What I learned
- `complete()` responses arrive as content parts; text extraction must
  filter `part.type === "text"` and join (same as selective-compaction).

### What was tricky to build
- Sequencing `after-required`: the reduced pass-1 template reuses the full
  seed map so non-required defaults survive, and pass-1 answers merge back
  into the seed *before* the prefill prompt renders — order matters or the
  prefill prompt sees empty goals.

### What warrants a second pair of eyes
- `parseJsonObject`'s brace-slice fallback could in principle grab a
  non-JSON `{...}` span in pathological prose; acceptable given the strict
  system prompt, but review welcome.
- Prefill latency (~10 s observed) — if it feels slow in practice, consider
  a smaller/faster model override later (open question in design §13).

### What should be done in the future
- Phase 4: JSONL plugins.

### Code review instructions
- Start at `extensions/prompto/prefill.ts` (`runPrefill`), then
  `prefill-parse.ts`, then `collectValues` in `run.ts`.
- Validate: `bun test extensions/prompto/tests/prefill.test.ts`; live flow
  needs a configured model (any) and the docmgr starter template.

### Technical details
- Prefill call: `complete(ctx.model, { systemPrompt, messages: [{ role:
  "user", content: [{ type: "text", text }] }] }, { apiKey, headers,
  maxTokens: config.prefillMaxTokens, signal: loader.signal })`.

## Step 9: Phase 4 implemented — JSONL plugins, verified live (commit 9e34e55)

Implemented the plugin subsystem: `plugin-protocol.ts` (pure describe/render
frame parsing, reusing the exported `parseFields`/`parsePrefill` validators
so plugin-announced fields obey exactly the frontmatter schema) and
`plugin.ts` (subprocess client: `--describe` capture with 5 s timeout;
render via one stdin request line and streamed stdout frames with 60 s
timeout, SIGKILL on timeout, stderr captured only for error messages).
Wired into the store (exec-bit classification, `allowProjectPlugins` gate,
describe issues surfaced as scan warnings) and `run.ts` (plugin `log`
frames go to `setWorkingMessage`). Registered `docs/authoring.md` and
`docs/plugin-protocol.md` as `/px` doc contributions via a `load:` callback
reading module-relative paths (`import.meta.url` works under pi's jiti).

Live e2e: a temporary global-layer bash plugin announced a `hello` template
with one required field; `/prompto ptest/hello` opened the generated form,
and submission produced "Plugin says hello to world (cwd=<user cwd>)" —
confirming both the render path and the cwd contract.

### Prompt Context

**User prompt (verbatim):** (see Step 6)

**Assistant interpretation:** Continue with Phase 4 per plan.

**Inferred user intent:** (see Step 6)

**Commit (code):** 9e34e55 — "Add prompto Phase 4: self-describing JSONL prompt plugins"

### What I did
- `plugin-protocol.ts`, `plugin.ts`, `tests/plugin.test.ts` (13 contract
  tests using chmod+x fixture scripts in tmp: describe happy/nonzero-exit/
  timeout; render happy-with-log, error frame, junk-then-prompt,
  silent-exit-with-stderr-tail, hang-timeout).
- `examples/tickets.plugin.py` (multi-template, computed docmgr choice
  lists) and `examples/git-diff.plugin.sh`.
- Exported `parseFields`/`parsePrefill` from `template.ts` for reuse.
- 56 bun tests pass; pi load smoke exit 0; live tmux e2e above; removed the
  temp `~/.pi/agent/prompts/ptest/` plugin afterwards.

### Why
- Decision D6: self-description is what lets plugins participate in the
  generated-form pipeline; timeouts + junk tolerance are the
  anti-protocol-contamination measures.

### What worked
- Made timeouts injectable (`timeoutMs` option) so the timeout contract
  tests run in 300 ms instead of hitting the real 5 s/60 s limits.

### What didn't work
- N/A this step (the pi-import/bun-test split lesson from Steps 6/8 was
  applied preemptively: subprocess code uses only node builtins).

### What I learned
- `import.meta.url` resolves correctly in pi's jiti-loaded TS extensions —
  module-relative doc loading works.
- The launcher reads `doc.path` relative to the session cwd
  (`extensions/launcher/index.ts:244`), so `load:` callbacks are the right
  way to ship extension-relative doc files.

### What was tricky to build
- Line-buffered stdout handling in `renderViaPlugin`: frames can arrive
  split across chunks or with a final unterminated line; the close handler
  flushes the remainder so a plugin that exits without a trailing newline
  still resolves. The `settled` flag + SIGKILL in `finish()` prevents
  double-resolution races between data/close/timeout paths.

### What warrants a second pair of eyes
- The double-spawn model (describe at scan, render at submit) means a
  plugin's announced schema can go stale between scan and render; the
  plugin sees only `values` so it must tolerate unknown/missing keys.
- SIGKILL (not SIGTERM-then-KILL) on timeout — plugins get no cleanup
  window; acceptable for prompt generators?

### What should be done in the future
- Phase 5 polish: palette contribution, autocomplete ranking, value memory.

### Code review instructions
- Start at `extensions/prompto/plugin.ts` (`renderViaPlugin` stream
  handling), then `plugin-protocol.ts` (`parseAnnouncedTemplate`), then the
  store gate in `store.ts`.
- Validate: `bun test extensions/prompto/tests/plugin.test.ts`; live flow
  per Technical details.

### Technical details
- Live e2e plugin: bash script in `~/.pi/agent/prompts/ptest/hello`
  (global layer → runs without config changes), reading the request with
  `read -r req` and answering log + prompt frames.

## Step 10: Phase 5 polish — palette, autocomplete ranking, value memory (commit 38557c6)

Closed out the polish items worth shipping now: `/px` launcher actions
(expand as default action, reload), a command-palette entry, project-first
ranking in `getArgumentCompletions`, and per-project value memory
(`state.ts`): each template's last-submitted values persist in
`<cwd>/.pi/prompto-state.json` and seed the next form. Merge order in
`collectValues` is defaults → remembered → prefill proposals → user edits,
resolving design §13 open question 6 exactly as leaned (per-project;
remembered values feed the prefill prompt's `{{…}}` context; proposals win
the seed).

Verified in tmux: submitting demo/greeting with "Alice" wrote the state
file; reopening the form in a fresh pi session showed "Alice█" prefilled.

### Prompt Context

**User prompt (verbatim):** (see Step 6)

**Assistant interpretation:** Continue with the remaining plan phases.

**Inferred user intent:** (see Step 6)

**Commit (code):** 38557c6 — "Add prompto Phase 5 polish: palette/launcher actions, value memory"

### What I did
- `state.ts` (load/save with field filtering, best-effort writes), wired
  into `collectValues`; palette/actions/ranking in `index.ts`.
- 56 bun tests still pass; pi load smoke exit 0; tmux value-memory e2e.

### Why
- Value memory removes the retype-the-goal friction that motivated the
  whole feature; palette/launcher integration is the monorepo convention.

### What worked
- Remembered values survive across pi sessions and merge correctly under
  prefill.

### What didn't work
- One tmux verification run came back empty — a chained kill/new-session
  race left a stale session; rerunning with explicit kill + sleep between
  steps worked. Lesson: separate tmux lifecycle commands, don't chain them
  with `&&` around captures.

### What I learned
- Palette `children` are static at registration time, so per-template
  palette items would go stale; a single "expand a template" item that
  opens the picker is the honest shape (per-template items would need
  registration mutation after each scan).

### What was tricky to build
- N/A (small step).

### What warrants a second pair of eyes
- Value memory stores whatever the user last submitted, including
  potentially sensitive goal text, in a project-local json — acceptable?
  (`.pi/` is typically gitignored here, but worth confirming per repo.)

### What should be done in the future
- Left deliberately unimplemented: two-pane picker preview (task 38, the
  current SelectList picker is adequate) and the real-world acceptance
  dogfood (task 40 — needs a session where the expanded docmgr prompt is
  actually run against this repo's docmgr root).

### Code review instructions
- `extensions/prompto/state.ts` and the merge order in `collectValues`
  (`run.ts`); palette/actions block in `index.ts`.
- Validate: submit any template twice, check `.pi/prompto-state.json`.

### Technical details
- State shape: `{ "values": { "<template-name>": { "<field>": <value> } } }`,
  filtered to currently-declared fields on both load and save.

## Step 11: package.json + real yaml parser (commit d5741d8)

The user overruled the dependency-light constraint: added a repo-root
`package.json` with the `yaml` package and replaced the hand-rolled
frontmatter parser. `frontmatter.ts` dropped from ~230 lines to ~50 (fence
splitting, `parse()` delegation, top-level-must-be-a-map check);
frontmatter is now full YAML — anchors, folded scalars, and flow maps work,
pinned by new tests. Net −138 lines.

### Prompt Context

**User prompt (verbatim):** "add package.json + install, that way we can use a proper yaml parser"

**Assistant interpretation:** Add a root package.json, install `yaml`, and
swap the subset parser for it.

**Inferred user intent:** Eliminate the parser-maintenance liability and
the YAML-subset authoring restrictions; a node_modules in the repo is an
acceptable price.

**Commit (code):** d5741d8 — "Replace hand-rolled frontmatter parser with the yaml package"

### What I did
- Root `package.json` (private, `yaml ^2.6.0`), npm lockfile,
  `node_modules/` gitignored; `npm install`.
- Rewrote `frontmatter.ts`; adjusted one test (yaml's tab error message),
  added two (top-level scalar rejected; anchors/folded scalars now parse).
- 58 bun tests pass; pi load smoke exit 0; live tmux check confirmed pi's
  jiti resolves `yaml` from the repo node_modules (form opened, remembered
  values intact).

### Why
- Resolution now works for BOTH loaders from the same place: node-style
  walk-up from `extensions/prompto/*` finds the repo-root `node_modules`
  under bun test and under pi's jiti alike — the mismatch from diary
  Steps 6/8 is gone for real npm packages.

### What worked
- Drop-in: `parseFrontmatter`'s signature and `FmMap`/`FmValue` types were
  already the yaml lib's natural output shape, so `template.ts` and
  `plugin-protocol.ts` needed zero changes.

### What didn't work
- `bun install` failed in this sandbox ("bun is unable to write files to
  tempdir: ReadOnlyFileSystem", even with TMPDIR overridden) — used
  `npm install` instead, hence a package-lock.json rather than bun.lock.

### What I learned
- The pi-package split (`prefill.ts`/`prefill-parse.ts` etc.) is still
  required: `@mariozechner/pi-*` imports remain resolvable only inside pi
  (alias to the earendil fork), so bun-tested modules may use npm deps and
  node builtins, but still not pi packages.

### What was tricky to build
- N/A (deletion-heavy step).

### What warrants a second pair of eyes
- Version skew: pi bundles its own nested `yaml` for its internals while
  extensions now use the repo's `^2.6.0` — both current, API-stable, but
  worth remembering there are two copies in play.

### What should be done in the future
- Optionally migrate other extensions' hand-rolled YAML emission to the
  package; out of scope for this ticket.

### Code review instructions
- Diff `extensions/prompto/frontmatter.ts` (should be ~50 lines) and the
  frontmatter tests; `bun test extensions/prompto/tests/` → 58 pass.

### Technical details
- `.gitignore` gained `node_modules/`; authoring doc's "frontmatter
  caveats" section rewritten (full YAML, top level must be a map).
