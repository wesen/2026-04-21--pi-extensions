# Pi Compaction: A Textbook Guide

Compaction is Pi's way of admitting that even large context windows are finite. A coding session can grow for hours: prompts, assistant responses, tool calls, tool results, file reads, edits, failed commands, and design decisions all accumulate. At some point the active conversation no longer fits comfortably in the model's context window. Pi's answer is not to discard the session. The full JSONL history remains on disk. Instead, Pi replaces older active context with a structured summary while keeping the most recent messages intact.

The goal of this chapter is to give you a working mental model of compaction: when it happens, what it preserves, what it loses, how settings affect it, and how extensions can intercept the process. By the end, you should be able to decide whether a problem is solved with settings, with `/compact` instructions, or with a custom extension.

## 1. The Two Summarization Mechanisms

Pi has two related summarization mechanisms. They use similar summary formats, but they solve different problems.

| Mechanism | Trigger | Purpose |
|---|---|---|
| **Compaction** | Context exceeds threshold, or you run `/compact` | Summarize older active context so the current branch fits in the model window. |
| **Branch summarization** | `/tree` navigation | Preserve useful information from a branch you are leaving when you move elsewhere in the session tree. |

The distinction matters. Compaction is about *space*: the context is too large, so old material is summarized. Branch summarization is about *navigation*: you are moving through the session tree and may want a summary of the abandoned branch to follow you.

A compacted session is still the same session. The old entries are not deleted from disk. What changes is the path of messages that Pi sends to the LLM on the next request.

## 2. The Settings Layer: When Compaction Happens

The simplest way to interact with compaction is through settings. Settings do not change the built-in summary prompt or summary format. They change when automatic compaction runs and how much recent context remains unsummarized.

Pi reads settings from two places:

| Location | Scope |
|---|---|
| `~/.pi/agent/settings.json` | Global settings for all projects. |
| `.pi/settings.json` | Project-local overrides for the current directory. |

Project settings override and merge with global settings. If the global file sets `compaction.enabled` and the project file sets only `compaction.reserveTokens`, the project inherits the global `enabled` value and overrides the reserve value.

The default compaction settings are:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

| Setting | Default | Meaning |
|---|---:|---|
| `compaction.enabled` | `true` | Enables automatic compaction when context is nearly full. |
| `compaction.reserveTokens` | `16384` | Tokens reserved for the model's next response. |
| `compaction.keepRecentTokens` | `20000` | Recent conversation tokens to keep unsummarized. |

Auto-compaction triggers roughly when:

```text
contextTokens > contextWindow - reserveTokens
```

If a model has a 200,000-token context window and `reserveTokens` is 16,384, then automatic compaction begins when context usage exceeds roughly 183,616 tokens. The reserve is there because the next assistant response also needs room. Without a reserve, Pi could ask the model to continue with a nearly full context and leave too little room for the answer.

### 2.1 Disabling Auto-Compaction

You can disable automatic compaction while keeping manual compaction available:

```json
{
  "compaction": {
    "enabled": false
  }
}
```

This is useful when you want explicit control and prefer to run `/compact` only at deliberate handoff points.

### 2.2 Keeping More Recent Context

If compaction summaries feel too aggressive, increase `keepRecentTokens`:

```json
{
  "compaction": {
    "enabled": true,
    "keepRecentTokens": 50000
  }
}
```

This tells Pi to preserve a larger tail of recent conversation verbatim. The tradeoff is that compaction may free less space, and repeated compactions may happen sooner.

### 2.3 Compacting Earlier

If you want Pi to leave more room for long model responses, increase `reserveTokens`:

```json
{
  "compaction": {
    "reserveTokens": 32768
  }
}
```

A larger reserve means compaction triggers earlier. This can reduce context overflow errors in sessions where the assistant produces long plans or large code blocks.

## 3. Manual Compaction: One-Off Control

Manual compaction is the next level of control. In an interactive Pi session, run:

```text
/compact
```

You can also provide custom instructions:

```text
/compact Focus on files changed, failed commands, design decisions, and exact next steps.
```

The instructions do not replace Pi's built-in compaction machinery. They guide the summary. This is the best tool when the default summary structure is fine but you want emphasis on a particular kind of information.

Good manual compaction instructions are concrete. They name what should survive:

```text
/compact Preserve every file path, command failure, error message, and remaining task.
```

```text
/compact Write a handoff summary for another agent. Include current goal, changed files, validation commands, open risks, and next actions.
```

```text
/compact Focus on architectural decisions and why they were made. Keep code-review instructions.
```

