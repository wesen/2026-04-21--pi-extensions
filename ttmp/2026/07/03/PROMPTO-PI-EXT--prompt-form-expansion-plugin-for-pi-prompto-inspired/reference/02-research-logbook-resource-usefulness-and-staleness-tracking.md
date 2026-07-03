---
Title: Research logbook — resource usefulness and staleness tracking
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
      Note: Authoritative API source; line anchors drift on pi upgrades (entry 9)
    - Path: extensions/session-summary/index.ts
      Note: Flagged actively wrong against pi 0.78 input-event API (logbook entry 15)
ExternalSources: []
Summary: Per-resource log of every document consulted during the PROMPTO-PI-EXT research and implementation — what was sought, what was found, what is stale, what needs updating.
LastUpdated: 2026-07-03T09:45:00-07:00
WhatFor: Track which resources are useful, out of date, or in need of updating, so future work on this ticket (or adjacent extensions) can skip dead ends and fix stale docs.
WhenToUse: Before re-researching anything about pi extensions, prompto, or the TUI APIs; when deciding which repo docs to update.
---


# Research logbook — resource usefulness and staleness tracking

## Goal

Every document and resource read for PROMPTO-PI-EXT, logged with: what was
being researched, what was sought in that document specifically, why it was
chosen, how it was found, what was useful, what was not, what was out of
date or wrong, and what needs updating. All research was local — no web
resources were consulted; the two source trees plus the installed pi
packages contained everything needed.

**Path abbreviations:** `prompto/` = `/home/manuel/workspaces/2026-07-03/pi-extension-prompto/prompto/`;
`ext/` = `/home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/`;
`pi:` = `/home/manuel/.pi/agent/npm/node_modules/@earendil-works/`.

## Staleness summary (the actionable part)

| Resource | Verdict | Action needed |
|---|---|---|
| `ext/extensions/session-summary/index.ts` input handler | **wrong against current API** | port to `event.text` / `{action:"transform"}` shape (outside this ticket) |
| `@mariozechner/*` import names repo-wide | **aliased legacy naming** | none now; rename only when the fork changes its alias policy |
| Design doc rev 1 on reMarkable (`/ai/2026/07/03/PROMPTO-PI-EXT`) | **superseded** | re-upload post-revision bundle (legacy dropped, plugins/prefill added, yaml package swap) |
| Diary Steps 6–8 parser rationale | **partially superseded** | none — Step 11 records the supersession; read 6→11 together |
| `prompto/pkg/doc/topics/02-prompto-cursor.md` | irrelevant to this ticket | none |
| `ext/README.md` install section | correct but incomplete | could mention the two-clone tool-conflict failure mode (see entry 12) |
| `ext/docs/pi-tui-ui-authoring-guide.md` | current and excellent | none |
| `pi:pi-coding-agent/.../types.d.ts` (0.78.0) | **authoritative** | re-verify line anchors after pi upgrades (0.80.3 already available) |

## Part 1: Legacy prompto (the behavioral inspiration)

### 1. `prompto/README.md`

- **Researching:** what prompto is end-to-end; the user workflow.
- **Looking for:** the elevator model — config, discovery convention, verbs.
- **Why chosen:** entry point of any repo; fastest orientation.
- **How found:** repo root listing.
- **Useful:** the `~/.prompto/config.yaml` + `prompto/` directory convention; the get/list/serve verb overview.
- **Not useful:** installation instructions (we never run the tool).
- **Out of date / wrong:** nothing observed.
- **Needs updating:** nothing for this ticket's purposes.

### 2. `prompto/pkg/prompto.go`

- **Researching:** the three prompt kinds and their rendering semantics.
- **Looking for:** the `Prompto` type, `Render`'s type switch, the executable contract, template loading.
- **Why chosen:** grep for the central type landed here; it is the semantic core of the whole tool (~140 lines).
- **How found:** exploration agent's package walk of `pkg/`.
- **Useful:** the single most valuable file of the legacy tree. The executable contract (`c.Dir = repo`, `PROMPTO_PARENT_PWD`, argv passthrough, stdout capture, `:38-56`) became the ancestor of the plugin protocol; the `FileType` switch shaped the `kind` union.
- **Not useful:** glazed `RunIntoWriter` plumbing (`:57-108`) — we deliberately did not reimplement Go-template rendering.
- **Out of date / wrong:** nothing; it accurately does what the docs say.
- **Needs updating:** n/a (legacy, read-only inspiration).

