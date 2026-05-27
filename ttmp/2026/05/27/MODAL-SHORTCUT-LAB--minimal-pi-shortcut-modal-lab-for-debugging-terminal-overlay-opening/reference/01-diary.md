---
Title: Diary
Ticket: MODAL-SHORTCUT-LAB
Status: active
Topics:
    - pi
    - extensions
    - tui
    - debugging
    - shortcuts
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/modal-shortcut-lab/index.ts
      Note: Implementation work recorded in diary
    - Path: extensions/modal-shortcut-lab/README.md
      Note: Lab extension quick runbook
    - Path: ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/design-doc/01-analysis-and-design-guide.md
      Note: Design guide written during Step 1 and Step 2
    - Path: ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/scripts/02-smoke-tmux-ctrl-shift-p.sh
      Note: Smoke test evidence captured in diary
ExternalSources: []
Summary: Chronological diary for building the modal shortcut lab and documenting shortcut-opened overlay debugging.
LastUpdated: 2026-05-27T22:00:00-04:00
WhatFor: Use this diary to reconstruct the investigation and write a post-mortem.
WhenToUse: Read before resuming MODAL-SHORTCUT-LAB work or changing command-palette shortcut behavior.
---


# Diary

## Goal

This diary records the creation of an isolated Pi extension lab for debugging shortcut-opened modals. It captures the reasoning, commands, failures, and validation evidence needed to reconstruct the work later for a post-mortem.

## Step 1: Create a Separate Ticket and Define the Investigation Scope

The first move was to stop changing the production command palette directly and create a separate investigation workspace. The goal was to make the next debugging loop smaller: prove each layer independently before returning to the command palette.

I created a new docmgr ticket, added an intern-oriented design guide document, added a diary, and created a task list that separates documentation, implementation, isolated launch, smoke testing, reMarkable upload, and post-mortem bookkeeping.

### Prompt Context

**User prompt (verbatim):** "Ok, let's take a step back, we are looping around. Let's create a test extension that is a minimal surface that allows us to test things from the ground up, increasingly complex shortcuts. Opening modals. Using a shortcut to open a modal. etc... RUnning it in a pi that has no other extensions going if possible.

Create a separate ticket to investigate this shortcut opening a modal issue, and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.


Then add a detailed list of tasks and work, keeping a detailed diary as you go. We want to retrace your steps later on to write a proper post mortem"

**Assistant interpretation:** Create a new docmgr ticket for a clean shortcut/modal investigation, write a detailed intern-ready technical guide, implement a minimal test extension, run it in isolated Pi if possible, upload the guide to reMarkable, and keep post-mortem-quality diary/task/changelog records.

**Inferred user intent:** Avoid further production command-palette guesswork by building a controlled reproduction harness and preserving the reasoning trail.

### What I did
- Created ticket `MODAL-SHORTCUT-LAB` with title `Minimal Pi shortcut modal lab for debugging terminal overlay opening`.
- Added `design-doc/01-analysis-and-design-guide.md`.
- Added `reference/01-diary.md`.
- Added tasks for guide writing, lab implementation, shortcut paths, debug logging, isolated launch, smoke testing, reMarkable upload, and post-mortem bookkeeping.
- Read relevant Pi/project docs before implementation:
  - `docs/pi-shared-extension-framework-guide.md`
  - `docs/pi-tui-ui-authoring-guide.md`
  - Pi official `docs/extensions.md`
  - Pi official `docs/tui.md`
  - Pi official `docs/keybindings.md`

### Why
- The command palette had accumulated several plausible fixes, but the debugging loop was still coupled to production behavior.
- A separate ticket keeps the investigation focused and prevents the command palette from becoming the experimental harness.
- The guide gives a future intern or reviewer enough context to reason about Pi extension loading, commands, shortcuts, raw terminal input, overlays, focus, and render timing.

### What worked
- `docmgr ticket create-ticket` created the expected workspace under `ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/`.
- `docmgr doc add` created the design guide and diary documents with frontmatter.
- Task creation worked through `docmgr task add`.

### What didn't work
- The initial generated `tasks.md` contained the placeholder `Add tasks here`. I removed it manually when organizing the tasks into Done/TODO sections.

### What I learned
- Pi supports the exact isolation mode needed for this investigation: `pi --no-extensions -e <extension>`. Explicit `-e` extensions still load while discovered extensions are disabled.

### What was tricky to build
- The investigation scope had to remain broad enough to include commands, overlays, shortcuts, raw terminal input, and render timing, but narrow enough not to re-create the full command palette.
- The ticket task list therefore splits production-like behavior into layers rather than defining one large task called "fix shortcuts".

