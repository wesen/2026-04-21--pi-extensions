---
Title: Pi docmgr extension for status, tickets, docs, and tasks
Ticket: PI-EXT-DOCMGR
Status: active
Topics:
    - tooling
    - documentation
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/docmgr/docmgr-cli.ts
      Note: Structured docmgr CLI adapter used by the v1 flows
    - Path: extensions/docmgr/index.ts
      Note: Pi extension entrypoint and command wiring for the docmgr dashboard
ExternalSources: []
Summary: Pi extension design for surfacing docmgr workspace status, ticket browsing/closing, doc browsing, and task toggling.
LastUpdated: 2026-04-25T11:07:32.001319034-04:00
WhatFor: ""
WhenToUse: ""
---






# Pi docmgr extension for status, tickets, docs, and tasks

## Overview

This ticket covers the first slice of a Pi extension that wraps the docmgr CLI in a Pi-native UI.

The extension will start with four small, high-value workflows:

1. status bar visibility for the active docmgr workspace,
2. ticket browsing and close confirmation,
3. doc browsing and preview,
4. task browsing and checkbox toggling.

The design intentionally avoids full editing and import/search workflows until the first release proves the UI shape and state model.

## Key Links

- **Design**: [design-doc/01-pi-docmgr-extension-design.md](./design-doc/01-pi-docmgr-extension-design.md)
- **Implementation guide**: [playbook/01-pi-docmgr-extension-implementation-guide.md](./playbook/01-pi-docmgr-extension-implementation-guide.md)
- **Diary**: [reference/01-diary.md](./reference/01-diary.md)

## Status

Current status: **active**

## Topics

- tooling
- documentation

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design-doc/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbook/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