A vague instruction such as "summarize well" adds little. The model already knows it is summarizing. The value of custom instructions is prioritization.

## 4. What Actually Happens During Compaction

Compaction is easier to reason about if you separate the full session file from the active context. The JSONL file stores the session history. The active context is what Pi sends to the model. Compaction changes the active context by inserting a summary and choosing a point from which recent messages remain verbatim.

The high-level algorithm is:

1. Compute the current context size.
2. Walk backward from the newest message.
3. Keep recent messages until approximately `keepRecentTokens` are preserved.
4. Choose a valid cut point.
5. Summarize older messages.
6. Append a `CompactionEntry` to the session.
7. Reload the active context as summary plus kept messages.

Here is the conceptual before-and-after picture.

```text
Before compaction:

  entry:  0     1     2     3      4     5     6      7      8     9
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│
        └─────┴─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┘
                └────────┬───────┘ └──────────────┬──────────────┘
               messagesToSummarize            kept messages
                                   ↑
                          firstKeptEntryId (entry 4)
```

```text
After compaction:

  entry:  0     1     2     3      4     5     6      7      8     9     10
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│ cmp │
        └─────┴─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┘
               └──────────┬──────┘ └──────────────────────┬───────────────────┘
                 not sent to LLM                    sent to LLM
                                                         ↑
                                              starts from firstKeptEntryId
```

The next LLM call sees:

```text
system prompt
+ compaction summary
+ messages from firstKeptEntryId onward
```

It does not see all older messages verbatim, although those older messages still exist in the session file.

## 5. Valid Cut Points and Split Turns

A turn begins with a user message and includes the assistant responses and tool activity until the next user message. Pi normally cuts at turn boundaries because tool calls and tool results belong together.

Valid cut points include:

- user messages,
- assistant messages,
- bash execution messages,
- custom messages,
- branch summary messages.

Pi does not cut at tool results. A tool result without its corresponding tool call would make the remaining context incoherent.

There is one important edge case: a single turn can be larger than `keepRecentTokens`. When that happens, Pi may split a turn. The early part of the turn becomes a special turn-prefix summary, while the later part remains verbatim.

```text
Split turn:

  entry:  0     1     2      3     4      5      6     7      8
        ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                ↑                                     ↑
         turnStartIndex = 1                  firstKeptEntryId = 7
                │                                     │
                └──── turnPrefixMessages (1-6) ───────┘
                                                      └── kept (7-8)
```

For split turns, Pi has to summarize the early part of the still-active turn. That summary is different from normal history summary: it preserves context needed to understand the kept tail of the same turn.

## 6. Repeated Compactions

Repeated compactions are iterative. Pi does not simply summarize from the beginning of time every time. On repeated compactions, the summarized span starts at the previous compaction's kept boundary, `firstKeptEntryId`, not at the compaction entry itself. If that kept entry cannot be found in the current path, Pi falls back to the entry after the previous compaction.

This detail matters because it preserves messages that survived the earlier compaction. When a second compaction happens, those messages may now become part of the older span and need to be folded into the updated summary.

Pi also recalculates `tokensBefore` from the rebuilt session context before writing the new compaction entry. The token count reflects the actual context being replaced, not merely a stale estimate.

## 7. The Compaction Entry

The summary is stored as a session entry. The TypeScript shape is:

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  fromHook?: boolean;
  details?: T;
}
```

The important fields are:

| Field | Meaning |
|---|---|
| `summary` | The generated summary that replaces older active context. |
| `firstKeptEntryId` | The first entry that remains verbatim after compaction. |
| `tokensBefore` | Token count before compaction. |
| `fromHook` | True when an extension supplied the compaction. |
| `details` | JSON-serializable metadata, often file tracking information. |

The default compaction details track files:

```typescript
interface CompactionDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

File tracking is cumulative. Pi extracts file operations from the messages being summarized and from previous compaction or branch summary details. This means a later summary can still know about files that were read or modified before an earlier compaction.

## 8. The Default Summary Format

Pi's default compaction and branch summaries use a structured markdown format. The exact generation is internal, but the documented format is:

