---
ticket: pi-ext-session-summary
title: "System Analysis: Session Summary Block Extension"
doc-type: analysis
topics:
  - pi
  - extensions
  - system-prompt
  - prompt-injection
  - message-parsing
  - session-management
created: 2026-04-23
author: manuel
related_files:
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md:Extension system overview"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/pirate.ts:Example of system prompt modification"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session.md:Message and session types"
---

# System Analysis: Session Summary Block Extension

## 1. The Problem We Are Solving

When working with a coding agent over many turns, the conversation grows long. The model has access to the full context window, but the human user does not. At any point, the user may want to know: what has been accomplished so far? What problems were encountered? What is the model planning to do next?

The extension solves this by **forcing the model to produce a structured summary at the end of every turn**. The summary is tagged with XML (`<summary>...</summary>`) so the extension can parse it reliably. The extension then surfaces this summary in the TUI as a widget, making it visible without scrolling through the entire conversation.

This is different from Pi's built-in compaction or tree navigation. Those are framework-level features. This extension is a **behavior-level constraint** on the model: "after every turn, tell me what just happened."

## 2. The Three Subsystems We Must Touch

This extension exercises more of Pi's API than the previous Hello World thinking block extension. We must touch three distinct subsystems:

### 2.1 System Prompt Injection (`before_agent_start`)

Before the agent begins processing a user prompt, the extension modifies the system prompt to include an instruction about summary blocks. This ensures the model knows the expected format before it starts generating tokens.

The `before_agent_start` event provides:

```typescript
interface BeforeAgentStartEvent {
  prompt: string;                    // User's prompt text
  images: ImageContent[];            // Attached images
  systemPrompt: string;              // Current system prompt
  systemPromptOptions: {             // Structured options
    customPrompt: string;
    selectedTools: ToolInfo[];
    toolSnippets: string[];
    promptGuidelines: string[];
    appendSystemPrompt: string;
    cwd: string;
    contextFiles: string[];
    skills: string[];
  };
}
```

The handler can return:

```typescript
interface BeforeAgentStartEventResult {
  message?: CustomMessage;           // Inject a message into the conversation
  systemPrompt?: string;             // Replace the system prompt for this turn
}
```

We use the `systemPrompt` return value to append our instruction.

### 2.2 User Prompt Injection (`input`)

The extension also appends a reminder to the user's actual prompt text. This serves as a near-term memory cue — the model sees the reminder in the user message itself, not just in the distant system prompt.

The `input` event:

```typescript
interface InputEvent {
  type: "input";
  prompt: string;                    // User's raw input
  images: ImageContent[];
  source: InputSource;               // "user" | "extension" | "api"
}
```

The handler can return:

```typescript
interface InputEventResult {
  prompt?: string;                   // Replace the user's prompt
  images?: ImageContent[];
  handled?: boolean;                 // If true, Pi skips normal processing
}
```

We return a modified `prompt` with the reminder appended.

**Important**: We only modify `source === "user"` prompts. We do not modify extension-generated or API-generated inputs, to avoid infinite loops.

### 2.3 Turn-End Parsing and Widget Display (`turn_end`)

After the model finishes its turn, the extension examines the fully assembled `AssistantMessage` for `<summary>...</summary>` tags. This is the right moment because:

- The message is **complete** — no partial tags, no buffering needed
- The `AssistantMessage.content` array is fully populated with `TextContent` blocks
- We can use simple regex/string search instead of streaming state machines

The `turn_end` event provides the final message:

```typescript
interface TurnEndEvent {
  type: "turn_end";
  turnIndex: number;
  message: AssistantMessage;         // Final assistant message
  toolResults: AgentToolResult[];    // Results from tool calls this turn
}
```

The parsing strategy:

1. Iterate over `message.content` and find all `TextContent` blocks
2. Join their text into a single string
3. Search for `<summary>...</summary>` using a regex
4. If found: extract, parse, display widget
5. If not found: display warning widget

This is **much simpler** than buffering `message_update` tokens. The only tradeoff: we only see the summary at turn end, not as it streams. For our use case (a summary widget displayed after the turn completes), this is exactly right.

