---
Title: Investigation Diary
Ticket: TUI-EXPERIENCES
Status: active
Topics:
    - pi
    - tui
    - extensions
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ttmp/2026/04/27/TUI-EXPERIENCES--beautiful-tui-experiences-in-pi-agent/design-doc/01-beautiful-tui-experiences-in-pi-agent.md
      Note: Primary design guide created during this investigation
ExternalSources: []
Summary: Chronological investigation diary for the pi-agent rich TUI guide.
LastUpdated: 2026-04-27T11:17:03.335952217-04:00
WhatFor: Record what was inspected, why, and how to validate the TUI guide.
WhenToUse: Use when continuing or reviewing the TUI-EXPERIENCES ticket.
---


# Diary

## Goal

This diary records the investigation and documentation work for creating a detailed intern-facing guide to beautiful TUI experiences in pi-agent.

## Step 1: Ticket setup, evidence gathering, and guide authoring

I created a new docmgr ticket workspace, inspected the pi TUI and extension documentation, searched the local pi-mono source tree for the concrete TUI implementation, and analyzed Nico Bailon's TUI-heavy extensions. The main deliverable is a design and implementation guide that explains the component model, extension UI APIs, overlay lifecycle, widgets, custom editor/footer/header hooks, and practical implementation patterns.

The investigation focused on evidence-backed guidance rather than abstract advice. I used the pi docs for the public API, the pi-mono source for runtime behavior, and Nico's extensions for mature third-party patterns that demonstrate overlays, widgets, custom editor rendering, background session handling, and shell chrome customization.

### Prompt Context

**User prompt (verbatim):** "Create anew docmgr to create beautiful TUI experiences in pi-agent.

Analyze nico-bailon's extension in ~/code/others/llms/pi/ and analyze his use of TUI

and also just the code of pi and the possibilities to do rich TUI experiences.

 reate a detailed analysis / design / implementation guide that is very detailed for a new intern, explaining all the parts of the     
 system needed to understand what it is, with prose paragraphs and bullet                                                              
 point sand pseudocode and diagrams and api references and file                                                                        
   references.                                                                                                                         
   It should be very clear and detailed. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Create a new docmgr ticket, research pi-agent's TUI extension capabilities and Nico Bailon's examples, write a detailed intern-facing guide, store it in the ticket, validate it, and upload it to reMarkable.

**Inferred user intent:** The user wants reusable documentation that enables a new contributor to build polished pi-agent terminal interfaces without needing to reverse engineer pi or third-party examples from scratch.

**Commit (code):** N/A — documentation-only workspace changes.

### What I did

- Loaded the `ticket-research-docmgr-remarkable` skill and its writing/checklist references.
- Loaded the `diary` skill format requirements.
- Ran `docmgr status --summary-only` to inspect the documentation workspace.
- Created ticket `TUI-EXPERIENCES` with title `Beautiful TUI Experiences in Pi Agent`.
- Created the primary design document:
  - `ttmp/2026/04/27/TUI-EXPERIENCES--beautiful-tui-experiences-in-pi-agent/design-doc/01-beautiful-tui-experiences-in-pi-agent.md`
- Created this investigation diary:
  - `ttmp/2026/04/27/TUI-EXPERIENCES--beautiful-tui-experiences-in-pi-agent/reference/01-investigation-diary.md`
- Read pi documentation:
  - `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/README.md`
  - `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
  - `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
  - `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md`
