---
Title: Pi extension to save last LLM response and import into docmgr
Ticket: PI-EXT-RESPONSE-CAPTURE
Status: active
Topics:
    - pi-extensions
    - documentation
    - tooling
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/response-capture/README.md
      Note: Usage documentation
    - Path: extensions/response-capture/docmgr.ts
      Note: Docmgr ticket list/select/import helper
    - Path: extensions/response-capture/index.ts
      Note: Extension commands and turn_end capture hook
    - Path: extensions/response-capture/response.ts
      Note: Response capture
    - Path: ttmp/2026/04/26/PI-EXT-RESPONSE-CAPTURE--pi-extension-to-save-last-llm-response-and-import-into-docmgr/design-doc/01-implementation-guide.md
      Note: Detailed implementation guide
    - Path: ttmp/2026/04/26/PI-EXT-RESPONSE-CAPTURE--pi-extension-to-save-last-llm-response-and-import-into-docmgr/reference/01-implementation-diary.md
      Note: Implementation diary
ExternalSources:
    - local:2026-04-26T13-57-33-340Z-second-capture.md
Summary: |
    Design and implementation plan for a Pi extension that captures the last assistant/LLM response, saves it as a markdown file, and optionally imports it into a selected docmgr ticket with `docmgr import file --file ... --ticket ...`.
LastUpdated: 2026-04-26T09:57:35.478979066-04:00
WhatFor: ""
WhenToUse: ""
---









# Pi extension to save last LLM response and import into docmgr

## Overview

This ticket tracks a `response-capture` Pi extension. The extension should remember the most recent assistant response, let the user save it as markdown, and then optionally import the saved file into a docmgr ticket selected interactively from Pi.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- pi-extensions
- documentation
- tooling

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
