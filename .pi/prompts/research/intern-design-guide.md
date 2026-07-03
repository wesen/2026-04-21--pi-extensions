---
title: Intern-ready docmgr design guide
description: Create a detailed system analysis/design/implementation guide in docmgr and optionally upload to reMarkable
submit: editor
fields:
  - name: subject
    label: System or topic to analyze
    type: text
    required: true
    help: Name the system, feature, repository area, or technology the intern guide should explain.
  - name: scope
    label: Scope and desired outcome
    type: text
    required: true
    help: What should the guide cover, and what should it enable someone to build or understand?
  - name: ticketMode
    label: Ticket mode
    type: choice
    choices: [create-new-ticket, use-existing-ticket, no-ticket]
    default: create-new-ticket
  - name: ticketId
    label: Ticket ID
    type: string
    placeholder: XXX-001 or leave blank for generated suggestion
    help: Required when using an existing ticket; otherwise may be a suggested new ticket ID.
  - name: title
    label: Document/title suggestion
    type: string
    placeholder: Intern-ready design and implementation guide
  - name: topics
    label: Docmgr topics
    type: multichoice
    choices: [analysis, design, implementation, architecture, onboarding, docs, research]
    default: [analysis, design, implementation, onboarding]
  - name: depth
    label: Depth
    type: choice
    choices: [intern-ready-exhaustive, focused-implementation-guide, research-heavy-design-package]
    default: intern-ready-exhaustive
  - name: uploadRemarkable
    label: Upload final bundle to reMarkable
    type: boolean
    default: true
  - name: validateDocmgr
    label: Run docmgr validation/doctor
    type: boolean
    default: true
prefill:
  fields: [ticketId, title]
  when: after-required
  prompt: |
    Given this desired intern-ready technical guide, propose:
    - ticketId: a short SCREAMING-KEBAB or SCREAMING-KEBAB-NNN docmgr ticket ID
    - title: a concise document title

    Subject: {{subject}}

    Scope and desired outcome:
    {{scope}}
---
Create an intern-ready technical analysis, design, and implementation guide for:

{{subject}}

Scope and desired outcome:

{{scope}}

Use or load the relevant skills before doing the work. In particular, consider `docmgr`, `diary`, `ticket-research-docmgr-remarkable`, `full-blown-tech-research-design`, `remarkable-upload`, and `textbook-authoring`.

{{#if ticketMode == "create-new-ticket"}}
Create a new docmgr ticket. Suggested ticket ID (if blank, propose one first): `{{ticketId}}`. Suggested title: "{{title}}". Use topics: {{topics}}.
{{/if}}
{{#if ticketMode == "use-existing-ticket"}}
Use the existing docmgr ticket `{{ticketId}}`. If the ticket does not exist, stop and ask before creating a replacement.
{{/if}}
{{#if ticketMode == "no-ticket"}}
Do not create a docmgr ticket unless the work turns out to need persistent ticket bookkeeping; if that happens, ask first.
{{/if}}

Write the guide for a new intern who has not seen this system before. The document should be clear, technical, and implementation-oriented. It should include:

- an executive summary and problem statement;
- a current-state architecture map grounded in repository files, docs, tests, and API references;
- prose paragraphs that explain why each subsystem exists before describing how it works;
- component responsibility tables where useful;
- Mermaid diagrams for architecture, data flow, and important runtime sequences;
- API references, type/schema sketches, and request/response or command examples;
- pseudocode for the core algorithms and flows;
- file references with concrete paths and line ranges for important claims;
- decision records for non-obvious architecture or API choices;
- a phased implementation plan with file-level guidance;
- testing, validation, and review instructions;
- risks, alternatives, open questions, and an intern onboarding checklist.

{{#if depth == "intern-ready-exhaustive"}}
Make the document exhaustive but navigable. Prefer a long-form textbook-style guide over a terse summary.
{{/if}}
{{#if depth == "focused-implementation-guide"}}
Keep the guide focused on the implementation path while still explaining all concepts an intern needs to avoid cargo-cult changes.
{{/if}}
{{#if depth == "research-heavy-design-package"}}
Treat this as a research/design package: gather source material first, save important sources under the ticket, run small experiments when cheap, and distinguish observed evidence from recommended design inference.
{{/if}}

Maintain a chronological diary while investigating and writing. Record commands, exact failures, important findings, tricky parts, review concerns, and future follow-ups.

{{#if validateDocmgr}}
Run `docmgr doctor --ticket <TICKET-ID> --stale-after 30` when there is a docmgr ticket, fix practical issues, and report any remaining validation warnings.
{{/if}}
{{#if uploadRemarkable}}
Upload the final document bundle to reMarkable using `remarquee upload bundle ... --remote-dir "/ai/YYYY/MM/DD/<TICKET-ID>" --toc-depth 2 --non-interactive`. Do not run extra reMarkable status/list commands unless the upload fails.
{{/if}}

Final response should report the ticket/path, documents created, validation result, reMarkable destination if uploaded, and remaining risks/open questions.
