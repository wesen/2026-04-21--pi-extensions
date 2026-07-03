---
Title: Prompto-inspired prompt form expansion extension for pi — analysis, design, and implementation guide
Ticket: PROMPTO-PI-EXT
Status: active
Topics:
    - pi-extensions
    - prompts
    - templates
    - tui
    - forms
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../../.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
      Note: Authoritative pi extension API surface (v0.78.0) the design is typed against
    - Path: 2026-04-21--pi-extensions/docs/pi-tui-ui-authoring-guide.md
      Note: Component contract
    - Path: 2026-04-21--pi-extensions/extensions/_shared/registry.ts
      Note: Mandatory monorepo registry contract for the new extension
    - Path: 2026-04-21--pi-extensions/extensions/pinned-skills/config.ts
      Note: Global/project JSON persistence pattern reused for prompto.json
    - Path: 2026-04-21--pi-extensions/extensions/pinned-skills/ui.ts
      Note: Production modal component patterns (frame
    - Path: 2026-04-21--pi-extensions/extensions/selective-compaction/index.ts
      Note: |-
        Gather-generate-review-act flow the /prompto UX mirrors
        complete()+BorderedLoader pattern the LLM prefill design copies
    - Path: 2026-04-21--pi-extensions/extensions/tui-showcase/index.ts
      Note: Form tab + overlay opening prior art for the modal form component
    - Path: prompto/pkg/prompto.go
      Note: Prompto type
    - Path: prompto/pkg/repository.go
      Note: Discovery walk
ExternalSources: []
Summary: Intern-ready analysis, design, and implementation guide for a pi extension that discovers prompt templates (prompto-style), renders a modal TUI form from each template's parameter schema, and expands the filled-in prompt into the pi editor or directly into the agent loop.
LastUpdated: 2026-07-03T08:30:00-07:00
WhatFor: Implement the prompto pi extension without re-deriving how prompto or the pi extension API works.
WhenToUse: Read before writing any code for the prompto extension; use the API appendix as a reference during implementation.
---



# Prompto-inspired prompt form expansion extension for pi — analysis, design, and implementation guide

## 1. Executive Summary

This document specifies a new pi extension, working name **`prompto`**, that
brings the core ideas of the legacy Go tool
[`prompto`](/home/manuel/workspaces/2026-07-03/pi-extension-prompto/prompto)
into the pi coding agent as a first-class interactive feature.

The one-sentence pitch: **type `/prompto docmgr/create-ticket`, get a modal
form asking for the ticket goal, title, topics, and analysis-plan options;
press Submit; the filled-in prompt lands in your editor (or goes straight to
the agent).**

The legacy prompto tool solved prompt *storage and rendering*: it discovered
prompt files in `prompto/` directories across configured git repositories and
rendered them to stdout — plain files verbatim, executable scripts by running
them, and YAML "template commands" by interpolating typed parameters into a
Go template. What it never had was an *interactive front end*: parameters were
passed as CLI flags, and the output had to be copy-pasted into a chat window.

pi's extension API supplies exactly the missing half: slash commands with
argument autocompletion, modal overlay components with full keyboard handling,
simple built-in dialogs (`select` / `input` / `confirm` / `editor`), and two
typed submission paths (`ui.setEditorText` for review-before-send,
`pi.sendUserMessage` for direct dispatch). Nothing in the existing extension
fleet does prompt-template expansion yet, but three extensions provide all the
UI prior art we need: `tui-showcase` (a working form tab in a modal overlay),
`pinned-skills` (a production two-pane checklist modal with search), and
`selective-compaction` (a complete gather → generate → review → act flow).

The proposed design:

- **Templates are Markdown files with YAML frontmatter.** The frontmatter
  declares typed form fields (`string`, `text`, `boolean`, `choice`,
  `multichoice`, `number`); the Markdown body is the prompt with
  `{{fieldName}}` placeholders and minimal conditional blocks.
- **Discovery is two-layered**: project-local `.pi/prompts/` and global
  `~/.pi/agent/prompts/`. There is deliberately **no legacy `prompto/`
  directory support** — the old tool is design inspiration, not a
  compatibility target.
- **The form is generated from the schema**, rendered as a centered modal via
  `ctx.ui.custom(...)`, one row per field, Tab/arrow navigation, Enter to
  submit, Esc to cancel.
- **Fields can be prefilled by the LLM.** A template may declare a
  `prefill:` prompt; before the form opens, the extension runs a one-shot
  completion (the `selective-compaction` pattern: `complete()` from
  `@mariozechner/pi-ai` behind an abortable loader) that proposes field
  values — e.g. deriving the next ticket number from the repo — which the
  user then reviews and edits in the form.
- **Dynamic prompts are JSONL plugins**: self-describing executables that
  speak a small JSONL stdio protocol (`describe` → template list with field
  schemas; `render` → prompt text). They replace legacy prompto's raw
  executable scripts and are discovered automatically alongside templates.
- **Submission defaults to "paste into editor"** so the user reviews the
  expanded prompt before sending; templates can opt into auto-send.

The document is written for an engineer new to this codebase. Sections 3–5
explain the two existing systems from scratch with file-level evidence.
Sections 6–9 give the design with decision records, pseudocode, and diagrams.
Section 10 is a phased, file-by-file implementation plan. Section 12 is an
API quick-reference appendix.

## 2. Problem Statement and Scope

### 2.1 Problem

Reusable prompts today live in two disconnected places:

1. **Legacy prompto repositories** — `prompto/` directories in git repos,
   addressable via the `prompto` CLI, but only renderable to stdout with CLI
   flags. There is no path from "I have a parameterized prompt" to "it is in
   my pi conversation" other than shelling out and copy-pasting.
2. **Ad-hoc muscle memory** — prompts retyped by hand in pi, with all their
   boilerplate (docmgr conventions, analysis-plan structure, output-format
   instructions) reproduced imperfectly each time.

The concrete motivating example: creating a docmgr ticket with a project
analysis plan. That prompt has a stable skeleton (create ticket, add design
doc + diary, follow investigation methodology) and a handful of per-use
variables (goal, title, topics, which analysis sections to include, upload to
reMarkable or not). Today the user retypes or copy-edits the whole thing.
The desired UX is: invoke one command, fill in a short form, get the fully
expanded prompt.

### 2.2 Goals

1. A pi slash command (`/prompto`) that lists/filters available prompt
   templates and expands one through an interactive modal form.
2. A template format that declares typed parameters so the form can be
   *generated*, not hand-built per prompt.
3. Discovery of templates from project (`.pi/prompts/`) and global
   (`~/.pi/agent/prompts/`) locations.
4. Dynamic prompts via **self-describing JSONL plugins**: executables that
   announce their own templates (name, fields, submit policy) when queried
   and render prompt text on request.
5. **LLM prefill**: a template can carry a prompt that asks the model to
   propose field values (e.g. the next ticket number, a suggested title)
   before the form opens; the user reviews the proposals in the form.
6. A review-before-send default, with per-template auto-send opt-in.
7. Ship as a standard extension in the `2026-04-21--pi-extensions` monorepo,
   following its `registerPiExtension` conventions.

### 2.3 Non-goals (explicitly out of scope)

- Re-implementing prompto's HTTP server / HTMX web UI
  (`prompto/pkg/server/`), favorites, or token-count statistics.
- **Any legacy compatibility with the prompto tool.** No `prompto/`
  repository scanning, no `~/.prompto/config.yaml`, no glazed TemplateCommand
  YAML parsing, no bridge to an installed `prompto` binary. The old tool is
  design inspiration only; existing prompt content gets ported by hand (or by
  an LLM) into the new format.
- Editing templates from within pi (use `$EDITOR` / the `docmgr` extension).
- Any change to pi core; everything must be possible with the public
  extension API of `@earendil-works/pi-coding-agent` 0.78.0.

## 3. Background for the intern: the two systems involved

Before the design makes sense you need a working model of (a) what the legacy
prompto tool does, and (b) how pi extensions work. Both are described from
source evidence; every load-bearing claim has a file reference you can open.

Paths below are abbreviated:

- `prompto/…` = `/home/manuel/workspaces/2026-07-03/pi-extension-prompto/prompto/…`
- `ext/…` = `/home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/…`
- `types.d.ts` = `/home/manuel/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`

## 4. Current state A: the legacy prompto tool (evidence-based)

### 4.1 What it is

prompto is a Go CLI (module `github.com/go-go-golems/prompto`, built on the
go-go-golems stack: clay, glazed, templ, huh). Its mental model:

- A user-level config file `~/.prompto/config.yaml` lists absolute paths of
  git repositories (`prompto/cmd/prompto/main.go:51-60`):

  ```yaml
  repositories:
    - /path/to/repo1
    - /path/to/repo2
  ```

- Each repository may contain a top-level **`prompto/` directory**. Every
  file under it is a prompt ("a prompto"), addressed by its path relative to
  that directory — e.g. `cms/data/form-dsl.yaml` — where the **first path
  segment is the group** (`prompto/pkg/repository.go:80-83`).

- CLI verbs (`prompto/cmd/prompto/cmds/commands.go:19-27`): `get`, `list`,
  `serve`, `which`, `edit`, plus clay-provided `config repositories
  add|remove|get` and a glazed `help` system.

The user workflow: register repos once, drop prompt files into `prompto/`
subdirectories, then `prompto get <group>/<name> [flags]` prints the rendered
prompt to stdout for pasting into an LLM chat.

### 4.2 The three prompt kinds

The central value type (`prompto/pkg/prompto.go:26-33`):

```go
type Prompto struct {
    Name       string    // "group/rest/of/path", extension stripped for templates
    Group      string    // first path segment
    Type       FileType  // Plain | Executable | TemplateCommand
    Command    *cmds.TemplateCommand // glazed, only for TemplateCommand
    FilePath   string
    Repository string
}
```

Type detection happens at discovery time (`prompto/pkg/repository.go:93-119`):

1. Default: **Plain** — `Render` just reads the file
   (`prompto/pkg/prompto.go:109`).
2. If the executable bit is set (`info.Mode()&0111 != 0`): **Executable**.
3. Else if the extension is `.yaml`/`.yml` *and* the file parses as a glazed
   `TemplateCommand`: **TemplateCommand** — and the extension is stripped
   from the addressable name (`repository.go:113-118`).

`Prompto.Render(repo, restArgs)` (`prompto/pkg/prompto.go:35`) is the single
polymorphic entry point, switching on the type.

### 4.3 Template prompts: a ready-made form schema

TemplateCommand YAMLs are glazed command definitions
(`prompto/pkg/doc/topics/03-creating-promptos.md:104-127`):

```yaml
name: greeting
short: Generate a greeting
parameters:
  - name: name
    type: string
    help: Name to greet
  - name: language
    type: string
    default: English
template: |
  {{- if eq .language "English" -}}Hello, {{ .name }}!{{- end -}}
```

Rendering (`prompto/pkg/prompto.go:57-108`) walks the command's parameter
schema, gathers `--flag value` pairs and positional args from the CLI
remainder, and runs the Go text/template (Sprig functions available through
glazed).

**This is the single most important observation in this document:** the
`parameters:` list — name, type, help text, default — is *exactly* the
information needed to auto-generate an interactive form. Legacy prompto sent
these parameters through CLI flag parsing; the pi extension sends them
through a modal TUI form instead. The design in section 7 is essentially
"keep this schema idea, swap the front end."

### 4.4 Executable prompts: the two-directory contract

Executable prompts produce *dynamic* prompt content — for example
`prompto/prompto/git-diff.sh` emits a formatted `git diff` of the caller's
repository. The execution contract (`prompto/pkg/prompto.go:38-56`):

```go
c := exec.Command(path, restArgs...)
c.Dir = repo                                        // cwd = prompt repo root
c.Env = append(os.Environ(), "PROMPTO_PARENT_PWD=" + currentDir)
c.Stdout = &out                                     // stdout is the prompt
```

- The script runs with **cwd = the prompt repository root**.
- The **caller's original cwd** is passed as `PROMPTO_PARENT_PWD`; scripts
  that want to inspect the caller's project `cd "$PROMPTO_PARENT_PWD"` first
  (see `prompto/prompto/git-diff.sh:90-97`).
- Extra CLI args are forwarded verbatim as argv; only stdout is captured;
  non-zero exit is an error.

We do **not** run legacy executable promptos (§2.3), but this contract is the
direct ancestor of the JSONL plugin protocol in §7.8: dynamic prompts as
subprocesses with a well-defined environment and stdout as the payload — just
with a structured protocol instead of raw argv/stdout.

### 4.5 What prompto never had

- **No interactive parameter entry.** `prompto get` without a name opens a
  huh fuzzy *picker* (`prompto/cmd/prompto/cmds/get.go:35-66`), but the
  parameters themselves are CLI-only.
- **No integration with any agent.** Output goes to stdout or, with
  `--print-path`, to a temp file (`get.go:97-131`).
- **No metadata beyond the path.** Grouping is the first path segment; there
  are no tags, descriptions (outside template YAMLs), or usage hints
  (`prompto/TODO.md` lists metadata as unbuilt).

## 5. Current state B: the pi extension system (evidence-based)

### 5.1 What a pi extension is

A pi extension is a TypeScript module whose default export is a factory
receiving the extension API (`types.d.ts:1005`):

```ts
export default function prompto(pi: ExtensionAPI): void | Promise<void> { … }
```

pi loads extensions from two places:

1. **Project settings** — `.pi/settings.json` next to the project, with an
   `"extensions"` array of module paths relative to the settings file. This
   monorepo's `ext/.pi/settings.json` lists its extensions as
   `"../extensions/<name>/index.ts"`.
2. **Global directory** — `~/.pi/agent/extensions/`; the monorepo convention
   is to symlink extension folders in (`ext/README.md:82-93`) and run
   `/reload` or start a fresh session.

Two registrations happen at load time, and it is important not to confuse
them:

- **`registerPiExtension({...})`** — a *repo-local* shared registry
  (`ext/extensions/_shared/registry.ts:218`) that records the extension's
  contributions (id, name, description, commands, actions, docs, settings,
  widgets, palette items) into a global map. The `/px` launcher and the
  command palette read this. It does **not** hook pi itself. Every extension
  in the monorepo must call it (`ext/AGENTS.md:13-19`).
- **`pi.registerCommand` / `pi.on` / `pi.registerShortcut` / …** — the actual
  pi runtime hooks (`types.d.ts:816-833`).

> **Version note.** Extensions import from `@mariozechner/pi-coding-agent`,
> but the active installed agent is the renamed fork
> `@earendil-works/pi-coding-agent` **v0.78.0**
> (`/home/manuel/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/`).
> Its `dist/core/extensions/types.d.ts` is the authoritative API surface.
> Beware drift in old code: `ext/extensions/session-summary/index.ts:213-223`
> handles the `input` event with a *legacy* shape (`event.prompt`, result
> `{prompt}`); the 0.78 types use `event.text` and result
> `{action: "transform", text}` (`types.d.ts:566-587`). Write new code
> against 0.78.

### 5.2 The API surface prompto needs

**Slash command registration** (`types.d.ts:818`, options shape
`types.d.ts:770-776`):

```ts
pi.registerCommand("prompto", {
  description: "Expand a prompt template through a form",
  getArgumentCompletions: (prefix) => AutocompleteItem[] | Promise<…> | null,
  handler: async (args: string, ctx: ExtensionCommandContext) => { … },
});
```

`args` is the raw string typed after `/prompto`; `getArgumentCompletions`
powers autocomplete of template names as the user types.

**Dialog primitives** on `ctx.ui` (`ExtensionUIContext`, `types.d.ts:67-191`):

| Method | Signature (abridged) | Use |
|---|---|---|
| `select` | `(title, options: string[], opts?) → Promise<string \| undefined>` | single choice |
| `input` | `(title, placeholder?, opts?) → Promise<string \| undefined>` | one-line text |
| `confirm` | `(title, message, opts?) → Promise<boolean>` | yes/no |
| `editor` | `(title, prefill?) → Promise<string \| undefined>` | multi-line text overlay |
| `notify` | `(message, "info"\|"warning"\|"error")` | toasts |

**Custom modal overlays** — the real form path
(`types.d.ts` `custom<T>`, verified signature):

```ts
ctx.ui.custom<T>(
  (tui, theme, keybindings, done: (result: T) => void) => Component & { dispose?() },
  { overlay: true,
    overlayOptions: { anchor: "center", width: "85%", maxHeight: "80%", margin: 1 } }
): Promise<T>
```

The factory returns a `Component` — pi-tui's line-renderer contract
(`ext/docs/pi-tui-ui-authoring-guide.md:30-36`):

```ts
interface Component {
  render(width: number): string[];   // return styled lines
  handleInput?(data: string): void;  // raw keystrokes while focused
  invalidate(): void;                // drop render cache
}
```

Calling `done(value)` closes the overlay and resolves the promise. State
changes must call `tui.requestRender()`. Keyboard handling uses
`matchesKey(data, Key.enter | Key.escape | Key.up | Key.tab | …)` from
`@mariozechner/pi-tui`.

**Getting the expanded prompt into the conversation** — two typed paths,
both currently unused by any extension in the monorepo (greenfield):

1. `ctx.ui.setEditorText(text)` / `ctx.ui.pasteToEditor(text)`
   (`types.d.ts`, verified) — put text into the input editor; the *user*
   presses Enter. Review-before-send.
2. `pi.sendUserMessage(content, { deliverAs? })` (`types.d.ts:843-845`,
   verified: "Always triggers a turn") — dispatch immediately; `deliverAs:
   "steer" | "followUp"` controls queueing while the agent is streaming.

**Useful context members** (`ExtensionContext`, `types.d.ts:207-236`):
`ctx.cwd`, `ctx.hasUI`, `ctx.isIdle()`, `ctx.ui.theme` (semantic color roles:
`accent`, `muted`, `dim`, `success`, `error`, `border`, …). Command handlers
get the richer `ExtensionCommandContext` (`types.d.ts:241-276`) adding
`waitForIdle()`, `newSession()`, etc.

**Subprocess execution**: `pi.exec(cmd, args, opts)` (`types.d.ts:855`) —
available, though `plugin.ts` uses `child_process.spawn` directly (§8.5).

### 5.3 Prior art in the monorepo (read these before coding)

1. **`ext/extensions/tui-showcase/index.ts` (691 lines)** — the closest
   thing to our modal form that already exists. Its overlay class
   (`:126-371`) has a **Form tab** demonstrating text fields (printable keys
   appended in `handleInput`, `:193-203`; backspace `:194-197`), checkbox
   toggles, a slider, and a Submit row that calls `done(...)`
   (`:214-227`, render at `:306-322`). It also shows opening overlays with
   `ctx.ui.custom(..., { overlay: true, overlayOptions: { width: "86%",
   maxHeight: "88%", anchor: "center", margin: 1 } })` (`:684-688`) and the
   widget-composition alternative: `SelectList` picker (`:448-479`) and
   `SettingsList` (`:481-515`), a ready-made multi-field settings form.
2. **`ext/extensions/pinned-skills/ui.ts` (282 lines)** — a production
   two-pane modal (`PinnedSkillsChecklist implements Component`): cached
   `render()` + `invalidate()` (`:122-160`), `markDirty()` (`:162-165`),
   `/`-to-search sub-mode (`:57-89`), space-to-toggle (`:112-119`), scroll
   windowing (`:180-185`), hand-drawn bordered frame with list/details split
   (`:243-282`). Its config persistence
   (`ext/extensions/pinned-skills/config.ts:43-56`) — global JSON under
   `~/.pi/agent/`, project JSON under `<cwd>/.pi/` — is the storage pattern
   we reuse.
3. **`ext/extensions/selective-compaction/index.ts` (184 lines)** — the full
   multi-step UX arc prompto mirrors: gather input (`select`), long
   operation behind a loader overlay with abort (`:112-135`), review via
   `ctx.ui.editor` (`:86`), `confirm` (`:92`), act. For prompto the final
   "act" becomes `setEditorText` / `sendUserMessage`.

Authoring guides: `ext/docs/pi-shared-extension-framework-guide.md`
(registry contributions, worked example at `:434-545`) and
`ext/docs/pi-tui-ui-authoring-guide.md` (component contract, modal
skeletons `:127-395`, keyboard model `:761-806`, width/ANSI safety
`:808-853`, pre-ship checklist `:1050-1065`). Testing:
`ext/docs/pi-testing-guide.md` — `timeout 20 pi --list-models` as a load
smoke test, tmux for interactive testing.

## 6. Gap analysis

| Needed for the feature | Legacy prompto (inspiration only) | pi extension API | Gap to build |
|---|---|---|---|
| Prompt storage & discovery | ✅ `prompto/` dirs, multi-repo config | ❌ nothing built-in | TS discovery over two pi-native directories |
| Typed parameter schema | ✅ glazed `parameters:` | ❌ | New frontmatter `fields:` schema (simpler, TS-friendly) |
| Template rendering | ✅ Go text/template + Sprig | ❌ | Small `{{…}}` interpolation engine (deliberately minimal) |
| Interactive form | ❌ CLI flags only | ✅ `ui.custom` modal, `SettingsList`, dialogs | Form component generated from schema |
| Dynamic prompts | ✅ raw executable scripts | ✅ subprocess spawning | JSONL plugin protocol + self-discovery |
| LLM prefill of parameters | ❌ | ✅ `complete()` from `@mariozechner/pi-ai` (pattern: `selective-compaction/index.ts:137-160`) | Prefill orchestration + JSON parsing + loader UX |
| Fuzzy template picker | ✅ huh picker (CLI) | ✅ `SelectList` / custom overlay | Picker overlay |
| Agent integration | ❌ stdout/copy-paste | ✅ `setEditorText`, `sendUserMessage` | Wire-up + per-template submit policy |
| Autocomplete of names | ❌ | ✅ `getArgumentCompletions` | Trivial wiring |

Nothing requires pi core changes; every gap closes inside one extension
directory.

## 7. Proposed design

### 7.1 Architecture overview

```
                 ┌──────────────────────────────────────────────────┐
                 │              extensions/prompto/                 │
                 │                                                  │
  /prompto ─────▶│ index.ts        command + registry registration  │
  (slash cmd)    │    │                                             │
                 │    ▼                                             │
                 │ store.ts        discovery & caching              │
                 │    │   sources (project wins on collision):      │
                 │    │    1. <cwd>/.pi/prompts/**           (proj) │
                 │    │    2. ~/.pi/agent/prompts/**       (global) │
                 │    │   executables in either layer are JSONL     │
                 │    │   plugins → plugin.ts sends "describe"      │
                 │    ▼                                             │
                 │ template.ts     frontmatter parse + {{}} render  │
                 │ plugin.ts       JSONL stdio client (§7.8)        │
                 │ prefill.ts      LLM field prefill (§7.7)         │
                 │    │                                             │
                 │    ▼                                             │
                 │ ui/picker.ts    template chooser (filter list)   │
                 │ ui/form.ts      schema-driven modal form         │
                 │    │                                             │
                 │    ▼                                             │
                 │ submit:  ctx.ui.setEditorText(prompt)   (default)│
                 │      or  pi.sendUserMessage(prompt)   (opt-in)   │
                 └──────────────────────────────────────────────────┘
```

Runtime flow for the motivating example:

```
user: /prompto docmgr/create-ticket
  │
  ├─ store.resolve("docmgr/create-ticket")        exact name match
  ├─ template.parse(file)                         frontmatter → FormSchema
  ├─ prefill (optional)                           complete() proposes values
  │     "Ticket number: PROMPTO-PI-EXT-2, …"      behind abortable loader
  ├─ ctx.ui.custom(FormComponent(schema))         modal opens, prefilled
  │     Goal:    [ analyze the frobnicator____ ]  (text)
  │     Title:   [ FROB-ANALYSIS_____________ ]   (string)
  │     Topics:  [x] analysis  [ ] refactor …     (multichoice)
  │     Plan:    (•) full  ( ) light               (choice)
  │     Upload to reMarkable: [x]                  (boolean)
  │     ── [ Submit ]  [ Cancel ] ──
  │
  ├─ render(body, values)                         placeholders filled
  └─ ctx.ui.setEditorText(expanded)               user reviews, presses ⏎
```

### 7.2 Template format

A template is a Markdown file with YAML frontmatter. Example —
`.pi/prompts/docmgr/create-ticket.md`, the motivating use case:

```markdown
---
name: docmgr/create-ticket            # optional; defaults to path-derived name
title: Create docmgr ticket + analysis plan
description: Scaffold a docmgr ticket and ask for a project analysis plan
submit: editor                        # editor (default) | auto
fields:
  - name: goal
    label: Ticket goal
    type: text                        # multi-line
    required: true
    help: What should this ticket achieve?
  - name: ticketTitle
    label: Ticket title
    type: string
    placeholder: Short imperative title
  - name: topics
    label: Topics
    type: multichoice
    choices: [analysis, design, refactor, tui, docs]
    default: [analysis]
  - name: planDepth
    label: Analysis plan depth
    type: choice
    choices: [full, light]
    default: full
  - name: uploadRemarkable
    label: Upload report to reMarkable when done
    type: boolean
    default: true
prefill:                              # optional LLM prefill (§7.7)
  fields: [ticketTitle]
  prompt: |
    Given this ticket goal, propose a short SCREAMING-KEBAB ticket title
    (like FROB-ANALYSIS). Goal: {{goal}}
  when: after-required                # ask goal first, then prefill the rest
---
Create a new docmgr ticket titled "{{ticketTitle}}" with topics
{{topics}}. The goal of the ticket:

{{goal}}

Then write a project analysis plan.
{{#if planDepth == "full"}}
Make the plan exhaustive: architecture map, evidence with file references,
risk register, and a phased implementation outline.
{{/if}}
{{#if uploadRemarkable}}
When the analysis document is complete, upload it to reMarkable.
{{/if}}
```

Schema, as TypeScript (`extensions/prompto/types.ts`):

```ts
type FieldType = "string" | "text" | "boolean" | "choice" | "multichoice" | "number";

interface TemplateField {
  name: string;            // placeholder name, [a-zA-Z_][a-zA-Z0-9_]*
  label?: string;          // form row label; defaults to name
  type: FieldType;         // defaults to "string"
  help?: string;           // one-line hint under the field
  placeholder?: string;    // ghost text for string/text
  default?: string | number | boolean | string[];
  required?: boolean;      // Submit blocked while empty
  choices?: string[];      // for choice/multichoice
}

interface PrefillSpec {
  fields: string[];        // which fields the LLM may propose values for
  prompt: string;          // may reference already-known values via {{name}}
  when?: "before-form" | "after-required";  // default before-form
}

interface PromptTemplate {
  name: string;            // addressable id, e.g. "docmgr/create-ticket"
  group: string;           // first path segment, e.g. "docmgr"
  title?: string;
  description?: string;
  submit: "editor" | "auto";
  fields: TemplateField[];
  prefill?: PrefillSpec;
  body: string;            // markdown after frontmatter (empty for plugins)
  filePath: string;        // absolute (template file or plugin executable)
  source: "project" | "global";            // discovery layer
  kind: "template" | "plain" | "plugin";   // plugin: rendered via §7.8
}
```

Rendering dialect — deliberately tiny (see Decision D2):

- `{{name}}` → the field value. `multichoice` joins with `", "`; booleans
  render `true`/`false` (usually only used inside `{{#if}}`).
- `{{#if name}} … {{/if}}` — included when the value is truthy (non-empty
  string, non-empty list, `true`).
- `{{#if name == "literal"}} … {{/if}}` — string equality only.
- No loops, no nesting of `#if`, no filters, no expressions. Anything fancier
  belongs in a JSONL plugin (§7.8).

Files without frontmatter (or non-`.md` files) are **plain** prompts:
selecting them skips the form and pastes the file contents. Files with the
executable bit are **JSONL plugins** (§7.8): each one is queried at discovery
time and may contribute *several* templates, whose forms work exactly like
file-template forms but whose rendering is delegated back to the plugin.

### 7.3 Discovery and configuration

Two layers, project wins on name collision:

1. **Project**: `<ctx.cwd>/.pi/prompts/**` — templates and plugins that
   travel with the repository, reviewable in PRs.
2. **Global**: `~/.pi/agent/prompts/**` — personal library.

Within each layer the naming conventions are inherited from prompto (they
were the good part): name = path relative to the prompts dir, extension
stripped; group = first path segment; dotfiles and dot-directories skipped
(the same skip rule as `prompto/pkg/repository.go:41-46`).

Classification per file:

- executable bit set → **JSONL plugin**: run a `describe` round-trip (§7.8)
  and register every template it announces under `<group>/<templateName>`.
- `.md` with a `fields:` or `prefill:` frontmatter → **template**.
- anything else → **plain**.

Config file `~/.pi/agent/prompto.json` holds only behavior knobs, no
repository lists (pattern copied from
`ext/extensions/pinned-skills/config.ts:43-56`):

```json
{
  "submitDefault": "editor",
  "allowProjectPlugins": false,
  "prefillMaxTokens": 1024
}
```

`allowProjectPlugins` gates execution of plugins from the *project* layer
(cloned-repo code should not run without opt-in; global-layer plugins are
always trusted — the user put them there). See Decision D6.

The store scans lazily on first `/prompto` invocation and caches per session;
`/prompto reload` rescans (re-running plugin `describe`). No file watching in
v1 (Decision D5).

### 7.4 Command surface

| Invocation | Behavior |
|---|---|
| `/prompto` | open the picker modal listing all templates (filter-as-you-type, grouped) |
| `/prompto <name>` | resolve exactly; open its form (or paste directly if plain) |
| `/prompto <prefix>` + autocomplete | `getArgumentCompletions` offers matching names with descriptions |
| `/prompto reload` | rescan all layers, `ctx.ui.notify` with counts |

Registry registration alongside, per monorepo convention
(`ext/extensions/_shared/registry.ts:189-202`):

```ts
registerPiExtension({
  id: "prompto",
  name: "Prompto",
  description: "Prompt template expansion with modal forms",
  commands: ["prompto"],
  tags: ["prompts", "templates", "forms"],
  run: (ctx) => openPicker(ctx),          // /px launcher entry
  palette: templates.map(t => ({ … run: () => openForm(t) })),  // Phase 5
});
```

### 7.5 The form component

One modal component class, `PromptFormComponent`, generated from
`TemplateField[]`. Layout (drawn with theme border/accent roles, patterned on
`pinned-skills/ui.ts:243-282`):

```
┌─ Create docmgr ticket + analysis plan ────────────────────────┐
│ Scaffold a docmgr ticket and ask for a project analysis plan  │
│                                                               │
│ ▸ Ticket goal *        │ analyze the frobnicator and produce  │
│   (text, 4 lines)      │ a refactoring plan_                  │
│   Ticket title         │ FROB-ANALYSIS                        │
│   Topics               │ [x] analysis [ ] design [ ] refactor │
│   Analysis plan depth  │ ◂ full ▸                             │
│   Upload to reMarkable │ [x]                                  │
│                                                               │
│ [ Submit ]   [ Cancel ]          tab/↑↓ move · space toggle   │
└───────────────────────────────────────────────────────────────┘
```

Field-type → row behavior:

- `string`: single-line inline edit; printable chars append, backspace
  deletes (pattern: `tui-showcase/index.ts:193-203`).
- `text`: shows a preview; Enter opens `ctx.ui.editor(label, current)` and
  writes the result back — we get a full multi-line editor for free instead
  of reimplementing one inside the form.
- `boolean`: space toggles `[x]`/`[ ]`.
- `choice`: ←/→ cycles choices (or space advances).
- `multichoice`: ←/→ moves within the choice list; space toggles membership.
- `number`: like string, digits only, validated on submit.

Keyboard model (per `ext/docs/pi-tui-ui-authoring-guide.md:761-806`):
`↑/↓/Tab/Shift-Tab` move focus across rows and the Submit/Cancel row; `Esc`
cancels (resolve `undefined`); `Enter` on Submit validates (required fields
non-empty, numbers parse) and calls `done(values)`; `Enter` elsewhere moves
to the next row, except in `text` rows where it opens the editor overlay.

Pseudocode skeleton:

```ts
class PromptFormComponent implements Component {
  private values: Record<string, Value>;   // seeded from field defaults
  private focus = 0;                        // index into rows (fields + submit + cancel)
  private cache?: string[];

  constructor(private tpl: PromptTemplate, private tui: TUI,
              private theme: Theme, private ui: ExtensionUIContext,
              private done: (v?: Record<string, Value>) => void) {}

  render(width: number): string[] {
    if (this.cache) return this.cache;
    lines = [frameTop(title), wrap(description), blank];
    for (const [i, f] of fields.entries())
      lines.push(rowFor(f, this.values[f.name], i === this.focus, width));
    lines.push(blank, submitCancelRow(this.focus), frameBottom(hintText));
    return this.cache = lines;            // every line width-clamped (§ safety)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return this.done(undefined);
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.down)) this.move(+1);
    else if (matchesKey(data, Key.up) || matchesKey(data, shift(Key.tab))) this.move(-1);
    else if (onSubmitRow && matchesKey(data, Key.enter)) this.trySubmit();
    else this.editFocusedField(data);      // per-type editing table above
    this.invalidate(); this.tui.requestRender();
  }

  private async trySubmit() {
    const missing = requiredEmpty(this.tpl.fields, this.values);
    if (missing.length) { this.error = `required: ${missing.join(", ")}`; return; }
    this.done(this.values);
  }

  invalidate() { this.cache = undefined; }
}
```

Opened via:

```ts
const values = await ctx.ui.custom<Record<string, Value> | undefined>(
  (tui, theme, kb, done) => new PromptFormComponent(tpl, tui, theme, ctx.ui, done),
  { overlay: true,
    overlayOptions: { anchor: "center", width: "85%", maxHeight: "80%", margin: 1 } });
if (values === undefined) return;                       // cancelled
const prompt = renderTemplate(tpl.body, values);
if (tpl.submit === "auto") pi.sendUserMessage(prompt);
else ctx.ui.setEditorText(prompt);
```

One subtlety flagged for implementation: `text` fields open a *nested*
overlay (`ctx.ui.editor`) from inside a `ctx.ui.custom` overlay. The
`modal-shortcut-lab` extension exists precisely to probe overlay/focus
behavior; verify nesting there first, and if nested overlays misbehave,
fall back to an in-form multi-line widget (pi-tui exports an `Editor`
component) or close-reopen the form around the editor call.

### 7.6 The picker

`/prompto` with no args opens a picker before the form. v1 composes the
built-in `SelectList` from `@mariozechner/pi-tui` inside a `ui.custom`
overlay (exactly the `tui-showcase` pattern at `index.ts:448-479`): items are
`"group/name — title"` sorted by group, filter-as-you-type, Enter selects,
Esc cancels. A richer two-pane picker with a preview (pattern:
`pinned-skills/ui.ts`) is Phase 5 polish.

### 7.7 LLM prefill

A template may declare a `prefill:` block (§7.2). Before the form opens (or,
with `when: after-required`, after the user has filled the required fields in
a first pass), the extension asks the model to *propose* values for the
listed fields. The user always sees and can edit the proposals — prefill
populates the form, it never bypasses it.

Mechanism — exactly the `selective-compaction` pattern
(`ext/extensions/selective-compaction/index.ts:112-160`):

```ts
async function runPrefill(ctx, tpl, known: Record<string, Value>) {
  if (!ctx.model) return {};                       // silently skip
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) return {};

  // abortable loader overlay while the completion runs
  const raw = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, "Prefilling form…");
    loader.onAbort = () => done(null);
    complete(ctx.model,
      { systemPrompt: PREFILL_SYSTEM_PROMPT,       // "reply with one JSON object,
                                                   //  keys limited to: <fields>"
        messages: [userMsg(renderTemplate(tpl.prefill.prompt, tpl.fields, known))] },
      { apiKey: auth.apiKey, headers: auth.headers,
        maxTokens: config.prefillMaxTokens, signal: loader.signal })
      .then(r => done(textOf(r))).catch(() => done(null));
    return loader;
  });
  if (raw === null) return {};                     // aborted/failed → empty

  const proposed = parseJsonObject(raw);           // strip fences, JSON.parse
  return pick(proposed, tpl.prefill.fields);       // never accept extra keys
}
```

Design points:

- **The prefill prompt is itself a template**: `{{name}}` placeholders
  resolve against already-known values (defaults, or the required fields
  entered in the first pass for `when: after-required`). This is what lets
  the docmgr example derive a ticket title *from* the goal.
- **Structured output by contract, defensive by parsing**: the system prompt
  demands a single JSON object with only the allowed keys; the parser strips
  code fences, tolerates surrounding prose, and drops unknown keys and
  type-mismatched values (a `boolean` field ignores `"maybe"`).
- **Failure is soft**: no model, no key, abort, bad JSON → the form opens
  with defaults and a `notify(…, "warning")`. Prefill must never block the
  feature.
- The prefill call uses the session's current model (`ctx.model`); no
  separate model configuration in v1.
- Use cases beyond the docmgr example: proposing a ticket *number* by
  listing existing ones (the prefill prompt can instruct the model, but a
  better fit for anything requiring file access is a plugin — see below —
  since `complete()` has no tool access).

### 7.8 JSONL plugin protocol

Plugins cover what static templates cannot: computed field choices,
context-dependent bodies, prompts assembled from live state (git diff, open
tickets, sprint data). A plugin is any executable file in a prompts layer.
The extension talks to it over stdin/stdout in **JSONL** (one JSON object
per line), in two short-lived invocations — no daemon, no handshake state:

**Discovery** (`describe`): at scan time the extension spawns the plugin
with `--describe` and reads template announcements until EOF:

```
$ .pi/prompts/docmgr/tickets.plugin.py --describe
{"type":"template","name":"create-ticket","title":"Create docmgr ticket","fields":[{"name":"goal","type":"text","required":true},{"name":"ticketNumber","type":"string"}],"submit":"editor"}
{"type":"template","name":"close-sprint","title":"Close sprint checklist","fields":[]}
{"type":"end"}
```

Announced templates register as `<group>/<name>` where the group comes from
the plugin's directory location, exactly like file templates. They appear in
the picker and autocomplete indistinguishably from file templates.

**Rendering** (`render`): after the form is submitted, the extension spawns
the plugin again, writes one request line to stdin, and reads response lines:

```
stdin:  {"type":"render","template":"create-ticket","values":{"goal":"…","ticketNumber":"FROB-7"},"cwd":"/home/manuel/project"}
stdout: {"type":"log","message":"querying docmgr…"}          (optional, shown as status)
stdout: {"type":"prompt","text":"Create a new docmgr ticket …","submit":"editor"}
```

or `{"type":"error","message":"…"}` → `notify(…, "error")`.

Contract details:

- Environment: `cwd` is passed in the request *and* set as the subprocess
  cwd; `PROMPTO_TEMPLATE` and `PROMPTO_PLUGIN_PATH` env vars are set for
  convenience. (The spirit of legacy `PROMPTO_PARENT_PWD`, §4.4, with the
  ambiguity removed: there is only one directory that matters, the user's.)
- Timeouts: `describe` 5 s, `render` 60 s; on timeout kill the process and
  notify. stderr is captured and logged, never parsed.
- Unknown `type` values in responses are ignored (forward compatibility).
- A plugin may itself declare `prefill` on an announced template; prefill
  runs in the extension (it owns the model), not in the plugin.
- Trust: global-layer plugins always run; project-layer plugins require
  `allowProjectPlugins: true` (Decision D6).

Plugin author's view (python, ~20 lines):

```python
#!/usr/bin/env python3
import json, sys
if "--describe" in sys.argv:
    print(json.dumps({"type":"template","name":"create-ticket", …}))
    print(json.dumps({"type":"end"})); sys.exit(0)
req = json.loads(sys.stdin.readline())
values = req["values"]
print(json.dumps({"type":"prompt","text": build_prompt(values)}))
```

### 7.9 Decision records

### Decision D1: Template format — frontmatter Markdown, not glazed YAML

- **Context:** Legacy prompto templates are glazed TemplateCommand YAMLs
  rendered by Go text/template + Sprig. The pi extension is TypeScript; no
  Go-template engine exists there, and full Sprig compatibility is a large
  surface.
- **Options considered:** (a) parse legacy YAMLs natively and reimplement
  enough Go-template; (b) shell out to the `prompto` binary for rendering;
  (c) define a new frontmatter-Markdown format with a minimal dialect.
- **Decision:** (c). No legacy parsing or bridging at all (user decision:
  prompto is inspiration, not a compatibility target).
- **Rationale:** Frontmatter Markdown matches how every other artifact in
  this ecosystem is written (docmgr docs, glazed help pages, skills); the
  body reads as the prompt it produces; a minimal dialect keeps the renderer
  ~100 lines and fully testable. Reimplementing Go-template semantics in TS
  is a bug farm; depending on an installed Go binary makes the extension
  fragile.
- **Consequences:** Existing prompto content must be ported by hand into the
  new format (mechanical: `parameters:` → `fields:`, Go-template syntax →
  `{{…}}` dialect); nothing scans old `prompto/` directories.
- **Status:** accepted

### Decision D2: Rendering engine — minimal `{{}}` interpolation, no template library

- **Context:** The body needs variable substitution and light conditionals.
- **Options considered:** (a) add a dependency (handlebars/mustache/eta);
  (b) hand-roll `{{name}}` + flat `{{#if}}`.
- **Decision:** (b).
- **Rationale:** Extensions in this monorepo are dependency-light (they
  import only the pi packages); the needed feature set is two regex-level
  constructs; prompts that need real logic have a better home as JSONL
  plugins (the same static/dynamic split legacy prompto drew with its
  executable promptos). A library invites
  users to write logic in templates that then can't round-trip anywhere else.
- **Consequences:** No loops/nesting/filters; the dialect must be documented
  in the template-authoring help. Renderer must be strict: unknown
  `{{placeholder}}` at render time is an error surfaced via
  `ui.notify(…, "error")`, not silently emitted.
- **Status:** proposed

### Decision D3: Submission — default `setEditorText`, per-template `submit: auto`

- **Context:** After the form, the expanded prompt must reach the agent.
  `pi.sendUserMessage` always triggers a turn (`types.d.ts:843-845`);
  `ctx.ui.setEditorText` stages text for the user to send.
- **Options considered:** (a) always auto-send; (b) always stage in editor;
  (c) stage by default, allow `submit: auto` per template, config default
  overridable.
- **Decision:** (c).
- **Rationale:** Expanded prompts are often long; the user should see what a
  form produced before burning a turn on it — especially while templates are
  young and buggy. But high-trust templates (the docmgr one, once stable)
  want one-keystroke flow. Making it per-template puts the choice where the
  knowledge is.
- **Consequences:** Two code paths to test. Auto-send while the agent is
  streaming needs `deliverAs` thought: use `"followUp"` so the prompt queues
  rather than steering mid-turn.
- **Status:** proposed

### Decision D4: Form UI — one custom `Component`, not chained dialogs, not `SettingsList`

- **Context:** Three viable form mechanics exist (§5.3): sequential built-in
  dialogs, a `SettingsList` widget, or a hand-rolled `Component`.
- **Options considered:** (a) chain `input`/`select`/`confirm` per field —
  zero custom TUI code; (b) `SettingsList` — free label/value/description
  rows; (c) custom `Component` modeled on `tui-showcase`'s Form tab and
  `pinned-skills`' frame.
- **Decision:** (c) for the product; (a) is acceptable as a Phase-1 stepping
  stone behind the same call site.
- **Rationale:** Sequential dialogs can't show the whole form at once, can't
  go *back* a field, and n dialogs for n fields feels like an interrogation.
  `SettingsList` is built for cycling enum-ish settings; free-text entry and
  required-field validation fight it. A custom component is ~250 lines with
  two strong in-repo references and gives exact control over layout,
  validation, and the Submit row.
- **Consequences:** We own keyboard handling and width safety (must follow
  the authoring guide's ANSI-safe helpers, `pi-tui-ui-authoring-guide.md:808-853`).
  The Phase-1 dialog fallback keeps the feature usable while the component
  is built.
- **Status:** proposed

### Decision D5: Discovery — scan-on-demand with cache; no file watcher in v1

- **Context:** Legacy prompto's server watches repos with fsnotify
  (`prompto/pkg/server/state/state.go:146-177`); CLI invocations rescan every
  time. Our scan additionally runs plugin `describe` subprocesses.
- **Options considered:** (a) watch all template dirs; (b) rescan on every
  `/prompto`; (c) scan once per session, explicit `/prompto reload`.
- **Decision:** (c).
- **Rationale:** Template sets are small (tens of files); a full rescan is
  cheap but doing it on every keystroke of autocomplete is not — and plugin
  `describe` calls make rescans strictly more expensive, strengthening the
  case for caching. Watchers add lifecycle complexity (dispose on reload)
  for a set that changes rarely mid-session. `/reload` already exists as a
  pi-wide convention.
- **Consequences:** Newly added templates/plugins need `/prompto reload` (or
  a new session) to appear. Autocomplete reads the cache, so it is instant.
- **Status:** proposed

### Decision D6: Dynamic prompts — self-describing JSONL plugins, project layer gated

- **Context:** Static templates cannot compute anything (live git state,
  existing ticket numbers, dynamic choice lists). Legacy prompto used raw
  executable scripts (argv in, stdout out); running arbitrary executables
  from inside pi executes code on the user's machine.
- **Options considered:** (a) no dynamic prompts at all; (b) legacy-style raw
  executables (stdout = prompt, no metadata); (c) self-describing JSONL
  plugins: `describe` announces templates + field schemas, `render` produces
  the prompt; (d) MCP servers as prompt providers.
- **Decision:** (c), with execution of *project-layer* plugins gated behind
  `allowProjectPlugins: true` in the config; global-layer plugins always run.
- **Rationale:** Raw executables (b) cannot participate in the core feature —
  the generated form — because they carry no field schema; self-description
  fixes that and gives plugins multi-template capability for free. JSONL over
  two short-lived invocations is the simplest possible protocol (no daemon,
  no handshake, trivially implementable in a 20-line script — §7.8) and
  matches the NDJSON-plugin style already used elsewhere in this toolchain
  (devctl plugins). MCP (d) is heavyweight for "print me a prompt" and would
  couple prompt authoring to server lifecycle management. The trust gate
  follows the observation that global files are placed by the user while
  project files arrive via `git clone`.
- **Consequences:** Plugin authors must implement two verbs instead of zero;
  a documented protocol page and a reference python/bash plugin are needed.
  Describe results are cached per session (D5), so a plugin that changes its
  template list needs `/prompto reload`. stderr is never parsed, avoiding
  the protocol-contamination failure mode known from devctl plugins.
- **Status:** proposed

### Decision D7: LLM prefill — extension-side `complete()`, JSON-object contract, soft-fail

- **Context:** Some field values are derivable (ticket title from goal,
  next ticket number, suggested topics); typing them by hand is friction.
  The user explicitly wants templates that can be "prefilled by the LLM".
- **Options considered:** (a) send a hidden user message through the agent
  loop and parse its reply; (b) call `complete()` from `@mariozechner/pi-ai`
  directly in the extension (the `selective-compaction` pattern,
  `index.ts:137-160`); (c) delegate prefill to plugins only.
- **Decision:** (b), declared per template via a `prefill:` frontmatter
  block; proposals always land in the form for user review, never straight
  into the prompt.
- **Rationale:** (a) pollutes the session transcript and burns an agent turn
  with tool access the task doesn't need; (b) is invisible to the session,
  abortable, cheap, and has working in-repo prior art including the loader
  UX. (c) would force plugin authorship for a purely declarative need —
  though plugins remain the right tool when prefill needs *file access*,
  since `complete()` is a bare completion with no tools.
- **Consequences:** Prefill quality depends on prompt+parse robustness: the
  system prompt demands one JSON object restricted to allowed keys; the
  parser drops unknown keys and type mismatches; every failure path degrades
  to an unprefilled form (never blocks). Adds `@mariozechner/pi-ai` as an
  import (already a pi dependency, not a new package). Latency: one model
  round-trip behind an abortable loader before the form opens.
- **Status:** proposed

## 8. Key flows (pseudocode)

### 8.1 Extension entry point — `extensions/prompto/index.ts`

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";
import { PromptStore } from "./store";
import { runPrompto } from "./run";

export default function prompto(pi: ExtensionAPI): void {
  const store = new PromptStore();     // lazy; scans on first use

  registerPiExtension({
    id: "prompto", name: "Prompto",
    description: "Prompt template expansion with modal forms",
    commands: ["prompto"], tags: ["prompts", "templates", "forms"],
    run: (ctx) => runPrompto(pi, store, "", ctx),
    docs: [{ title: "Authoring prompto templates", path: "./docs/authoring.md" }],
  });

  pi.registerCommand("prompto", {
    description: "Expand a prompt template through a form",
    getArgumentCompletions: (prefix) =>
      store.list().filter(t => t.name.startsWith(prefix))
           .map(t => ({ value: t.name, label: t.name, description: t.title ?? "" })),
    handler: (args, ctx) => runPrompto(pi, store, args.trim(), ctx),
  });
}
```

### 8.2 Command orchestration — `extensions/prompto/run.ts`

```ts
async function runPrompto(pi, store, args, ctx) {
  if (!ctx.hasUI) { /* headless: notify unsupported, return */ }

  if (args === "reload") {
    const n = await store.rescan(ctx.cwd);
    return ctx.ui.notify(`prompto: ${n} templates loaded`, "info");
  }

  await store.ensureLoaded(ctx.cwd);
  const tpl = args ? store.resolve(args) : await openPicker(ctx, store.list());
  if (!tpl) return args
    ? ctx.ui.notify(`prompto: no template named "${args}"`, "error")
    : undefined;                                    // picker cancelled

  let prompt: string;
  if (tpl.kind === "plain") {
    prompt = await readFile(tpl.filePath);
  } else {
    // 1. prefill (optional, soft-fail — §7.7)
    let seed = defaults(tpl.fields);
    if (tpl.prefill?.when !== "after-required" && tpl.prefill)
      seed = { ...seed, ...(await runPrefill(ctx, tpl, seed)) };

    // 2. form (skipped when the template has no fields)
    const values = tpl.fields.length ? await openForm(ctx, tpl, seed) : {};
    if (values === undefined) return;               // cancelled

    // ("after-required" variant: openForm runs required-only first,
    //  then runPrefill with those values, then the full form, prefilled.)

    // 3. produce the prompt
    try {
      prompt = tpl.kind === "plugin"
        ? await renderViaPlugin(tpl, values, ctx)   // JSONL render — §7.8
        : renderTemplate(tpl.body, tpl.fields, values);
    } catch (e) { return ctx.ui.notify(`prompto: ${e.message}`, "error"); }
  }

  if (tpl.submit === "auto")
    pi.sendUserMessage(prompt, ctx.isIdle() ? {} : { deliverAs: "followUp" });
  else
    ctx.ui.setEditorText(prompt);
}
```

### 8.3 Discovery — `extensions/prompto/store.ts`

```ts
async rescan(cwd: string): Promise<number> {
  const layers = [
    { dir: join(homedir(), ".pi/agent/prompts"), source: "global"  },
    { dir: join(cwd, ".pi/prompts"),             source: "project" }, // wins
  ];
  const byName = new Map<string, PromptTemplate>();
  for (const layer of layers)
    for (const file of await walk(layer.dir)) {    // skip dotfiles/dirs
      if (isExecutable(file)) {
        if (layer.source === "project" && !config.allowProjectPlugins)
          { warn(file); continue; }
        for (const t of await describePlugin(file))     // JSONL describe, §7.8
          byName.set(t.name, { ...t, kind: "plugin", filePath: file, ... });
      } else if (isTemplateMd(file)) {                  // has fields/prefill fm
        byName.set(nameOf(file), parseTemplate(file, layer));
      } else {
        byName.set(nameOf(file), plainTemplate(file, layer));
      }
    }
  this.templates = byName; return byName.size;
}
```

### 8.4 Renderer — `extensions/prompto/template.ts`

```ts
function renderTemplate(body, fields, values): string {
  // 1. conditionals: {{#if name}}…{{/if}} and {{#if name == "lit"}}…{{/if}}
  body = body.replace(IF_BLOCK_RE, (_, name, op, lit, inner) => {
    const v = values[name];
    const keep = op ? String(v) === lit : truthy(v);
    return keep ? inner : "";
  });
  // 2. placeholders — strict: unknown name throws
  return body.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`unknown placeholder {{${name}}}`);
    return formatValue(values[name]);   // string[] → "a, b"; bool → "true"
  });
}
```

### 8.5 Plugin client — `extensions/prompto/plugin.ts`

```ts
async function describePlugin(file: string): Promise<AnnouncedTemplate[]> {
  const out = await spawnCapture(file, ["--describe"], { timeoutMs: 5000 });
  const templates = [];
  for (const line of out.stdout.split("\n").filter(Boolean)) {
    const msg = safeJsonParse(line);               // bad line → skip + log
    if (msg?.type === "template") templates.push(validateAnnounced(msg));
    if (msg?.type === "end") break;
  }
  return templates;                                 // [] on any failure
}