### 2.4 Safety Cleanup (`agent_end`)

The `agent_end` event fires when the entire agent loop finishes (after all tool calls are resolved):

```typescript
interface AgentEndEvent {
  type: "agent_end";
  messages: AgentMessage[];          // All messages from this prompt
}
```

We use this as a safety net: if for any reason the widget was not cleared at `turn_end`, clear it here.

## 3. The Summary Block Schema

The summary block is XML-tagged for reliable parsing. Inside the tags, the content can be plain text or structured JSON. The extension should support both.

### 3.1 XML-Only Format (Simple)

```xml
<summary>
This turn: read package.json, identified Vite as the build tool.
Session so far: set up project structure, installed dependencies, configured Vite.
Issues: none.
Next steps: create the main entry point and write the first component.
</summary>
```

### 3.2 JSON-Inside-XML Format (Structured)

```xml
<summary>
{
  "thisTurn": {
    "filesRead": ["package.json", "vite.config.ts"],
    "filesEdited": [],
    "filesWritten": [],
    "commandsRun": [],
    "description": "Identified Vite as the build tool and confirmed project dependencies."
  },
  "sessionSoFar": {
    "filesRead": ["package.json", "vite.config.ts"],
    "filesEdited": [],
    "filesWritten": ["README.md"],
    "description": "Set up project structure, installed dependencies, configured Vite, wrote README."
  },
  "issues": [],
  "nextSteps": [
    "Create src/main.ts entry point",
    "Write the first React component",
    "Add Storybook stories"
  ]
}
</summary>
```

### 3.3 Hybrid Format (Recommended)

```xml
<summary>
## This Turn
- Read package.json and vite.config.ts
- Confirmed Vite is the build tool

## Session So Far
- Project structure set up
- Dependencies installed
- Vite configured
- README written

## Issues
- None

## Next Steps
1. Create src/main.ts
2. Write first React component
3. Add Storybook stories
</summary>
```

The extension should be **format-agnostic** at first: extract the text between tags and display it verbatim. A future enhancement could parse structured JSON and render it as a table.

### 3.4 System Prompt Instruction

The instruction appended to the system prompt:

```
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
```

### 3.5 User Prompt Reminder

The reminder appended to every user prompt:

```

Don't forget to add the <summary>...</summary> block at the end of your response.
```

This is intentionally short and repetitive. It acts as a near-term memory cue.

### 3.6 Why Parse at `turn_end` Instead of `message_update`?

We considered parsing the `message_update` stream (buffering `text_delta` tokens and looking for tags as they arrive). That approach is fragile:

- Tags could be split across multiple `text_delta` events
- Partial tags (`<summary` without `>`) require complex buffering logic
- The extension must maintain streaming state across events

Parsing at `turn_end` avoids all of this. The `AssistantMessage` is complete. We simply join all text blocks and run a regex. The regex is straightforward because the text is fully assembled:

```typescript
const summaryMatch = fullText.match(/<summary>([\s\S]*?)<\/summary>/);
```

The `[\s\S]*?` pattern matches any content (including newlines) non-greedily, so it stops at the first `</summary>`.

If the model produces multiple summaries, we use the last one (closest to the end of the message), which is most likely the intended one.

## 4. Design Decisions

### 4.1 Why XML Tags?

XML tags (`<summary>...</summary>`) were chosen over JSON or markdown because:

- They are **visually distinctive** in the text stream, making detection reliable
- They are **unlikely to conflict** with code the model writes (code blocks use triple backticks, not XML)
- They are **easy to explain** to the model: "wrap your summary in `<summary>` and `</summary>`"
- They allow **nested content** (JSON, markdown, plain text) without escaping issues

### 4.2 Why Both System Prompt and User Prompt Injection?

The system prompt provides the **long-term constraint**: the model learns the pattern and follows it. The user prompt reminder provides the **short-term cue**: right before responding, the model sees "don't forget the summary." This dual-layer approach increases compliance.

### 4.3 Why `turn_end` Instead of `message_update`?

`message_update` fires for every token, giving us partial text. Parsing partial text is fragile — tags could be split across events. `turn_end` gives us the complete, assembled `AssistantMessage`. We join all text blocks and run a single regex. No buffering, no state machines, no edge cases around partial tags.