```markdown
## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Requirements mentioned by user]

## Progress
### Done
- [x] [Completed tasks]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues, if any]

## Key Decisions
- **[Decision]**: [Rationale]

## Next Steps
1. [What should happen next]

## Critical Context
- [Data needed to continue]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

The format is a handoff document. It tells the next model call what goal is being pursued, what constraints matter, what has already happened, and what files are relevant.

Before summarization, Pi serializes the conversation into plain text. The serialization looks like this:

```text
[User]: What they said
[Assistant thinking]: Internal reasoning
[Assistant]: Response text
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: Output from tool
```

Tool results are truncated to 2000 characters during serialization. This prevents large `read` or `bash` outputs from dominating the summarization request.

## 9. Branch Summarization

Branch summarization appears when you use `/tree` to navigate to a different branch. A session tree can fork: one branch contains work you are leaving, and another branch is where you are going. If you ask Pi to summarize the abandoned branch, the summary lets useful context follow you.

The process is:

1. Find the deepest common ancestor of the old leaf and target leaf.
2. Collect entries from the old branch back to that ancestor.
3. Prepare entries within a token budget.
4. Generate a summary.
5. Append a `BranchSummaryEntry`.

```text
Before navigation:

         ┌─ B ─ C ─ D (old leaf, being abandoned)
    A ───┤
         └─ E ─ F (target)

Common ancestor: A
Entries to summarize: B, C, D
```

```text
After navigation with summary:

         ┌─ B ─ C ─ D ─ [summary of B,C,D]
    A ───┤
         └─ E ─ F (new leaf)
```

The branch summary entry shape is:

```typescript
interface BranchSummaryEntry<T = unknown> {
  type: "branch_summary";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  fromId: string;
  fromHook?: boolean;
  details?: T;
}
```

Branch summary settings are separate from compaction settings:

```json
{
  "branchSummary": {
    "reserveTokens": 16384,
    "skipPrompt": false
  }
}
```

If `skipPrompt` is true, Pi skips the "Summarize branch?" prompt on `/tree` navigation and defaults to no summary.

## 10. Extension Hooks: Observe, Cancel, Replace

Settings control when default compaction runs. Extensions control what happens when it runs.

The main hook is `session_before_compact`:

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;
});
```

The event includes:

```typescript
interface SessionBeforeCompactEvent {
  type: "session_before_compact";
  preparation: CompactionPreparation;
  branchEntries: SessionEntry[];
  customInstructions?: string;
  signal: AbortSignal;
}
```

The preparation object contains the data Pi has already computed:

```typescript
interface CompactionPreparation {
  firstKeptEntryId: string;
  messagesToSummarize: AgentMessage[];
  turnPrefixMessages: AgentMessage[];
  isSplitTurn: boolean;
  tokensBefore: number;
  previousSummary?: string;
  fileOps: FileOperations;
  settings: CompactionSettings;
}
```

An extension can return nothing, cancel, or provide a replacement compaction.

### 10.1 Observe and Allow Default Compaction

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    ctx.ui.notify(
      `Compacting ${event.preparation.tokensBefore.toLocaleString()} tokens`,
      "info",
    );

    // Return nothing: Pi uses default compaction.
  });
}
```

Use this pattern for logging, metrics, or UI visibility.

### 10.2 Cancel Compaction

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (_event, ctx) => {
    const ok = await ctx.ui.confirm(
      "Compaction requested",
      "Allow compaction now?",
    );

    if (!ok) {
      return { cancel: true };
    }
  });
}
```

Cancellation is useful when compaction should be deliberate. For example, you might block compaction during a sensitive debugging session and run it manually only after writing a diary entry.