async function renderViaPlugin(tpl, values, ctx): Promise<string> {
  const req = { type: "render", template: tpl.pluginTemplateName,
                values, cwd: ctx.cwd };
  const proc = spawn(tpl.filePath, [], {
    cwd: ctx.cwd,
    env: { ...process.env, PROMPTO_TEMPLATE: tpl.pluginTemplateName,
           PROMPTO_PLUGIN_PATH: tpl.filePath },
    timeoutMs: 60000,
  });
  proc.stdin.write(JSON.stringify(req) + "\n"); proc.stdin.end();
  for await (const line of linesOf(proc.stdout)) {
    const msg = safeJsonParse(line);
    if (msg?.type === "log")    ctx.ui.setWorkingMessage?.(msg.message);
    if (msg?.type === "prompt") return msg.text;
    if (msg?.type === "error")  throw new Error(msg.message);
    // unknown types ignored (forward compatibility)
  }
  throw new Error(`plugin ${tpl.filePath} exited without a prompt`);
}
```

(Prefill pseudocode lives in §7.7; it is small enough not to repeat.)

## 9. Alternatives considered (beyond the decision records)

- **Input-event expansion instead of a slash command** — hook `pi.on("input")`
  and expand inline syntax like `@prompto:name` inside any message
  (`InputEvent` → `{action:"transform", text}`, `types.d.ts:566-587`). Neat,
  but forms are interactive and the input hook should stay synchronous-fast;
  also discoverability is worse than a slash command. Could be added later
  for *parameterless* templates only.
- **Making it a pi tool the LLM can call** (`pi.registerTool`) — lets the
  *agent* expand templates, but the whole point is human-driven prompt
  authoring before the agent runs. Not pursued.
- **Reusing the `docmgr` extension** — the motivating example touches docmgr,
  but prompt expansion is domain-agnostic; the docmgr ticket prompt is just a
  template file. Keeping the extension generic is strictly more useful.

## 10. Implementation plan (phased, file-level)

All paths relative to `ext/extensions/prompto/`.

### Phase 1 — skeleton + plain templates + dialog fallback (1–2 days)

1. `types.ts` — `PromptTemplate`, `TemplateField`, `Value`, config types.
2. `config.ts` — read/write `~/.pi/agent/prompto.json`
   (copy the load/save shape from `ext/extensions/pinned-skills/config.ts:43-56`).
3. `store.ts` — layered scan (§8.3), name resolution, cache, `rescan`.
4. `template.ts` — frontmatter parse (YAML via the same parser other
   extensions use — check what `_shared` already imports before adding a dep)
   + renderer (§8.4).
5. `index.ts` + `run.ts` — registration (§8.1) and orchestration (§8.2), with
   the *dialog fallback* form: for each field call `ui.input` / `ui.select` /
   `ui.confirm` / `ui.editor` sequentially (Decision D4 stepping stone).
6. Register in `ext/.pi/settings.json` (`"../extensions/prompto/index.ts"`).
7. Smoke: `timeout 20 pi --list-models` (load check), then tmux run:
   `/prompto` → pick → answer dialogs → text appears in editor.
8. Write two starter templates: `docmgr/create-ticket` (§7.2) into this
   repo's `.pi/prompts/`, and a trivial `demo/greeting`.

Milestone: the motivating example works end-to-end, ugly but functional.

### Phase 2 — the real modal form (2–3 days)

1. `ui/form.ts` — `PromptFormComponent` (§7.5). Steal deliberately:
   frame/scroll/dirty-tracking from `ext/extensions/pinned-skills/ui.ts:122-185,243-282`;
   text-entry key handling from `ext/extensions/tui-showcase/index.ts:193-227`.
2. `ui/picker.ts` — `SelectList`-based chooser (§7.6, pattern
   `tui-showcase/index.ts:448-479`).
3. Swap `run.ts` from dialog fallback to `openForm` / `openPicker`.
4. Validation UX: required-field error line in the frame footer; strict
   renderer errors via `notify`.
5. Verify the nested-overlay question for `text` fields (§7.5 subtlety) in
   `modal-shortcut-lab`; pick fallback if needed.
6. Pre-ship the checklist in `ext/docs/pi-tui-ui-authoring-guide.md:1050-1065`
   (width safety, Esc handling, dispose, render cache).

### Phase 3 — LLM prefill (1–2 days)

1. `prefill.ts` — `runPrefill` per §7.7: `complete()` +
   `ctx.modelRegistry.getApiKeyAndHeaders` + `BorderedLoader` (copy the
   working shape from `ext/extensions/selective-compaction/index.ts:112-160`),
   strict-JSON system prompt, defensive parser (`parseJsonObject`: strip
   fences, JSON.parse, drop unknown keys and type mismatches).
2. Wire `prefill.when` variants into `run.ts`: `before-form` (default) and
   `after-required` (required-only form pass → prefill → full form).
3. Extend the docmgr/create-ticket starter template with the `prefill:`
   block from §7.2; verify the proposed title lands editable in the form.
4. Soft-fail paths: no model, no key, abort, garbage output → unprefilled
   form + one `notify(…, "warning")`.

### Phase 4 — JSONL plugins (2–3 days)

1. `plugin.ts` — `describePlugin` + `renderViaPlugin` per §7.8/§8.5:
   spawn with timeouts (5 s / 60 s), line-buffered JSONL parsing, stderr
   captured to log only, unknown message types ignored.
2. Store integration: exec-bit classification, `allowProjectPlugins` gate
   with a per-file warning notify, per-session describe cache (D5/D6).
3. Reference plugins in `examples/`: a ~20-line python plugin
   (`tickets.plugin.py` announcing `create-ticket` with a computed
   next-ticket-number choice list) and a bash one-template plugin.
4. Protocol doc `docs/plugin-protocol.md` registered as an extension doc
   contribution.
5. Contract tests with fixture plugins: happy path, `error` response, junk
   stdout lines, timeout, nonzero exit.

### Phase 5 — polish (as needed)

1. Palette items per template (`collectPaletteItems`,
   `ext/extensions/_shared/registry.ts:244`) and a launcher `run` action.
2. `getArgumentCompletions` polish: include `title` as description, rank
   project layer first.
3. Two-pane picker with body preview.
4. `docs/authoring.md` — template-authoring guide registered as an extension
   doc contribution (renders in `/px`).
5. Value memory: persist last-submitted values per template in
   `<cwd>/.pi/prompto-state.json`; merge under prefill proposals next time.
6. Consider `input`-event inline expansion for parameterless templates (§9).

## 11. Testing and validation strategy

1. **Unit-testable core, no pi dependency.** `template.ts` (parse + render)
   and `store.ts` (layering, collision, classification) must be pure modules;
   test with the repo's existing test runner (check `ext/package.json`;
   if none exists, `node --test` keeps it dependency-free). Renderer cases:
   every field type, unknown placeholder throws, `#if` truthy/equality/else
   absence, multichoice join, defaults applied when a field is skipped.
