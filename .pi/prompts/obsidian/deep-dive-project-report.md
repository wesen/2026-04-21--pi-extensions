---
title: Obsidian deep-dive technical project report
description: Write a textbook-style project/PR/research report in the go-go-parc Obsidian vault, then commit and push
submit: editor
fields:
  - name: target
    label: Report target
    type: text
    required: true
    help: Describe the repository, PR, branch, feature, or topic to report on.
  - name: reportKind
    label: Report kind
    type: choice
    choices: [project-deep-dive, pr-deep-dive, research-article]
    default: project-deep-dive
  - name: vaultPath
    label: Obsidian vault path
    type: string
    default: /home/manuel/code/wesen/go-go-golems/go-go-parc
  - name: noteTitle
    label: Note title
    type: string
    placeholder: PROJ - Project - Deep Dive
  - name: destination
    label: Destination section
    type: choice
    choices: [Projects/YYYY/MM/DD, Research/YYYY/MM/DD]
    default: Projects/YYYY/MM/DD
  - name: sourceDepth
    label: Evidence depth
    type: choice
    choices: [diaries-git-and-code, code-and-docs, full-research-sources]
    default: diaries-git-and-code
  - name: commitAndPush
    label: Commit and push vault changes
    type: boolean
    default: true
  - name: includeDiagrams
    label: Include Mermaid diagrams where useful
    type: boolean
    default: true
prefill:
  fields: [noteTitle]
  when: after-required
  prompt: |
    Propose an Obsidian note title for this deep-dive technical report.
    Prefer `PROJ - <Project> - <Subtitle>` for project/PR reports and
    `ARTICLE - <Topic> - <Subtitle>` for durable research articles.

    Report target:
    {{target}}
---
Write a detailed deep-dive technical report for the Obsidian vault.

Report target:

{{target}}

Report kind: {{reportKind}}
Vault: `{{vaultPath}}`
Suggested note title: `{{noteTitle}}`
Destination section: `{{destination}}`

Use or load the relevant skills before doing the work. In particular, consider `obsidian-vault-writing`, `pr-deep-dive-report`, `obsidian-vault-research-report`, `textbook-authoring`, and `git-commit-instructions`.

{{#if reportKind == "project-deep-dive"}}
Treat this as a project/repository deep dive. Build a mental model from local README files, docs, source code, tests, ticket workspaces, implementation diaries, and git history.
{{/if}}
{{#if reportKind == "pr-deep-dive"}}
Treat this as a PR deep dive. Determine whether the PR is open or merged, fetch the relevant range, enumerate changed files and ticket workspaces, read all implementation diaries, and then read the key source changes before writing.
{{/if}}
{{#if reportKind == "research-article"}}
Treat this as a durable research article. Gather and read sources before writing. The Obsidian article should contain the full useful report, not a terse summary.
{{/if}}

{{#if sourceDepth == "diaries-git-and-code"}}
Prioritize implementation diaries, git history, changed files, architecture docs, and tests. The report should explain what was built, why the design evolved that way, what failed, and which decisions matter.
{{/if}}
{{#if sourceDepth == "code-and-docs"}}
Prioritize current local source code and documentation. Do not invent history that is not supported by files.
{{/if}}
{{#if sourceDepth == "full-research-sources"}}
Gather external sources when needed, save important references, and quote or cite them explicitly in the report.
{{/if}}

Writing style requirements:

- Write in a textbook-style technical blog-post voice: precise, direct, and evidence-based.
- Do not use analogies. Explain technical systems in their own terms using definitions, code, diagrams, traces, and concrete examples.
- Prefer prose paragraphs that explain why a design exists before listing what changed.
- Include concise bullet lists only when they carry specific technical content.
- Include real code snippets or pseudocode for essential logic paths.
- Include concrete file paths and code references for important claims.
- Include failure modes, tricky details, review concerns, and open questions.
- Use Obsidian-friendly YAML frontmatter and the vault's `PROJ - ...` or `ARTICLE - ...` naming conventions.
{{#if includeDiagrams}}
- Include Mermaid diagrams for architecture, data flow, or runtime sequences where they clarify the report.
{{/if}}

Write the note under `{{vaultPath}}/{{destination}}/` unless the evidence or an existing vault convention clearly indicates a better location. Preserve append-only vault history: create a new dated note rather than overwriting historical notes unless explicitly necessary.

{{#if commitAndPush}}
After writing, commit and push the vault repository. Stage only the intended report/note files; do not stage incidental Obsidian workspace/cache changes. Before committing, inspect `git status --porcelain`, `git diff --stat`, and `git diff --cached --stat`. Use a focused commit message such as `Project report: <topic>` or `Research report: <topic>`, then run `git push`.
{{/if}}

Final response should report the note path, evidence sources read, commit hash if committed, push result, and any important caveats or follow-up questions.
