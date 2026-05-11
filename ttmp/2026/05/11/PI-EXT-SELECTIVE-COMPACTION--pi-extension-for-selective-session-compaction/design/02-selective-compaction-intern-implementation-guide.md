---
Title: Selective Compaction Intern Implementation Guide
Ticket: PI-EXT-SELECTIVE-COMPACTION
Status: active
Topics:
    - compaction
    - extensions
    - pi
    - tui
DocType: design
Intent: long-term
Owners: []
RelatedFiles:
    - Path: .pi/settings.json
      Note: Project settings now load the selective-compaction extension
    - Path: docs/pi-shared-extension-framework-guide.md
      Note: Local intern-facing guide for the shared extension framework
    - Path: extensions/_shared/registry.ts
      Note: Shared extension registration API the new extension should use
    - Path: extensions/compaction-meter/index.ts
      Note: Existing shared-framework compaction extension registration and widget pattern
    - Path: extensions/compaction-title/index.ts
      Note: Existing compaction customization extension pattern
    - Path: extensions/compaction-title/title.ts
      Note: Dedicated prompt helper and parser pattern for compaction-adjacent behavior
    - Path: extensions/selective-compaction/README.md
      Note: User-facing docs registered with the shared launcher
    - Path: extensions/selective-compaction/index.ts
      Note: Extension registration
    - Path: extensions/selective-compaction/prompt.ts
      Note: Dedicated selective compaction prompt
    - Path: extensions/selective-compaction/session.ts
      Note: Branch scanning
ExternalSources: []
Summary: Detailed analysis, design, and implementation guide for a Pi extension that selectively compacts a chosen middle range of a session into a new conversation.
LastUpdated: 2026-05-11T09:18:00-04:00
WhatFor: Teach a new intern the Pi extension, session, compaction, UI, prompt, and implementation concepts needed to build selective session-range compaction.
WhenToUse: Use before implementing the selective compaction extension, reviewing its API choices, or onboarding someone to Pi session compaction internals.
---



# Selective Compaction Intern Implementation Guide

## Executive Summary

This ticket designs a new Pi extension tentatively named **Selective Compaction**. The extension lets a user choose a **start message** and an **end message** in the current session, summarize only that selected middle range with a dedicated prompt, and create a new conversation that preserves the surrounding context.

The goal is not generic summarization. The goal is to recover context-window budget by compressing old conversation material that has become less useful, while keeping enough continuity for the model to continue correctly. The summary should answer two practical questions:

- **What happened in the selected range?**
- **What from that range will still be relevant after the range is removed?**

The intended transformation is:

```text
Input conversation for current branch:

  system prompt
  A: messages before selected range
  [compact start]
  B: selected messages to compact
  [compact end]
  C: messages after selected range

Output conversation in new session:

  system prompt
  A: original messages before selected range, copied forward
  B': dedicated summary of selected messages
  B'': linkage message bridging from the summary to C
  C: original messages after selected range, copied forward
```

The extension should use the local shared extension framework (`registerPiExtension`) so it appears in `/px`, exposes actions, provides docs, and can later contribute a status widget. It should also expose direct slash commands for fast use.

## Problem Statement

Pi already has standard compaction. Standard compaction is optimized for the common case where older history can be summarized and recent messages can be kept. It chooses its own cut point based on token thresholds and settings such as `keepRecentTokens`.

This ticket targets a different workflow. Sometimes the user knows that a specific middle section of the conversation is no longer needed in full detail. For example:

- The session contains a long investigation that produced a short conclusion.
- The assistant read many files and tried several failed approaches, but only the result matters now.
- The conversation wandered through planning or debugging that is no longer relevant to the current task.
- The recent messages `C` are still important and should remain verbatim, but an earlier chunk `B` should be compressed.

Default compaction cannot express this precisely because it generally summarizes from the old side of the conversation and keeps a recency window. Selective compaction should let the user explicitly mark the range to compress.

## Required User-Facing Behavior

A user should be able to:

1. Open a selector for messages in the current branch.
2. Choose the start of the range to compact.
3. Choose the end of the range to compact.
4. Preview the proposed partition: `A`, `B`, `C`.
5. Ask the extension to generate a dedicated summary and bridge for `B`.
6. Preview or edit the generated summary/bridge.
7. Create a new session containing `A + B' + B'' + C`.

The extension should not silently mutate the old session. It should create a new session with a parent-session link, just like handoff-style workflows. The old session remains the source of truth and a rollback path.

## Core Mental Model

Think of the current branch as a list of session entries. Some entries contain LLM-visible messages, and some entries are metadata such as labels or model changes.

```text
current branch entries

  e01  user message
  e02  assistant message
  e03  tool result
  e04  user message       ← range start might be here
  e05  assistant message
  e06  tool result
  e07  user message       ← range end might be here
  e08  assistant message
  e09  tool result
```

