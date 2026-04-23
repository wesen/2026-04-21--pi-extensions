---
ticket: pi-ext-session-summary
title: "Implementation Guide: Session Summary Block Extension"
doc-type: design
topics:
  - pi
  - extensions
  - typescript
  - implementation
  - system-prompt
created: 2026-04-23
author: manuel
related_files:
  - "~/.pi/agent/extensions/session-summary.ts:The extension file we create"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/pirate.ts:Reference for system prompt modification"
---

# Implementation Guide: Session Summary Block Extension

## 1. Prerequisites

Before writing code:

- **Pi installed** and runnable (`pi --version` works)
- **Basic TypeScript knowledge**
- **Read the Analysis document** (`design/analysis.md`) in this ticket

## 2. File Layout

Single-file extension:

```
~/.pi/agent/extensions/
└── session-summary.ts
```

## 3. The System Prompt Instruction

This is the text we append to the system prompt. It tells the model what to produce and how to format it.

```typescript
const SYSTEM_PROMPT_INSTRUCTION = `
At the end of every turn, before you finish responding, you MUST output a
<summary>...</summary> block that recaps:

1. What work you did THIS TURN (files read, edited, written, commands run)
2. What work has been done in the ENTIRE SESSION so far
3. Any ISSUES or BLOCKERS you encountered
4. What the NEXT STEPS should be

The summary must be the LAST thing in your response, after all tool calls
and text output. It must always be present, even if brief.

Example:
<summary>
This turn: read auth.ts, identified the login bug in the validateToken function.
Session so far: read auth.ts, read user.ts, identified login bug.
Issues: the validateToken function uses a deprecated API.
Next steps: refactor validateToken to use the new API, then test.
</summary>
`;
```

## 4. The User Prompt Reminder

This is the text we append to every user prompt. It acts as a near-term memory cue.

```typescript
const USER_PROMPT_REMINDER = "\n\nDon't forget to add the <summary>...</summary> block at the end of your response.";
```

## 5. Minimal Working Extension

Here is the smallest extension that implements the full feature:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const WIDGET_KEY = "session-summary";

const SYSTEM_PROMPT_INSTRUCTION = `
At the end of every turn, before you finish responding, you MUST output a
<summary>...</summary> block that recaps:

1. What work you did THIS TURN (files read, edited, written, commands run)
2. What work has been done in the ENTIRE SESSION so far
3. Any ISSUES or BLOCKERS you encountered
4. What the NEXT STEPS should be

The summary must be the LAST thing in your response, after all tool calls
and text output. It must always be present, even if brief.

Example:
<summary>
This turn: read auth.ts, identified the login bug in the validateToken function.
Session so far: read auth.ts, read user.ts, identified login bug.
Issues: the validateToken function uses a deprecated API.
Next steps: refactor validateToken to use the new API, then test.
</summary>
`;

const USER_PROMPT_REMINDER = "\n\nDon't forget to add the <summary>...</summary> block at the end of your response.";

export default function (pi: ExtensionAPI) {
  // 1. Modify system prompt before each turn
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + SYSTEM_PROMPT_INSTRUCTION,
    };
  });

  // 2. Append reminder to every user prompt
  pi.on("input", async (event) => {
    if (event.source !== "user") return; // Don't modify extension/API inputs
    if (event.prompt.includes(USER_PROMPT_REMINDER.trim())) return; // Avoid duplication

    return {
      prompt: event.prompt + USER_PROMPT_REMINDER,
    };
  });

  // 3. Parse summary at turn end and display widget
  pi.on("turn_end", async (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;

    // Join all text content blocks
    const fullText = message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Search for <summary>...</summary>
    const match = fullText.match(/<summary>([\s\S]*?)<\/summary>/);

    if (match && match[1].trim()) {
      const summary = match[1].trim();
      const lines = [
        `📋 Turn ${event.turnIndex + 1} Summary`,
        "",
        ...summary.split("\n").slice(0, 10), // Show first 10 lines
      ];
      ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" });
    } else {
      ctx.ui.setWidget(WIDGET_KEY, [
        `⚠️ Turn ${event.turnIndex + 1}: No summary detected`,
        "",
        "The model did not produce a <summary>...</summary> block.",
      ], { placement: "aboveEditor" });
    }
  });

  // 4. Safety cleanup
  pi.on("agent_end", async (_event, ctx) => {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });
}
```

### 5.1 Line-by-Line Explanation

**Lines 1-22**: We define constants for the system prompt instruction and user prompt reminder. These are appended to every turn.

**Line 24**: The extension factory receives `pi: ExtensionAPI`.

**Lines 26-30**: We subscribe to `before_agent_start`. This fires before the agent loop begins. We return a modified `systemPrompt` with our instruction appended. The `\n\n` ensures separation from existing prompt text.

**Lines 33-40**: We subscribe to `input`. This fires when the user sends a prompt. We check `event.source === "user"` to avoid modifying extension-generated inputs. We also check for duplication to avoid appending the reminder multiple times if the user pastes it manually. We return a modified `prompt`.

**Lines 43-69**: We subscribe to `turn_end`. This fires when the model finishes a turn. We:
1. Verify the message role is "assistant"
2. Extract all `TextContent` blocks and join them
3. Run a regex to find `<summary>...</summary>`
4. If found and non-empty: display a widget with the summary
5. If not found: display a warning widget

**Lines 72-74**: We subscribe to `agent_end` to clear the widget as a safety net.

## 6. Enhanced Version: Multiple Summaries, Truncation, and Commands

The minimal version works, but it lacks features that make it usable in practice:

- **Multiple summaries**: If the model produces multiple `<summary>` blocks, which one do we use?
- **Truncation**: Very long summaries overflow the widget
- **Commands**: A `/summary` command to manually show the last summary
- **Session tracking**: Track whether summaries are improving over time

Here is the production-quality version:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const WIDGET_KEY = "session-summary";
const MAX_WIDGET_LINES = 15;

const SYSTEM_PROMPT_INSTRUCTION = `
At the end of every turn, before you finish responding, you MUST output a
<summary>...</summary> block that recaps:

1. What work you did THIS TURN (files read, edited, written, commands run)
2. What work has been done in the ENTIRE SESSION so far
3. Any ISSUES or BLOCKERS you encountered
4. What the NEXT STEPS should be

The summary must be the LAST thing in your response, after all tool calls
and text output. It must always be present, even if brief.

Example:
<summary>
This turn: read auth.ts, identified the login bug in the validateToken function.
Session so far: read auth.ts, read user.ts, identified login bug.
Issues: the validateToken function uses a deprecated API.
Next steps: refactor validateToken to use the new API, then test.
</summary>
`;

const USER_PROMPT_REMINDER = "\n\nDon't forget to add the <summary>...</summary> block at the end of your response.";

interface SummaryState {
  lastSummary: string | null;
  lastTurnHadSummary: boolean;
  turnIndex: number;
  summaryCount: number;            // Total summaries across session
  missingCount: number;            // Total missing summaries across session
}

export default function (pi: ExtensionAPI) {
  const state: SummaryState = {
    lastSummary: null,
    lastTurnHadSummary: false,
    turnIndex: 0,
    summaryCount: 0,
    missingCount: 0,
  };

  // Reset state on session start
  pi.on("session_start", async () => {
    state.lastSummary = null;
    state.lastTurnHadSummary = false;
    state.turnIndex = 0;
    state.summaryCount = 0;
    state.missingCount = 0;
  });

  // 1. Modify system prompt
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + SYSTEM_PROMPT_INSTRUCTION,
    };
  });

  // 2. Append reminder to user prompts
  pi.on("input", async (event) => {
    if (event.source !== "user") return;
    if (event.prompt.includes(USER_PROMPT_REMINDER.trim())) return;

    return {
      prompt: event.prompt + USER_PROMPT_REMINDER,
    };
  });

  // 3. Parse summary at turn end
  pi.on("turn_end", async (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;

    state.turnIndex = event.turnIndex;

    // Join all text blocks
    const fullText = message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Find ALL summary matches, use the LAST one
    const allMatches = [...fullText.matchAll(/<summary>([\s\S]*?)<\/summary>/g)];
    const lastMatch = allMatches.length > 0 ? allMatches[allMatches.length - 1] : null;

    if (lastMatch && lastMatch[1].trim()) {
      const summary = lastMatch[1].trim();
      state.lastSummary = summary;
      state.lastTurnHadSummary = true;
      state.summaryCount++;

      const lines = summary.split("\n");
      const truncated = lines.length > MAX_WIDGET_LINES
        ? [...lines.slice(0, MAX_WIDGET_LINES), "", `... (${lines.length - MAX_WIDGET_LINES} more lines)`]
        : lines;

      ctx.ui.setWidget(WIDGET_KEY, [
        `📋 Turn ${event.turnIndex + 1} Summary`,
        "",
        ...truncated,
        "",
        `✅ ${state.summaryCount} summaries | ⚠️ ${state.missingCount} missing`,
      ], { placement: "aboveEditor" });
    } else {
      state.lastSummary = null;
      state.lastTurnHadSummary = false;
      state.missingCount++;

      ctx.ui.setWidget(WIDGET_KEY, [
        `⚠️ Turn ${event.turnIndex + 1}: No summary detected`,
        "",
        "The model did not produce a <summary>...</summary> block.",
        "",
        `✅ ${state.summaryCount} summaries | ⚠️ ${state.missingCount} missing`,
      ], { placement: "aboveEditor" });
    }
  });

  // 4. Safety cleanup
  pi.on("agent_end", async (_event, ctx) => {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });

  // 5. Manual /summary command
  pi.registerCommand("summary", {
    description: "Show the last detected summary (or a warning if none)",
    handler: async (_args, ctx) => {
      if (state.lastSummary) {
        ctx.ui.notify(`Last summary (Turn ${state.turnIndex + 1}):\n${state.lastSummary.slice(0, 200)}...`, "info");
      } else if (state.turnIndex === 0) {
        ctx.ui.notify("No turns have completed yet.", "warning");
      } else {
        ctx.ui.notify(`No summary was detected in the last turn (Turn ${state.turnIndex + 1}).`, "warning");
      }
    },
  });

  // 6. /summary-toggle command to disable/enable reminder
  let remindersEnabled = true;
  pi.registerCommand("summary-toggle", {
    description: "Toggle summary reminders on/off",
    handler: async (_args, ctx) => {
      remindersEnabled = !remindersEnabled;
      ctx.ui.notify(`Summary reminders ${remindersEnabled ? "enabled" : "disabled"}.`, "info");
    },
  });
}
```