### 10.3 Replace the Summary

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    const p = event.preparation;

    return {
      compaction: {
        summary: [
          "## Goal",
          "Continue implementing the current task.",
          "",
          "## Critical Context",
          "Custom summary generated by my extension.",
        ].join("\n"),
        firstKeptEntryId: p.firstKeptEntryId,
        tokensBefore: p.tokensBefore,
        details: {
          custom: true,
          readFiles: p.fileOps.readFiles,
          modifiedFiles: p.fileOps.modifiedFiles,
        },
      },
    };
  });
}
```

Returning `compaction` tells Pi not to use the default summary. The `firstKeptEntryId` and `tokensBefore` should normally come from `event.preparation`. Those fields anchor your custom summary into Pi's session mechanics.

## 11. Custom Prompt and Custom Model

If you want to change the actual compaction prompt, use an extension that calls a model itself and returns a compaction result. Pi ships an example at:

```text
examples/extensions/custom-compaction.ts
```

The important imports are:

```typescript
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
```

The pattern is:

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    const { preparation, signal } = event;
    const {
      messagesToSummarize,
      turnPrefixMessages,
      tokensBefore,
      firstKeptEntryId,
      previousSummary,
    } = preparation;

    const model = ctx.modelRegistry.find("google", "gemini-2.5-flash");
    if (!model) return; // fallback to default compaction

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) return;

    const allMessages = [
      ...messagesToSummarize,
      ...turnPrefixMessages,
    ];

    const conversationText = serializeConversation(
      convertToLlm(allMessages),
    );

    const previousContext = previousSummary
      ? `\n\nPrevious session summary for context:\n${previousSummary}`
      : "";

    const response = await complete(
      model,
      {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a conversation summarizer. Create a comprehensive summary.${previousContext}

Preserve:
1. The main goals and objectives discussed
2. Key decisions made and their rationale
3. Important code changes, file modifications, or technical details
4. Current state of ongoing work
5. Blockers, issues, or open questions
6. Next steps

<conversation>
${conversationText}
</conversation>`,
              },
            ],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        maxTokens: 8192,
        signal,
      },
    );

    const summary = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    if (!summary.trim()) return;

    return {
      compaction: {
        summary,
        firstKeptEntryId,
        tokensBefore,
      },
    };
  });
}
```

This is the point where you truly own the compaction prompt. Settings cannot do this. Manual `/compact instructions` can influence the default prompt, but a custom extension can replace the summarization request completely.

The `signal` field matters. Pass it to model calls so pressing escape or aborting compaction cancels your custom summarization too.

## 12. Triggering Compaction from an Extension

Extensions can also trigger compaction. This is different from intercepting compaction. You might trigger compaction when usage crosses a custom threshold, when a ticket closes, or when the user runs a custom command.

Pi exposes `ctx.compact()`:

```typescript
ctx.compact({
  customInstructions: "Focus on changed files and next steps.",
  onComplete: (result) => {
    ctx.ui.notify("Compaction completed", "info");
  },
  onError: (error) => {
    ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
  },
});
```

A complete command example:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  function trigger(ctx: ExtensionContext, customInstructions?: string) {
    ctx.compact({
      customInstructions,
      onComplete: () => {
        if (ctx.hasUI) ctx.ui.notify("Compaction completed", "info");
      },
      onError: (error) => {
        if (ctx.hasUI) ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
      },
    });
  }

  pi.registerCommand("my-compact", {
    description: "Trigger compaction with custom instructions",
    handler: async (args, ctx) => {
      trigger(ctx, args.trim() || undefined);
    },
  });
}
```

A threshold-based example from Pi's extension examples uses `ctx.getContextUsage()` at `turn_end`:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const COMPACT_THRESHOLD_TOKENS = 100_000;

export default function (pi: ExtensionAPI) {
  let previousTokens: number | null | undefined;

  const triggerCompaction = (ctx: ExtensionContext, customInstructions?: string) => {
    ctx.compact({ customInstructions });
  };

  pi.on("turn_end", (_event, ctx) => {
    const usage = ctx.getContextUsage();
    const currentTokens = usage?.tokens ?? null;
    if (currentTokens === null) return;

    const crossedThreshold =
      previousTokens !== undefined &&
      previousTokens !== null &&
      previousTokens <= COMPACT_THRESHOLD_TOKENS;

    previousTokens = currentTokens;

    if (!crossedThreshold || currentTokens <= COMPACT_THRESHOLD_TOKENS) {
      return;
    }

    triggerCompaction(ctx);
  });
}
```

The intent is simple: settings give you Pi's default threshold; an extension can define a project-specific threshold or trigger point.

## 13. Reacting After Compaction

Use `session_compact` when you want to observe the saved result:

```typescript
pi.on("session_compact", async (event, ctx) => {
  // event.compactionEntry - the saved compaction entry
  // event.fromExtension - whether an extension supplied it

  ctx.ui.notify(
    `Compaction saved. fromExtension=${event.fromExtension}`,
    "info",
  );
});
```

This hook is good for logging, metrics, or extension state updates. It is too late to change the summary; use `session_before_compact` for that.

## 14. Branch Summary Extensions

The branch summary hook is `session_before_tree`:

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;
});
```

The preparation object includes:

```typescript
interface TreePreparation {
  targetId: string;
  oldLeafId: string | null;
  commonAncestorId: string | null;
  entriesToSummarize: SessionEntry[];
  userWantsSummary: boolean;
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
}
```

You can cancel navigation:

```typescript
return { cancel: true };
```

You can provide or modify summarization instructions:

```typescript
return {
  customInstructions: "Summarize only implementation decisions and modified files.",
  replaceInstructions: false,
  label: "pre-refactor-branch",
};
```

You can provide a custom branch summary:

```typescript
if (event.preparation.userWantsSummary) {
  return {
    summary: {
      summary: "Custom branch summary...",
      details: {
        custom: true,
      },
    },
  };
}
```

The hook always fires before tree navigation. Your custom summary is only relevant when `userWantsSummary` is true.

