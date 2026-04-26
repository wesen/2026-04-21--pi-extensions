---
Title: PI Agent Metadata Environment Variables Extension
Ticket: PI-EXT-AGENT-ENV
Status: active
Topics:
    - pi-extensions
    - agent
    - environment
    - metadata
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/agent-env/README.md
      Note: agent-env user documentation
    - Path: extensions/agent-env/env.ts
      Note: Safe env snapshot
    - Path: extensions/agent-env/index.ts
      Note: agent-env extension event handlers and commands
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design-doc/01-plan-review-and-revised-design.md
      Note: Independent plan review and revised implementation design
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/01-analysis.md
      Note: API exploration and approach comparison
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/02-design.md
      Note: Architecture design and implementation plan
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/reference/01-diary.md
      Note: Implementation diary
ExternalSources: []
Summary: |
    Build a PI extension that injects agent metadata (session_id, turn_index, model info, cwd, etc.) as PI_AGENT_* environment variables into every bash tool execution and user ! / !! command.
LastUpdated: 2026-04-26T08:55:24.086684246-04:00
WhatFor: ""
WhenToUse: ""
---








# PI Agent Metadata Environment Variables Extension

## Overview

This ticket designs and tracks implementation of a PI extension (`agent-env`)
that exposes agent metadata as `PI_AGENT_*` environment variables during bash
tool calls. This allows scripts and build tools to know they are running under
PI and to correlate activity with the current session, turn, and model.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- pi-extensions
- agent
- environment
- metadata

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
