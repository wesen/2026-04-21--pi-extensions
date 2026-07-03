---
name: prompto-template-authoring
description: Create prompt templates and JSONL plugins for the prompto pi extension (form-based prompt expansion via /prompto). Use when asked to add a new prompto template, turn a recurring prompt into a form, add LLM-prefilled fields, write a prompto plugin script that computes templates or prompt bodies dynamically, or debug why a template/plugin does not show up or fails to render.
---

# Prompto Template Authoring

## Overview

The prompto pi extension (`extensions/prompto/` in this repo) expands prompt
templates through modal TUI forms. `/prompto <group>/<name>` opens a form
generated from the template's field schema; submitting renders the body and
places the prompt in the pi editor (default) or sends it directly.

This skill covers authoring the three prompt kinds:

1. **Plain prompts** — any non-executable file without schema frontmatter; selecting pastes the contents verbatim. No form.
2. **Templates** — Markdown with YAML frontmatter declaring typed fields (and optionally an LLM prefill block); a form is generated.
3. **JSONL plugins** — executables that announce templates over a two-verb stdio protocol; for computed choice lists and dynamic prompt bodies.

Authoritative in-repo docs (read when details are in doubt — they ship with
the extension and track the implementation): `extensions/prompto/docs/authoring.md`
and `extensions/prompto/docs/plugin-protocol.md`. Reference plugins:
`extensions/prompto/examples/tickets.plugin.py` (multi-template, computed
choices) and `extensions/prompto/examples/git-diff.plugin.sh` (single
template, live git state).

## Where files go

| Layer | Path | Notes |
|---|---|---|
| Project | `<repo>/.pi/prompts/**` | travels with the repo, reviewable in PRs; wins name collisions |
| Global | `~/.pi/agent/prompts/**` | personal library; plugins here always run |

Addressable name = path relative to the layer root, **extension stripped**:
`.pi/prompts/docmgr/create-ticket.md` → `/prompto docmgr/create-ticket`.
First path segment = group. Dotfiles/dot-dirs are skipped. After adding or
editing files, run `/prompto reload` in pi (the scan is cached per session);
parse errors and name shadowing appear as warnings there.

## Template format

```markdown
---
title: Create docmgr ticket + analysis plan     # shown in picker/form header
description: One-line description
submit: editor            # editor (default) = review before send · auto = send immediately
fields:
  - name: goal            # placeholder name: [a-zA-Z_][a-zA-Z0-9_]*
    label: Ticket goal    # form row label (defaults to name)
    type: text            # string | text | boolean | choice | multichoice | number
    required: true
    help: Shown under the field while focused
    placeholder: Ghost text for string/text
  - name: depth
    type: choice
    choices: [full, light]   # required for choice/multichoice; default must be a member
    default: full
prefill:                  # optional — LLM proposes values before the form opens
  fields: [ticketTitle]   # which declared fields the model may fill
  when: after-required    # before-form (default) | after-required
  prompt: |
    Propose a short SCREAMING-KEBAB ticket title for this goal: {{goal}}
---
The prompt body. Use {{goal}} placeholders.
{{#if depth == "full"}}
Included only when depth is "full".
{{/if}}
{{#if uploadFlag}}truthy check: booleans, non-empty strings/lists, non-zero numbers{{/if}}
```

Frontmatter is full YAML; the top level must be a map. Field-type → form
behavior: `string`/`number` inline editing; `text` opens a multi-line editor
overlay on Enter; `boolean` space-toggles; `choice` cycles with ←/→;
`multichoice` has an inner cursor (←/→) with space toggling membership.

### Rendering dialect (deliberately tiny — do not fight it)

- `{{name}}` — substitution; multichoice joins as `a, b`; booleans render `true`/`false`.
- `{{#if name}}…{{/if}}`, `{{#if name == "lit"}}`, `{{#if name != "lit"}}` — flat only.
- No loops, no nesting, no filters. **Unknown placeholders are an error at
  expand time** (by design — typos fail loudly). Prompts needing real logic
  belong in a plugin, not in template syntax.

### Prefill rules

- Proposals always land **in the form** for user review, never straight into the prompt.
- The prefill prompt is itself rendered with `{{…}}` against known values;
  `when: after-required` runs a required-fields-only form pass first, so the
  prompt can reference e.g. `{{goal}}`.
- Every failure (no model, no key, abort, non-JSON output) soft-fails to an
  unprefilled form with one warning. Keep prefill prompts small and
  single-purpose; the model must answer with one JSON object restricted to
  the allowed keys.