2. **Load smoke test** after every phase:
   `timeout 20 pi --list-models` from the monorepo root — catches import
   errors, per `ext/docs/pi-testing-guide.md`.
3. **Interactive tmux tests** (per `AGENT.md` guidance: drive TUIs via tmux
   send-keys/capture-pane): script the happy path — `/prompto`, filter,
   Enter, fill fields, Submit — and assert the editor contains the expanded
   prompt; script Esc-cancel at both picker and form.
4. **Prefill parser tests** (Phase 3): `parseJsonObject` against clean JSON,
   fenced JSON, JSON embedded in prose, wrong types, extra keys, arrays,
   empty output — every case must yield a safe (possibly empty) value map,
   never a throw that blocks the form.
5. **Plugin contract tests** (Phase 4): fixture plugins covering describe
   happy path, junk lines interleaved with valid JSONL, `error` response,
   timeout (sleeping plugin), nonzero exit, and stderr noise — assert the
   store/renderer behavior for each (skip + log, notify, never crash pi).
6. **Dogfood milestone:** the `docmgr/create-ticket` template — with its
   LLM-prefilled title — used to create a real ticket in this repo is the
   acceptance test for the whole feature.

## 12. API quick reference (appendix)

Everything the implementation touches, in one table. Authoritative file:
`/home/manuel/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`.

