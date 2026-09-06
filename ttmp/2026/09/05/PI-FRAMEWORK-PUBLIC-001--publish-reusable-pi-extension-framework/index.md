---
Title: Publish reusable Pi extension framework
Ticket: PI-FRAMEWORK-PUBLIC-001
Status: active
Topics:
    - pi-extensions
    - tooling
    - documentation
    - tui
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://docs/pi-shared-extension-framework-guide.md
      Note: Existing onboarding conventions
    - Path: repo://docs/pi-testing-guide.md
      Note: Existing smoke workflow and documented drift
    - Path: repo://docs/pi-tui-ui-authoring-guide.md
      Note: Component and rendering mental model
    - Path: repo://ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/changelog.md
      Note: Ticket progress and delivery record
    - Path: repo://ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/design-doc/01-public-framework-architecture-and-intern-implementation-guide.md
      Note: Primary intern analysis and implementation specification
    - Path: repo://ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/reference/01-investigation-diary.md
      Note: Chronological investigation and delivery evidence
    - Path: repo://ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/tasks.md
      Note: Research completion separated from future implementation
ExternalSources: []
Summary: Design and extraction ticket for a public framework library and optional Pi shell package.
LastUpdated: 2026-09-05T17:15:00-04:00
WhatFor: Coordinate evidence-backed package extraction and publication.
WhenToUse: Planning or implementing reuse of the shared extension framework outside this workspace.
---


# Publish reusable Pi extension framework

## Overview

Extract the contribution registry, reusable TUI views, docs/settings orchestration, and dashboard services into a public library. Provide a separate installable Pi shell for `/px`, `/palette`, and shortcut ownership. Package names are proposed; no npm package was created or published during this research.

## Start here

- [Architecture and intern implementation guide](design-doc/01-public-framework-architecture-and-intern-implementation-guide.md): detailed current-state analysis, proposed APIs, diagrams, pseudocode, decisions, phased file-level implementation, test matrix, release gates, and source references.
- [Investigation diary](reference/01-investigation-diary.md): chronological evidence and delivery record.
- [Tasks](tasks.md): research completion and future implementation phases.
- [Contract probes](scripts/01-contract-probes.mjs) and [results](sources/01-contract-probe-results.txt): five assertions against current behavior, including confirmed defects.

## Key decisions awaiting review

1. Approve npm names/scope, license, and supported Pi/Node versions.
2. Verify runtime identity before implementing lifecycle-aware registry scoping.
3. Approve a separate library/shell boundary and explicit registration API migration.
4. Publish only implemented settings/dashboard capabilities; defer richer editors and scheduling.

## Acceptance criterion

Two independently packaged consumer extensions, installed outside this repository, appear in the same shell, resolve their shipped docs, apply settings, and survive reload without stale callbacks or duplicate terminal listeners. See the guide for the complete implementation definition of done.

## Delivery

The guide and diary were successfully uploaded as `PI-FRAMEWORK-PUBLIC-001 Public Framework Guide.pdf` to `/ai/2026/09/05/PI-FRAMEWORK-PUBLIC-001`. The upload receipt is in `sources/03-upload-receipt.txt`; ticket validation passed. The implementation ticket remains active after the completed research deliverables.
