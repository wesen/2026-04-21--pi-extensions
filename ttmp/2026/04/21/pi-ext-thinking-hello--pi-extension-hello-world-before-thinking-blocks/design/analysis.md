---
ticket: pi-ext-thinking-hello
title: "System Analysis: Pi, Extensions, and Thinking Blocks"
doc-type: analysis
topics:
  - pi
  - extensions
  - typescript
  - tui
  - agent-system
created: 2026-04-21
author: manuel
related_files:
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md:Primary extension documentation"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session.md:Message and session type definitions"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/types.ts:AI message event stream types"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts:ExtensionAPI type definitions"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/hidden-thinking-label.ts:Example thinking-block UI customization"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/message-renderer.ts:Example custom message rendering"
---

# System Analysis: Pi, Extensions, and Thinking Blocks

## 1. What Is Pi?

**Pi** (also called `pi-coding-agent`) is a minimal terminal-based coding harness created by Mario Zechner. It is not merely a chat interface; it is a full **agent runtime** that orchestrates large language models (LLMs) to perform software engineering tasks. Pi runs inside a terminal, maintains persistent sessions, manages conversation trees (branching and forking), and exposes a rich extension API that lets users customize nearly every aspect of its behavior.

### 1.1 Core Concepts for the New Intern

If you have never worked with Pi before, here are the mental models you need:

- **Session**: A single conversation thread stored as a JSONL file on disk. Sessions are trees, not linear logs. You can branch, fork, and navigate between branches interactively.
- **Turn**: One complete request/response cycle. The user sends a prompt; the LLM responds, possibly calling tools; the results are collected; the turn ends.
- **Tool**: A typed function the LLM can invoke. Built-in tools include `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`. Extensions can register additional tools.
- **Message**: A structured unit of communication within a session. Messages have a `role` (`user`, `assistant`, `toolResult`, `bashExecution`, `custom`, etc.) and typed `content` blocks.
- **Content Block**: A message is not just a string. It is an array of blocks, each with a `type`. Types include `text`, `image`, `thinking`, and `toolCall`.
- **Thinking Block**: A special content block that carries the LLM's internal reasoning. Models like Claude (Anthropic), DeepSeek, and OpenAI's reasoning models emit these. In Pi, thinking blocks are rendered as collapsible sections in the terminal UI.
- **Extension**: A TypeScript module that Pi loads at startup. Extensions subscribe to lifecycle events, register tools, add commands, and manipulate the UI.

### 1.2 Why Extensions Matter

Pi's philosophy is **minimal core, maximal extensibility**. The core agent handles LLM communication, tool execution, and session persistence. Everything else—permission gates, custom compactors, Git integration, thinking-block decorators—is implemented as an extension. This means:

- You do not need to fork Pi to change its behavior.
- You write TypeScript (no compilation step; Pi uses [jiti](https://github.com/unjs/jiti) to run TS directly).
- Your extension lives in `~/.pi/agent/extensions/` and is hot-reloadable with the `/reload` command.

---

## 2. The Message System: Where Thinking Blocks Live

To write an extension that intercepts thinking blocks, you must understand Pi's message architecture. This section is dense but essential. Read it twice.

### 2.1 Messages Are Typed, Not Stringly-Typed

In many chat applications, a message is just a string. In Pi, a message is a **strongly typed object**. The type hierarchy lives across three packages:

| Package | File | What It Defines |
|---------|------|-----------------|
| `@mariozechner/pi-ai` | `packages/ai/src/types.ts` | Base message types: `UserMessage`, `AssistantMessage`, `ToolResultMessage`, content blocks |
| `@mariozechner/pi-agent-core` | `packages/agent/src/types.ts` | The `AgentMessage` union type |
| `@mariozechner/pi-coding-agent` | `packages/coding-agent/src/core/messages.ts` | Extended types: `BashExecutionMessage`, `CustomMessage`, etc. |

For extension authors, the most important type is **`AssistantMessage`**:

```typescript
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}
```

Notice the `content` field: it is an **array** of blocks. A single assistant response can contain:
- A `text` block ("I'll help you with that.")
- A `thinking` block (the model's internal reasoning)
- A `toolCall` block (a request to execute a tool)
- More `text` blocks after the tool returns

### 2.2 Content Block Types

```typescript
interface TextContent {
  type: "text";
  text: string;
  textSignature?: string; // Provider-specific metadata
}

interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string; // For multi-turn continuity with OpenAI/Anthropic
  redacted?: boolean;         // True if safety filters redacted the content
}

interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
}
```

The **`ThinkingContent`** block is what we care about. When an LLM like Claude 3.7 Sonnet or DeepSeek-R1 emits reasoning tokens, Pi's provider layer converts those tokens into `ThinkingContent` blocks and inserts them into the `AssistantMessage.content` array.

### 2.3 The Session File Format

Sessions are stored as **JSONL** (JSON Lines) files. Each line is one entry. Messages are stored as `SessionMessageEntry` objects:

```json
{"type":"message","id":"a1b2c3d4","parentId":"prev1234","timestamp":"2024-12-03T14:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"provider":"anthropic","model":"claude-sonnet-4-5","usage":{...},"stopReason":"stop"}}
```

When a thinking block is present, the `content` array looks like this in the session file:

```json
[
  {"type": "text", "text": "Let me analyze this step by step."},
  {"type": "thinking", "thinking": "1. The user wants to refactor the auth module...\n2. I should first read the current implementation..."},
  {"type": "toolCall", "id": "call_abc", "name": "read", "arguments": {"path": "/src/auth.ts"}}
]
```

This is the **on-disk representation**. But our extension does not operate on the session file directly. It operates on the **live event stream** as the message is being constructed.

---

## 3. The Live Event Stream: How Pi Constructs Messages

When Pi sends a prompt to an LLM, the response does not arrive all at once. It arrives as a **stream of tokens**. Pi's provider layer translates this provider-specific streaming format into a provider-agnostic event stream called `AssistantMessageEventStream`.

### 3.1 The AssistantMessageEvent Protocol

Every token (or group of tokens) that arrives from the LLM is wrapped in an `AssistantMessageEvent`. These events form a strict protocol:

```
start
├── text_start (contentIndex: 0)
│   ├── text_delta (delta: "Let me ")
│   ├── text_delta (delta: "analyze ")
│   └── text_end (content: "Let me analyze this.")
├── thinking_start (contentIndex: 1)
│   ├── thinking_delta (delta: "1. The user...")
│   ├── thinking_delta (delta: "\n2. I should...")
│   └── thinking_end (content: "1. The user...\n2. I should...")
├── toolcall_start (contentIndex: 2)
│   ├── toolcall_delta (delta: "{\\n  \\")
│   └── toolcall_end (toolCall: { id: "...", name: "read", arguments: {...} })
└── done (reason: "toolUse", message: AssistantMessage)
```

The full type definition from `packages/ai/src/types.ts`:

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

Key observations:
- **`thinking_start`** fires exactly once per thinking block, before any thinking tokens arrive.
- **`thinking_delta`** fires repeatedly as reasoning tokens stream in.
- **`thinking_end`** fires once when the thinking block is complete.
- **`contentIndex`** tells you the position of this block within `AssistantMessage.content`.
- **`partial`** is the in-progress `AssistantMessage` being built.

### 3.2 From Provider Stream to Pi Events

Different LLM providers encode thinking differently:

- **Anthropic (Claude)**: Uses `thinking` content blocks in the Messages API. Pi extracts these directly.
- **OpenAI (o1, o3-mini)**: Uses `reasoning_content` or `<thinking>` tags in some APIs. Pi normalizes these into `ThinkingContent` blocks.
- **DeepSeek**: Emits `<think>...</think>` tags in the text stream. Pi's provider strips these tags and creates separate `ThinkingContent` blocks.
- **Google (Gemini)**: Has a `thought` field in some responses. Pi maps this to `ThinkingContent`.

This normalization is **crucial** for extension authors. You do not need to handle provider-specific formats. You only handle Pi's unified `AssistantMessageEvent` protocol.

---

## 4. The Extension System: Events, Context, and the UI

Now that you understand how messages and thinking blocks are structured, we can discuss how extensions hook into Pi.

### 4.1 The Extension Factory Function

Every extension is a TypeScript module that exports a **default factory function**:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Your extension logic here
}
```

This function receives an `ExtensionAPI` object (`pi`), which is your gateway to everything. The factory can be synchronous or asynchronous. If it returns a `Promise`, Pi awaits it before firing `session_start`.

### 4.2 ExtensionAPI: The Big Picture

`ExtensionAPI` provides five categories of functionality:

1. **Event Subscription** (`pi.on`) — Subscribe to lifecycle events.
2. **Tool Registration** (`pi.registerTool`) — Add new tools the LLM can call.
3. **Command Registration** (`pi.registerCommand`) — Add slash commands like `/hello`.
4. **Message Rendering** (`pi.registerMessageRenderer`) — Custom renderers for custom message types.
5. **Actions** (`pi.sendMessage`, `pi.sendUserMessage`, `pi.appendEntry`) — Inject messages or persist state.

For our thinking-block extension, we only need **event subscription** and **UI context methods**.

### 4.3 The ExtensionContext Object

Every event handler receives two arguments: `(event, ctx)`, where `ctx` is an `ExtensionContext`:

```typescript
interface ExtensionContext {
  ui: ExtensionUIContext;           // All UI methods
  hasUI: boolean;                   // False in RPC/print mode
  cwd: string;                      // Current working directory
  sessionManager: ReadonlySessionManager; // Session tree, entries, metadata
  model: Model<any> | undefined;    // Current model config
  signal: AbortSignal | undefined;  // Abort signal for current stream
  abort(): void;                    // Abort current operation
  isIdle(): boolean;                // Is the agent streaming?
  // ... and more
}
```

The **`ui`** field is where the magic happens for our use case. Key methods:

| Method | Purpose |
|--------|---------|
| `ctx.ui.notify(message, type?)` | Show a transient toast notification. |
| `ctx.ui.setStatus(key, text?)` | Set footer status text. |
| `ctx.ui.setWidget(key, content?, options?)` | Display a widget above or below the editor. |
| `ctx.ui.setHiddenThinkingLabel(label?)` | Change the collapsed thinking block label. |
| `ctx.ui.setWorkingMessage(message?)` | Change the "working..." message during streaming. |
| `ctx.ui.setWorkingIndicator(options?)` | Customize the streaming spinner. |

Our extension will use **`ctx.ui.setWidget()`** to display "Hello World" when thinking starts, and clear it when thinking ends.

### 4.4 Event Taxonomy for Thinking Block Interception

Pi emits dozens of events. We only care about three for this project:

| Event | When It Fires | Can We Modify? |
|-------|---------------|----------------|
| `message_start` | When any message (user, assistant, toolResult) begins. | No (notification only). |
| `message_update` | During assistant streaming, for every `AssistantMessageEvent`. | No direct return value, but `event.message` is a live reference. |
| `message_end` | When a message is fully assembled. | No (notification only). |

The critical insight: **`message_update` is the only event that gives us access to `AssistantMessageEvent`**, which contains `thinking_start` and `thinking_end`.

### 4.5 The Handler Signature

```typescript
pi.on("message_update", async (event, ctx) => {
  // event.type is always "message_update" (redundant but typed)
  // event.message is the AgentMessage being built
  // event.assistantMessageEvent is the raw stream event
});
```

The handler type is:

```typescript
type ExtensionHandler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;
```

For `message_update`, `R = undefined`, so the handler returns `void`. You cannot return a modified message. However, `event.message` is passed by reference. If you mutate it, the TUI *might* see the mutation—but this is **undocumented behavior** and fragile.

For a reliable, maintainable extension, we use **side effects** (UI notifications/widgets) rather than mutation.

---

## 5. Design Options: How to "Say Hello World"

There are multiple ways to implement "say hello world before each thinking block." Each has trade-offs.

### 5.1 Option A: Widget-Based Display (Recommended)

**Mechanism**: When `thinking_start` is detected, call `ctx.ui.setWidget()` to render "Hello World" above the editor. When `thinking_end` is detected, clear the widget.

**Pros**:
- Uses fully documented, public APIs.
- Visually tied to the thinking lifecycle.
- Non-invasive; does not mutate messages.
- Works with all providers.

**Cons**:
- The text appears in a widget area, not inline within the message stream.
- If multiple thinking blocks occur in one turn, the widget flickers.

### 5.2 Option B: Notification Toast

**Mechanism**: Call `ctx.ui.notify("Hello World", "info")` on `thinking_start`.

**Pros**:
- Dead simple.
- Uses documented API.

**Cons**:
- Notifications are transient and may be missed.
- Does not feel "before the thinking block" visually.

### 5.3 Option C: Custom Message Injection

**Mechanism**: Call `pi.sendMessage()` with a `CustomMessage` when `thinking_start` fires.

**Pros**:
- Creates a persistent record in the session.
- Can be rendered with a custom message renderer.

**Cons**:
- Injects a new session entry, which affects context window usage.
- The message appears as a separate bubble, not inline.
- May confuse the LLM on subsequent turns if `display: true` and sent to context.

### 5.4 Option D: Message Content Mutation (Experimental)

**Mechanism**: In `message_update`, when `thinking_start` is detected, mutate `event.message.content` to insert a `TextContent` block before the thinking block.

**Pros**:
- Truly inline with the message content.
- Visually "before the thinking block."

**Cons**:
- **Undocumented and unsupported.** Pi's TUI may not re-render already-emitted content.
- Could break with future Pi updates.
- May interfere with token counting or context serialization.

### 5.5 Our Design Decision

We implement **Option A (Widget)** as the primary approach, with **Option B (Notification)** as a fallback demonstration. We document Option D for advanced readers but warn against using it in production.

---

## 6. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER TERMINAL                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          TUI (pi-tui)                                │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │    │
│  │  │   Header    │  │   Widget    │  │        Message Pane          │  │    │
│  │  │             │  │  "Hello     │  │  ┌───────────────────────┐  │  │    │
│  │  │             │  │   World"    │  │  │ User: refactor auth   │  │  │    │
│  │  │             │  │             │  │  ├───────────────────────┤  │  │    │
│  │  │             │  │             │  │  │ Assistant:            │  │  │    │
│  │  │             │  │             │  │  │ [thinking]            │  │  │    │
│  │  │             │  │             │  │  │ "1. Read auth.ts..."  │  │  │    │
│  │  └─────────────┘  └─────────────┘  │  └───────────────────────┘  │  │    │
│  │                                    └─────────────────────────────┘  │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │    │
│  │  │                        Editor                                    │  │    │
│  │  └─────────────────────────────────────────────────────────────────┘  │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │    │
│  │  │   Footer: [status] [model] [tokens] [git branch]                │  │    │
│  │  └─────────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTENSION RUNTIME                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  hello-world-thinking.ts                                            │    │
│  │                                                                     │    │
│  │  pi.on("message_update", (event, ctx) => {                         │    │
│  │    if (event.assistantMessageEvent.type === "thinking_start") {     │    │
│  │      ctx.ui.setWidget("hello-world", ["Hello World"]);              │    │
│  │    }                                                                │    │
│  │    if (event.assistantMessageEvent.type === "thinking_end") {       │    │
│  │      ctx.ui.setWidget("hello-world", undefined);                    │    │
│  │    }                                                                │    │
│  │  });                                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT SESSION RUNTIME                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Input     │───▶│   Agent     │───▶│  Provider   │───▶│   LLM       │  │
│  │   Handler   │    │   Loop      │    │   Layer     │    │   API       │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │                  │          │
│         │                  │                  │                  │          │
│         ▼                  ▼                  ▼                  ▼          │
│    before_agent_start  turn_start      HTTP request        Token stream    │
│    agent_start         context          after_provider_    (provider-specific)
│    message_start       message_update   response           (Claude/OpenAI/ etc.)
│    message_end         tool_execution_start
│                        tool_call
│                        tool_result
│                        turn_end
│                        agent_end
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Lifecycle Flow: A Single Turn with Thinking

Here is the exact sequence of events when a user sends a prompt and the LLM responds with thinking + a tool call:

```
1. USER types: "Refactor the auth module" + Enter
   └── pi.on("input") fires (extension can transform prompt)

2. BEFORE AGENT STARTS
   └── pi.on("before_agent_start") fires
       └── Extension can inject messages or modify system prompt

3. AGENT LOOP BEGINS
   └── pi.on("agent_start") fires

4. TURN STARTS
   └── pi.on("turn_start") fires
       └── event.turnIndex = 0

5. CONTEXT PREPARATION
   └── pi.on("context") fires
       └── Extension can filter/modify messages sent to LLM

6. PROVIDER REQUEST
   └── pi.on("before_provider_request") fires
   └── HTTP request sent to LLM API
   └── pi.on("after_provider_response") fires

7. LLM STREAMS RESPONSE
   └── pi.on("message_start") fires
       └── event.message = { role: "assistant", content: [], ... }

   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "text_start", contentIndex: 0, ... }

   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "text_delta", delta: "I'll ", ... }

   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "text_delta", delta: "help ", ... }

   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "text_end", content: "I'll help you refactor the auth module.", ... }

   ★★★ THINKING BLOCK BEGINS ★★★
   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "thinking_start", contentIndex: 1, ... }
       ★★★ OUR EXTENSION: ctx.ui.setWidget("hello-world", ["Hello World"]) ★★★

   └── pi.on("message_update") fires (repeatedly)
       └── event.assistantMessageEvent = { type: "thinking_delta", delta: "1. Read ", ... }

   └── pi.on("message_update") fires (repeatedly)
       └── event.assistantMessageEvent = { type: "thinking_delta", delta: "auth.ts\n", ... }

   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "thinking_end", content: "1. Read auth.ts\n2. Extract interfaces...", ... }
       ★★★ OUR EXTENSION: ctx.ui.setWidget("hello-world", undefined) ★★★

   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "toolcall_start", contentIndex: 2, ... }

   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "toolcall_delta", delta: "{\n  \"path\": ", ... }

   └── pi.on("message_update") fires
       └── event.assistantMessageEvent = { type: "toolcall_end", toolCall: { ... }, ... }

   └── pi.on("message_end") fires
       └── event.message = fully assembled AssistantMessage