### 3. `prompto/pkg/repository.go`

- **Researching:** discovery: how files become addressable prompts.
- **Looking for:** the walk, name/group derivation, type detection, watcher.
- **Why chosen:** the other half of the core; `LoadPromptos` referenced from every command.
- **How found:** exploration agent's package walk.
- **Useful:** name = path relative to `prompto/` with extension-stripping for templates (`:80-83`, `:113-118`); dotfile skipping (`:41-46`); group = first segment. Adopted nearly verbatim in `store.ts`.
- **Not useful:** the fsnotify watcher (`:179`) — decision D5 chose scan-on-demand instead.
- **Out of date / wrong:** nothing.
- **Needs updating:** n/a.

### 4. `prompto/cmd/prompto/main.go` and `cmd/prompto/cmds/*.go`

- **Researching:** CLI surface and config loading.
- **Looking for:** viper config shape, the interactive picker, `--print-path`.
- **Why chosen:** command wiring shows what users actually invoke.
- **How found:** exploration agent, `cmd/` walk.
- **Useful:** the huh fuzzy picker in `get.go:35-66` validated that "picker before form" is the right no-args behavior; the config key set (just `repositories`) confirmed how little global config the old tool needed.
- **Not useful:** `--print-path` temp-file handoff and its GC — pi has direct editor injection, so the mechanism is obsolete in our context; `edit.go`/`which.go` (trivial).
- **Out of date / wrong:** nothing observed.
- **Needs updating:** n/a.

### 5. `prompto/pkg/doc/topics/03-creating-promptos.md`

- **Researching:** the legacy template format in author-facing terms.
- **Looking for:** the canonical TemplateCommand YAML example with `parameters:`.
- **Why chosen:** docs state intent; code states mechanics. The YAML example (`:104-127`) is the cleanest statement of the "typed parameter schema" idea.
- **How found:** exploration agent listing `pkg/doc/topics/`.
- **Useful:** the parameters list (name/type/help/default) — the direct blueprint for our `fields:` schema, and the origin of the design's central observation (schema ⇒ generated form).
- **Not useful:** Sprig function documentation (we rejected that dialect).
- **Out of date / wrong:** nothing for its own tool.
- **Needs updating:** n/a.

### 6. `prompto/pkg/server/*` (serve.go, state, handlers, templ views)