### What warrants a second pair of eyes
- The ticket topics and doc types should stay aligned with docmgr vocabulary and project conventions.
- The guide should be reviewed for whether it is truly intern-ready and not just a dump of debugging notes.

### What should be done in the future
- Keep adding diary entries after each experiment rather than waiting until the end.

### Code review instructions
- Start with `ttmp/.../design-doc/01-analysis-and-design-guide.md` for the investigation plan.
- Then inspect `ttmp/.../tasks.md` to see what is done versus remaining.

### Technical details
- Ticket path: `ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/`

## Step 2: Implement the Minimal Modal Shortcut Lab Extension

The implementation created a new extension under `extensions/modal-shortcut-lab/`. It is intentionally small and isolated. It exposes a single modal component and several ways to open it, so each layer can be tested without involving the command palette registry, hierarchy, action execution, or search state.

The lab records structured JSONL events to `/tmp/pi-modal-shortcut-lab.log`. The logs are meant to answer whether raw input arrived, whether scheduling fired, whether `ctx.ui.custom()` created the component, whether `onHandle` ran, whether focus was set, whether render was requested, whether `render()` ran, and whether input later closed the modal.

### Prompt Context

**User prompt (verbatim):** (same as Step 1)

**Assistant interpretation:** Implement the requested minimal surface for command-opened modals, shortcut-opened modals, raw terminal shortcuts, and render/focus diagnostics.

**Inferred user intent:** Get a clean reproduction tool that can be run without global/project extension noise.

**Commit (code):** 85e1595 — "feat(modal-lab): add isolated shortcut modal test extension"

### What I did
- Added `extensions/modal-shortcut-lab/index.ts`.
- Added `extensions/modal-shortcut-lab/README.md`.
- Registered the extension with `registerPiExtension()` to follow repository conventions.
- Added commands:
  - `/modal-lab notify`
  - `/modal-lab replace`
  - `/modal-lab overlay`
  - `/modal-lab scheduled`
  - `/modal-lab status`
  - `/modal-lab-debug on|off|clear|tail|status`
- Added registered shortcut paths:
  - `Ctrl+Shift+M` direct overlay open
  - `Ctrl+Shift+Alt+M` scheduled overlay open
- Added raw terminal paths:
  - `Ctrl+Shift+P` scheduled overlay open
  - `Ctrl+Shift+O` direct overlay open
- Added `LabModal`, a tiny `Component` implementation with render/input counters.
- Added structured logging events for raw input, scheduling, custom UI factory, overlay handle, render kicks, render calls, input, and completion.
- Added ticket scripts:
  - `scripts/01-run-isolated-modal-lab.sh`
  - `scripts/02-smoke-tmux-ctrl-shift-p.sh`

### Why
- Slash commands establish that extension load and command dispatch work before shortcut handling is involved.
- Replacement custom UI establishes that `ctx.ui.custom()` can create and focus a component without overlay behavior.
- Overlay command establishes that overlay rendering works without shortcut timing.
- Registered shortcuts test Pi's high-level shortcut system.
- Raw terminal shortcuts test the path used by the production command palette.
- Scheduled raw open tests the suspected timing boundary between consuming terminal input and mounting the overlay.

### What worked
- Extension load check passed:
  - `timeout 25 pi --no-extensions -e /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/modal-shortcut-lab/index.ts --list-models`
  - exit code: `0`
- Tmux smoke test succeeded with the observed kitty/tmux CSI-u `Ctrl+Shift+P` sequence:
  - sent: `\e[112:80;6u`
  - pane showed `Modal Shortcut Lab`
  - log included `raw.input`, `schedule.fire`, `custom.onHandle`, `modal.render`, and `modal.render.done`.

### What didn't work
- No implementation failure was observed in the first smoke test.
- Buffer/replay experiments are not implemented yet. The lab currently proves the base shortcut-to-modal path and records raw events; controlled replay policies are a future phase.

### What I learned
- In an isolated `--no-extensions -e` Pi process, the raw `Ctrl+Shift+P` path can schedule, mount, focus, request render, and render the modal immediately under tmux.
- That means if production still fails, the difference is likely in extra production logic: buffering/replay, competing extensions, command-palette component behavior, or terminal event sequences not reproduced by the scripted smoke test.

### What was tricky to build
- The lab needed to bind `Ctrl+Shift+P` to reproduce the command-palette problem, but doing so would conflict with the production command palette if both loaded. The runbook therefore makes isolated mode mandatory.
- The render burst is useful for diagnostics but should not automatically be considered the production design. It is intentionally noisy so the log can classify render timing.