We also use `agent_end` as a safety net to clear any leftover widgets.

### 4.4 Why Widget Instead of Custom Message?

A widget (`ctx.ui.setWidget()`) is transient and non-persistent. A custom message (`pi.sendMessage()`) would be stored in the session file and consume context window tokens. The summary is a UI affordance, not a conversation participant, so a widget is the right abstraction.

## 5. State Management

This extension requires minimal state because parsing happens at `turn_end` on the complete message. The only state we track is:

```typescript
interface SummaryState {
  lastSummary: string | null;        // Content of last detected summary
  lastTurnHadSummary: boolean;       // Did the last turn have a summary?
  turnIndex: number;
}
```

State is reset at `session_start` and updated at `turn_end`.

## 6. Edge Cases

| Edge Case | Mitigation |
|-----------|------------|
| Model emits `<summary>` but not `</summary>` | At `turn_end`, regex requires both tags. If not found, show warning. |
| Model puts code containing `<summary>` inside backticks | Regex is greedy enough to find the outermost tags; use last match |
| Summary is empty (`<summary></summary>`) | Treat as missing; show warning widget |
| Model produces summary in the middle of text, not at the end | Accept it anyway; the instruction says "at the end" but partial compliance is better than none |
| Multiple summaries in one turn | Use the last match (regex with `g` flag, take last) |
| User prompt already contains the reminder text | Check before appending to avoid duplication |
| Extension appends reminder to its own generated input | Only modify `source === "user"` prompts |
| Summary contains markdown that confuses the TUI | Strip or escape markdown syntax before putting in widget |
| Summary is very long | Truncate to N lines for widget display; full text available in session |

## 7. Architecture

```text
User types prompt
  │
  ▼
input event fires
  └── Extension: append reminder to prompt text
        └── "Don't forget to add the <summary>..."
  │
  ▼
before_agent_start event fires
  └── Extension: append summary instruction to system prompt
        └── "At the end of every turn, you MUST output <summary>..."
  │
  ▼
LLM streams response (extension does nothing during streaming)
  │
  ▼
turn_end fires
  └── Extension: parse complete AssistantMessage
        ├── Join all TextContent blocks into one string
        ├── Search for <summary>...</summary> with regex
        ├── IF found: extract, format, ctx.ui.setWidget("summary", lines)
        └── IF not found: ctx.ui.setWidget("summary", ["⚠️ No summary detected"])
  │
  ▼
agent_end fires
  └── Extension: safety cleanup — clear widgets
```

## 8. Key Files and Their Roles

| File | Role |
|------|------|
| `~/.pi/agent/extensions/session-summary.ts` | The extension (the only file we write) |
| `packages/coding-agent/docs/extensions.md` | Extension system overview |
| `packages/coding-agent/examples/extensions/pirate.ts` | Example of `systemPromptAppend` pattern |
| `packages/coding-agent/docs/session.md` | Message types and content blocks |
| `packages/ai/src/types.ts` | `AssistantMessageEvent` stream protocol |
| `packages/coding-agent/src/core/extensions/types.ts` | `ExtensionAPI`, event handlers |

## 9. Comparison to Previous Extension

| Aspect | Hello World Thinking | Session Summary |
|--------|---------------------|-----------------|
| Events used | `message_update`, `turn_start`, `agent_end` | `input`, `before_agent_start`, `turn_end`, `agent_end` |
| System prompt | No | Yes (`before_agent_start`) |
| Prompt injection | No | Yes (`input`) |
| Message parsing | Event-based (`thinking_start`/`thinking_end`) | Text-based (regex on complete message at `turn_end`) |
| Widget purpose | Status display (always shown during thinking) | Validation result (summary or warning) |
| State complexity | Simple boolean + counter | None (parsing is done on complete message) |
| Compliance enforcement | Passive (react to model behavior) | Active (modify prompts to increase compliance) |

This extension is more complex because it touches more of Pi's surface area: system prompt modification, prompt transformation, and message parsing. However, parsing at `turn_end` (rather than during streaming) makes the message parsing simpler than it would otherwise be.