The extension partitions the branch:

```text
A = entries before selected range
B = entries inside selected range
C = entries after selected range
```

Then it creates a replacement branch in a new session:

```text
A copied messages
summary custom message for B
linkage custom message for continuity into C
C copied messages
```

This is a **new-session rewrite**, not an in-place `CompactionEntry`. That matters because Pi's built-in compaction model is append-only and assumes everything after `firstKeptEntryId` stays after the compaction entry. Our desired output preserves `A`, summarizes `B`, and then preserves `C`, which is a middle-splice operation. Creating a new session is the simplest, safest implementation shape.

## Relevant Pi Concepts

### Extension modules

A Pi extension is a TypeScript module that exports a default factory function:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function selectiveCompaction(pi: ExtensionAPI): void {
  // register commands, events, tools, shared-framework metadata
}
```

Extensions are loaded from project or user extension folders and can be hot-reloaded with `/reload` when placed in auto-discovered locations.

Important docs:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md`

### Shared extension framework

This repository has a local shared framework in `extensions/_shared/registry.ts`. New extensions should call `registerPiExtension(...)` so the launcher and dashboard can discover them.

Reference file:

- `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts`

Minimal registration pattern:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";

export default function selectiveCompaction(pi: ExtensionAPI): void {
  registerPiExtension({
    id: "selective-compaction",
    name: "Selective Compaction",
    description: "Summarize a selected middle range of the current session into a new conversation.",
    commands: ["selective-compact", "scompact"],
    tags: ["compaction", "session", "context"],
    run: async (ctx) => openSelectiveCompactionFlow(ctx),
    actions: [
      {
        id: "open",
        title: "Open selective compaction flow",
        description: "Choose a start/end message and create a compacted replacement session.",
        default: true,
        run: async (ctx) => openSelectiveCompactionFlow(ctx),
      },
    ],
    docs: [
      {
        id: "overview",
        title: "Selective Compaction overview",
        markdown: SELECTIVE_COMPACTION_DOCS,
      },
    ],
  });
}
```

### Session entries and messages

Pi stores sessions as JSONL files. The current branch is a tree path from the active leaf back to the root. Extensions can inspect it with:

```ts
const branch = ctx.sessionManager.getBranch();
```

Important entry/message concepts from `session.md`:

- `SessionMessageEntry`: a conversation message entry.
- `CompactionEntry`: built-in summary entry that replaces earlier context during context building.
- `CustomEntry`: extension state that does not participate in LLM context.
- `CustomMessageEntry`: extension-injected content that does participate in LLM context.
- `LabelEntry`: a bookmark/marker on an entry.

For this extension, most work happens over `SessionMessageEntry` items, because those contain the actual `AgentMessage` values to preserve or summarize.

### New-session creation

Command handlers receive `ExtensionCommandContext`, which provides `ctx.newSession(...)`. This is only available in command/action handlers, not in arbitrary event handlers, because session replacement can deadlock if done at the wrong time.

Safe pattern:

```ts
const sourceSession = ctx.sessionManager.getSessionFile();

await ctx.newSession({
  parentSession: sourceSession,
  setup: async (newSessionManager) => {
    // append copied messages and custom summary/linkage messages here
  },
  withSession: async (replacementCtx) => {
    replacementCtx.ui.notify("Selective compaction session created.", "info");
  },
});
```

The `withSession` callback receives a replacement-session context. Do not use the old `ctx.sessionManager` after session replacement.

### Model calls for dedicated summary generation

The dedicated prompt should use `complete(...)` from `@mariozechner/pi-ai`, similar to Pi's `handoff.ts` and `custom-compaction.ts` examples.

Relevant examples:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/custom-compaction.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/handoff.ts`

High-level model-call pattern:

```ts
import { complete, type Message } from "@mariozechner/pi-ai";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
if (!auth.ok || !auth.apiKey) throw new Error("No API key");

const conversationText = serializeConversation(convertToLlm(messagesInB));

const response = await complete(
  ctx.model!,
  {
    systemPrompt: SELECTIVE_COMPACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: buildUserPrompt(conversationText, surroundingContext) }],
        timestamp: Date.now(),
      },
    ],
  },
  { apiKey: auth.apiKey, headers: auth.headers, signal },
);
```

## Proposed Architecture

### File layout

Create a new extension directory:

```text
extensions/selective-compaction/
  index.ts       # extension registration, slash commands, orchestration
  prompt.ts      # dedicated summary prompt and parser helpers
  session.ts     # branch partitioning, validation, message copying helpers
  ui.ts          # selector/preview components, or wrapper around simple dialogs
  README.md      # user-facing documentation registered in /px
```

The first implementation can keep `ui.ts` simple and use `ctx.ui.select`, `ctx.ui.editor`, and `ctx.ui.confirm`. A later implementation can add a richer `SelectList` preview overlay.