8. TOOL EXECUTION
   └── pi.on("tool_execution_start") fires
   └── pi.on("tool_call") fires (extension can block/modify)
   └── Built-in tool executes (e.g., `read`)
   └── pi.on("tool_execution_update") fires (partial results)
   └── pi.on("tool_result") fires (extension can modify result)
   └── pi.on("tool_execution_end") fires

9. TURN ENDS
   └── pi.on("turn_end") fires

10. AGENT LOOP ENDS (no more tool calls)
    └── pi.on("agent_end") fires
```

Our extension only hooks into **step 7**, specifically the `thinking_start` and `thinking_end` events within `message_update`.

---

## 8. Provider-Specific Considerations

Not all LLMs emit thinking blocks. Here is a compatibility matrix:

| Provider | Model | Thinking Blocks? | Notes |
|----------|-------|------------------|-------|
| Anthropic | Claude 3.7 Sonnet | Yes | Native `thinking` blocks in Messages API |
| Anthropic | Claude 3.5 Sonnet | No | No reasoning output |
| OpenAI | o1, o3-mini | Yes | Reasoning tokens exposed via API |
| OpenAI | GPT-4o, GPT-4.5 | No | No reasoning output |
| DeepSeek | DeepSeek-R1, V3 | Yes | `<think>` tags in text stream |
| Google | Gemini 2.5 Pro | Sometimes | `thought` field in some configurations |
| Local (llama.cpp) | Various | Sometimes | Depends on `--reasoning-format` flags |

**Implication for testing**: To test this extension, you must use a model that emits thinking blocks. Claude 3.7 Sonnet via Anthropic API is the most reliable option.

---

## 9. Summary of Key Files and Their Roles

| File Path | Role in This Project |
|-----------|----------------------|
| `~/.pi/agent/extensions/hello-world-thinking.ts` | **Our extension file** — the only file we write. |
| `packages/coding-agent/docs/extensions.md` | Primary documentation for the extension system. Read this for the authoritative reference. |
| `packages/coding-agent/docs/session.md` | Defines all message types, content blocks, and session entry formats. Essential for understanding `ThinkingContent`. |
| `packages/ai/src/types.ts` | Defines `AssistantMessageEvent`, the streaming protocol we intercept. |
| `packages/coding-agent/src/core/extensions/types.ts` | Defines `ExtensionAPI`, `ExtensionContext`, `ExtensionUIContext`, and all handler signatures. |
| `packages/coding-agent/examples/extensions/hidden-thinking-label.ts` | Example that customizes thinking block UI. Shows `ctx.ui.setHiddenThinkingLabel()`. |
| `packages/coding-agent/examples/extensions/message-renderer.ts` | Example of custom message rendering. Shows `pi.registerMessageRenderer()`. |
| `packages/coding-agent/examples/extensions/status-line.ts` | Example of footer status manipulation. Shows `ctx.ui.setStatus()`. |
| `packages/coding-agent/examples/extensions/widget-placement.ts` | Example of widget placement. Shows `ctx.ui.setWidget()` with placement options. |

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **Agent** | The core loop that orchestrates LLM calls, tool execution, and message assembly. |
| **Content Block** | A typed unit within a message's `content` array: `text`, `thinking`, `toolCall`, or `image`. |
| **Extension** | A TypeScript module that extends Pi's behavior via the `ExtensionAPI`. |
| **ExtensionAPI** | The `pi` object passed to every extension factory. Provides event subscription, tool/command registration, and actions. |
| **ExtensionContext** | The `ctx` object passed to every event handler. Provides UI methods, session access, and runtime state. |
| **jiti** | The TypeScript runtime Pi uses to execute extensions without pre-compilation. |
| **Message** | A structured conversation unit with a `role` and `content` blocks. |
| **Session** | A persistent conversation tree stored as JSONL. |
| **Thinking Block** | A `ThinkingContent` block carrying an LLM's internal reasoning. |
| **Turn** | One complete user-prompt-to-LLM-response cycle, including any tool calls. |
| **TUI** | Terminal User Interface. Pi's interactive rendering layer (from `pi-tui` package). |