| API | Where | Notes |
|---|---|---|
| `ExtensionFactory` | `types.d.ts:1005` | default-export signature |
| `pi.registerCommand(name, {description, getArgumentCompletions?, handler})` | `types.d.ts:818`, shape `:770-776` | slash command |
| `pi.registerShortcut(keyId, {description, handler})` | `types.d.ts:820-823` | optional hotkey |
| `pi.sendUserMessage(content, {deliverAs?})` | `types.d.ts:843-845` | always triggers a turn |
| `pi.exec(cmd, args, opts)` | `types.d.ts:855` | available, but plugin.ts uses `child_process.spawn` directly (needs stdin write + line streaming) |
| `complete(model, {systemPrompt, messages}, {apiKey, headers, maxTokens, signal})` | `@mariozechner/pi-ai`; usage `ext/extensions/selective-compaction/index.ts:148-160` | LLM prefill one-shot completion |
| `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)` | `selective-compaction/index.ts:142-145` | credentials for `complete()` |
| `BorderedLoader` | `@mariozechner/pi-coding-agent`; usage `selective-compaction/index.ts:116-127` | abortable loader overlay during prefill/plugin render |
| `ctx.ui.custom<T>(factory, {overlay, overlayOptions})` | `types.d.ts:116-126` | modal; `done(v)` resolves |
| `ctx.ui.select / input / confirm / editor / notify` | `types.d.ts:69-75,134` | dialog fallback + text fields |
| `ctx.ui.setEditorText / pasteToEditor / getEditorText` | `types.d.ts:128-132` | stage prompt for review |
| `ctx.ui.theme` | `types.d.ts:174` | roles: accent/muted/dim/border/… |
| `ctx.cwd`, `ctx.hasUI`, `ctx.isIdle()` | `types.d.ts:207-236` | context basics |
| `Component` contract | `ext/docs/pi-tui-ui-authoring-guide.md:30-36` | `render(width): string[]`, `handleInput?`, `invalidate` |
| `matchesKey`, `Key`, `SelectList`, `SettingsList`, `truncateToWidth`, `visibleWidth` | `@mariozechner/pi-tui` (see `tui-showcase/index.ts:3-20`) | keyboard + widgets + width safety |
| `registerPiExtension(reg)` | `ext/extensions/_shared/registry.ts:218`, shape `:189-202` | monorepo registry (mandatory) |
| `InputEvent` / `InputEventResult` | `types.d.ts:564-587` | only if §9 inline expansion is built |