### 6.1 Key Improvements Over the Minimal Version

- **Multiple summary detection**: Uses `matchAll` with the `g` flag to find all `<summary>` blocks, then takes the last one
- **Truncation**: Limits widget to 15 lines with a "... (N more lines)" indicator
- **Session statistics**: Tracks total summaries and missing summaries across the session
- **`/summary` command**: Lets the user recall the last summary at any time
- **`/summary-toggle` command**: Lets the user disable reminders when they become annoying
- **State reset on `session_start`**: Properly initializes state for new sessions
- **Duplication guard**: Checks if the prompt already contains the reminder before appending

### 6.2 The `matchAll` Pattern

The key line for multiple summary detection:

```typescript
const allMatches = [...fullText.matchAll(/<summary>([\s\S]*?)<\/summary>/g)];
const lastMatch = allMatches.length > 0 ? allMatches[allMatches.length - 1] : null;
```

Why `matchAll` instead of `match`?

- `match` with the `g` flag returns an array of full matches but **no capture groups**
- `matchAll` returns an iterator of `RegExpExecArray` objects, each containing capture groups
- We spread the iterator into an array with `[...]` and take the last element

## 7. Testing the Extension

### 7.1 Quick Test with `--extension`

```bash
pi -e ~/.pi/agent/extensions/session-summary.ts
```

Ask a question that requires work:

```
> Read the package.json and tell me what build tool this project uses.
> Show your work and include a summary.
```

### 7.2 Verify System Prompt Injection

To verify the system prompt is being modified, add temporary logging:

```typescript
pi.on("before_agent_start", async (event) => {
  console.log("[session-summary] Appending system prompt instruction");
  return {
    systemPrompt: event.systemPrompt + "\n\n" + SYSTEM_PROMPT_INSTRUCTION,
  };
});
```

### 7.3 Verify Prompt Injection

To verify the user prompt is being modified:

```typescript
pi.on("input", async (event) => {
  if (event.source !== "user") return;
  const modified = event.prompt + USER_PROMPT_REMINDER;
  console.log("[session-summary] Modified prompt:", modified.slice(-100));
  return { prompt: modified };
});
```

### 7.4 Verify Summary Detection

To trace summary detection:

```typescript
pi.on("turn_end", async (event) => {
  const fullText = event.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const hasSummary = fullText.includes("<summary>");
  console.log("[session-summary] Turn", event.turnIndex, "has summary:", hasSummary);
});
```

## 8. Extension Checklist

Before considering this extension complete:

- [ ] Extension file is in `~/.pi/agent/extensions/session-summary.ts`
- [ ] Pi loads the extension without errors
- [ ] System prompt is modified on every turn (verify with logging)
- [ ] User prompt has reminder appended (verify with logging)
- [ ] Model produces `<summary>` blocks when asked to do work
- [ ] Widget shows summary content when present
- [ ] Widget shows warning when summary is missing
- [ ] Widget is cleared on `agent_end`
- [ ] `/summary` command works
- [ ] `/summary-toggle` command works
- [ ] State resets properly on `session_start`
- [ ] No `console.log()` spam left in production code
- [ ] Duplication guard prevents double reminders

## 9. Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Modifying non-user inputs | Infinite loops or unexpected behavior | Check `event.source === "user"` |
| Double reminders | Prompt grows by 2x reminder text each turn | Check `event.prompt.includes(reminder)` |
| Missing summary detected | Warning widget always shows | Verify model produces `<summary>` tags; check regex |
| Widget never clears | Widget persists between turns | Add `agent_end` cleanup handler |
| System prompt too long | Context window fills up | The instruction is ~15 lines; monitor with `ctx.getContextUsage()` |
| Model ignores instruction | No summaries produced | Try stronger language ("MUST", "REQUIRED"); add user prompt reminder |

## 10. Future Enhancements

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| JSON parsing | Parse structured JSON inside `<summary>` and render as a table | Medium |
| Persistent statistics | Store summary stats in session file via `pi.appendEntry()` | Low |
| Summary history | `/summary-history` command to show all summaries | Medium |
| Auto-compact | Use summaries to drive custom compaction logic | High |
| Per-model tuning | Different instructions for different models | Low |
| Summary quality scoring | Heuristic: does the summary mention files/tools actually used? | High |
