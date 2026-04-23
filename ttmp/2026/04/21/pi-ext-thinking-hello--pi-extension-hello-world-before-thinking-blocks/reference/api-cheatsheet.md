---
ticket: pi-ext-thinking-hello
title: "API Cheat Sheet: Thinking Block Extension"
doc-type: reference
topics:
  - pi
  - extensions
  - api-reference
created: 2026-04-21
author: manuel
related_files: []
---

# API Cheat Sheet: Thinking Block Extension

## Extension Factory

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subscribe to events, register tools/commands
}
```

## Event Subscription

```typescript
pi.on("event_name", async (event, ctx) => {
  // Handle event
});
```

### Events Relevant to Thinking Blocks

| Event | Handler Type | Key Fields |
|-------|--------------|------------|
| `message_update` | `ExtensionHandler<MessageUpdateEvent>` | `event.message`, `event.assistantMessageEvent` |
| `message_start` | `ExtensionHandler<MessageStartEvent>` | `event.message` |
| `message_end` | `ExtensionHandler<MessageEndEvent>` | `event.message` |
| `turn_start` | `ExtensionHandler<TurnStartEvent>` | `event.turnIndex`, `event.timestamp` |
| `turn_end` | `ExtensionHandler<TurnEndEvent>` | `event.turnIndex`, `event.message`, `event.toolResults` |
| `agent_start` | `ExtensionHandler<AgentStartEvent>` | — |
| `agent_end` | `ExtensionHandler<AgentEndEvent>` | `event.messages` |

## AssistantMessageEvent Types

```typescript
type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "done"; reason: "stop" | "length" | "toolUse"; message: AssistantMessage }
  | { type: "error"; reason: "aborted" | "error"; error: AssistantMessage };
```

## UI Context Methods

```typescript
ctx.ui.notify(message: string, type?: "info" | "warning" | "error"): void;

ctx.ui.setWidget(
  key: string,
  content: string[] | undefined,
  options?: { placement?: "aboveEditor" | "belowEditor" }
): void;

ctx.ui.setStatus(key: string, text: string | undefined): void;
ctx.ui.setWorkingMessage(message?: string): void;
ctx.ui.setHiddenThinkingLabel(label?: string): void;
ctx.ui.setWorkingIndicator(options?: { frames?: string[]; intervalMs?: number }): void;
```

## Content Block Types

```typescript
interface TextContent {
  type: "text";
  text: string;
}

interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
}
```

## ExtensionContext

```typescript
interface ExtensionContext {
  ui: ExtensionUIContext;
  hasUI: boolean;
  cwd: string;
  sessionManager: ReadonlySessionManager;
  model: Model<any> | undefined;
  signal: AbortSignal | undefined;
  abort(): void;
  isIdle(): boolean;
  getContextUsage(): ContextUsage | undefined;
  getSystemPrompt(): string;
}
```
