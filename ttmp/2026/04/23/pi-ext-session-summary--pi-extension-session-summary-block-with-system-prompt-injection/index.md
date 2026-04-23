---
Title: ""
Ticket: ""
Status: ""
Topics: []
DocType: ""
Intent: ""
Owners: []
RelatedFiles:
    - Path: ttmp/2026/04/23/pi-ext-session-summary--pi-extension-session-summary-block-with-system-prompt-injection/design/analysis.md
      Note: System analysis and architecture
    - Path: ttmp/2026/04/23/pi-ext-session-summary--pi-extension-session-summary-block-with-system-prompt-injection/design/implementation.md
      Note: Complete implementation guide
    - Path: ttmp/2026/04/23/pi-ext-session-summary--pi-extension-session-summary-block-with-system-prompt-injection/playbooks/setup-and-test.md
      Note: Setup and test playbook
    - Path: ttmp/2026/04/23/pi-ext-session-summary--pi-extension-session-summary-block-with-system-prompt-injection/reference/api-cheatsheet.md
      Note: API quick reference
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---


# Pi Extension: Session Summary Block with System Prompt Injection

## Purpose

Build a Pi extension that enforces structured session summaries at the end of every model turn. The extension:

1. **Injects** a system prompt instruction asking the model to output a `<summary>...</summary>` block before ending each turn
2. **Appends** a reminder to every user prompt: "don't forget to add the `<summary>...</summary>`"
3. **Detects** whether the model actually emitted the summary block when the turn finishes
4. **Displays** a widget showing the parsed summary, or a warning widget if the summary is missing

## What the Summary Block Contains

The summary block is an XML-tagged structure (with optional nested JSON) that recaps:

- **Work done this turn** — what files were read, edited, written, what commands were run
- **Work done in the entire session so far** — cumulative progress since session start
- **Issues encountered** — errors, blockers, warnings, or assumptions made
- **Next steps** — what the model plans to do next, or what the user should do

## Document Structure

| Document | Purpose |
|----------|---------|
| [`design/analysis.md`](design/analysis.md) | System architecture, event flow, design decisions, schema design |
| [`design/implementation.md`](design/implementation.md) | Complete implementation plan with pseudocode and real code |
| [`reference/api-cheatsheet.md`](reference/api-cheatsheet.md) | Quick-reference for APIs this extension uses |
| [`playbooks/setup-and-test.md`](playbooks/setup-and-test.md) | Step-by-step commands to scaffold, run, and test |

## Key References

- **Pi Mono Repo**: https://github.com/badlogic/pi-mono
- **Extensions Documentation**: [`packages/coding-agent/docs/extensions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- **Pi System Prompt Docs**: `packages/coding-agent/docs/system-prompt.md`
- **Extension Examples**: [`packages/coding-agent/examples/extensions/pirate.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/pirate.ts) (system prompt append example)
- **Previous Ticket**: [[pi-ext-thinking-hello]] — Hello World thinking block extension (same repo, shared patterns)

## Status

- [x] Analysis complete
- [x] Implementation plan drafted
- [x] Code written and tested
- [x] Uploaded to reMarkable
- [x] Inline mutation removed (Pi passes copies, not references)
- [x] Bordered widget rendering added
- [x] File logging added for debugging
- [x] Repo README updated with go-minitrace guide