### Component diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│ extensions/selective-compaction/index.ts                            │
│                                                                     │
│  registerPiExtension()                                              │
│  pi.registerCommand("selective-compact")                            │
│  openSelectiveCompactionFlow(ctx)                                   │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ui.ts                                                               │
│                                                                     │
│  chooseStartEntry(ctx, candidates)                                  │
│  chooseEndEntry(ctx, candidates, start)                             │
│  previewPlan(ctx, plan)                                             │
│  editGeneratedSummary(ctx, generated)                               │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ session.ts                                                          │
│                                                                     │
│  getSelectableMessages(branch)                                      │
│  buildPartition(branch, startId, endId)                             │
│  validatePartition(partition)                                       │
│  appendPartitionToNewSession(sm, partition, generated)              │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ prompt.ts                                                           │
│                                                                     │
│  SELECTIVE_COMPACTION_SYSTEM_PROMPT                                 │
│  buildSelectiveCompactionPrompt(partition)                          │
│  parseGeneratedCompaction(text)                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Runtime sequence

```text
User runs /selective-compact or opens extension through /px
  │
  ├─► extension waits for idle state
  │
  ├─► read current branch from ctx.sessionManager.getBranch()
  │
  ├─► build selectable message list
  │
  ├─► user selects start message
  │
  ├─► user selects end message
  │
  ├─► validate partition A/B/C
  │       ├─ invalid: explain and abort
  │       └─ valid: continue
  │
  ├─► show preview counts and message snippets
  │
  ├─► serialize B with serializeConversation(convertToLlm(...))
  │
  ├─► call model with dedicated prompt
  │
  ├─► parse B' and B''
  │
  ├─► allow user to edit generated output
  │
  ├─► create new session with parentSession = old session
  │       ├─ append A messages
  │       ├─ append custom summary message B'
  │       ├─ append custom linkage message B''
  │       └─ append C messages
  │
  └─► notify user and optionally set a session title
```

## Dedicated Prompt Design

The user explicitly requested a dedicated prompt inspired by the compaction template. The prompt should not be the default Pi compaction prompt verbatim. It should be tuned to the selective middle-splice use case.

### Prompt goals

The generated summary must:

- Explain what happened in `B`.
- Preserve facts, decisions, constraints, errors, and file operations from `B` that are still relevant.
- Discard incidental back-and-forth, false starts, repeated context, and verbose tool output.
- Mention what can safely be forgotten.
- Create a bridge into `C`, because `C` remains verbatim and may refer back to events in `B`.

### Proposed output format

Ask the model to return two top-level sections:

```markdown
## Selective Compaction Summary

### What happened
- ...

### Relevant outcomes and decisions
- ...

### Files, commands, and artifacts
- ...

### Errors, blockers, and corrected assumptions
- ...

### What is safe to forget
- ...

### What remains relevant going forward
- ...

<read-files>
path/to/file
</read-files>

<modified-files>
path/to/file
</modified-files>

## Linkage Message

The conversation now continues after a compacted middle section. The next preserved messages may refer to ...
```

This resembles Pi's compaction structure (`Goal`, `Constraints & Preferences`, `Progress`, `Key Decisions`, `Next Steps`, `Critical Context`, file tags), but reframes it around a selected middle range and its relevance to later context.

### Proposed system prompt

```ts
export const SELECTIVE_COMPACTION_SYSTEM_PROMPT = `
You are Pi's selective session compaction summarizer.

Your job is to replace a selected middle range of a coding-agent conversation with a compact, technically precise summary and a linkage message. The messages before the selected range and after the selected range will remain verbatim in the new session.

Optimize for recovering context-window budget while preserving continuity. Do not continue the conversation. Do not solve new tasks. Summarize only the selected range.

Write for a future assistant that will see:
1. The original messages before the selected range.
2. Your summary of the selected range.
3. Your linkage message.
4. The original messages after the selected range.

Your summary must answer:
- What happened in the selected range?
- What decisions, constraints, facts, commands, files, errors, and artifacts remain relevant?
- What can safely be forgotten because it was exploratory, superseded, or redundant?
- How should the future assistant understand references in the preserved following messages?

Return exactly this Markdown structure:

## Selective Compaction Summary

### What happened
[Concise prose plus bullets.]

### Relevant outcomes and decisions
- [Decision/fact and why it matters.]

### Files, commands, and artifacts
- [Paths, commands, generated docs, test outputs, uploads, etc.]

### Errors, blockers, and corrected assumptions
- [Failures with exact error snippets when important.]

### What is safe to forget
- [Exploration or repeated details that need not remain verbatim.]

### What remains relevant going forward
- [Specific state needed to continue after the compacted range.]

<read-files>
[path per line, if known]
</read-files>

<modified-files>
[path per line, if known]
</modified-files>