## 13. Risks, open questions

1. **Nested overlays** (`ui.editor` from inside `ui.custom`) — behavior
   unverified; mitigation plan in §7.5/Phase 2. *(Biggest UX risk.)*
2. **API drift** — the monorepo imports `@mariozechner/*` names while the
   active runtime is `@earendil-works/*` 0.78; if the fork renames its
   import path for extensions, follow whatever the other 15 extensions do at
   that time. The `session-summary` input-handler drift shows this is real.
3. **`sendUserMessage` while streaming** — `deliverAs: "followUp"` is the
   designed answer; needs one manual test during Phase 1.
4. **Name collisions** — extensions are stripped from addressable names
   (`docmgr/create-ticket`, not `…/create-ticket.md`), so `foo.md` next to a
   plugin announcing `foo` in the same group collide; resolution is layer
   order then alphabetical, and `/prompto reload` should print a
   doctor-style warning listing shadowed entries.
5. **Prefill quality and latency** — one model round-trip before the form
   opens; garbage or slow output degrades to an unprefilled form (soft-fail
   contract, §7.7), but a habitually slow prefill will make users disable
   it. Keep `prefillMaxTokens` small and the loader abortable.
6. **Plugin misbehavior** — hangs (mitigated by 5 s/60 s timeouts + kill),
   stdout protocol contamination (mitigated: junk lines skipped, stderr
   never parsed), and code execution trust (mitigated: project-layer gate,
   Decision D6). Residual risk: a *global* plugin the user forgot about
   running at every `describe` scan — `/prompto reload` should list which
   plugins it executed.
