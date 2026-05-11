---
Title: Diary
Ticket: PI-EXT-SELECTIVE-COMPACTION
Status: active
Topics:
    - compaction
    - extensions
    - pi
    - tui
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: .pi/settings.json
      Note: Step 3 project extension loading
    - Path: extensions/selective-compaction/index.ts
      Note: Step 3 main extension implementation
    - Path: extensions/selective-compaction/prompt.ts
      Note: Step 3 dedicated prompt and parser
    - Path: extensions/selective-compaction/session.ts
      Note: Step 3 partition and session-copy helpers
    - Path: ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/design/01-selective-session-compaction-extension.md
      Note: Initial interpretation and design questions for selective compaction
    - Path: ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/design/02-selective-compaction-intern-implementation-guide.md
      Note: Detailed design guide and prompt architecture recorded in Step 2
ExternalSources: []
Summary: Chronological diary for the selective session compaction extension ticket.
LastUpdated: 2026-05-11T09:03:54.103885917-04:00
WhatFor: Record interpretation, design, implementation, validation, failures, and review notes for PI-EXT-SELECTIVE-COMPACTION.
WhenToUse: Use before resuming work on the selective compaction extension ticket.
---




# Diary

## Goal

This diary captures the creation and evolution of the selective session compaction extension ticket.

## Step 1: Create ticket and capture initial interpretation

I created the docmgr workspace for a proposed Pi extension that lets a user choose a contiguous message range in a session and replace that range with a compacted summary plus a bridge into the later context. This step is intentionally lightweight: the user asked for a concise interpretation first so the design can be validated before implementation begins.

The key design assumption recorded here is that messages before and after the selected range are preserved verbatim, while only the marked middle range is summarized and bridged.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket on creating a new extension (use our framework to register it) where we can select a start and a stop message in the session, and then ask for compaction to create a new conversation where we have:

input: system prompt - A: series of messages ^-- compact start - B: series of messages ^-- compact end marker - C: messages

output: system prompt - A: series of message + B': summary of messages + B'' - \"linkage message\" to bridge over to C + C

say how you interpreted this concisely so I can validate before we start seriously ."

**Assistant interpretation:** Create a docmgr ticket for a Pi extension that registers through the extension framework and supports range-based compaction: preserve pre-range messages, summarize the selected range, insert a bridge, and preserve post-range messages in a new conversation.

**Inferred user intent:** Validate the intended product behavior and data transformation before spending time on Pi docs, framework integration, and implementation details.

### What I did
- Ran `docmgr status --summary-only` and `docmgr ticket list` to inspect the current doc workspace.
- Created ticket `PI-EXT-SELECTIVE-COMPACTION`.
- Added design doc `design/01-selective-session-compaction-extension.md`.
- Added this diary at `reference/01-diary.md`.
- Added three initial tasks for validation, documentation review, and design.

### Why
- The ticket provides a durable workspace for the upcoming extension design and implementation.
- Capturing the interpretation early makes it easier for the user to correct the model before implementation work starts.

### What worked
- The ticket, design doc, diary, and initial tasks were created successfully.
- The concise transformation model is now recorded in the design doc.

### What didn't work
- N/A.

### What I learned
- There are existing Pi compaction-related tickets (`PI-EXT-COMPACTION-TITLE`, `PI-EXT-COMPACTION-METER`, `PI-EXT-PINNED-SKILLS`) that should likely be reviewed before implementation.

### What was tricky to build
- This step did not implement code. The main ambiguity is semantic: whether `B''` should be its own message, part of the summary, or a special system/developer handoff artifact.

### What warrants a second pair of eyes
- Confirm the exact output transcript shape, especially message roles and whether marker metadata is visible in the transcript.

### What should be done in the future
- Read the Pi extension docs and relevant existing compaction extensions before designing APIs.
- Decide whether the extension should create a new conversation immediately or show a confirmation/preview first.

### Code review instructions
- No code changed in this step.
- Review `design/01-selective-session-compaction-extension.md` for the captured interpretation and open questions.

### Technical details
- Ticket path: `ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction`.


## Step 2: Write intern-facing design and implementation guide

I expanded the ticket from a short interpretation into a detailed intern-facing design package. The design now states that selective compaction should use a dedicated prompt inspired by Pi's compaction structure, but tuned toward the practical goal of recovering context window by explaining what happened in the selected range and what remains relevant afterward.

The guide recommends implementing the feature as a safe new-session rewrite rather than an in-place mutation or a normal `CompactionEntry`. This preserves the old session, keeps `A` and `C` verbatim, and inserts `B'` plus `B''` as extension-owned context messages.