## Linkage Message
[A short bridge, written as context for the future assistant, explaining how the preserved messages after the compacted range relate to the summary.]
`;
```

### User prompt payload

The user prompt should include serialized `A` tail, serialized `B`, and serialized `C` head. The model needs the selected range `B` in full, and only limited surrounding context to write a good bridge.

```text
## Task
Summarize SELECTED_RANGE and write a linkage message.

## Previous context tail (A, limited)
<previous-context-tail>
[User]: ...
[Assistant]: ...
</previous-context-tail>

## Selected range to compact (B, full)
<selected-range>
[User]: ...
[Assistant]: ...
[Tool result]: ...
</selected-range>

## Following context head (C, limited)
<following-context-head>
[User]: ...
[Assistant]: ...
</following-context-head>

## Notes
- A and C will remain verbatim.
- Only B is being replaced.
- Focus the summary on what C and future work may still need.
```

The surrounding context should be capped. For example, include at most the last 6 visible messages from `A` and first 6 visible messages from `C`, or a token/character limit. We do not want the summarization request itself to become huge.

## Session Partitioning Design

### Candidate selection

Start with message entries only:

```ts
type MessageEntry = SessionEntry & { type: "message" };

function getMessageEntries(branch: SessionEntry[]): MessageEntry[] {
  return branch.filter((entry): entry is MessageEntry => entry.type === "message");
}
```

Each candidate should display:

- Entry ID.
- Role (`user`, `assistant`, `toolResult`, `bashExecution`, `custom`, etc.).
- Timestamp.
- Short content preview.
- Optional label, if `ctx.sessionManager.getLabel(entry.id)` exists.

Example display label:

```text
2026-05-11 09:21 user        Create a new docmgr ticket on creating...
2026-05-11 09:22 assistant   Created docmgr ticket: PI-EXT-SELECTIVE...
2026-05-11 09:24 toolResult  bash: docmgr ticket create-ticket...
```

### Range semantics

Use inclusive range semantics:

```text
startEntryId and endEntryId are both inside B.

A = entries before startEntryId
B = entries from startEntryId through endEntryId
C = entries after endEntryId
```

The UI should say this explicitly.

### Validation rules

This is the most important technical section. A naive implementation that allows arbitrary start/end messages can create invalid provider context. Tool results may refer to tool calls that were removed, and assistant tool calls may require tool results that were removed.

Start with conservative rules:

1. **Do not allow `B` to start at a `toolResult` message.**
   - Reason: the corresponding assistant tool call is probably in `A`, but the result would be summarized away. This may be okay if both are summarized, but it is confusing and provider-sensitive.

2. **Do not allow `C` to start at a `toolResult` message.**
   - Reason: `C` would contain a tool result whose initiating assistant tool call was in summarized `B`, creating an invalid message sequence.

3. **Do not allow `A` to end with an assistant message that contains unresolved tool calls unless their tool results are also in `A`.**
   - Reason: provider payloads generally require tool-call/tool-result consistency.

4. **Do not allow `B` to split an assistant tool-call batch from its tool results.**
   - If an assistant message in `B` has tool calls, all corresponding `toolResult` messages should be in `B` too.

5. **Prefer compacting whole user turns.**
   - A turn begins at a user message and continues until before the next user message.
   - This mirrors Pi's built-in compaction cut-point safety.

6. **Require at least one message in `B`.**

7. **Warn if `B` is very small.**
   - If `B` has fewer than e.g. 4 messages or estimated tokens are low, compaction may not be worth it.

Practical implementation strategy: initially only allow start candidates that are user messages or custom messages and end candidates that land at the end of a turn. This avoids many hard cases.

### Turn extraction pseudocode

```ts
interface Turn {
  startIndex: number;
  endIndex: number; // inclusive
  entries: MessageEntry[];
  label: string;
}

function buildTurns(messageEntries: MessageEntry[]): Turn[] {
  const turns: Turn[] = [];
  let currentStart = 0;

  for (let i = 1; i < messageEntries.length; i++) {
    if (messageEntries[i].message.role === "user") {
      turns.push({
        startIndex: currentStart,
        endIndex: i - 1,
        entries: messageEntries.slice(currentStart, i),
        label: summarizeTurn(messageEntries.slice(currentStart, i)),
      });
      currentStart = i;
    }
  }

  if (messageEntries.length > 0) {
    turns.push({
      startIndex: currentStart,
      endIndex: messageEntries.length - 1,
      entries: messageEntries.slice(currentStart),
      label: summarizeTurn(messageEntries.slice(currentStart)),
    });
  }

  return turns;
}
```

First implementation recommendation: select **turn start** and **turn end** rather than arbitrary message IDs. The UI can still describe them as messages, but internally we stay on valid turn boundaries.

## New Session Construction

### Why not use `appendCompaction`?

`appendCompaction(summary, firstKeptEntryId, tokensBefore, details, fromHook)` is designed for normal compaction:

```text
summary + messages from firstKeptEntryId onward
```

That works when summarized content is before the kept suffix. It does not naturally represent:

```text
A + summary(B) + C
```

because `A` is before the summarized range and must remain verbatim. Therefore the recommended implementation is a new session with copied messages and custom summary messages.

### Message roles for B' and B''

Use `appendCustomMessageEntry` for both generated messages. They participate in context and can be displayed with a custom renderer.

Recommended shape:

```ts
const summaryText = `## Selective Compaction Summary\n...`;
const linkageText = `## Linkage Message\n...`;

newSessionManager.appendCustomMessageEntry(
  "selective-compaction-summary",
  summaryText,
  true,
  {
    sourceSession: oldSessionFile,
    compactedStartEntryId: startEntryId,
    compactedEndEntryId: endEntryId,
    compactedMessageCount: partition.B.length,
    generatedAt: new Date().toISOString(),
  },
);

newSessionManager.appendCustomMessageEntry(
  "selective-compaction-linkage",
  linkageText,
  true,
  {
    sourceSession: oldSessionFile,
    followsSummary: true,
  },
);
```

A single custom message containing both sections is simpler and may be enough. Two messages match the user's `B' + B''` model more directly. If provider or context formatting makes two custom messages noisy, combine them later.

### Copying messages

Pseudocode:

```ts
function appendCopiedMessages(sm: SessionManager, entries: MessageEntry[]): void {
  for (const entry of entries) {
    sm.appendMessage(cloneMessageForNewSession(entry.message));
  }
}

function cloneMessageForNewSession(message: AgentMessage): AgentMessage {
  return structuredClone({
    ...message,
    timestamp: Date.now(), // optional: preserve original timestamp in details instead
  });
}
```

Open implementation question: preserve original message timestamps or use new timestamps? For auditability, preserving original timestamps may be useful. For a new session timeline, new timestamps may be cleaner. Recommendation: preserve the message content exactly, but store original entry IDs in a sidecar custom entry or details object.

### Source mapping metadata

Add a non-context custom entry in the new session with source mapping:

```ts
newSessionManager.appendCustomEntry("selective-compaction-state", {
  sourceSession: oldSessionFile,
  createdAt: new Date().toISOString(),
  startEntryId,
  endEntryId,
  copiedBeforeIds: partition.A.map((e) => e.id),
  compactedIds: partition.B.map((e) => e.id),
  copiedAfterIds: partition.C.map((e) => e.id),
});
```

This helps debugging without adding noise to LLM context.

## UI Design

### MVP UI

The minimum viable UI can be command-driven with built-in dialogs:

```text
/selective-compact
  select start turn
  select end turn
  confirm preview
  loader while generating
  editor to edit summary/linkage
  confirm create new session
```

Use `ctx.ui.select(...)` for simple pickers and `ctx.ui.editor(...)` for the generated Markdown. This keeps the first implementation small.

### Better UI

After the MVP works, add a custom overlay using `SelectList` from `@mariozechner/pi-tui` and `ctx.ui.custom(...)`:

- Left side: list of turns/messages.
- Right side: preview of selected range and estimated token savings.
- Footer: key hints.
- Actions:
  - Enter: select start/end.
  - Space: toggle range endpoint.
  - p: preview partition.
  - g: generate summary.
  - Esc: cancel.

Relevant TUI docs:

- Selection dialog pattern in `docs/tui.md`.
- `SelectList`, `DynamicBorder`, `Text`, `Container`.
- Always ensure rendered lines do not exceed `width`.

### Preview content

Before generating, show:

```text
Selective compaction preview

Before range (A): 42 messages
Selected range (B): 31 messages
After range (C): 12 messages

Start: user 2026-05-11 08:14 "Investigate why compaction fails..."
End: assistant 2026-05-11 08:47 "The parser tests now pass..."

Validation: OK, turn-boundary safe

This will create a new session. The old session will not be modified.
```

## Implementation Plan

### Phase 1: Skeleton extension

Create:

```text
extensions/selective-compaction/index.ts
extensions/selective-compaction/README.md
```

Implement:

- `registerPiExtension(...)` metadata.
- `/selective-compact` command.
- `/scompact` alias.
- Simple status notification.

Validation:

```bash
timeout 20 pi --list-models
```

Manual:

```text
/reload
/px
/selective-compact
```

### Phase 2: Branch scanning and turn display

Create `session.ts` with:

- `getMessageEntries(branch)`.
- `messagePreview(message)`.
- `buildTurns(messageEntries)`.
- `formatTurnOption(turn)`.

Test with a small fixture if possible. Because session entries are plain objects, unit tests can construct fake branches.

Pseudocode command flow:

```ts
const branch = ctx.sessionManager.getBranch();
const messages = getMessageEntries(branch);
const turns = buildTurns(messages);

const startId = await ctx.ui.select("Compact start", turns.map(formatTurnOption));
const endId = await ctx.ui.select("Compact end", turnsAfterStart.map(formatTurnOption));
```

### Phase 3: Partition and validation

Implement:

- `buildPartition(messageEntries, startTurn, endTurn)`.
- `validatePartition(partition)`.
- `estimatePartition(partition)` for counts and rough sizes.

Validation result shape:

```ts
interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
```

Start conservative: only whole turns. Then the validation mostly ensures non-empty `B` and legal ordering.

### Phase 4: Dedicated prompt generation

Create `prompt.ts` with:

- `SELECTIVE_COMPACTION_SYSTEM_PROMPT`.
- `buildSelectiveCompactionPrompt(partition)`.
- `parseSelectiveCompactionResponse(text)`.

Use `serializeConversation(convertToLlm(...))` for B and limited context snippets for A/C.

Generation pseudocode:

```ts
async function generateSelectiveSummary(ctx, partition, signal) {
  if (!ctx.model) throw new Error("No model selected");

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) throw new Error(auth.ok ? "No API key" : auth.error);

  const response = await complete(
    ctx.model,
    {
      systemPrompt: SELECTIVE_COMPACTION_SYSTEM_PROMPT,
      messages: [buildUserMessage(partition)],
    },
    { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 8192, signal },
  );

  const text = response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  return parseSelectiveCompactionResponse(text);
}
```

### Phase 5: Loader and editor preview

Wrap generation in `ctx.ui.custom(...)` with `BorderedLoader`, following the `handoff.ts` example.

Then allow editing:

```ts
const edited = await ctx.ui.editor("Edit selective compaction summary", generatedMarkdown);
if (edited === undefined) return;
```

Parser can be loose for MVP:

- If response contains `## Linkage Message`, split at that heading.
- Otherwise treat the whole response as summary and synthesize a generic linkage message.

### Phase 6: Create new session

Use `ctx.newSession(...)`:

```ts
const oldSessionFile = ctx.sessionManager.getSessionFile();
const copiedBefore = partition.before.map(copySerializableEntryData);
const copiedAfter = partition.after.map(copySerializableEntryData);
const metadata = buildMetadata(...);

const result = await ctx.newSession({
  parentSession: oldSessionFile,
  setup: async (sm) => {
    appendCopiedMessages(sm, copiedBefore);
    sm.appendCustomMessageEntry("selective-compaction-summary", summary, true, metadata.summary);
    sm.appendCustomMessageEntry("selective-compaction-linkage", linkage, true, metadata.linkage);
    appendCopiedMessages(sm, copiedAfter);
    sm.appendCustomEntry("selective-compaction-state", metadata.state);
  },
  withSession: async (replacementCtx) => {
    replacementCtx.ui.notify("Selective compaction session created.", "info");
  },
});
```

If `result.cancelled`, notify the user.

### Phase 7: Renderer and docs

Register message renderers:

```ts
pi.registerMessageRenderer("selective-compaction-summary", (message, options, theme) => {
  return new Text(theme.fg("accent", "Selective compaction summary\n") + message.content, 0, 0);
});
```

Add README docs and register them in `registerPiExtension`.

### Phase 8: Tests and manual validation

Run:

```bash
timeout 20 pi --list-models
```

Manual tests:

1. Start a fresh test session.
2. Create several short turns.
3. Run `/selective-compact`.
4. Select a middle range.
5. Verify generated summary and linkage.
6. Create new session.
7. Inspect context behavior by asking the model what it remembers from the compacted section.
8. Confirm old session remains intact.

## API Reference Cheat Sheet

### Extension registration

```ts
registerPiExtension({
  id,
  name,
  description,
  commands,
  tags,
  run,
  actions,
  docs,
  settings,
  widgets,
});
```

File:

- `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts`

### Slash commands

```ts
pi.registerCommand("selective-compact", {
  description: "Compact a selected middle range into a new session",
  handler: async (args, ctx) => {
    await openSelectiveCompactionFlow(ctx, args);
  },
});
```

### Session inspection

```ts
const branch = ctx.sessionManager.getBranch();
const entries = ctx.sessionManager.getEntries();
const leafId = ctx.sessionManager.getLeafId();
const label = ctx.sessionManager.getLabel(entryId);
```

### New session

```ts
await ctx.newSession({
  parentSession: ctx.sessionManager.getSessionFile(),
  setup: async (sm) => { /* append entries */ },
  withSession: async (replacementCtx) => { /* notify or set editor */ },
});
```

### Model completion

```ts
const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
const response = await complete(model, request, {
  apiKey: auth.apiKey,
  headers: auth.headers,
  signal,
  maxTokens: 8192,
});
```

### Conversation serialization

```ts
const text = serializeConversation(convertToLlm(agentMessages));
```

### UI primitives

