---
Title: ""
Ticket: ""
Status: ""
Topics: []
DocType: ""
Intent: ""
Owners: []
RelatedFiles:
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/design/analysis.md
      Note: System analysis
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/design/implementation.md
      Note: Complete implementation guide
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/playbooks/setup-and-test.md
      Note: Setup and test playbook
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/reference/api-cheatsheet.md
      Note: API quick reference
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/event-stream.ts
      Note: AssistantMessageEventStream implementation
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/extending-pi-readme.md
      Note: Extending Pi README (defuddled)
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/extending-pi-skill.md
      Note: Extending Pi SKILL.md (defuddled)
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/extension-examples-readme.md
      Note: Extension examples README
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/extension-types.ts
      Note: ExtensionAPI type definitions
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/hidden-thinking-label.ts
      Note: 'Example: hidden thinking label extension'
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/message-renderer.ts
      Note: 'Example: custom message renderer'
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/messages.ts
      Note: Extended message types (CustomMessage
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/pi-ai-types.ts
      Note: Pi AI package type definitions
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/pi-extensions-docs.md
      Note: Pi extensions documentation (defuddled)
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/pi-session-docs.md
      Note: Pi session/message types documentation (defuddled)
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/status-line.ts
      Note: 'Example: status line'
    - Path: ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/sources/widget-placement.ts
      Note: 'Example: widget placement'
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---




# Pi Extension: Hello World Before Thinking Blocks

## Purpose

This ticket documents the design, analysis, and implementation of a **Pi extension** that inserts the text "Hello World" immediately before every thinking block rendered by the Pi coding agent. The goal is educational: to build a complete, working extension from first principles, explaining every subsystem an intern needs to understand along the way.

## What We Are Building

A TypeScript extension for [Pi](https://github.com/badlogic/pi-mono) (the terminal coding agent by Mario Zechner) that:

1. **Detects** when the LLM begins emitting a thinking/reasoning block
2. **Reacts** by displaying "Hello World" in the terminal UI before the thinking content appears
3. **Cleans up** when thinking ends, so the UI remains tidy

## Document Structure

| Document | Purpose | Audience |
|----------|---------|----------|
| [`design/analysis.md`](design/analysis.md) | System architecture, message flow, thinking block lifecycle, event taxonomy | New intern |
| [`design/implementation.md`](design/implementation.md) | Complete implementation guide with pseudocode, real code, file references, and testing | New intern |
| [`reference/api-cheatsheet.md`](reference/api-cheatsheet.md) | Quick-reference for ExtensionAPI, ExtensionContext, event types, and UI methods | Anyone implementing |
| [`playbooks/setup-and-test.md`](playbooks/setup-and-test.md) | Step-by-step commands to scaffold, install, run, and debug the extension | Anyone testing |

## Key References

- **Pi Mono Repo**: https://github.com/badlogic/pi-mono
- **Extensions Documentation**: [`packages/coding-agent/docs/extensions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- **Extension Examples**: [`packages/coding-agent/examples/extensions/`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/)
- **Session/Message Types**: [`packages/coding-agent/docs/session.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session.md)
- **Pi AI Types**: [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/types.ts)
- **Extension Types**: [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts)
- **Extending Pi Skill**: https://github.com/tmustier/pi-extensions/tree/main/extending-pi

## Status

- [x] Analysis complete
- [x] Implementation guide drafted
- [x] Documents uploaded to reMarkable
- [ ] Code written and tested with a thinking-capable model
