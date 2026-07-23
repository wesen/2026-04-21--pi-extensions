---
Title: Investigation diary
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
DocType: reference
Intent: long-term
Owners:
    - manuel
RelatedFiles:
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
      Note: Installed event type declarations
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts
      Note: Installed session manager declarations
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md
      Note: Compaction entry and lifecycle documentation
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md
      Note: |-
        Pi lifecycle and prompt hook documentation
        Evidence for current lifecycle and input APIs
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md
      Note: |-
        Session entry and manager documentation
        Evidence for session metrics
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts
      Note: Shared extension registration contract
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/env.ts
      Note: Existing PI_AGENT_* schema inspected during the investigation
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/index.ts
      Note: |-
        Existing Bash-child metadata injection inspected during the investigation
        Investigation subject for model visibility
        Capability event implementation and load error fix
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/session-summary/index.ts
      Note: |-
        Existing prompt hook inspected for reuse and API drift
        Existing prompt injection comparison
        Step 6 compatibility repair
    - Path: repo://extensions/session-context/index.ts
      Note: Implementation and smoke-test evidence
    - Path: repo://extensions/session-context/snapshot.ts
      Note: Self-test and metric implementation
    - Path: repo://extensions/session-summary/README.md
      Note: Updated behavior documentation
ExternalSources: []
Summary: |
    Chronological record of the evidence gathered for the session-context prompt injection design, including the distinction between Bash-child environment metadata and model-visible prompt context.
LastUpdated: 2026-07-23T00:00:00Z
WhatFor: Use this diary to resume the design or implement the ticket without repeating the API investigation.
WhenToUse: Read before implementing or reviewing PI-EXT-SESSION-CONTEXT.
---




# Diary

## Goal

This diary records the investigation and design work for a new Pi extension that adds deterministic session statistics and identifiers to the model's prompt context, adds a compact turn note at prompt submission, and explains the visibility boundary of the existing `agent-env` extension.

## Step 1: Create the ticket and map the repository

The request required a new docmgr ticket, an intern-facing design and implementation guide, examples of system and input prompt changes, and reMarkable delivery. I created a dedicated ticket rather than extending the older `pi-ext-session-summary` ticket because the requested feature is a distinct runtime metadata layer: it reports session identity and statistics, while `session-summary` enforces a response format and renders a summary widget.

The initial repository scan also showed that the requested feature overlaps two existing extensions. `agent-env` already exposes session and model metadata to Bash children. `session-summary` already modifies the system prompt and user input, but its input hook uses an older API shape. These two facts became central constraints for the design.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket for a new pi extension that adds a summary of the current session statistics and id to the system prompt with like, duration, models, turn count, compaction count, date span, etc...) so that the model knows general information about the sessions, and also injects the turn info and other summary at prompt submission (making clear in the system prompt that this is additional info).

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Show me an example of system prompt changes and input prompt changes."

**Assistant interpretation:** Create a new ticket and write an evidence-backed, intern-readable design and implementation guide for a `session-context` extension that injects session statistics into the system prompt and a compact turn summary into submitted prompts, then upload the documentation bundle to reMarkable.

**Inferred user intent:** Make session identity and high-level runtime state available to the model without requiring the model to rediscover it through shell commands, while keeping the distinction between metadata and actual instructions explicit.

**Commit (code):** N/A — this step created ticket documentation only.

### What I did

- Ran `docmgr status --summary-only` and inspected the repository layout.
- Confirmed all extensions live under `extensions/` and that the shared registry is mandatory.
- Created the ticket:

  ```bash
  docmgr ticket create-ticket --ticket PI-EXT-SESSION-CONTEXT --title "Session context statistics in Pi prompts" --topics pi-extensions,pi,metadata,prompts,compaction,tokens,environment
  ```

- Added the primary design document and two reference documents with `docmgr doc add`.
- Inspected the existing `session-summary`, `agent-env`, compaction, shared-framework, and session-format materials.

### Why

The ticket needed a stable home before writing the design so that the design, diary, references, tasks, changelog, and final upload would remain linked.

### What worked

- The ticket was created at:
  `ttmp/2026/07/23/PI-EXT-SESSION-CONTEXT--session-context-statistics-in-pi-prompts`
