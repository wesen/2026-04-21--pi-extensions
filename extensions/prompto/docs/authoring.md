# Authoring prompto templates

Templates live in `<project>/.pi/prompts/**` (travels with the repo) or
`~/.pi/agent/prompts/**` (personal). The addressable name is the path
relative to that directory with the extension stripped —
`.pi/prompts/docmgr/create-ticket.md` → `/prompto docmgr/create-ticket` —
and the first segment is the group. Project templates shadow global ones
with the same name. After adding files, run `/prompto reload`.

Three kinds:

- **Plain** — any file without `fields:`/`prefill:` frontmatter. Selecting
  it pastes the contents into the editor. No form.
- **Template** — Markdown with YAML frontmatter (below). A form is
  generated from `fields:`; the body is rendered with the submitted values.
- **Plugin** — an executable file speaking the JSONL protocol (see
  plugin-protocol.md). For prompts that need computed content.

## Template format

```markdown
---
title: Create docmgr ticket + analysis plan
description: One-line description shown in the picker
submit: editor            # editor (default): review before send · auto: send immediately
fields:
  - name: goal            # placeholder name: [a-zA-Z_][a-zA-Z0-9_]*
    label: Ticket goal    # form row label (default: name)
    type: text            # string | text | boolean | choice | multichoice | number
    required: true
    help: Shown under the field while focused
  - name: depth
    type: choice
    choices: [full, light]
    default: full
prefill:                  # optional: LLM proposes values before the form opens
  fields: [ticketTitle]   # which fields it may fill
  when: after-required    # before-form (default) | after-required
  prompt: |
    Propose a short SCREAMING-KEBAB ticket title for this goal: {{goal}}
---
The prompt body. Use {{goal}} placeholders.
{{#if depth == "full"}}
This line only appears when depth is "full".
{{/if}}
{{#if uploadRemarkable}}truthy check (booleans, non-empty strings/lists){{/if}}
```

## Rendering dialect (deliberately tiny)

- `{{name}}` — the value; multichoice joins as `a, b`; booleans render
  `true`/`false`.
- `{{#if name}}…{{/if}}` — kept when truthy (true, non-empty string/list,
  non-zero number).
- `{{#if name == "lit"}}…{{/if}}` and `!=` — string comparison only.
- No nesting, loops, or filters. Unknown placeholders are an **error** at
  expand time. Prompts needing real logic should be plugins.

## Frontmatter caveats

Frontmatter is full YAML (parsed with the `yaml` package from the repo's
package.json). The top level must be a map; parse errors show up as
warnings in `/prompto reload`.

## Prefill behavior

Prefill proposals always land **in the form** for review — never straight
into the prompt. `after-required` asks the required fields first, so the
prefill prompt can reference them (`{{goal}}` above). Failures (no model,
abort, bad output) degrade to an unprefilled form with a warning. Config
knob: `prefillMaxTokens` in `~/.pi/agent/prompto.json`.

## Value memory

Each template's last-submitted values are remembered per project and seed
the next form (prefill proposals override them). The state is stored
outside the worktree — under `~/.pi/agent/prompto-state/`, keyed by a hash
of the project directory — so submitted prompt text can never end up as a
committable file inside your repository.