7. **Open question:** should project-layer templates be able to set
   `submit: auto`? A cloned repo auto-sending prompts is a (mild) surprise
   vector. Current lean: allow it but show a one-time notify per template.
8. **Open question:** value memory (Phase 5.5) — per-project or global?
   Lean: per-project, since goals/titles are project-specific. How should
   remembered values compose with prefill? Lean: remembered values seed the
   prefill prompt's `{{…}}` context, prefill proposals win the seed merge.

## 14. References

Legacy prompto (all under `/home/manuel/workspaces/2026-07-03/pi-extension-prompto/prompto/`):

- `pkg/prompto.go` — `Prompto` type `:26`, `Render` `:35` (executable contract `:38-56`, template `:57-108`), `LoadTemplateCommand` `:120`.
- `pkg/repository.go` — discovery walk `:26-119`, grouping `:151-177`, watcher `:179`.
- `cmd/prompto/main.go` — config loading `:44-65`; `cmd/prompto/cmds/get.go` — interactive picker `:35-66`, `--print-path` `:97-131`.
- `pkg/doc/topics/03-creating-promptos.md` — template YAML format `:104-127`.
- `prompto/git-diff.sh` — executable prompt example (uses `PROMPTO_PARENT_PWD` `:90-97`).

pi extension system (under `/home/manuel/workspaces/2026-07-03/pi-extension-prompto/2026-04-21--pi-extensions/`):

- `.pi/settings.json` — extension load list.
- `extensions/_shared/registry.ts` — registry contract `:189-202`, `registerPiExtension` `:218`, palette `:244`.
- `extensions/tui-showcase/index.ts` — form tab `:193-227,306-322`, overlay opening `:684-688`, `SelectList` `:448-479`, `SettingsList` `:481-515`.
- `extensions/pinned-skills/ui.ts` — production modal patterns `:57-185,243-282`; `config.ts:43-56` — persistence pattern.
- `extensions/selective-compaction/index.ts` — gather→generate→review→act flow `:86-135`.
- `docs/pi-shared-extension-framework-guide.md`, `docs/pi-tui-ui-authoring-guide.md`, `docs/pi-testing-guide.md`.

pi runtime types: `/home/manuel/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` (v0.78.0) — see §12 table for symbol lines.