### What warrants a second pair of eyes
- `ctx.ui.onTerminalInput()` is used by production code but is less prominent in public docs than `pi.registerShortcut()`. Its use in the lab should be checked against current Pi API expectations.
- The direct raw open path may be intentionally unsafe in some terminal states; it is present as a comparison, not a recommendation.

### What should be done in the future
- Add explicit buffering/replay modes to reproduce the `ESC[27u` cancellation class in isolation.
- Add a parser or post-processing script that summarizes log event sequences into a compact timeline.

### Code review instructions
- Start with `extensions/modal-shortcut-lab/index.ts`.
- Review `registerRawTerminalListener()`, `scheduleOpen()`, `openLabModal()`, and `LabModal.render()`.
- Validate with:
  - `timeout 25 pi --no-extensions -e /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/modal-shortcut-lab/index.ts --list-models`
  - `ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/scripts/02-smoke-tmux-ctrl-shift-p.sh`

### Technical details
- Debug log: `/tmp/pi-modal-shortcut-lab.log`
- Isolated launch: `pi --no-extensions --no-session -e /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/modal-shortcut-lab/index.ts`
- Smoke sequence sent by script: `ESC[112:80;6u`

## Step 3: Upload the Design Guide to reMarkable

After writing the intern-ready design guide and validating the first lab implementation, I uploaded the guide to reMarkable so it can be read away from the codebase. This preserves the design rationale in a review-friendly format before the investigation continues into buffering/replay experiments.

The upload targeted the ticket-specific destination under the dated `/ai` hierarchy. The upload command succeeded and printed the remote folder path, so no extra verification command was needed.

### Prompt Context

**User prompt (verbatim):** (same as Step 1)

**Assistant interpretation:** Publish the written design guide to reMarkable as part of the requested ticket workflow.

**Inferred user intent:** Make the investigation design available for careful review and later post-mortem writing.

### What I did
- Ran `remarquee upload bundle` for the design guide.
- Uploaded the resulting PDF as `MODAL SHORTCUT LAB Design Guide.pdf`.
- Marked the upload task complete with `docmgr task check --ticket MODAL-SHORTCUT-LAB --id 7`.
- Updated the ticket changelog with the reMarkable destination.

### Why
- The user explicitly requested upload to reMarkable.
- The guide is long-form and better suited to review as a PDF than as only raw Markdown in the terminal.

### What worked
- Upload command succeeded:
  - `OK: uploaded MODAL SHORTCUT LAB Design Guide.pdf -> /ai/2026/05/27/MODAL-SHORTCUT-LAB`

### What didn't work
- My first frontmatter validation command used a repo-relative path beginning with `ttmp/...`. `docmgr validate frontmatter` resolves paths relative to the docs root, so it tried to open `ttmp/ttmp/...` and failed:
  - `Error: open /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/design-doc/01-analysis-and-design-guide.md: no such file or directory`
  - `Error: open /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/reference/01-diary.md: no such file or directory`
- Re-running with docs-root-relative paths (`2026/05/27/...`) succeeded.
- While cleaning duplicate related-file frontmatter, I changed `ExternalSources` to a map form. Validation failed because this field expects strings:
  - `Line: 26 Col: 0`
  - `Problem: yaml: unmarshal errors:`
  - `line 25: cannot unmarshal !!map into string`
  - `line 27: cannot unmarshal !!map into string`
  - `line 29: cannot unmarshal !!map into string`
- I fixed `ExternalSources` by changing the entries back to quoted strings.

### What I learned
- No reMarkable auth or filename issue occurred for this document name.
- For `docmgr validate frontmatter --doc`, use a path relative to `ttmp/` rather than a repo-relative `ttmp/...` path.
- `RelatedFiles` accepts structured `{ Path, Note }` entries, but `ExternalSources` in this docmgr schema expects string entries.

### What was tricky to build
- The upload skill recommends avoiding routine post-upload cloud listing. I relied on the successful `OK: uploaded ...` output instead of running extra verification commands.

### What warrants a second pair of eyes
- Review the PDF on-device for readability if the guide will be used as onboarding material.

### What should be done in the future
- If the guide changes substantially after buffering/replay experiments, upload a revised version or a second follow-up document.

### Code review instructions
- Review the source Markdown at `ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/design-doc/01-analysis-and-design-guide.md`.
- Confirm the remote location in the upload output if needed; do not run routine cloud listing unless troubleshooting.

### Technical details
- Remote path: `/ai/2026/05/27/MODAL-SHORTCUT-LAB`
- Uploaded name: `MODAL SHORTCUT LAB Design Guide.pdf`
