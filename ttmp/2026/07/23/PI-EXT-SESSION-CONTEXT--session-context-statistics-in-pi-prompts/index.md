---
Title: Session context statistics in Pi prompts
Ticket: PI-EXT-SESSION-CONTEXT
Status: active
Topics:
    - pi-extensions
    - pi
    - metadata
    - prompts
    - compaction
    - tokens
    - environment
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-07-23T15:12:36.922664208-04:00
WhatFor: ""
WhenToUse: ""
---

# Session context statistics in Pi prompts

## Overview

This ticket designs a new `session-context` Pi extension. It computes bounded session metadata—session id, elapsed wall-clock span, date span, models, prompt/assistant-turn counts, compactions, branch summaries, tool activity, and available usage—and injects it into the model's context. A full informational block is added to the system prompt and a compact current-turn block is added at prompt submission.

The investigation also answers the relationship to `agent-env`: `PI_AGENT_*` variables are exported only inside Bash child processes, so the model does not automatically know them. The design proposes an optional `agent-env:capability` event-bus handshake so the model can be told that the capability exists and understand its scope.

## Key Links

- [Primary analysis/design/implementation guide](design-doc/01-session-context-statistics-prompt-injection-analysis-design-and-implementation-guide.md)
- [Prompt and API reference with examples](reference/02-prompt-and-api-reference.md)
- [Investigation diary](reference/01-investigation-diary.md)
- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active** — implementation complete and smoke-tested; the related `session-summary` input hook has also been migrated to Pi's current API.

## Topics

- pi-extensions
- pi
- metadata
- prompts
- compaction
- tokens
- environment

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design-doc/ - Primary architecture and implementation guide
- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