### Prompt Context

**User prompt (verbatim):** "use a dedicated prompt, but do it inspired by the compaction ttemplate. But the overall goal is to say "this is what happened, this is what is going to be relevant" and thus reduce old parts of the conversation that are not really needed anymore, in order to gain context window back.

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Produce a detailed technical guide for an intern, stored in the docmgr ticket and uploaded to reMarkable, that explains the system concepts and implementation path for selective compaction using a dedicated summary prompt inspired by existing compaction.

**Inferred user intent:** Create a high-quality handoff document that lets someone new implement the extension correctly without rediscovering Pi extension, session, compaction, and TUI APIs.

### What I did
- Read Pi extension, session, compaction, and TUI docs from the installed `@mariozechner/pi-coding-agent` package.
- Read the local shared extension framework guide and registry contract.
- Read existing compaction-related extensions and examples, including `custom-compaction.ts`, `handoff.ts`, `compaction-title`, and `compaction-meter`.
- Added `design/02-selective-compaction-intern-implementation-guide.md` to the ticket.
- Related the guide to the key local framework and extension files.
- Updated the ticket changelog.

### Why
- The implementation touches several subsystems: extension registration, command handlers, session tree/message storage, model calls, compaction prompt design, TUI selection flows, and new-session replacement.
- A detailed design lowers the risk that an intern implements an unsafe middle-splice by mutating session files or producing invalid tool-call/tool-result sequences.

### What worked
- The guide now includes prose explanation, diagrams, pseudocode, API references, implementation phases, validation rules, edge cases, and file references.
- The design explicitly chooses a dedicated prompt and explains how it differs from default compaction.
- The design recommends whole-turn selection for the MVP to avoid dangling tool results.

### What didn't work
- I initially ran `docmgr task check --ticket PI-EXT-SELECTIVE-COMPACTION --id 2,3`, which accidentally checked the user-validation task because the placeholder task occupied id 1. I corrected `tasks.md` manually so validation remains open and the design task is checked.
- I first validated frontmatter with a path prefixed by `ttmp/`, causing docmgr to resolve `ttmp/ttmp/...` and fail with: `Error: open /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/design/02-selective-compaction-intern-implementation-guide.md: no such file or directory`. Re-running with the path relative to the doc root succeeded.

### What I learned
- Pi's built-in `CompactionEntry` is suffix-oriented (`summary + messages from firstKeptEntryId onward`) and is therefore not a natural representation for `A + summary(B) + C` middle-range compaction.
- Command handlers have `ctx.newSession(...)`, which is the right shape for safe session replacement because it preserves the original session and gives a fresh replacement context.
- The existing `handoff.ts` and `custom-compaction.ts` examples together cover most of the required model-call and session-handoff patterns.

### What was tricky to build
- The hardest design issue is preserving provider-valid message ordering after deleting a middle range. Tool results in `C` can refer to assistant tool calls in `B`, and assistant messages in `A` can have tool calls whose results are moved into `B`. The guide addresses this by recommending conservative whole-turn range selection for the MVP.
- Another subtle point is that built-in compaction sounds tempting but does not match the desired middle-splice output shape. The guide documents why creating a new session is safer and clearer.

### What warrants a second pair of eyes
- Confirm whether `B'` and `B''` should be two `CustomMessageEntry` records or a single combined custom message.
- Confirm whether the MVP should select whole turns rather than arbitrary messages, despite the user-facing phrase “start and stop message.”
- Review the proposed dedicated prompt to ensure it captures the exact level of detail desired for future continuation.

### What should be done in the future
- Implement the extension skeleton under `extensions/selective-compaction/`.
- Add fixture tests for partitioning and validation before wiring the UI.
- Run manual smoke tests with sessions containing tool calls to validate turn-boundary safety.

### Code review instructions
- No production code changed in this step.
- Review `design/02-selective-compaction-intern-implementation-guide.md` first, especially `Dedicated Prompt Design`, `Session Partitioning Design`, and `New Session Construction`.
- Validate by reading the guide for correctness against the Pi docs and existing examples listed in its `File References` section.

### Technical details
- Main guide: `ttmp/2026/05/11/PI-EXT-SELECTIVE-COMPACTION--pi-extension-for-selective-session-compaction/design/02-selective-compaction-intern-implementation-guide.md`.
- Key local API reference: `extensions/_shared/registry.ts`.
- Key Pi docs: `docs/extensions.md`, `docs/session.md`, `docs/compaction.md`, and `docs/tui.md` from the installed package.


## Step 3: Implement selective compaction extension MVP