- The workspace contains `index.md`, `tasks.md`, `changelog.md`, a design document, and two reference documents.
- The repository's existing `agent-env` and `session-summary` implementations supplied concrete patterns rather than requiring speculative architecture.

### What didn't work

- An initial file-read probe used the nonexistent path `/home/manuel/.nvm/versions/node/v22.22.22/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and returned:

  ```text
  ENOENT: no such file or directory, access '/home/manuel/.nvm/versions/node/v22.22.22/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts'
  ```

- The installed path is under Node `v22.22.1`; subsequent reads used the correct path.

### What I learned

- The new work should be a separate `session-context` extension, not a redesign of `session-summary`.
- The repository's docmgr workspaces are date-based and the current workspace is under `2026/07/23`.

### What was tricky to build

The feature crosses prompt lifecycle, session-tree accounting, environment scope, and documentation delivery. Treating all of these as one “metadata string” would hide important semantics. The design separates a deterministic snapshot, a full system block, a compact input block, and an optional capability handshake with `agent-env`.

### What warrants a second pair of eyes

- Confirm the ticket name and extension id are appropriate before implementation.
- Confirm whether the scope should include the companion `agent-env` event-bus change or keep it as a follow-up.

### What should be done in the future

- Implement the pure snapshot and formatter modules after the design is reviewed.

### Code review instructions

- Start with the ticket design document, then compare its file map with `extensions/agent-env/index.ts` and `extensions/_shared/registry.ts`.
- Validate the ticket workspace with `docmgr doctor --ticket PI-EXT-SESSION-CONTEXT --stale-after 30`.

### Technical details

- Ticket id: `PI-EXT-SESSION-CONTEXT`
- Proposed extension id: `session-context`
- Primary design document: `design-doc/01-session-context-statistics-prompt-injection-analysis-design-and-implementation-guide.md`
- Prompt/API reference: `reference/02-prompt-and-api-reference.md`

## Step 2: Verify the existing environment and prompt injection paths

The repository's `agent-env` extension does not set environment variables on the Pi process. It prepends a shell-quoted export preamble to LLM Bash tool commands in `tool_call` and wraps local operations for user `!`/`!!` commands in `user_bash`. The values are therefore available to a child shell and its descendants.

The extension does not register `before_agent_start`, does not transform `input`, and does not send a context-visible custom message. The model consequently has no automatic knowledge of the variables. It can learn them if a command prints them and the output is returned, but that is observation after a tool call, not ambient prompt context.

### Prompt Context

**User prompt (verbatim):** "also, we have an extension that injects this kind of data into the env of every bash call, but does the model even know about it?"

**Assistant interpretation:** Determine whether the existing `agent-env` child-process environment injection is visible to the model, and incorporate the answer into the new extension design.

**Inferred user intent:** Avoid duplicating or misunderstanding an existing metadata mechanism, and ensure the model receives an explicit explanation of the Bash-environment scope if that is not automatic.

**Commit (code):** N/A — this step updated design documentation only.

### What I did

- Read `extensions/agent-env/index.ts`, `extensions/agent-env/env.ts`, and its README.
- Traced `tool_call` mutation and `user_bash` operation wrapping.
- Read Pi's installed extension lifecycle docs and TypeScript declarations.
- Read the current `session-manager.d.ts` and `session-format.md` to identify session id, timestamps, model-change entries, compactions, branch summaries, messages, and usage fields.
- Read the official examples for `before_agent_start`, input transforms, system prompt inspection, and the inter-extension event bus.
- Added a model-visibility table and optional `agent-env:capability` event-bus handshake to the design.

### Why

A child process environment is a process boundary. The model needs an explicit prompt or returned tool output if it is expected to use a value without first probing the shell.

### What worked

- `agent-env/env.ts` provides a concrete list of metadata fields that can be mirrored in a model-facing capability description.
- `SessionManager` already provides the stronger sources needed for the new snapshot: session id, session name, leaf id, header, branch, entries, model changes, compactions, and assistant usage.
- Pi's `pi.events` API supports a small optional handshake without importing `agent-env` private modules.

### What didn't work

- The existing `session-summary` input code cannot be treated as a current API reference. It uses `event.prompt` and returns `{ prompt: ... }`, while the installed declarations define `event.text` and `{ action: "transform", text, images }`.
- A child-environment approach cannot provide the full session statistics before a model call without adding a shell round trip; the design therefore does not use it as the source of truth.

### What I learned

- The precise answer is: **the model does not automatically know about `PI_AGENT_*`; it only knows after explicit prompt injection or after observing command output.**
- The new extension should compute metadata directly from Pi runtime APIs and should describe `agent-env` as a Bash-child capability, not as model-process state.
- The optional event bus should report installed/enabled capability status; absence of an event must remain unknown, not false.

### What was tricky to build

The difficult distinction is between a value being available to a tool process and being available in the LLM request. The design now documents four different paths: child-shell-only data, printed tool output, system-prompt injection, and context-visible custom messages. This avoids the unsafe assumption that a mutated Bash command or environment export is a reliable model metadata channel.

### What warrants a second pair of eyes

- Verify runtime rendering/persistence behavior of `tool_call` mutations before making any claim about whether the injected export preamble is displayed in the transcript. The design intentionally treats that path as incidental and non-authoritative.
- Review the proposed event name and payload for compatibility with the existing `agent-env` extension.

### What should be done in the future

- Add a focused live smoke test that asks the model for the session id before and after a Bash command printing `$PI_AGENT_SESSION_ID`.
- Decide whether the event-bus companion change belongs in this ticket or `PI-EXT-AGENT-ENV`.

### Code review instructions

- Review `extensions/agent-env/index.ts:183-223` and `extensions/agent-env/env.ts:43-89` first.
- Compare the visibility table in the design guide with Pi's `before_agent_start`, `input`, `sendMessage`, and `appendEntry` contracts.
- Validate with a live Pi session rather than relying only on TUI rendering.

### Technical details

The proposed capability payload is:

```typescript
{
  installed: true,
  enabled: boolean,
  extensionVersion: string,
  scope: "bash-child-process",
  variablePrefix: "PI_AGENT_",
  fields: string[],
}
```

The stable event name is proposed as `agent-env:capability`.

## Step 3: Write the intern-facing design and prompt examples

I wrote the primary design guide and the compact prompt/API reference. The guide explains the system from the repository extension registry through Pi lifecycle events, session JSONL entries, metric definitions, prompt formatting, agent-env scope, decisions, implementation phases, tests, risks, and open questions. It includes ASCII diagrams, TypeScript contracts, pseudocode, concrete before/after system prompts, and concrete before/after input prompts.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Turn the evidence gathered in Steps 1 and 2 into the requested technical deliverables.

**Inferred user intent:** Give a new intern enough precise context to implement the feature safely without copying stale extension code or confusing shell-visible state with model-visible context.

**Commit (code):** N/A — documentation only; no implementation code was changed.

### What I did

- Wrote `design-doc/01-session-context-statistics-prompt-injection-analysis-design-and-implementation-guide.md`.
- Wrote `reference/02-prompt-and-api-reference.md`.
- Included the exact system-prompt and input-prompt examples requested by the user.
- Defined active-branch statistics and precise semantics for duration, date span, user prompt count, assistant response count, model list, compactions, branch summaries, tools, errors, and usage.
- Added implementation phases and validation commands.

### Why

A future implementer needs more than a short hook snippet. The main correctness risks are metric ambiguity, prompt hierarchy confusion, stale API usage, branch handling, and privacy. The design explains those risks before code is written.

### What worked

- The design is grounded in current local source paths and installed Pi declarations.
- The examples make the “additional informational context” boundary visible in the system prompt.
- The guide recommends deterministic aggregation rather than an extra LLM summary call on every prompt.
- The optional agent-env integration remains decoupled and can be implemented as a follow-up.

### What didn't work

- No implementation code was written in this ticket yet, so live prompt inspection and runtime smoke tests remain future work.

### What I learned

- A model-facing session snapshot should be versioned, bounded, and JSON-shaped.
- The system block should include the full snapshot; the input block should include only a short turn-oriented subset.
- `getBranch()` is the right primary metric source for active-branch history; `buildContextEntries()` is for compaction-aware model-visible context and would understate historical counts.

### What was tricky to build

The prompt examples needed to show enough data to be useful without encouraging the model to treat values as instructions. The design therefore repeats an explicit priority boundary, uses stable delimiters, and requires delimiter-sensitive escaping for session-controlled strings such as names and paths.

### What warrants a second pair of eyes

- Review the exact input-hook context lifetime and session-replacement behavior before implementation.
- Review the default privacy settings, especially cwd, session file, and cost.
- Review whether compaction/branch-summary usage should be included in ordinary token totals.

### What should be done in the future

- Implement the pure aggregation and formatting tests first.
- Add the live smoke tests described in the design.

### Code review instructions

- Read the Executive Summary, Current-state architecture, Metric definitions, Prompt design, and Decision records in the primary design guide.
- Use the compact reference for copy/paste hook contracts.
- Check the implementation against `types.d.ts`, not the older `session-summary` input code.

### Technical details

Primary deliverables:

```text
design-doc/01-session-context-statistics-prompt-injection-analysis-design-and-implementation-guide.md
reference/02-prompt-and-api-reference.md
reference/01-investigation-diary.md
```

Relevant validation commands:

```bash
docmgr doctor --ticket PI-EXT-SESSION-CONTEXT --stale-after 30
timeout 20 pi --list-models
```

## Step 4: Documentation validation and delivery

This step records the final ticket bookkeeping, document validation, and reMarkable upload. It should be completed only after the design and reference files are written, the ticket tasks are updated, and the bundle upload succeeds.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Finish the documentation workflow by validating and uploading the ticket bundle to reMarkable, then report the ticket and delivery paths.

**Inferred user intent:** Receive a durable, reviewable design package both in the repository's docmgr workspace and on the reMarkable device.

**Commit (code):** N/A — documentation delivery; no implementation code change.

### What I did

- Related the primary design, prompt/API reference, and diary to the source files and installed Pi references.
- Ran `docmgr doctor --ticket PI-EXT-SESSION-CONTEXT --stale-after 30`.
- Fixed an initial relation-format issue where `Path:...:Note` strings were interpreted as literal paths; rewrote them as structured `Path`/`Note` fields.
- Ran the required dry-run bundle conversion.
- Uploaded the three documents as one PDF bundle with `remarquee upload bundle` to `/ai/2026/07/23/PI-EXT-SESSION-CONTEXT`.
- Recorded the successful output: `OK: uploaded PI-EXT-SESSION-CONTEXT Session Context Guide.pdf -> /ai/2026/07/23/PI-EXT-SESSION-CONTEXT`.

### Why

The ticket is not complete until its bookkeeping and delivery artifacts are consistent and the uploaded PDF is known to exist. A single bundle gives the intern the primary guide, prompt reference, and investigation history with one table of contents.

### What worked

- `docmgr doctor --ticket PI-EXT-SESSION-CONTEXT --stale-after 30` completed with `All checks passed`.
- The dry run confirmed all three Markdown files and the requested remote directory.
- The real upload succeeded at `/ai/2026/07/23/PI-EXT-SESSION-CONTEXT`.

### What didn't work

- The first `docmgr doctor` run reported 27 missing-related-file findings because manually authored `Path:...:Note` strings were interpreted as literal paths. Reformatting the frontmatter into structured `Path` and `Note` fields resolved the issue.

### What I learned

- The reMarkable workflow should use a single bundle with a table of contents so the intern receives the design guide, prompt reference, and diary together.
- Docmgr relation frontmatter must represent external files with separate `Path` and `Note` fields; the colon separator is a CLI input convention, not the final YAML representation.

### What was tricky to build

The primary guide is long and contains code blocks, JSON, XML-like delimiters, and ASCII diagrams. The dry run confirmed the bundle inputs and pandoc conversion plan before the real upload; the frontmatter relation format was the main bookkeeping sharp edge.

### What warrants a second pair of eyes

- Confirm the PDF's visual rendering on the device, especially long code blocks and ASCII diagrams.
- Review the implementation's input-hook context handling, privacy defaults, and agent-env event-bus payload.

### What should be done in the future

- Consider repairing the older `session-summary` input hook, which still uses the pre-v0.81 input API.
- Add a formal test harness if this repository adopts one; the current implementation includes a self-test command and live smoke coverage.

### Code review instructions

- Start with the primary design guide and prompt/API reference.
- Run `docmgr doctor --ticket PI-EXT-SESSION-CONTEXT --stale-after 30`.
- Use the upload output path if the PDF needs to be reviewed on reMarkable.

### Technical details

Expected remote destination:

```text
/ai/2026/07/23/PI-EXT-SESSION-CONTEXT/
```

## Step 5: Implement prompt numbers and runtime injection

The user clarified that the prompt metadata must contain two distinct user-prompt numbers: the next prompt number within the current compaction-aware context window and the next prompt number across the total active session. I updated the design and reference documents, implemented the extension, enabled it in the project settings, and added the optional Agent Env capability event so the model can understand the Bash-child scope.

### Prompt Context

**User prompt (verbatim):** "pass in prompt number (this context window) and prompt number (total session), if possible. Update, then implement"

**Assistant interpretation:** Update the ticket documentation to define both prompt-number semantics, then implement the session-context extension and the agent-env capability integration.

**Inferred user intent:** Let the model distinguish its position within the current post-compaction context from its position in the complete active session history.

**Commit (code):** N/A — implementation and documentation changes are currently uncommitted.

### What I did

- Added `contextWindowUserPrompts` and `nextContextWindowPromptNumber` based on `sessionManager.buildContextEntries()`.
- Added `nextSessionPromptNumber` based on all user messages from `sessionManager.getBranch()`.
- Implemented `extensions/session-context/index.ts`, `snapshot.ts`, `format.ts`, `prompt.ts`, and `README.md`.
- Added the extension to `.pi/settings.json` and the repository README inventory.
- Added `agent-env:capability` emission on Agent Env session start and toggle paths.
- Related implementation files to the ticket design/reference/diary.
- Ran the isolated Pi load check:

  ```bash
  timeout 20 pi --no-session --no-extensions -e ./extensions/session-context/index.ts --list-models no-such-model
  ```

- Ran the live project smoke session. It initially exposed an implementation error:

  ```text
  Extension "/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/index.ts" error: EXTENSION_VERSION is not defined
  ```

  Imported `EXTENSION_VERSION` from `agent-env/env.ts`, reloaded Pi, and confirmed the error disappeared.
- Ran `/session-context-self-test`. The first run failed because the expected duration omitted zero-minute/zero-second components; corrected the expectation to `1h 0m 0s`, reloaded, and obtained `session-context self-test: PASS`.
- Sent a live prompt asking the model to report the two prompt numbers without using tools. The model returned `1 1`, demonstrating that the transformed input metadata was visible.
- Queried `/session-context` after the live turn and verified the next values were both `2`.

### Why

`getBranch()` represents the active session history, while `buildContextEntries()` applies Pi's compaction boundary. Counting both gives the model the two different positions the user requested without confusing assistant/tool-loop turns with user prompts.

### What worked

- The extension loaded in the project startup extension list.
- The system and input hook implementation uses the installed current API: `event.text` and `{ action: "transform", text, images }`.
- The self-tests cover total/context-window prompt counts, compaction count, usage aggregation, and duration formatting.
- The live model read the prompt numbers from the input metadata block.
- Agent Env now communicates only a capability description, explicitly scoped to Bash child processes.

### What didn't work

- The first live reload failed because the new capability emitter referenced `EXTENSION_VERSION` without importing it.
- The first self-test expected `1h`, while the formatter intentionally emitted `1h 0m 0s`. The test expectation was corrected.
- No formal TypeScript compiler is installed in the repository; validation used Pi's Jiti-based extension load, the self-test command, and the live tmux smoke session.

### What I learned

- The context-window prompt number must be derived from `buildContextEntries()`, not from the full branch, because compaction changes what is currently model-visible.
- A prompt transform can make the metadata immediately visible, while the system block remains the authoritative full snapshot.
- Capability state can cross extension boundaries through `pi.events` without importing another extension's private state.

### What was tricky to build

The two prompt numbers look similar but use different entry sets. The total number uses the full active branch, while the context-window number uses Pi's compaction-aware entries. The implementation keeps both fields explicit and labels them in human output and prompt text. A second sharp edge was that lifecycle events execute during extension binding, so the new Agent Env capability emitter had to be fully self-contained before `session_start`.

### What warrants a second pair of eyes

- Check the behavior after a real `/compact` to confirm the context-window number resets to the retained post-compaction user-message count plus one.
- Review whether usage from compaction and nested tool calls should remain in the aggregate usage display.
- Review the privacy defaults and whether `activeModel` should be included in the compact schema reference.

### What should be done in the future

- Add formal fixture tests if a TypeScript test runner is introduced.
- Decide whether to commit the implementation as one focused commit or separate code/docs commits.

### Code review instructions

- Start at `extensions/session-context/snapshot.ts`, then review `format.ts`, `prompt.ts`, and `index.ts`.
- Inspect `extensions/agent-env/index.ts` capability emission and `.pi/settings.json` loading.
- Run:

  ```bash
  timeout 20 pi --no-session --no-extensions -e ./extensions/session-context/index.ts --list-models no-such-model
  ```

- Start the project in tmux, run `/session-context-self-test`, send a no-tools prompt asking for both prompt numbers, and run `/session-context` after the turn.

### Technical details

Implemented model-facing fields:

```text
nextContextWindowPromptNumber = user messages in buildContextEntries() + 1
nextSessionPromptNumber = user messages in getBranch() + 1
```

Implemented capability event:

```text
agent-env:capability
scope = bash-child-process
variablePrefix = PI_AGENT_
```

## Step 6: Repair the session-summary input hook

The user approved fixing the stale input API. I migrated the existing session-summary reminder hook without changing its system-prompt or response-summary behavior, then updated the current ticket documentation to record that the compatibility issue is resolved.

### Prompt Context

**User prompt (verbatim):** "ok fix it"

**Assistant interpretation:** Update `extensions/session-summary/index.ts` to use the installed Pi input event and transform-result contract, and bring the relevant documentation up to date.

**Inferred user intent:** Restore session-summary’s per-prompt reminder injection for normal interactive and RPC input.

**Commit (code):** N/A — implementation and documentation changes are currently uncommitted.

### What I did

- Replaced the `event.source !== "user"` guard with a pass-through for `event.source === "extension"`.
- Replaced `event.prompt` with `event.text`.
- Replaced `{ prompt: ... }` with `{ action: "transform", text, images }`.
- Updated `extensions/session-summary/README.md` to document the current input behavior.
- Updated the session-context design guide, index, and diary to remove the stale-API follow-up.

### Why

Current Pi identifies normal input as `interactive` or `rpc`, while extension-generated input is identified as `extension`. The old handler skipped all normal input because it looked for the obsolete `user` source, so the summary reminder was not appended.

### What worked

- The migrated handler preserves image attachments while transforming text.
- Extension-generated input is passed through, preventing reminder re-processing.
- The system-prompt instruction and turn-end summary extraction remain unchanged.

### What didn't work

- No formal TypeScript test runner is configured in this repository. Validation still needs a Pi runtime load and interactive input smoke test.

### What I learned

- Input source filtering must use the current source union rather than historical labels.
- Returning `action: "continue"` explicitly makes pass-through behavior clear and matches the installed extension API.

### What was tricky to build

The handler had two independent compatibility problems: the source guard prevented normal input from reaching the reminder logic, and the payload shape was obsolete even if it did. Both must be migrated together; changing only the field name would still leave normal interactive input skipped.

### What warrants a second pair of eyes

- Verify the reminder is appended once for interactive and RPC input, including input with images.
- Verify extension-generated input does not receive the reminder a second time.

### What should be done in the future

- Add formal fixture tests if a TypeScript test runner is introduced.

### Code review instructions

- Start at `extensions/session-summary/index.ts` around the `pi.on("input", ...)` handler.
- Compare it with the installed `examples/extensions/input-transform.ts` and `types.d.ts` `InputEvent`/`InputEventResult` declarations.
- Run `pi --list-models` to verify extension loading, then use an interactive session with `/summary-toggle` and a normal prompt to verify reminder behavior.

### Technical details

Current transform contract:

```typescript
return {
  action: "transform",
  text: event.text + USER_PROMPT_REMINDER,
  images: event.images,
};
```