- **Researching:** whether the HTTP/HTMX server had ideas worth porting.
- **Looking for:** anything beyond render-to-browser: search, stats, refresh.
- **Why chosen:** completeness — it is a third of the legacy codebase.
- **How found:** exploration agent walk.
- **Useful:** only negatively: confirmed the server is a render/clipboard UI for Cursor-over-ngrok, i.e. solving a problem pi does not have. Justified scoping it out (non-goal #1). Token-count stats via tiktoken noted and rejected.
- **Not useful:** nearly all of it, by design of our scope.
- **Out of date / wrong:** `state.go:46` `CreateTemplateWithFuncs` appears vestigial (html/template funcmap unused since the templ migration) — mild rot in the legacy repo.
- **Needs updating:** only if anyone revives the legacy server; not our problem.

### 7. `prompto/prompto/git-diff.sh`

- **Researching:** what a real executable prompt looks like in practice.
- **Looking for:** how scripts consume `PROMPTO_PARENT_PWD` and argv.
- **Why chosen:** the only substantial executable prompto in the repo — ground truth for the contract.
- **How found:** exploration agent listing the repo's own `prompto/` dir.
- **Useful:** the `cd "$PROMPTO_PARENT_PWD"` idiom (`:90,97`) demonstrated the two-directory ambiguity we then removed (plugin protocol passes one `cwd`, in-band and as the subprocess cwd). Also became `examples/git-diff.plugin.sh` in spirit.
- **Not useful:** its flag parsing (raw executables get argv; plugins get typed values — the whole point of the redesign).
- **Out of date / wrong:** nothing.
- **Needs updating:** n/a.

### 8. `prompto/TODO.md`

- **Researching:** what the original author considered unfinished.
- **Looking for:** metadata/tags/versioning ambitions.
- **Why chosen:** cheap signal about known gaps.
- **How found:** repo root listing.
- **Useful:** confirmed metadata beyond the path was never built — so `title`/`description` frontmatter in our format fills a real, acknowledged gap rather than dropping a feature.
- **Not useful:** the rest of the wishlist.
- **Out of date / wrong:** it is a TODO file from 2024; treat as historical.
- **Needs updating:** n/a.

## Part 2: pi extension system (the platform)

### 9. `pi:pi-coding-agent/dist/core/extensions/types.d.ts` (v0.78.0)

- **Researching:** the exact extension API surface.
- **Looking for:** `ExtensionAPI`, `ExtensionUIContext.custom/select/input/editor`, `sendUserMessage`, `setEditorText`, `InputEvent` shapes, command registration.
- **Why chosen:** it is the *installed* contract — the only artifact that cannot lie about what the runtime accepts.
- **How found:** exploration agent traced `which pi` → the `@earendil-works` install; key line ranges then re-read first-hand (`sed -n '560,590p;835,850p;116,136p'`) before the design was written.
- **Useful:** everything; the design doc's §12 API table is anchored to it. Deciding facts: `sendUserMessage` "always triggers a turn" with `deliverAs`; `custom<T>`'s `done(result)` resolution; `InputEventResult`'s `{action:"transform"}` union (proving drift elsewhere, see entry 15).
- **Not useful:** provider registration, session-tree APIs (out of scope).
- **Out of date / wrong:** nothing — this file *defines* current.
- **Needs updating:** our line-number anchors (design doc §12, diary) will drift when pi upgrades; pi 0.80.3 was already advertised in-session. Re-verify anchors on next pi bump.

### 10. `ext/docs/pi-tui-ui-authoring-guide.md` (1077 lines)

- **Researching:** how to build a modal form component correctly.
- **Looking for:** the `Component` contract, overlay skeletons, keyboard model, width/ANSI safety, pre-ship checklist.
- **Why chosen:** repo's own authoring bible; AGENTS.md points at it.
- **How found:** `docs/` listing via exploration agent; already indexed in `ext/AGENTS.md:5-11`.
- **Useful:** the single most useful platform document. Component contract (`:30-36`), keyboard model + recommended keymap (`:761-806`), width/ANSI helpers (`:808-853`), pre-ship checklist (`:1050-1065`) — all consumed directly by `ui/form.ts`.
- **Not useful:** the declarative `RenderNode` layer (`:497-605`) — more machinery than a single form warrants.
- **Out of date / wrong:** nothing found; matched observed runtime behavior everywhere we tested.
- **Needs updating:** could add a section on **nested overlays** (editor-over-custom) — we had to establish that behavior empirically (diary Step 7); the guide is silent on it.

### 11. `ext/docs/pi-shared-extension-framework-guide.md` (712 lines)

- **Researching:** the monorepo's registration conventions.
- **Looking for:** `registerPiExtension` contribution model: actions, docs, settings, palette.
- **Why chosen:** mandatory convention per `ext/AGENTS.md:13-19`.
- **How found:** `docs/` listing.
- **Useful:** the registry contract (`:69-80`), doc contributions (§5), palette (§8), the worked counter-demo (`:434-545`). Directly shaped `index.ts`'s registration block.
- **Not useful:** dashboard widgets (§7) and schema settings (§6) — no prompto need yet.
- **Out of date / wrong:** nothing observed.
- **Needs updating:** could document that palette `children` are static at registration time (we derived the "one picker item, not per-template items" rule ourselves — diary Step 10).

### 12. `ext/README.md` and `ext/AGENTS.md`

- **Researching:** how extensions are installed, loaded, and tested in this repo.
- **Looking for:** `.pi/settings.json` mechanics, global symlink install, smoke-test commands, house rules.
- **Why chosen:** repo entry points.
- **How found:** repo root.
- **Useful:** the two load paths (project settings vs `~/.pi/agent/extensions` symlinks); `timeout 20 pi --list-models` as load check; the "every extension calls registerPiExtension, doc paths relative" rules.
- **Not useful:** nothing notable.
- **Out of date / wrong:** not wrong, but **incomplete in a way that cost time**: nothing warns that installing extensions globally from one clone while running pi in a second clone of the same repo produces fatal tool-name conflicts (`Tool "tui_demo_card" conflicts` — diary Step 6). We hit this live.
- **Needs updating:** add a "two clones of this repo" caveat to the README install section.

### 13. `ext/extensions/tui-showcase/index.ts` (691 lines)

- **Researching:** working form mechanics in a real overlay.
- **Looking for:** text-field key handling, toggles, submit row, overlay opening options, `SelectList`/`SettingsList` composition.
- **Why chosen:** the only in-repo component with an actual form tab; flagged by the exploration agent as closest prior art.
- **How found:** exploration agent's extension inventory, then read in depth.
- **Useful:** printable-key/backspace editing (`:193-203`), submit-row `done()` (`:214-227`), overlay options (`:684-688`), the `SelectList` picker pattern (`:448-479`) which became `ui/picker.ts` nearly structurally.
- **Not useful:** gradients, palettes, kanban demos — showcase noise around the useful kernel; `SettingsList` (`:481-515`) evaluated and rejected for form use (decision D4).
- **Out of date / wrong:** nothing; it loads and runs today (it even produced the two-clone conflict, proving it loads twice).
- **Needs updating:** n/a — demo code doing demo work.

### 14. `ext/extensions/pinned-skills/ui.ts`, `config.ts`, `index.ts`

- **Researching:** production-quality modal structure and config persistence.
- **Looking for:** render caching/dirty tracking, scroll windowing, frame drawing; the global/project JSON config pattern.
- **Why chosen:** the repo's best non-demo modal; agent-flagged.
- **How found:** exploration agent inventory.
- **Useful:** `render` cache + `invalidate` + `markDirty` (`ui.ts:122-165`), `ensureScroll` (`:180-185`), the frame-drawing helpers (`:243-282`) — transplanted into `ui/form.ts`; `config.ts:43-56` load/merge/warning pattern — transplanted into our `config.ts`.
- **Not useful:** the skills-snapshot domain logic; the `/`-search sub-mode (picker got `SelectList`'s built-in filter instead).
- **Out of date / wrong:** nothing observed.
- **Needs updating:** n/a.

### 15. `ext/extensions/session-summary/index.ts`

- **Researching:** prior art for the `input` event (considered for inline expansion, §9 of the design doc).
- **Looking for:** how an extension transforms user input pre-agent.
- **Why chosen:** only extension hooking `input`.
- **How found:** exploration agent grep for `pi.on(`.
- **Useful:** *as a warning*: its handler reads `event.prompt`, checks `event.source !== "user"`, returns `{prompt}` (`:213-223`) — none of which matches the installed 0.78 types (`event.text`, `source: interactive|rpc|extension`, `{action:"transform", text}`).
- **Not useful:** as a pattern to copy — that is the point.
- **Out of date / wrong:** **actively wrong against the current API.** Either it silently no-ops or survives on a compatibility shim; untested by us.
- **Needs updating:** yes — port its input handler to the 0.78 event shape. Recorded as design-doc risk #2; outside this ticket's scope.

### 16. `ext/extensions/selective-compaction/index.ts` and `prompt.ts`

- **Researching:** how an extension calls the LLM outside the agent loop.
- **Looking for:** `complete()` usage, credential plumbing, loader UX, abort.
- **Why chosen:** only extension doing exactly this; agent-flagged.
- **How found:** exploration agent inventory; re-read first-hand before Phase 3 (`sed -n '100,170p'`).
- **Useful:** the complete recipe: `getApiKeyAndHeaders` (`:142-145`), `complete(model, {systemPrompt, messages}, {apiKey, headers, maxTokens, signal})` (`:148-160`), `BorderedLoader` with `onAbort` inside `ui.custom` (`:116-127`), content-part text extraction. `prefill.ts` is structurally this file's pattern.
- **Not useful:** compaction domain logic and session forking.
- **Out of date / wrong:** nothing; compiled types accepted the same shapes.
- **Needs updating:** n/a.

### 17. `ext/extensions/launcher/index.ts` (spot read)

- **Researching:** how registered doc contributions are rendered.
- **Looking for:** whether `PiExtensionDoc.path` is extension-relative.
- **Why chosen:** it is the consumer of the registry docs.
- **How found:** grep for `doc.path`.
- **Useful:** `:244` reads `doc.path` with bare `fs.readFileSync` — i.e. cwd-relative, NOT extension-relative. Decided our docs use `load:` callbacks with `import.meta.url`-derived paths.
- **Not useful:** the rest (not read).
- **Out of date / wrong:** behavior is arguably a footgun rather than a bug.
- **Needs updating:** the framework guide could state "path is cwd-relative; use load for extension-shipped files".

### 18. Extension inventory sweep (all 24 `ext/extensions/*` — one-liner depth)

- **Researching:** prior art coverage: does anything already do prompt expansion?
- **Looking for:** overlap, reusable patterns, naming conventions.
- **Why chosen:** avoid rebuilding something that exists.
- **How found:** exploration agent directory walk.
- **Useful:** established the greenfield claim (nothing does template expansion; `sendUserMessage`/`setEditorText` unused repo-wide) and surfaced the three deep-read targets (13/14/16) plus `modal-shortcut-lab` as the overlay test harness.
- **Not useful:** 19 of 24 extensions individually — but the sweep's value was exactly in being able to dismiss them.
- **Out of date / wrong:** n/a at one-liner depth.
- **Needs updating:** n/a.

## Part 3: Runtime and toolchain facts established empirically

### 19. `pi:pi-ai/dist/stream.d.ts` and `pi:pi-tui/dist/keys.d.ts`

- **Researching:** exact `complete()` signature; key-matching API for the form.
- **Looking for:** `complete` params; `Key`/`matchesKey` names for arrows/tab/shift-combos.
- **Why chosen:** installed types beat guide prose (same rationale as entry 9).
- **How found:** grep in the installed packages.
- **Useful:** `complete<TApi>(model, context, options)` confirmed; `Key.left/right/tab`, `Key.shift("tab")`, `Key.ctrl("u")` all verified before writing `ui/form.ts`.
- **Not useful:** kitty-protocol internals.
- **Out of date / wrong:** nothing.
- **Needs updating:** same anchor-drift caveat as entry 9.

### 20. `pi:pi-coding-agent/package.json` + node_modules layout

- **Researching:** whether extensions can import a real YAML parser.
- **Looking for:** is `yaml` a pi dependency, and where does it physically live?
- **Why chosen:** dependency question blocking the frontmatter design.
- **How found:** `ls node_modules`, `node -e "require('…/package.json')"`, `require.resolve` probing.
- **Useful:** `yaml` is a direct dep but *nested* (not hoisted); `typebox` precedent (image-qa imports it bare) proved pi's loader resolves from pi's package context.
- **Not useful:** —
- **Out of date / wrong:** my initial inference ("bun + NODE_PATH will reach it") was **wrong**; empirically disproven in a scratch test (bun ignores NODE_PATH). This drove the hand-rolled parser (Step 6), later superseded by the root package.json (Step 11).
- **Needs updating:** nothing to update; the lesson is recorded in diary Steps 6/11 and the vault note's loader-duality section.

### 21. Workspace `AGENT.md` (repo root, one level up)

- **Researching:** house rules for building/testing in this workspace.
- **Looking for:** TUI testing guidance, Go rules (for reading prompto), tmux conventions.
- **Why chosen:** it is the standing instruction file.
- **How found:** workspace root listing at session start.
- **Useful:** "use tmux + capture-pane for TUIs" became the entire e2e methodology; batching send-keys advice.
- **Not useful:** Go build/lint rules (we wrote no Go).
- **Out of date / wrong:** nothing.
- **Needs updating:** n/a.

## Part 4: This ticket's own documents (self-tracking)

### 22. Design doc (`design-doc/01-…analysis-design-and-implementation-guide.md`)

- **Status:** revision 2 (no legacy, JSONL plugins, LLM prefill) matches the implementation with one knowing deviation: §10 Phase 1's "frontmatter parse via YAML" note went through hand-rolled-parser (Step 6) and back to the `yaml` package (Step 11) — the doc text is again accurate, the intermediate history lives in the diary.
- **Out of date:** the **reMarkable copy is revision 1** — it still describes legacy `prompto/` repo scanning and lacks §7.7/§7.8 and decisions D6/D7.
- **Needs updating:** re-upload the bundle (this logbook's upload includes the current revision; see below).

### 23. Investigation diary (`reference/01-investigation-diary.md`, Steps 1–12)

- **Status:** current; the only place the parser detour and its reversal are both recorded.
- **Out of date:** Steps 6–8 describe the hand-rolled-parser rationale as if standing; Step 11 supersedes it. Read chronologically, not as reference.
- **Needs updating:** nothing — diaries are append-only by design.

## Method note

Two thorough exploration agents produced the initial maps (prompto
architecture; pi extension API + prior art). Every fact the design then
*depended on* was re-verified first-hand against the installed types or by
running code (the `custom`/`sendUserMessage`/`InputEvent` spot-check, the
`complete()` re-read, the bun/NODE_PATH experiment, the tmux e2e runs).
The one inference taken on faith that turned out wrong — bun resolving
pi's nested packages — was exactly the one that had not been verified
before designing around it.