```ts
await ctx.ui.select("Pick start", options);
await ctx.ui.confirm("Create new session?", previewText);
await ctx.ui.editor("Edit summary", generatedMarkdown);
ctx.ui.notify("Done", "info");
```

### Loader UI

```ts
const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
  const loader = new BorderedLoader(tui, theme, "Generating selective summary...");
  loader.onAbort = () => done(null);
  generate(loader.signal).then(done).catch(() => done(null));
  return loader;
});
```

## Data Structures

Recommended internal types:

```ts
interface SelectableMessage {
  entry: MessageEntry;
  index: number;
  role: string;
  timestamp: string;
  preview: string;
  label?: string;
}

interface SelectableTurn {
  id: string;
  startIndex: number;
  endIndex: number;
  startEntryId: string;
  endEntryId: string;
  entries: MessageEntry[];
  preview: string;
}

interface SelectivePartition {
  before: MessageEntry[];
  selected: MessageEntry[];
  after: MessageEntry[];
  startEntryId: string;
  endEntryId: string;
}

interface GeneratedSelectiveCompaction {
  summary: string;
  linkage: string;
  raw: string;
  readFiles: string[];
  modifiedFiles: string[];
}

interface SelectiveCompactionStateEntry {
  version: 1;
  sourceSession?: string;
  createdAt: string;
  startEntryId: string;
  endEntryId: string;
  beforeEntryIds: string[];
  selectedEntryIds: string[];
  afterEntryIds: string[];
  summaryMessageCustomType: "selective-compaction-summary";
  linkageMessageCustomType: "selective-compaction-linkage";
}
```

## Edge Cases and Risks

### Tool-call consistency

This is the largest risk. Preserving `C` while removing `B` can leave dangling tool results or assistant tool calls if the range cuts through a tool batch. The MVP should avoid this by selecting whole turns only.

### Message roles and provider compatibility

Custom messages participate in context, but providers may serialize them differently from user/assistant messages. Verify how `buildSessionContext()` converts `CustomMessageEntry`. If a custom role causes provider issues, use a normal user message such as:

```text
[Selective compaction summary inserted by extension]
...
```

But prefer `CustomMessageEntry` first because it records extension provenance and can be rendered specially.

### Huge selected ranges

The selected `B` might be too large for one summarization call. Options:

- Warn and abort if serialized `B` exceeds a safe character/token estimate.
- Chunk `B` into multiple summaries, then summarize the summaries.
- Reuse Pi's iterative compaction utility later.

MVP recommendation: warn at a high threshold and ask the user to select a smaller range.

### Existing compaction entries in source session

The branch may already include `CompactionEntry` entries. `getBranch()` contains entries, while `buildSessionContext()` represents what the model currently sees. The extension must decide whether to operate on raw branch entries or built context.

Recommendation:

- Use raw message entries for copying `A`, `B`, and `C`.
- If a prior compaction entry lies before `A`, ensure the new session does not accidentally expand old content that the current context no longer had.
- For MVP, detect existing compaction entries and show a warning: `This session already contains compaction entries; selective compaction will copy visible message entries on the current branch, not reconstruct hidden pre-compaction history.`

### Branch metadata

Model changes, thinking-level changes, labels, and session names may exist between messages. MVP may ignore most metadata. Later versions can preserve:

- Current model via `appendModelChange` if public API is available and desired.
- Thinking level via `appendThinkingLevelChange`.
- Labels via `appendLabelChange` for copied entries, though IDs change.
- Session name via `pi.setSessionName(...)` after new session creation.

### User trust

Because this creates a transformed conversation, always preview and let the user edit generated text before creating the session.

## Alternatives Considered

### Alternative 1: Override built-in compaction only

Use `session_before_compact` and return a custom `CompactionEntry`.

Pros:

- Integrates with `/compact` and auto-compaction.
- Uses existing compaction storage.

Cons:

- Built-in compaction is suffix-oriented: summary plus kept messages from `firstKeptEntryId` onward.
- It cannot naturally represent `A + summary(B) + C`.
- Harder to preserve pre-range messages verbatim while replacing only a middle range.

Decision: not recommended for this feature.

### Alternative 2: Mutate the current session file in place

Rewrite the current JSONL file to remove `B` and insert summary messages.

Pros:

- The current session remains the active session path.

Cons:

- High risk of corrupting session history.
- Violates append-only expectations.
- Harder to undo.

Decision: do not do this.

### Alternative 3: Generate a handoff prompt only

Use a handoff-style prompt and let the user start a fresh session without preserving `A` and `C` verbatim.

Pros:

- Simple.
- Already similar to `examples/extensions/handoff.ts`.

Cons:

- Does not satisfy the required output shape.
- Loses exact context from `A` and `C`.

Decision: useful inspiration, not sufficient.

### Alternative 4: Add labels only, then rely on future core support

