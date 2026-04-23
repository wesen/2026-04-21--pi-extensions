---
ticket: pi-ext-thinking-hello
title: "Implementation Guide: Hello World Thinking Block Extension"
doc-type: design
topics:
  - pi
  - extensions
  - typescript
  - implementation
created: 2026-04-21
author: manuel
related_files:
  - "~/.pi/agent/extensions/hello-world-thinking.ts:The extension file we create"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/widget-placement.ts:Reference for widget placement"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/hidden-thinking-label.ts:Reference for thinking block UI"
---

# Implementation Guide: Hello World Thinking Block Extension

## 1. Prerequisites

Before writing code, ensure you have:

- **Pi installed** and runnable from your terminal (`pi --version` should work).
- **A model that emits thinking blocks** configured in Pi. Claude 3.7 Sonnet via Anthropic is recommended.
- **Basic TypeScript knowledge**. You do not need to compile anything; Pi uses [jiti](https://github.com/unjs/jiti) to run `.ts` files directly.
- **Read the Analysis document** (`design/analysis.md`) in this ticket. This guide assumes you understand message types, the event stream, and the extension lifecycle.

---

## 2. File Layout

For a single-file extension (the simplest style), we create one file:

```
~/.pi/agent/extensions/
└── hello-world-thinking.ts
```

No `package.json`, no build step, no `node_modules`. Just one TypeScript file.

If you later want to share this extension as a Pi package, you would add:

```
~/.pi/agent/extensions/hello-world-thinking/
├── manifest.json       # Package metadata
├── package.json        # If you need npm dependencies
└── src/
    └── index.ts        # Entry point
```

For this tutorial, we stick to the single-file style.

---

## 3. Minimal Working Extension

Here is the smallest extension that detects thinking blocks and displays "Hello World":

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const WIDGET_KEY = "hello-world-thinking";

export default function (pi: ExtensionAPI) {
  pi.on("message_update", async (event, ctx) => {
    const streamEvent = event.assistantMessageEvent;

    if (streamEvent.type === "thinking_start") {
      ctx.ui.setWidget(WIDGET_KEY, ["🌍 Hello World"], { placement: "aboveEditor" });
    }

    if (streamEvent.type === "thinking_end") {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  });
}
```

### 3.1 Line-by-Line Explanation

**Line 1**: We import `ExtensionAPI` as a type-only import. This ensures we get compile-time type checking without emitting runtime imports. Pi resolves `@mariozechner/pi-coding-agent` internally.

**Line 3**: A constant widget key. Widgets are identified by string keys. Using a constant prevents typos and makes cleanup easier.

**Line 5**: The default export is a factory function receiving `pi: ExtensionAPI`.

**Line 6**: We subscribe to the `message_update` event. This fires for every token streamed by the LLM.

**Line 7**: We extract `assistantMessageEvent`, which contains the actual stream event type (`text_delta`, `thinking_start`, etc.).

**Lines 9–11**: When the event type is `thinking_start`, we call `ctx.ui.setWidget()` with:
- The widget key.
- An array of strings to display. Each string becomes a line.
- Options specifying `placement: "aboveEditor"` (the default, but explicit is better).

**Lines 13–15**: When the event type is `thinking_end`, we clear the widget by passing `undefined` as the content.

---

## 4. Enhanced Version: Notification + Widget + Turn Tracking

The minimal version works, but it is naive. It does not handle edge cases:

- **Multiple thinking blocks in one turn**: The widget flickers on/off.
- **Nested thinking**: Some providers emit thinking inside tool-call reasoning.
- **Error during thinking**: If the stream errors out, `thinking_end` never fires, and the widget persists.
- **No visibility into which turn**: You cannot tell if this is the first or fifth thinking block.

Here is a production-quality version:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const WIDGET_KEY = "hello-world-thinking";
const NOTIFICATION_TYPE: "info" | "warning" | "error" = "info";

interface ThinkingState {
  active: boolean;
  turnIndex: number;
  blockIndex: number;
  startTime: number;
}

export default function (pi: ExtensionAPI) {
  // Per-turn state
  let state: ThinkingState = {
    active: false,
    turnIndex: 0,
    blockIndex: 0,
    startTime: 0,
  };

  // Reset state at the start of each turn
  pi.on("turn_start", async (event) => {
    state = {
      active: false,
      turnIndex: event.turnIndex,
      blockIndex: 0,
      startTime: 0,
    };
  });

  // Main logic: intercept thinking blocks
  pi.on("message_update", async (event, ctx) => {
    const streamEvent = event.assistantMessageEvent;

    switch (streamEvent.type) {
      case "thinking_start": {
        state.active = true;
        state.blockIndex++;
        state.startTime = Date.now();

        const lines = [
          `🌍 Hello World (Turn ${state.turnIndex + 1}, Block ${state.blockIndex})`,
        ];

        ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" });
        ctx.ui.notify(`Thinking block ${state.blockIndex} started`, NOTIFICATION_TYPE);
        break;
      }

      case "thinking_delta": {
        // Optional: update widget with elapsed time or token count
        if (state.active) {
          const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
          ctx.ui.setWidget(WIDGET_KEY, [
            `🌍 Hello World (Turn ${state.turnIndex + 1}, Block ${state.blockIndex})`,
            `   ⏱️ ${elapsed}s elapsed`,
          ], { placement: "aboveEditor" });
        }
        break;
      }

      case "thinking_end": {
        if (state.active) {
          const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
          ctx.ui.notify(`Thinking block ${state.blockIndex} finished (${elapsed}s)`, NOTIFICATION_TYPE);
        }
        state.active = false;
        ctx.ui.setWidget(WIDGET_KEY, undefined);
        break;
      }

      case "error": {
        // Clean up on stream error
        state.active = false;
        ctx.ui.setWidget(WIDGET_KEY, undefined);
        break;
      }
    }
  });

  // Safety: clear widget when a message ends (catches missing thinking_end)
  pi.on("message_end", async (_event, ctx) => {
    if (state.active) {
      state.active = false;
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  });

  // Safety: clear widget when the agent ends (catches all edge cases)
  pi.on("agent_end", async (_event, ctx) => {
    state.active = false;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });

  // Optional: register a command to toggle the extension
  pi.registerCommand("hello-thinking-toggle", {
    description: "Toggle Hello World thinking block display",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Hello World thinking extension is always active.", "info");
    },
  });
}
```

### 4.1 State Management Deep Dive

The `ThinkingState` interface tracks:
- **`active`**: Is a thinking block currently open? Prevents duplicate widgets if events fire unexpectedly.
- **`turnIndex`**: Which turn are we on? Useful for debugging multi-turn interactions.
- **`blockIndex`**: How many thinking blocks have we seen in this turn? Some models emit multiple thinking blocks.
- **`startTime`**: When did the current thinking block start? Lets us show elapsed time.

Why store state in a closure variable rather than `pi.appendEntry()`?

- `appendEntry()` persists data to the session file. That is overkill for transient UI state.
- Closure variables are recreated when the extension loads (on startup or `/reload`). They are lost on session switch, which is correct for UI state.
- If you needed state to survive across `/reload`, you would reconstruct it from the session manager in `session_start`.

### 4.2 Safety Cleanups

We register three safety handlers:

1. **`message_end`**: If `thinking_end` is somehow skipped (e.g., provider quirk), clear the widget when the message finishes.
2. **`agent_end`**: If the agent loop terminates abruptly (error, abort, user cancellation), clear the widget.
3. **`message_update` → `error`**: If the stream errors, clear the widget immediately.

This is defensive programming. Pi handles many LLM providers, and not all of them emit perfectly balanced `start`/`end` events.

---

## 5. Advanced Topic: Inline Content Injection (Experimental)

As discussed in the analysis document, you can attempt to mutate the message content directly. **This is undocumented and may break in future Pi versions.** Use it only for experimentation.

### 5.1 The Theory

When `message_update` fires, `event.message` is the live `AssistantMessage` being assembled. If we insert a `TextContent` block into `event.message.content` before the thinking block, the TUI might render it.

### 5.2 The Code

```typescript
pi.on("message_update", async (event, ctx) => {
  const streamEvent = event.assistantMessageEvent;

  if (streamEvent.type === "thinking_start") {
    const message = event.message;
    if (message.role !== "assistant") return;

    const contentIndex = streamEvent.contentIndex;

    // Insert a text block immediately before the thinking block
    message.content.splice(contentIndex, 0, {
      type: "text",
      text: "🌍 Hello World\n\n",
    });

    // Notify the TUI that the message changed (undocumented)
    // This may or may not force a re-render of already-displayed content.
  }
});
```

### 5.3 Why This Is Dangerous

1. **Race conditions**: The TUI may have already rendered content up to index `contentIndex - 1`. Inserting before that index does not retroactively insert text into the terminal buffer.
2. **Token count desync**: Pi's context usage calculator runs after message assembly. If you insert content that was not emitted by the LLM, token counts become inaccurate.
3. **Session corruption**: The mutated message is written to the session JSONL file. On session resume, the injected text appears as if the LLM wrote it, which is misleading.
4. **Future breakage**: Pi's internal message construction may change. Relying on mutable references is fragile.

**Verdict**: Do not use this in production. Use the widget approach.

---

## 6. Testing the Extension

### 6.1 Quick Test with `--extension`

Copy the enhanced extension to your extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
cp hello-world-thinking.ts ~/.pi/agent/extensions/
```

Run Pi with the extension loaded:

```bash
pi -e ~/.pi/agent/extensions/hello-world-thinking.ts
```

Ask the model a question that requires reasoning:

```
> Solve this step by step: if a train leaves Chicago at 60mph and another leaves
> New York at 80mph, when do they meet? Show your reasoning.
```

If your model supports thinking blocks, you should see:
- A widget appears above the editor saying "🌍 Hello World (Turn 1, Block 1)"
- A notification toast saying "Thinking block 1 started"
- The widget updates with elapsed time as thinking continues
- The widget disappears when thinking ends

### 6.2 Auto-Discovery Test

For daily use, extensions should be auto-discovered. Ensure the file is in the right place:

```bash
ls ~/.pi/agent/extensions/hello-world-thinking.ts
```

Start Pi normally:

```bash
pi
```

The extension loads automatically. Use `/reload` to hot-reload it after edits.

### 6.3 Debugging Tips

**Extension not loading?**
- Check the file path. Global extensions must be in `~/.pi/agent/extensions/*.ts`.
- Look for syntax errors. jiti will throw if your TypeScript is invalid.
- Check Pi's startup output. Extension load errors are printed to the terminal.

**Widget not appearing?**
- Verify your model emits thinking blocks. Not all models do.
- Add `console.log()` inside the `message_update` handler to see what events fire:
  ```typescript
  pi.on("message_update", async (event) => {
    console.log("message_update:", event.assistantMessageEvent.type);
  });
  ```
- If you only see `text_delta` and `text_end`, your model is not emitting thinking blocks.

**Widget persisting after thinking ends?**
- Add the safety handlers (`message_end`, `agent_end`) from the enhanced version.
- Some providers emit `thinking_start` without a matching `thinking_end` on errors.

### 6.4 Using Console Logging for Development

Pi extensions can use `console.log()`, `console.warn()`, and `console.error()`. Output goes to the terminal where Pi is running. This is the primary debugging tool.

```typescript
pi.on("message_update", async (event) => {
  const e = event.assistantMessageEvent;
  if (e.type.startsWith("thinking")) {
    console.log(`[hello-world-thinking] ${e.type} idx=${e.contentIndex}`);
  }
});
```

---

## 7. Extension Locations Reference

| Location | Scope | Hot Reload? |
|----------|-------|-------------|
| `~/.pi/agent/extensions/*.ts` | Global (all projects) | Yes, via `/reload` |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdirectory) | Yes, via `/reload` |
| `.pi/extensions/*.ts` | Project-local | Yes, via `/reload` |
| `.pi/extensions/*/index.ts` | Project-local (subdirectory) | Yes, via `/reload` |
| `pi -e ./path.ts` | One-shot (current run only) | No |

For this extension, `~/.pi/agent/extensions/hello-world-thinking.ts` is the recommended location.

---

## 8. From Single File to Shareable Package

If you want to distribute this extension, follow the package format:

### 8.1 Create a Directory

```bash
mkdir -p ~/.pi/agent/extensions/hello-world-thinking
cd ~/.pi/agent/extensions/hello-world-thinking
```

### 8.2 Write `manifest.json`

```json
{
  "name": "hello-world-thinking",
  "version": "1.0.0",
  "description": "Displays 'Hello World' before each thinking block",
  "entry": "index.ts",
  "author": "Your Name",
  "license": "MIT"
}
```

### 8.3 Write `index.ts`

Move the enhanced extension code into `index.ts`.

### 8.4 Install as a Package

```bash
pi install path:~/.pi/agent/extensions/hello-world-thinking
```

Or publish to GitHub and install via:

```bash
pi install git:github.com/yourusername/pi-hello-world-thinking
```

See [`packages.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md) for full packaging documentation.

---

## 9. Complete Reference Implementation

Here is the final, copy-paste-ready implementation:

```typescript
/**
 * Hello World Thinking Block Extension
 *
 * Displays "Hello World" in a widget whenever the LLM emits a thinking block.
 *
 * Installation:
 *   1. Copy this file to ~/.pi/agent/extensions/hello-world-thinking.ts
 *   2. Start pi (auto-discovery) or run: pi -e ./hello-world-thinking.ts
 *   3. Ask a question that requires reasoning
 *
 * Requires a model that emits thinking blocks (e.g., Claude 3.7 Sonnet).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const WIDGET_KEY = "hello-world-thinking";

export default function (pi: ExtensionAPI) {
  let active = false;
  let blockCount = 0;
  let startTime = 0;

  pi.on("turn_start", async (event) => {
    active = false;
    blockCount = 0;
    startTime = 0;
  });

  pi.on("message_update", async (event, ctx) => {
    const e = event.assistantMessageEvent;

    if (e.type === "thinking_start") {
      active = true;
      blockCount++;
      startTime = Date.now();
      ctx.ui.setWidget(WIDGET_KEY, ["🌍 Hello World"], { placement: "aboveEditor" });
    }

    if (e.type === "thinking_delta" && active) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      ctx.ui.setWidget(WIDGET_KEY, ["🌍 Hello World", `   ⏱️ ${elapsed}s`], { placement: "aboveEditor" });
    }

    if (e.type === "thinking_end" && active) {
      active = false;
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }

    if (e.type === "error") {
      active = false;
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  });

  pi.on("message_end", async (_event, ctx) => {
    if (active) {
      active = false;
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    active = false;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });
}
```

---

## 10. Common Pitfalls and How to Avoid Them

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| Using a model without thinking | Widget never appears | Switch to Claude 3.7 Sonnet, o1, or DeepSeek-R1 |
| Forgetting to clear widget | Widget persists forever | Add `message_end`, `agent_end`, and `error` handlers |
| Type-only import vs. value import | Runtime error about missing module | Use `import type { ... }` for Pi packages |
| Wrong file location | Extension not loaded | Verify path: `~/.pi/agent/extensions/*.ts` |
| Mutating `event.message.content` | Session corruption, desynced tokens | Use UI methods (widget, notify) instead |
| Blocking the event handler | Pi freezes | Always use `async` handlers and avoid heavy sync work |

---

## 11. Extension Checklist

Before considering this extension complete, verify:

- [ ] Extension file is in `~/.pi/agent/extensions/hello-world-thinking.ts`
- [ ] Pi loads the extension without errors on startup
- [ ] Widget appears when thinking starts
- [ ] Widget disappears when thinking ends
- [ ] Widget disappears on stream error
- [ ] Widget disappears when agent ends
- [ ] Extension works with `/reload` after edits
- [ ] Tested with at least one thinking-capable model
- [ ] No `console.log()` spam left in production code
- [ ] Code is formatted and commented