- Remembered values: each template's last-submitted values persist per
  project under `~/.pi/agent/prompto-state/` (keyed by a cwd hash, outside
  the worktree so prompt text is never committable) and seed the next form;
  prefill proposals override remembered values.

## JSONL plugins

A plugin is any **executable** file in a prompts layer. Project-layer plugins
only run when `allowProjectPlugins: true` is set in `~/.pi/agent/prompto.json`
(global-layer plugins always run). Two short-lived invocations, JSONL on
stdout, no daemon:

**Describe** (`plugin --describe`, 5 s timeout, exit 0):

```json
{"type":"template","name":"close-ticket","title":"…","fields":[{"name":"ticket","type":"choice","choices":["A","B"],"required":true}],"submit":"editor"}
{"type":"end"}
```

`name` must match `[a-zA-Z0-9_][a-zA-Z0-9_-]*`; the addressable name becomes
`<group>/<name>` from the plugin's directory. `fields` uses the exact
frontmatter schema — and since describe runs at scan time, choice lists may
be computed (existing ticket ids, branch names). A plugin may announce many
templates and may declare `prefill` (the LLM call runs in the extension, not
the plugin).

**Render** (request on stdin, 60 s timeout, then SIGKILL):

```json
→ {"type":"render","template":"close-ticket","values":{"ticket":"A"},"cwd":"/home/user/project"}
← {"type":"log","message":"querying…"}        (optional, shown as status)
← {"type":"prompt","text":"the expanded prompt"}
```

or `{"type":"error","message":"…"}`. Subprocess cwd = the user's cwd;
`PROMPTO_TEMPLATE` and `PROMPTO_PLUGIN_PATH` env vars are set.

Minimal python plugin:

```python
#!/usr/bin/env python3
import json, sys
if "--describe" in sys.argv:
    print(json.dumps({"type": "template", "name": "hello",
                      "fields": [{"name": "who", "type": "string", "required": True}]}))
    print(json.dumps({"type": "end"})); sys.exit(0)
req = json.loads(sys.stdin.readline())
print(json.dumps({"type": "prompt", "text": f"Say hello to {req['values']['who']}!"}))
```

Plugin rules:

- `chmod +x` — the exec bit is what classifies a file as a plugin.
- stdout is protocol; junk lines are skipped but keep it clean. **Log to
  stderr** — it is captured for error reporting, never parsed.
- Tolerate unknown/missing keys in `values` (the described schema is cached
  per session and can be staler than the render request).
- Emit exactly one terminal frame (`prompt` or `error`); exiting without one
  is reported as an error with the stderr tail attached.

## Validation workflow

1. Create/edit the file; `chmod +x` for plugins.
2. In pi: `/prompto reload` — check the notify for counts, parse warnings,
   and shadowed-name warnings.
3. `/prompto <group>/<name>` — fill the form, confirm the expansion in the
   editor before trusting `submit: auto`.
4. For plugins, test outside pi first:
   `./plugin --describe` (valid JSONL, ends with `{"type":"end"}`), then
   `echo '{"type":"render","template":"<name>","values":{...},"cwd":"'$PWD'"}' | ./plugin`.
5. Automated TUI checks: drive pi via tmux — send the command text and Enter
   as **separate** key bursts with ~1 s pause (pi's slash autocomplete popup
   swallows a same-burst Enter), then `capture-pane` to assert the form and
   the expanded editor text.

## Common failures

| Symptom | Cause |
|---|---|
| Template missing from picker/autocomplete | no `/prompto reload` after adding the file; or a dotfile path segment; or the name is shadowed by a project-layer file |
| "unknown placeholder {{x}}" on expand | body references a field not declared in `fields:` (or a typo) — strict by design |
| Frontmatter warning at reload | invalid YAML, top level not a map, unknown field type, choice default not in `choices`, duplicate field name, prefill referencing an undeclared field |
| Plugin listed as skipped | project-layer plugin without `allowProjectPlugins: true` |
| Plugin "exited without a prompt frame" | script forgot the terminal frame, printed it to stderr, or crashed — check the stderr tail in the error message |
| Plugin ignored entirely | missing exec bit (classified as a plain prompt) |
| Prefill silently absent | no model/API key in the session, aborted loader, or the model returned non-JSON — a single warning notify says which |

## Working rules

- Prefer a template over a plugin until you need computation; prefer
  `submit: editor` until a template has earned trust.
- Put shared/team prompts in the project layer, personal ones in the global
  layer; expect project to shadow global on equal names.
- Keep prefill prompts short (one JSON object, few keys); anything needing
  repository inspection belongs in a plugin's describe or render step.
