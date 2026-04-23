---
ticket: pi-ext-session-summary
title: "API Cheat Sheet: Session Summary Extension"
doc-type: reference
topics:
  - pi
  - extensions
  - api-reference
created: 2026-04-23
author: manuel
related_files: []
---

# API Cheat Sheet: Session Summary Extension

## Events Used by This Extension

| Event | Handler Type | What We Do |
|-------|-------------|------------|
| `session_start` | `ExtensionHandler<SessionStartEvent>` | Reset summary statistics |
| `input` | `ExtensionHandler<InputEvent, InputEventResult>` | Append reminder to user prompts |
| `before_agent_start` | `ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>` | Append instruction to system prompt |
| `turn_end` | `ExtensionHandler<TurnEndEvent>` | Parse summary, display widget or warning |
| `agent_end` | `ExtensionHandler<AgentEndEvent>` | Clear widget safety cleanup |

## Input Event

```typescript
interface InputEvent {
  type: "input";
  prompt: string;
  images: ImageContent[];
  source: "user" | "extension" | "api";
}

interface InputEventResult {
  prompt?: string;
  images?: ImageContent[];
  handled?: boolean;
}
```

Always check `event.source === "user"` before modifying.

## BeforeAgentStart Event

```typescript
interface BeforeAgentStartEvent {
  prompt: string;
  images: ImageContent[];
  systemPrompt: string;
  systemPromptOptions: BuildSystemPromptOptions;
}

interface BeforeAgentStartEventResult {
  message?: CustomMessage;
  systemPrompt?: string;
}
```

Return `systemPrompt` to replace the system prompt for this turn.

## TurnEnd Event

```typescript
interface TurnEndEvent {
  type: "turn_end";
  turnIndex: number;
  message: AssistantMessage;
  toolResults: AgentToolResult[];
}
```

The `message` is the fully assembled assistant message. Parse `message.content` for `TextContent` blocks.

## TextContent Block

```typescript
interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}
```

Join all text blocks to get the full message text:

```typescript
const fullText = message.content
  .filter((block): block is { type: "text"; text: string } => block.type === "text")
  .map((block) => block.text)
  .join("");
```

## Summary Detection Regex

```typescript
// Find last summary block
const allMatches = [...fullText.matchAll(/<summary>([\s\S]*?)<\/summary>/g)];
const lastMatch = allMatches.length > 0 ? allMatches[allMatches.length - 1] : null;
```

## Widget API

```typescript
// Show summary widget
ctx.ui.setWidget("session-summary", ["line1", "line2"], { placement: "aboveEditor" });

// Show warning widget
ctx.ui.setWidget("session-summary", ["⚠️ No summary detected"], { placement: "aboveEditor" });

// Clear widget
ctx.ui.setWidget("session-summary", undefined);
```

## Command Registration

```typescript
pi.registerCommand("summary", {
  description: "Show the last detected summary",
  handler: async (args, ctx) => {
    ctx.ui.notify("Summary content here", "info");
  },
});
```
