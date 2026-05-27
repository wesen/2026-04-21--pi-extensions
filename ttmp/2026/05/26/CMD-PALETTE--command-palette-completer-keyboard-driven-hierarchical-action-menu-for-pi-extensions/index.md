---
Title: Command Palette Completer — Keyboard-Driven Hierarchical Action Menu for Pi Extensions
Ticket: CMD-PALETTE
Status: active
Topics:
    - extensions
    - tui
    - ux
    - command-palette
    - launcher
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: docs/pi-shared-extension-framework-guide.md
      Note: Framework guide — the contribution model and conventions
    - Path: docs/pi-tui-ui-authoring-guide.md
      Note: TUI guide — Component contract
    - Path: extensions/_shared/registry.ts
      Note: Core registry contract — PiExtensionRegistration
    - Path: extensions/_shared/ui/action-picker.ts
      Note: ActionPicker — the action-level selector
    - Path: extensions/_shared/ui/extension-launcher.ts
      Note: ExtensionLauncher TUI component — the modal overlay pattern to extend
    - Path: extensions/docmgr/index.ts
      Note: Uses pi.registerShortcut() with Key constants — shortcut patterns
    - Path: extensions/launcher/index.ts
      Note: Current /px launcher — shows how overlays and action delegation work
    - Path: extensions/pinned-skills/index.ts
      Note: Full-featured extension with actions
    - Path: extensions/session-tagger/index.ts
      Note: Uses pi.registerShortcut() — the shortcut registration API
ExternalSources: []
Summary: ""
LastUpdated: 2026-05-26T07:42:48.899320966-04:00
WhatFor: ""
WhenToUse: ""
---


# Command Palette Completer — Keyboard-Driven Hierarchical Action Menu for Pi Extensions

## Overview

<!-- Provide a brief overview of the ticket, its goals, and current status -->

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- extensions
- tui
- ux
- command-palette
- launcher

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