Use `pi.setLabel` to mark start/end and wait for core APIs to support middle-splice compaction.

Pros:

- Very safe.

Cons:

- Does not deliver context recovery now.

Decision: labels can be part of UX, but not the whole feature.

## Suggested Initial Code Skeleton

```ts
// extensions/selective-compaction/index.ts
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { registerPiExtension } from "../_shared/registry";
import { SELECTIVE_COMPACTION_SYSTEM_PROMPT, buildPrompt, parseResponse } from "./prompt";
import { buildPartitionFlow, appendCompactedSession } from "./session";

const CUSTOM_SUMMARY = "selective-compaction-summary";
const CUSTOM_LINKAGE = "selective-compaction-linkage";

export default function selectiveCompaction(pi: ExtensionAPI): void {
  registerPiExtension({
    id: "selective-compaction",
    name: "Selective Compaction",
    description: "Summarize a selected middle range of the current session into a new conversation.",
    commands: ["selective-compact", "scompact"],
    tags: ["compaction", "session", "context"],
    run: async (ctx) => openSelectiveCompactionFlow(ctx),
    actions: [
      {
        id: "open",
        title: "Open selective compaction flow",
        description: "Select a range, summarize it, and create a replacement session.",
        default: true,
        run: async (ctx) => openSelectiveCompactionFlow(ctx),
      },
    ],
    docs: [
      {
        id: "overview",
        title: "Selective Compaction overview",
        markdown: "# Selective Compaction\n\nSelect a middle range of the current session and replace it with a summary plus bridge in a new session.",
      },
    ],
  });

  pi.registerMessageRenderer(CUSTOM_SUMMARY, (message, _options, theme) =>
    new Text(theme.fg("accent", "Selective Compaction Summary\n") + String(message.content), 0, 0),
  );

  pi.registerMessageRenderer(CUSTOM_LINKAGE, (message, _options, theme) =>
    new Text(theme.fg("muted", "Selective Compaction Linkage\n") + String(message.content), 0, 0),
  );

  pi.registerCommand("selective-compact", {
    description: "Compact a selected middle range into a new session",
    handler: async (_args, ctx) => openSelectiveCompactionFlow(ctx),
  });

  pi.registerCommand("scompact", {
    description: "Alias for /selective-compact",
    handler: async (_args, ctx) => openSelectiveCompactionFlow(ctx),
  });
}

async function openSelectiveCompactionFlow(ctx: ExtensionCommandContext): Promise<void> {
  await ctx.waitForIdle();

  if (!ctx.hasUI) {
    ctx.ui.notify("selective-compaction requires interactive mode", "error");
    return;
  }
  if (!ctx.model) {
    ctx.ui.notify("No model selected", "error");
    return;
  }

  const partition = await buildPartitionFlow(ctx);
  if (!partition) return;

  const generated = await generateWithLoader(ctx, partition);
  if (!generated) return;

  const edited = await ctx.ui.editor("Edit selective compaction output", generated.raw);
  if (edited === undefined) return;

  const finalGenerated = parseResponse(edited);
  await appendCompactedSession(ctx, partition, finalGenerated);
}
```

This skeleton is intentionally incomplete. It shows where each responsibility should live.

## Documentation and Review Checklist

Before marking implementation complete:

- [ ] Extension appears in `/px`.
- [ ] Direct commands `/selective-compact` and `/scompact` work.
- [ ] The default action is safe and opens the flow.
- [ ] The extension uses a dedicated prompt, not default compaction instructions.
- [ ] Summary prompt is inspired by Pi compaction structure and focused on relevance.
- [ ] MVP only selects safe whole-turn ranges.
- [ ] User sees a preview before generation.
- [ ] User can edit generated summary/linkage before creating the new session.
- [ ] New session has `parentSession` set.
- [ ] Old session remains unchanged.
- [ ] New session contains `A + B' + B'' + C` in that order.
- [ ] Source mapping metadata is saved as a non-context custom entry.
- [ ] Message renderer makes inserted summary/linkage recognizable.
- [ ] `timeout 20 pi --list-models` passes.
- [ ] Manual `/reload`, `/px`, and command smoke tests pass.

## File References

Core docs and examples read for this design:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/custom-compaction.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/handoff.ts`
- `/home/manuel/code/wesen/2026-04-21--pi-extensions/docs/pi-shared-extension-framework-guide.md`
- `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts`
- `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts`
- `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/title.ts`
- `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-meter/index.ts`

## Final Recommendation

Implement this as a **new-session selective rewrite extension** using the shared extension framework. Keep the first version conservative by selecting whole turns only. Use a dedicated prompt inspired by Pi's compaction template, but explicitly optimized for “what happened” and “what remains relevant.” Store summary and linkage as custom context messages, and preserve source mapping as non-context custom metadata.

This gives users a safe, reviewable way to recover context window without surrendering control to automatic cut-point selection.
