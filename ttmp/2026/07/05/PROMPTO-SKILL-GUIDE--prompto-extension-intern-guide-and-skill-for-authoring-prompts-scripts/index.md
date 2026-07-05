---
Title: Prompto Extension Intern Guide and Skill for Authoring Prompts/Scripts
Ticket: PROMPTO-SKILL-GUIDE
Status: complete
Topics:
    - prompto
    - pi-extension
    - documentation
    - skill-authoring
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/prompto/index.ts
      Note: 'Extension entrypoint: registerPiExtension'
    - Path: extensions/prompto/plugin-protocol.ts
      Note: Pure JSONL parsing (parseDescribeOutput
    - Path: extensions/prompto/plugin.ts
      Note: describePlugin + renderViaPlugin subprocess execution
    - Path: extensions/prompto/run.ts
      Note: runPrompto orchestrator + expandTemplate + collectValues two-pass prefill
    - Path: extensions/prompto/store.ts
      Note: PromptStore layered scan + shadowing + plugin describer seam
    - Path: extensions/prompto/template.ts
      Note: parseTemplate/parseFields/parsePrefill/renderTemplate + the tiny dialect
ExternalSources: []
Summary: Analyze the prompto pi extension and produce an intern-ready analysis/design/implementation guide plus authoring playbooks, to serve as the foundation for a prompto-authoring skill. Bundle uploaded to reMarkable.
LastUpdated: 2026-07-05T17:18:22.817368986-04:00
WhatFor: Onboard a new intern to prompto end-to-end and provide the canonical reference for a future prompto-authoring skill.
WhenToUse: Read the design doc before writing, reviewing, or refactoring any prompto template, plugin, or part of the extension itself.
---








# Prompto Extension Intern Guide and Skill for Authoring Prompts/Scripts

## Overview

This ticket produces a complete intern-ready analysis, design, and
implementation guide for the `prompto` pi extension, plus focused authoring
playbooks and a quick reference card. The work is the foundation for a
future skill that teaches prompto prompt/script authoring.

Prompto is a pi extension that turns reusable prompt fragments into a
form-driven workflow. It supports three kinds of prompts — **plain** (a
file, pasted verbatim), **template** (YAML frontmatter `fields:` + a tiny
`{{name}}`/`{{#if}}` rendering dialect), and **plugin** (an executable
speaking a two-phase JSONL protocol). Templates and plugins are discovered
from two layered directories: project (`.pi/prompts/`) and global
(`~/.pi/agent/prompts/`), with project shadowing global.

## Documents

- **[design/01-prompto-intern-guide.md](./design/01-prompto-intern-guide.md)** —
  THE main deliverable. A textbook-style intern guide covering: the mental
  model, every subsystem (store, parsing, rendering, plugin protocol,
  prefill, value memory, config, runtime, UI), authoring guides for all
  three kinds, test architecture, operations, a full API reference, file
  map, glossary, onboarding checklist, and 7 decision records.
- **[playbooks/01-author-a-template.md](./playbooks/01-author-a-template.md)** —
  Step-by-step checklist for authoring a template (frontmatter + dialect).
- **[playbooks/02-author-a-plugin.md](./playbooks/02-author-a-plugin.md)** —
  Step-by-step checklist for authoring a JSONL plugin (describe + render).
- **[reference/02-quick-reference-card.md](./reference/02-quick-reference-card.md)** —
  One-page cheat sheet: dialect, field schema, prefill schema, protocol
  frames, commands, paths, diagnostics.

## Key Links

- **Source under analysis**: `extensions/prompto/` (13 TS files, 65 passing tests)
- **Real templates** (in this repo): `.pi/prompts/{demo,docmgr,obsidian,research,workflow}/*.md`
- **Reference plugins**: `extensions/prompto/examples/{git-diff.plugin.sh,tickets.plugin.py}`
- **Related Files**: see frontmatter `RelatedFiles`

## Status

Current status: **active** — guide complete; reMarkable upload pending.

## Topics

- prompto
- pi-extension
- documentation
- skill-authoring

## Tasks

See [tasks.md](./tasks.md). Analysis, guide, playbooks, and API reference
are complete; the reMarkable upload is the remaining task.

## Changelog

See [changelog.md](./changelog.md).

## Structure

- `design/` — the main intern guide (analysis + design + implementation)
- `reference/` — quick reference card
- `playbooks/` — step-by-step authoring playbooks
- `scripts/` — (reserved for any helper scripts)
- `sources/` — (reserved for external source material)
- `various/` — working notes
- `archive/` — deprecated artifacts