- Searched local pi-mono source for TUI and extension API implementation points:
  - `packages/tui/src/tui.ts`
  - `packages/tui/src/components/select-list.ts`
  - `packages/tui/src/components/editor.ts`
  - `packages/coding-agent/src/core/extensions/types.ts`
  - `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
  - `packages/coding-agent/src/modes/interactive/components/custom-editor.ts`
  - `packages/coding-agent/src/modes/interactive/components/bordered-loader.ts`
  - `packages/coding-agent/src/modes/interactive/components/footer.ts`
- Searched and read Nico Bailon's extensions under `/home/manuel/code/others/llms/pi/nicobailon`, especially:
  - `pi-interactive-shell/index.ts`
  - `pi-interactive-shell/overlay-component.ts`
  - `pi-messenger/index.ts`
  - `pi-messenger/overlay.ts`
  - `pi-powerline-footer/index.ts`
  - `pi-skill-palette/index.ts`
- Wrote the guide with architecture diagrams, API references, pseudocode, implementation phases, risk analysis, validation strategy, and file references.

### Why

- The user explicitly asked for a docmgr ticket and a detailed guide for a new intern.
- Pi's TUI system is powerful but distributed across docs, source code, examples, and third-party extensions.
- Nico's extensions are especially useful because they show realistic patterns beyond toy examples: full overlays, background state, status widgets, editor/footer replacement, startup overlays, and multi-agent messaging.

### What worked

- `docmgr ticket create-ticket` and `docmgr doc add` created the ticket workspace and documents successfully.
- The pi `docs/tui.md` file provided a strong public API baseline, including component contracts, overlays, built-ins, theming, widgets, custom footer, and custom editor patterns.
- The local pi-mono source provided concrete implementation evidence for `ExtensionUIContext`, `ctx.ui.custom()`, custom editor replacement, and UI reset behavior.
- `rg -n` over Nico's extensions quickly identified the important TUI usage sites.

### What didn't work

- A final `find ttmp/TUI-EXPERIENCES` command failed because docmgr created the ticket under a date-based path, not a flat ticket directory.
- Exact failure:
  - Command suffix: `find ttmp/TUI-EXPERIENCES -maxdepth 3 -type f -print | sort`
  - Error: `find: ‘ttmp/TUI-EXPERIENCES’: No such file or directory`
- The correct path is:
  - `ttmp/2026/04/27/TUI-EXPERIENCES--beautiful-tui-experiences-in-pi-agent/`

### What I learned

- Pi's TUI extension API is intentionally broad: it supports modal dialogs, overlays, widgets, custom footer/header, custom editor, raw input listeners, and renderers.
- The deepest integration point is not the overlay API but `setEditorComponent`, because it changes the core input path and must preserve pi app keybindings.
- Nico's strongest pattern is pairing a transient overlay with a persistent widget/status so hidden or background state remains discoverable.
- Rich TUI quality mostly comes from lifecycle discipline: width-safe rendering, `requestRender()` after state changes, cleanup in `dispose()` and `session_shutdown`, and careful focus/key handling.

### What was tricky to build

- The research crossed three locations: installed pi docs, local pi-mono source, and Nico's extension repos. The same concept appears at multiple levels: public docs, type definitions, interactive-mode implementation, and third-party usage.
- The extension API has both high-level methods (`select`, `confirm`) and low-level component factories (`custom`, `setEditorComponent`). The guide needed to explain when to use each so an intern does not over-engineer a simple prompt or under-design a full overlay.
- The `pi-powerline-footer` extension is powerful but invasive. It demonstrates real capability, but the guide needed to warn that editor replacement is a last-resort tool because it can break core pi affordances if mishandled.

### What warrants a second pair of eyes

- The guide cites source locations from the current local checkout. If pi-mono changes significantly, line numbers may drift.
- The guide recommends patterns based on observed extension code and public docs; an implementer should still test against the currently installed pi version.
- The `pi-powerline-footer` analysis is intentionally conservative; someone maintaining that extension may have additional context about safe monkey-patching patterns.

### What should be done in the future

- Add a small runnable example extension to the ticket if the next step is implementation rather than documentation.
- Consider adding a checklist script that scans rendered component lines for `visibleWidth(line) <= width`.
- Keep this guide updated if `ExtensionUIContext` gains new capabilities or overlay options change.

### Code review instructions

- Start with the design doc:
  - `ttmp/2026/04/27/TUI-EXPERIENCES--beautiful-tui-experiences-in-pi-agent/design-doc/01-beautiful-tui-experiences-in-pi-agent.md`
- Validate that the guide references the right source areas:
  - `packages/tui/src/tui.ts`
  - `packages/coding-agent/src/core/extensions/types.ts`
  - `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
  - Nico's `pi-interactive-shell`, `pi-messenger`, `pi-powerline-footer`, and `pi-skill-palette`.
- Run validation:
  - `docmgr doctor --ticket TUI-EXPERIENCES --stale-after 30`
- Confirm reMarkable upload after validation.

### Technical details

Key evidence commands used:

```bash
docmgr status --summary-only
find /home/manuel/code/others/llms/pi -maxdepth 3 -type f | head -200
find /home/manuel/code/others/llms/pi/nicobailon -maxdepth 2 -type f \( -name '*.ts' -o -name 'README.md' -o -name 'package.json' \) | sort
rg -n "ctx\.ui\.custom|setWidget|setFooter|setEditorComponent|class .*Component|interface Component|class TUI|custom\(" packages examples -S
rg -n "ctx\.ui\.|setWidget|custom\(|overlay|setFooter|setEditorComponent|setStatus|requestRender|handleInput|render\(|registerCommand|registerTool|class .*Component" /home/manuel/code/others/llms/pi/nicobailon -S
```