## 15. RPC and JSON Mode Touchpoints

In RPC mode, compaction can be triggered through the `compact` command:

```json
{"type": "compact"}
```

or with instructions:

```json
{"type": "compact", "customInstructions": "Focus on code changes"}
```

RPC also exposes a way to enable or disable automatic compaction:

```json
{"type": "set_auto_compaction", "enabled": true}
```

JSON/RPC event streams include compaction lifecycle events:

```json
{"type": "compaction_start", "reason": "manual"}
```

```json
{
  "type": "compaction_end",
  "reason": "manual",
  "result": { "summary": "..." },
  "aborted": false,
  "willRetry": false
}
```

The reason can be `manual`, `threshold`, or `overflow`. If compaction happens because the context overflowed and succeeds, Pi may retry the original prompt automatically.

## 16. Choosing the Right Lever

The easiest mistake is to reach for an extension too early. Most compaction needs are solved with settings or manual instructions.

| Need | Best lever |
|---|---|
| Turn auto-compaction off. | `compaction.enabled: false` |
| Keep more recent conversation verbatim. | Increase `compaction.keepRecentTokens`. |
| Leave more room for model output. | Increase `compaction.reserveTokens`. |
| Focus one compaction on handoff details. | `/compact <instructions>` |
| Trigger compaction from a custom command. | `ctx.compact({ customInstructions })` |
| Inspect or approve every compaction. | `session_before_compact` observer/cancel hook. |
| Replace the summary format or model. | `session_before_compact` returning `compaction`. |
| React after compaction is saved. | `session_compact`. |
| Influence `/tree` branch summaries. | `session_before_tree`. |

The mental model is:

- **Settings decide when default compaction runs.**
- **Manual instructions influence one default compaction.**
- **Extensions can trigger, cancel, observe, or replace compaction.**
- **Only a custom extension truly owns the compaction prompt.**

## 17. Common Misunderstandings

### "If I disable auto-compaction, I can no longer compact."

No. Disabling auto-compaction prevents threshold-triggered compaction. Manual `/compact` still works.

### "Settings can change the summary format."

No. Settings control thresholds and retention. To change the summary format, use an extension.

### "Compaction deletes my history."

No. The full session history remains in the JSONL file. Compaction changes what is sent to the LLM as active context.

### "Custom instructions replace the compaction prompt."

No. They guide the default compaction. To replace the prompt, intercept `session_before_compact`, call a model yourself, and return a `compaction` result.

### "Branch summaries and compaction are the same thing."

They use similar summary formats, but they have different triggers and purposes. Compaction manages context size; branch summaries preserve context during tree navigation.

## 18. Practical Recipes

### 18.1 Handoff-Focused Manual Compaction

```text
/compact Write a continuation handoff. Preserve exact files changed, commands run, failures, decisions, validation status, and next steps.
```

Use this before handing a session to another agent.

### 18.2 Project Settings for Long Coding Sessions

`.pi/settings.json`:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 24576,
    "keepRecentTokens": 40000
  }
}
```

This keeps more recent work while reserving enough room for substantial responses.

### 18.3 Approval Gate Before Compaction

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    const ok = await ctx.ui.confirm(
      "Compact context?",
      `About to compact ${event.preparation.tokensBefore.toLocaleString()} tokens.`,
    );
    if (!ok) return { cancel: true };
  });
}
```

### 18.4 House-Style Summary Command

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerCommand("handoff-compact", {
    description: "Compact with handoff-focused instructions",
    handler: async (_args, ctx) => {
      ctx.compact({
        customInstructions: [
          "Write a continuation handoff.",
          "Preserve exact files changed.",
          "Preserve commands run and exact errors.",
          "Preserve open risks and next actions.",
        ].join("\n"),
      });
    },
  });
}
```

## 19. Source References

The research for this document came from the installed Pi documentation and TypeScript declarations:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/settings.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/rpc.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/custom-compaction.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/trigger-compact.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/compaction/compaction.d.ts`

## 20. Key Points

- Compaction preserves the session file but replaces older active context with a structured summary.
- The defaults are `reserveTokens: 16384` and `keepRecentTokens: 20000`.
- `/compact <instructions>` is the simplest way to influence one compaction without writing code.
- Settings cannot replace the built-in summary prompt.
- `session_before_compact` is the extension hook for observing, cancelling, or replacing compaction.
- `ctx.compact()` is the extension API for triggering compaction.
- `session_compact` runs after a compaction entry is saved.
- `session_before_tree` is the branch-summary customization hook, not the main compaction hook.