I implemented the first working version of the selective compaction extension. The MVP follows the design guide's conservative approach: users select whole turns rather than arbitrary message boundaries, the extension generates a dedicated selective-compaction summary and linkage message, and then it creates a new session rather than mutating the current one.

The implementation is intentionally split into orchestration, prompt, session, and README files so the next intern can continue from the design document without unpacking one large extension file. The extension is also registered in project settings so it loads with the local Pi extension suite.

### Prompt Context

**User prompt (verbatim):** "Implement"

**Assistant interpretation:** Implement the selective compaction extension described in the ticket and prior design guide.

**Inferred user intent:** Move from design to a usable MVP that can be loaded by Pi and manually tested through `/px` or slash commands.

### What I did
- Created `extensions/selective-compaction/index.ts` with shared-framework registration, commands, generation flow, message renderers, and new-session creation.
- Created `extensions/selective-compaction/prompt.ts` with the dedicated prompt, user-message builder, and response parser.
- Created `extensions/selective-compaction/session.ts` with branch scanning, whole-turn construction, partition validation, preview formatting, and new-session append helpers.
- Created `extensions/selective-compaction/README.md` and registered it as launcher documentation.
- Added `../extensions/selective-compaction/index.ts` to `.pi/settings.json`.
- Added a warning when the source branch already contains built-in compaction entries.
- Cleaned up session helper typings to use the exported `SessionMessageEntry` type instead of a non-exported `AgentMessage` import.
- Ran `timeout 30 pi --list-models` to validate the extension loads.
- Related the implementation files to the intern guide and updated changelog/tasks.

### Why
- The implementation needed to preserve the design invariant `A + B' + B'' + C` while leaving the original session untouched.
- Whole-turn selection avoids the most dangerous invalid-context cases where tool results become separated from their initiating assistant tool calls.
- Splitting prompt/session/orchestration code keeps future improvements localized.

### What worked
- `timeout 30 pi --list-models` completed successfully, which means the extension loads without startup/runtime import errors.
- The extension is discoverable through the shared registry and project settings.
- The MVP flow has preview and edit points before new-session creation.

### What didn't work
- No automated UI test was run because this flow requires interactive TUI selection and model generation.
- Static TypeScript checking is not configured in this repository, so load validation is the main automated check used here.

### What I learned
- The local extension set is loaded through `.pi/settings.json`, so adding the extension there is enough for project-local startup validation.
- The existing `handoff.ts` example maps closely to the loader/editor/new-session portion, while `custom-compaction.ts` maps to the dedicated model call.

### What was tricky to build
- The biggest sharp edge remains message validity after removing a middle range. The solution was to restrict the MVP to whole turns by grouping messages at user-message boundaries and letting users choose start/end turns.
- Another subtlety is that session replacement invalidates the old command context. The implementation captures plain serializable data before `ctx.newSession(...)` and uses only the replacement context inside `withSession`.
- The prompt response parser must be tolerant. It splits on `## Linkage Message` when present and otherwise synthesizes a generic bridge so the flow does not fail solely because the model omitted the exact heading.

### What warrants a second pair of eyes
- Review `appendCompactedSession(...)` to confirm copied `AgentMessage` objects are safe to append directly into a new session.
- Review whether `CustomMessageEntry` is the best representation for `B'` and `B''`, or whether a single custom message would be less noisy in model context.
- Manually test the interactive flow in a real session with tool calls and confirm the resulting provider context is valid.

### What should be done in the future
- Add non-interactive fixture tests for `buildTurns`, `buildPartition`, `validatePartition`, and `parseSelectiveCompactionResponse` if a test harness is introduced.
- Improve the selector from simple `ctx.ui.select` dialogs to a richer preview overlay.
- Add token estimates and warnings for very large selected ranges.
- Decide whether to preserve model/thinking metadata and labels in the new session.

### Code review instructions
- Start with `extensions/selective-compaction/index.ts` and follow `openSelectiveCompactionFlow`.
- Then review `extensions/selective-compaction/session.ts` for turn grouping and new-session append semantics.
- Then review `extensions/selective-compaction/prompt.ts` for prompt correctness and parser resilience.
- Validate startup with `timeout 30 pi --list-models`.
- Manually validate in Pi with `/reload`, `/px`, and `/selective-compact`.

### Technical details
- Commands: `/selective-compact`, `/scompact`.
- Shared registry id: `selective-compaction`.
- Inserted custom message types: `selective-compaction-summary`, `selective-compaction-linkage`.
- Non-context state custom type: `selective-compaction-state`.
- Load validation command: `timeout 30 pi --list-models`.
