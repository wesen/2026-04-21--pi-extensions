---
Title: ""
Ticket: ""
Status: ""
Topics: []
DocType: ""
Intent: ""
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
      Note: Extension API — events
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md
      Note: Session file format — JSONL
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tree.md
      Note: Tree navigation — navigateTree()
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md
      Note: TUI components — overlays
    - Path: docs/pi-compaction-textbook.md
      Note: Compaction textbook — how compacted entries affect searchability
    - Path: docs/pi-shared-extension-framework-guide.md
      Note: Extension framework guide — registerPiExtension() contract
    - Path: docs/pi-tui-ui-authoring-guide.md
      Note: TUI authoring guide — Component contract
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---


# Session Search Extension: Analysis, Design & Implementation Guide

## Goal

Design and build a Pi extension called `session-search` that allows the user to search for a string in tool call arguments and tool results across the entire session history. The extension shows a ranked, chronological list of every time a given string appeared in a tool call (especially `read` and `write`), displaying when and in which turn the string first appeared, and provides the ability to navigate to that point in the session tree to fork from around that tool call.

This document is written for a new intern who knows TypeScript and terminal UI basics but has not built a Pi extension before. It explains every part of the system needed to understand the problem, the solution, and the implementation.

---

## 1. The Problem: You Can't Find What You've Already Seen

Pi coding sessions can run for hours. The agent reads dozens of files, writes code, runs shell commands, edits files, and iterates. The session file on disk records every single one of these interactions, including the full text of every `read` call and the exact diff of every `write` call. But there is no way to search through all of those tool calls and results from within Pi.

Imagine you remember that somewhere around turn 15 the agent wrote a specific string — maybe a function name, an error message, or a configuration value — into a file, and now you want to go back to that exact moment. You'd have to scroll through the session or manually read the JSONL file. This extension solves that problem by providing a search interface that:

1. Scans all tool call arguments and results in the current session branch
2. Finds every occurrence of a user-specified search string
3. Shows a browsable, chronological list of matches with file name, turn number, timestamp, and match context
4. Lets the user select a match and navigate to that point in the session tree to fork

---

## 2. System Overview: The Pieces You Need to Understand

Building this extension requires understanding five Pi subsystems:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Session Search Extension                     │
│                                                                  │
│  1. Session File Format ──┐                                     │
│     (JSONL on disk)       │    4. Tree Navigation & Forking      │
│     entries, id/parentId  ├───►  /tree, branch(), navigateTree  │
│                           │                                     │
│  2. SessionManager API ──┤    5. Extension Framework             │
│     getEntries(), getBranch()  registerPiExtension(), actions,   │
│                           │     commands, docs, widgets           │
│  3. TUI Component System ─┘                                     │
│     render(width), handleInput()                                │
│     ctx.ui.custom(), overlays                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Session File Format

Every Pi session is stored as a JSONL (JSON Lines) file under `~/.pi/agent/sessions/`. Each line is a JSON object with a `type` field. The entries form a **tree** via `id` and `parentId` fields.

**Key entry types for this extension:**

| Entry Type | `type` field | What it contains |
|---|---|---|
| `SessionMessageEntry` | `"message"` | An `AgentMessage` — user, assistant, toolResult, bashExecution, or custom |
| `CompactionEntry` | `"compaction"` | A summary of older messages (the originals are still on disk) |
| `BranchSummaryEntry` | `"branch_summary"` | Summary of an abandoned branch when navigating `/tree` |
| `CustomEntry` | `"custom"` | Extension state (not sent to LLM) |
| `LabelEntry` | `"label"` | User-defined bookmark/marker on an entry |

The session file is **append-only**. Compaction replaces older messages in the *active context sent to the LLM*, but the original entries remain in the JSONL file. This is crucial: even after compaction, we can still search the full history by reading the file.

**Source:** `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`
**Reference:** Pi docs `session.md`

### 2.2 AgentMessage Types and Tool Calls

Each `SessionMessageEntry` wraps an `AgentMessage`. The relevant message roles for tool-call searching are:

```typescript
// An assistant message that may contain tool calls
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  // ... other fields: api, provider, model, usage, stopReason, timestamp
}

// A tool call within assistant content
interface ToolCall {
  type: "toolCall";
  id: string;           // Links to the matching ToolResultMessage
  name: string;         // "read", "write", "edit", "bash", etc.
  arguments: Record<string, any>;  // The actual arguments
}

// A tool result message
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;   // Matches the ToolCall.id
  toolName: string;
  content: (TextContent | ImageContent)[];  // The result text/images
  details?: any;        // Tool-specific metadata
  isError: boolean;
  timestamp: number;
}
```

For `read` tool calls, `arguments` contains `{ path: string, offset?: number, limit?: number }`.
For `write` tool calls, `arguments` contains `{ path: string, content: string }`.
For `edit` tool calls, `arguments` contains `{ path: string, edits: Array<{ oldText: string, newText: string }> }`.

The tool *result* contains the file content that was read, or a confirmation message for write/edit.

**Key insight:** Both the arguments (what the agent asked to do) and the results (what came back) can contain the search string. We need to search both.

### 2.3 SessionManager API

The `SessionManager` is accessible via `ctx.sessionManager` in extension event handlers and command handlers. It provides read-only access to the session tree.

**Critical methods for this extension:**

```typescript
// Get all entries in the session (flat list, includes all branches)
ctx.sessionManager.getEntries(): SessionEntry[]

// Get entries on the current branch (walk from leaf to root)
ctx.sessionManager.getBranch(fromId?: string): SessionEntry[]

// Get the current leaf entry ID
ctx.sessionManager.getLeafId(): string | null

// Get a specific entry by ID
ctx.sessionManager.getEntry(id: string): SessionEntry | undefined

// Get the full tree structure
ctx.sessionManager.getTree(): SessionTreeNode[]

// Get the session file path (for direct JSONL parsing if needed)
ctx.sessionManager.getSessionFile(): string | undefined
```

**Important distinction:** `getEntries()` returns all entries across all branches. `getBranch()` returns only the entries on the current active path in **root→leaf (chronological) order**. For this extension, we want to search the **current branch** by default, because that's the conversation the user is actually in. We might add a "search all branches" option later.

### 2.4 Tree Navigation and Forking

Pi's session tree allows branching. The `/tree` command lets users navigate to any point in the conversation history and fork from there. This extension needs to replicate a subset of that functionality: when the user selects a match, we navigate to the entry where the tool call happened so they can fork.

**Two navigation approaches:**

1. **`ctx.navigateTree(targetId, options?)`** — Available in `ExtensionCommandContext` (command handlers). This changes the leaf pointer in the *same* session file, with optional branch summarization. This is what `/tree` uses internally.

2. **`ctx.fork(entryId, options?)`** — Also available in `ExtensionCommandContext`. This creates a *new* session file containing the path from root to the selected entry. The old session is preserved.

The `navigateTree` approach is more natural for "go back to this point and continue differently." The `fork` approach is for "create a copy of the conversation up to this point." For this extension, `navigateTree` is the primary action, because the user wants to *go to* the match point and fork from there.

**Key detail:** When navigating to a non-user-message entry (like a toolResult), `navigateTree` sets the leaf to that entry. The user then continues the conversation from that point. When navigating to a user message, the leaf is set to the *parent* of that entry, and the user message text is placed in the editor for re-submission.

**For our use case:** We want to navigate to the **parent user message** of the tool call. A tool call happens within an assistant turn, which is a response to a user message. If we navigate to the user message, the user can edit and re-submit it to fork. If we navigate to the assistant message or tool result, the conversation continues from after that tool result, which is less useful for forking.

**Reference:** Pi docs `tree.md`, `extensions.md` (ExtensionCommandContext section)

### 2.5 The Extension Framework

Extensions in this repo use a shared registration system called `registerPiExtension()`. This is defined in `extensions/_shared/registry.ts` and provides a unified way to declare what an extension contributes.

The registration contract:

```typescript
interface PiExtensionRegistration {
  id: string;            // Stable machine name: "session-search"
  name: string;          // Display name: "Session Search"
  description: string;   // One-line explanation
  commands?: string[];   // Slash commands: ["session-search"]
  tags?: string[];       // Search tags: ["search", "history", "fork"]
  run?: PiExtensionActionHandler;  // Default action when selected in /px
  actions?: PiExtensionAction[];   // Named operations
  docs?: PiExtensionDoc[];         // Help pages
  settings?: PiExtensionSettingsContribution;
  widgets?: PiDashboardWidget[];
}
```

**Our extension will register:**
- `id: "session-search"`
- One command: `/session-search`
- A default `run` action that opens the search UI
- An additional action: "Search current file history" (pre-fills the current file path)
- Documentation explaining the extension
- A dashboard widget showing "last search: X matches"

**Reference:** `docs/pi-shared-extension-framework-guide.md`

---

## 3. Architecture

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     session-search Extension                  │
│                                                              │
│  ┌──────────────┐    ┌────────────────┐    ┌──────────────┐ │
│  │  Search Index │◄───│ Session Scanner │◄───│ SessionManager│ │
│  │  (in-memory)  │    │ (on demand)     │    │   (read-only) │ │
│  └──────┬───────┘    └────────────────┘    └──────────────┘ │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────┐                                       │
│  │ Search UI Overlay │──► User selects match                │
│  │ (TUI Component)   │                                       │
│  └────────┬─────────┘                                       │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │ Match Navigator   │───►│ ctx.navigateTree()│              │
│  │ (finds parent     │    │ or ctx.fork()     │              │
│  │  user message)    │    └──────────────────┘              │
│  └──────────────────┘                                       │
│                                                              │
│  ┌──────────────────┐                                       │
│  │ Dashboard Widget  │  "session-search: last 3 matches"     │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

1. **User invokes** `/session-search` or selects the extension from `/px`
2. **Search overlay opens** — user types a search query
3. **Scanner runs** — walks the current branch entries, extracts tool call args and results, searches for the query string
4. **Results display** — matches shown in a scrollable, selectable list
5. **User selects a match** — extension finds the parent user message for that tool call
6. **Navigation** — `ctx.navigateTree()` is called to jump to that point, placing the user message in the editor for re-submission

### 3.3 Key Design Decisions

**Decision 1: Search the current branch, not all entries.**
The current branch (`getBranch()`) represents the conversation the user is actually in. Searching all entries across all branches would return matches from abandoned explorations that the user has already context-switched away from. We can add an "all branches" option later.

**Decision 2: Search tool call arguments AND tool results.**
A search for "validateAuth" should find both:
- The `write` tool call where the agent wrote `validateAuth` into a file (in the arguments)
- The `read` tool result where the agent read a file containing `validateAuth` (in the result)

**Decision 3: Navigate to the parent user message, not the tool call entry.**
When the user selects a match, we find the user message that initiated the turn containing the tool call. This way, `navigateTree` restores the user's original prompt in the editor, making it easy to modify and re-submit (fork). If we navigated to the tool result itself, the conversation would continue from *after* the tool call, which is less useful.

**Decision 4: Build the search index on demand, not incrementally.**
Sessions are not that large (typically a few hundred tool calls). Walking the branch and searching is fast enough to do on each search. We don't need a persistent index. This avoids the complexity of maintaining incremental state across events.

**Decision 5: Offer both `navigateTree` and `fork` as navigation options.**
- `navigateTree` (default): Rewinds the current session to the match point. The old branch is abandoned (with optional summary). This is the "go back and try a different approach" use case.
- `fork`: Creates a new session file with the conversation up to the match point. The original session is preserved. This is the "try an alternative in a new session" use case.

---

## 4. Session Scanner: The Core Algorithm

The scanner walks the current branch and extracts searchable tool-call records. Each record links back to the session entry where the tool call occurred.

### 4.1 Data Model

```typescript
/** A single searchable occurrence of a string in a tool call or result */
interface ToolCallMatch {
  /** The session entry ID of the assistant message containing the tool call */
  assistantEntryId: string;

  /** The session entry ID of the tool result message */
  resultEntryId: string;

  /** The session entry ID of the parent user message for this turn */
  parentUserEntryId: string;

  /** Tool name: "read", "write", "edit", "bash", etc. */
  toolName: string;

  /** Tool call ID (links assistant content to tool result) */
  toolCallId: string;

  /** Tool call arguments */
  arguments: Record<string, any>;

  /** Tool result content (concatenated text) */
  resultText: string;

  /** Timestamp of the assistant message */
  timestamp: number;

  /** 0-based turn index (counting user messages from the start) */
  turnIndex: number;

  /** Where the match was found */
  matchLocation: "arguments" | "result" | "both";

  /** Line numbers within the matched text where the query appears */
  matchLines: number[];
}

/** Summary of a scan result */
interface ScanResult {
  matches: ToolCallMatch[];
  scanDurationMs: number;
  totalEntriesScanned: number;
  totalToolCallsScanned: number;
}
```

### 4.2 Scanning Algorithm (Pseudocode)

```
FUNCTION scanBranch(sessionManager, query, options):
  branch = sessionManager.getBranch()  // entries root→leaf (chronological)
  // branch is already root→leaf (chronological)

  matches = []
  turnIndex = 0
  currentUserEntryId = null
  pendingToolCalls = {}  // toolCallId -> { entryId, args, toolName, timestamp }

  FOR EACH entry IN branch:
    IF entry.type != "message":
      CONTINUE

    message = entry.message

    // Track turn boundaries and parent user messages
    IF message.role == "user":
      currentUserEntryId = entry.id
      turnIndex++

    // Collect tool calls from assistant messages
    IF message.role == "assistant":
      FOR EACH contentBlock IN message.content:
        IF contentBlock.type == "toolCall":
          pendingToolCalls[contentBlock.id] = {
            assistantEntryId: entry.id,
            arguments: contentBlock.arguments,
            toolName: contentBlock.name,
            timestamp: message.timestamp,
            parentUserEntryId: currentUserEntryId,
            turnIndex: turnIndex
          }

    // Match tool results against pending calls and search query
    IF message.role == "toolResult":
      pending = pendingToolCalls[message.toolCallId]
      IF pending == null:
        CONTINUE  // orphaned result, skip

      resultText = concatenate all text blocks from message.content

      // Search both arguments and result
      argMatch = searchInObject(pending.arguments, query)
      resultMatch = query IS SUBSTRING OF resultText

      IF argMatch OR resultMatch:
        matchLocation = argMatch AND resultMatch ? "both"
                      : argMatch ? "arguments"
                      : "result"

        matchLines = computeMatchLineNumbers(
          argMatch ? pending.arguments : {},
          resultMatch ? resultText : "",
          query
        )

        matches.push({
          assistantEntryId: pending.assistantEntryId,
          resultEntryId: entry.id,
          parentUserEntryId: pending.parentUserEntryId,
          toolName: pending.toolName,
          toolCallId: message.toolCallId,
          arguments: pending.arguments,
          resultText: resultText,
          timestamp: pending.timestamp,
          turnIndex: pending.turnIndex,
          matchLocation: matchLocation,
          matchLines: matchLines
        })

      DELETE pendingToolCalls[message.toolCallId]

  RETURN {
    matches: matches,
    scanDurationMs: ...,
    totalEntriesScanned: branch.length,
    totalToolCallsScanned: ...  // count of matched pendingToolCalls
  }
```

### 4.3 Searching Tool Call Arguments

The `arguments` field is a `Record<string, any>`. For `read` it's `{ path, offset?, limit? }`. For `write` it's `{ path, content }`. For `edit` it's `{ path, edits: [{ oldText, newText }] }`. For `bash` it's `{ command, timeout? }`.

We need to search the *string values* within the arguments object. This is a recursive string search:

```typescript
function searchInObject(obj: Record<string, any>, query: string): boolean {
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.includes(query)) {
      return true;
    }
    if (typeof value === "object" && value !== null) {
      if (searchInObject(value, query)) return true;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.includes(query)) return true;
        if (typeof item === "object" && item !== null && searchInObject(item, query)) return true;
      }
    }
  }
  return false;
}
```

### 4.4 Handling Compaction

Compaction entries summarize older messages. The original entries still exist in the JSONL file but are no longer on the current branch path. After compaction:

- `getBranch()` returns entries in **root→leaf (chronological) order** from `firstKeptEntryId` to the leaf, plus the compaction entry itself
- The compacted entries are NOT in the branch (they were replaced by the compaction summary)

**For search purposes:** If we only scan `getBranch()`, we miss all tool calls that were compacted. To search the full history, we need to read the raw JSONL file. The approach:

1. First, scan the current branch (fast, always available)
2. Optionally, parse the full JSONL file to find tool calls in compacted regions

The JSONL parsing approach:

```typescript
import { readFileSync } from "fs";

function scanFullSession(sessionFilePath: string, query: string): ToolCallMatch[] {
  const lines = readFileSync(sessionFilePath, "utf8").trim().split("\n");
  const matches: ToolCallMatch[] = [];

  // Build a map of all entries by ID for tree traversal
  const entriesById = new Map<string, any>();
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.type === "message" && entry.id) {
      entriesById.set(entry.id, entry);
    }
  }

  // Scan all message entries (regardless of which branch they're on)
  // ... same matching logic as above, but against all entries
  return matches;
}
```

**Initial implementation:** Search only the current branch. Add full-file scanning as a follow-up. This keeps the initial version simple and fast.

### 4.5 Extracting the Parent User Message

When the user selects a match, we need to find the user message that initiated the turn containing the tool call. The algorithm:

```typescript
function findParentUserMessage(
  sessionManager: ReadonlySessionManager,
  assistantEntryId: string
): string | null {
  const branch = sessionManager.getBranch();

  // Walk backward from the assistant entry to find the nearest user message
  let foundAssistant = false;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type !== "message") continue;

    if (entry.id === assistantEntryId) {
      foundAssistant = true;
      continue;
    }

    if (foundAssistant && entry.message.role === "user") {
      return entry.id;
    }
  }

  // Fallback: the assistant message might be the first message
  // (unlikely, but handle gracefully)
  return null;
}
```

---

## 5. User Interface Design

### 5.1 The Search Overlay

The search UI is a modal overlay component that opens when the user invokes `/session-search`. It follows the pattern described in `docs/pi-tui-ui-authoring-guide.md` — a single `Component` class with render helpers and keyboard input handling.

**Layout:**

```
╭─────────────────── Session Search ───────────────────╮
│ Search: myFunction█                                  │
│                                                      │
│ 12 matches in 8 tool calls · Enter select · Esc close│
├──────────────────────────────────────────────────────┤
│                                                      │
│ ▸ Turn 3 · 14:23:01 · read                          │
│   src/auth/validate.ts:1-50                          │
│   → found in result (line 23)                        │
│                                                      │
│   Turn 5 · 14:25:12 · write                          │
│   src/auth/handler.ts                                │
│   → found in arguments (content)                     │
│                                                      │
│   Turn 5 · 14:25:12 · edit                           │
│   src/auth/handler.ts                                 │
│   → found in arguments (oldText)                      │
│                                                      │
│   Turn 8 · 14:31:44 · bash                          │
│   grep -rn "myFunction" src/                          │
│   → found in result (line 3)                         │
│                                                      │
│   ... 8 more matches ...                             │
├──────────────────────────────────────────────────────┤
│ f: fork · n: navigate · c: compacted scan · ?: help  │
╰──────────────────────────────────────────────────────╯
```

**Keyboard controls:**

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection |
| `Enter` | Navigate to match (default: `navigateTree` to parent user message) |
| `f` | Fork from match point (creates new session) |
| `n` | Navigate (same as Enter) — rewinds current session |
| `c` | Toggle compacted-region search |
| `Tab` | Cycle match detail (compact/expanded/full content) |
| `?` | Show help |
| `/` | Enter search mode / clear query |
| `Esc` | Close overlay |
| `Backspace` | Delete last query character |
| `Ctrl+U` | Clear query |
| printable char | Append to search query |

### 5.2 Component Structure

```typescript
class SessionSearchOverlay implements Component {
  // State
  private query = "";
  private matches: ToolCallMatch[] = [];
  private selected = 0;
  private scroll = 0;
  private searchMode = true;  // typing appends to query
  private scanning = false;
  private expanded = new Set<number>();  // which matches are expanded

  // Dependencies
  private tui: TUI;
  private theme: Theme;
  private done: (result: SessionSearchResult | null) => void;
  private sessionManager: ReadonlySessionManager;

  // Render decomposition
  render(width: number): string[] {
    const w = Math.max(70, Math.min(width, 120));
    const inner = w - 4;

    return [
      this.renderTopBorder(w),
      ...this.renderSearchHeader(inner),
      this.renderDivider(w),
      ...this.renderMatchList(inner),
      this.renderDivider(w),
      ...this.renderFooter(inner),
      this.renderBottomBorder(w),
    ];
  }
}
```

### 5.3 Match Display Modes

Each match can be shown in three detail levels:

**Compact (default):**
```
▸ Turn 3 · 14:23:01 · read · src/auth/validate.ts → result line 23
```

**Expanded (Tab once):**
```
▸ Turn 3 · 14:23:01 · read · src/auth/validate.ts → result line 23
  23:   function myFunction(input: string): boolean {
```

**Full (Tab twice):**
```
▸ Turn 3 · 14:23:01 · read · src/auth/validate.ts → result line 23
  ── arguments ──
  path: "src/auth/validate.ts"
  offset: 1
  limit: 50
  ── result (50 lines) ──
  22:   // Validates user authentication
  23:   function myFunction(input: string): boolean {
  24:     return input.length > 0;
```

### 5.4 Search Result Type

When the user selects a match and closes the overlay, the extension receives a typed result:

```typescript
interface SessionSearchResult {
  match: ToolCallMatch;
  action: "navigate" | "fork";
}
```

The command handler then calls `ctx.navigateTree()` or `ctx.fork()` with the appropriate entry ID.

---

## 6. Navigation: Going to the Match Point

### 6.1 Using `ctx.navigateTree()`

This is the primary navigation method. It rewinds the current session to the match point:

```typescript
pi.registerCommand("session-search", {
  description: "Search tool call arguments and results in session history",
  handler: async (args, ctx) => {
    // If args provided, pre-fill the search query
    const prefill = args.trim() || undefined;

    const result = await ctx.ui.custom<SessionSearchResult | null>(
      (tui, theme, keybindings, done) =>
        new SessionSearchOverlay({
          tui, theme, done,
          sessionManager: ctx.sessionManager,
          prefill,
        }),
      {
        overlay: true,
        overlayOptions: {
          anchor: "center",
          width: "85%",
          maxHeight: "80%",
          margin: 1,
        },
      },
    );

    if (!result) return;  // User cancelled

    const { match, action } = result;

    if (action === "navigate") {
      // Navigate to the parent user message of the tool call
      const targetId = match.parentUserEntryId;
      if (!targetId) {
        ctx.ui.notify("Cannot find parent user message for this tool call", "warning");
        return;
      }

      const navResult = await ctx.navigateTree(targetId, {
        summarize: true,  // Generate summary of abandoned branch
        label: `search:${match.toolName}:${match.toolCallId}`,
      });

      if (navResult.cancelled) {
        ctx.ui.notify("Navigation cancelled", "info");
      }
    }

    if (action === "fork") {
      const targetId = match.parentUserEntryId;
      if (!targetId) {
        ctx.ui.notify("Cannot find parent user message for this tool call", "warning");
        return;
      }

      const forkResult = await ctx.fork(targetId, {
        withSession: async (newCtx) => {
          newCtx.ui.notify(
            `Forked from search match: ${match.toolName} in turn ${match.turnIndex}`,
            "info",
          );
        },
      });

      if (forkResult.cancelled) {
        ctx.ui.notify("Fork cancelled", "info");
      }
    }
  },
});
```

### 6.2 The Navigation UX

When `navigateTree` is called with a user message entry ID:
1. The leaf pointer moves to the parent of that user message
2. The user message text is placed in the editor
3. The user can edit the message and re-submit, creating a new branch

This is exactly what `/tree` does when the user selects a user message. Our extension replicates this behavior but skips the tree-browsing step — the user goes directly to the relevant point.

### 6.3 Integration with Pi's History/Fork UI

The user's original question asked: "maybe there's a way to show the history forking UI of pi itself and have it jump to that tool call?"

Pi's `/tree` command opens a `TreeSelectorComponent` that shows the full session tree. There is no public API for extensions to open `/tree` with a pre-selected entry. The tree selector is internal to the interactive mode.

**Possible approaches:**

1. **Call `ctx.navigateTree()` directly** (our chosen approach) — This changes the session state without showing the tree UI. Simple and effective.

2. **Set editor text to `/tree` and let the user navigate manually** — This opens the tree UI but doesn't pre-select an entry. Not useful.

3. **Contribute a feature request to Pi for programmatic tree navigation** — Pi could expose an API like `ctx.showTree({ preselectEntryId })`. This would be the ideal UX but requires upstream changes.

For now, we use approach 1. We can add a "show in tree" action later if Pi exposes the API.

---

## 7. Extension Registration

### 7.1 Full Registration

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";

let lastSearchSummary: string | null = null;

export default function sessionSearchExtension(pi: ExtensionAPI): void {
  registerPiExtension({
    id: "session-search",
    name: "Session Search",
    description: "Search tool call arguments and results in session history. Navigate to match points to fork.",
    commands: ["session-search"],
    tags: ["search", "history", "fork", "navigation"],

    // Default action: open search UI
    run: async (ctx) => {
      // Delegate to the command handler
      pi.registerCommand("session-search", { /* ... */ });
    },

    actions: [
      {
        id: "search",
        title: "Search session history",
        description: "Search for a string in tool call arguments and results.",
        default: true,
        run: async (ctx) => {
          // Same as the /session-search command
        },
      },
      {
        id: "search-file",
        title: "Search current file history",
        description: "Search for the current file path in tool calls (reads, writes, edits).",
        run: async (ctx) => {
          // Pre-fill with the active file path if determinable
        },
      },
      {
        id: "search-compacted",
        title: "Search including compacted history",
        description: "Search the full JSONL file, including compacted regions.",
        run: async (ctx) => {
          // Enable full-file scanning mode
        },
      },
    ],

    docs: [
      {
        id: "overview",
        title: "Session Search overview",
        markdown: `# Session Search

Search for strings in tool call arguments and results across the entire session history.
Select a match to navigate to that point in the conversation and fork.

## Commands
- \`/session-search [query]\` — Open the search overlay
- \`/session-search myFunction\` — Search for "myFunction" immediately

## Features
- Searches tool call arguments (file paths, content, commands)
- Searches tool results (file content returned by read, output from bash)
- Shows chronological match list with turn numbers and timestamps
- Navigate to match points to fork the conversation
- Fork from match points to create new sessions
- Optional full-file scanning including compacted regions

## Key bindings (in search overlay)
- \`↑↓\` navigate matches
- \`Enter\` navigate to match point
- \`f\` fork from match point
- \`Tab\` cycle match detail (compact/expanded/full)
- \`Esc\` close
`,
      },
    ],

    widgets: [
      {
        id: "last-search",
        title: "Session Search Status",
        defaultZone: "statusBar",
        defaultVariant: "short",
        priority: 70,
        render: ({ variant }) => {
          if (!lastSearchSummary) return "";
          if (variant === "short") return `search:${lastSearchSummary}`;
          return ["Session Search", `Last: ${lastSearchSummary}`];
        },
      },
    ],
  });

  // Register the command
  pi.registerCommand("session-search", {
    description: "Search tool call arguments and results in session history",
    handler: async (args, ctx) => {
      // ... (see Section 6.1 for full implementation)
    },
  });
}
```

---

## 8. File Layout

```
extensions/session-search/
  index.ts        # Extension registration, command handler, event wiring
  scanner.ts      # Branch scanning algorithm, ToolCallMatch type, search logic
  ui.ts           # SessionSearchOverlay component (render + handleInput)
  types.ts        # Shared types: ToolCallMatch, ScanResult, SessionSearchResult
  README.md       # User-facing documentation
```

---

## 9. Implementation Plan (Step by Step)

### Step 1: Types and Scanner (`types.ts`, `scanner.ts`)

Create the data model and the scanning algorithm. Write unit tests using a mock session manager.

**Key files:**
- `extensions/session-search/types.ts` — `ToolCallMatch`, `ScanResult`, `SessionSearchResult`
- `extensions/session-search/scanner.ts` — `scanBranch()`, `searchInObject()`, `findParentUserMessage()`

**Validation:**
```bash
# Run tests
npx tsx extensions/session-search/scanner.test.ts
```

### Step 2: Search Overlay UI (`ui.ts`)

Build the `SessionSearchOverlay` component. Start with a minimal version: search query input + match list + selection.

**Key file:** `extensions/session-search/ui.ts`

**Validation:** Manual test by registering the extension and invoking `/session-search`.

### Step 3: Extension Registration and Command (`index.ts`)

Wire up `registerPiExtension()`, the command handler, and navigation logic.

**Key file:** `extensions/session-search/index.ts`

**Validation:**
```bash
timeout 20 pi --list-models  # Check load errors
/reload
/px                            # Extension appears
/session-search                # Overlay opens
```

### Step 4: Dashboard Widget and Polish

Add the status bar widget, expanded match view, compacted-region search, and "search current file" action.

### Step 5: Testing and Edge Cases

- Empty session (no tool calls)
- Very long tool results (truncation in display)
- Compacted sessions (some matches in compacted regions)
- Multi-branch sessions
- Search strings that match hundreds of times
- Non-ASCII search strings

---

## 10. API Reference

### 10.1 Pi Extension APIs Used

| API | Module | Purpose |
|-----|--------|---------|
| `ExtensionAPI` | `@mariozechner/pi-coding-agent` | Extension entry point type |
| `ExtensionCommandContext` | `@mariozechner/pi-coding-agent` | Command handler context with `navigateTree()`, `fork()` |
| `ReadonlySessionManager` | `@mariozechner/pi-coding-agent` | Read-only session access: `getBranch()`, `getEntries()` |
| `SessionEntry`, `SessionMessageEntry` | `@mariozechner/pi-coding-agent` | Entry type definitions |
| `AgentMessage`, `ToolCall`, `ToolResultMessage` | `@mariozechner/pi-agent-core` / `@mariozechner/pi-ai` | Message type definitions |
| `registerPiExtension` | `../_shared/registry` | Shared extension registration |
| `Component`, `matchesKey`, `Key`, `truncateToWidth`, `visibleWidth`, `wrapTextWithAnsi` | `@mariozechner/pi-tui` | TUI component building blocks |
| `Text`, `Box`, `Container`, `Spacer` | `@mariozechner/pi-tui` | Built-in TUI widgets |

### 10.2 Key Method Signatures

```typescript
// SessionManager methods
getBranch(fromId?: string | undefined): SessionEntry[]
getEntries(): SessionEntry[]
getLeafId(): string | null
getEntry(id: string): SessionEntry | undefined
getSessionFile(): string | undefined

// Navigation (ExtensionCommandContext)
navigateTree(targetId: string, options?: {
  summarize?: boolean;
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
}): Promise<{ editorText?: string; cancelled: boolean }>

fork(entryId: string, options?: {
  position?: "before" | "at";
  withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
}): Promise<{ cancelled: boolean }>
```

### 10.3 Pi Source References

| File | What it contains |
|------|------------------|
| `packages/coding-agent/src/core/session-manager.ts` | SessionManager, entry types, tree logic |
| `packages/coding-agent/src/core/messages.ts` | Extended message types (BashExecutionMessage, etc.) |
| `packages/ai/src/types.ts` | Base message types (UserMessage, AssistantMessage, ToolResultMessage) |
| `packages/agent/src/types.ts` | AgentMessage union type |
| `packages/coding-agent/src/core/tools/read.ts` | Read tool implementation and `ReadToolDetails` |
| `packages/coding-agent/src/core/tools/write.ts` | Write tool implementation |
| `packages/coding-agent/src/core/tools/edit.ts` | Edit tool implementation |
| `packages/coding-agent/src/core/tools/bash.ts` | Bash tool implementation and `BashToolDetails` |
| `packages/coding-agent/dist/core/extensions/types.d.ts` | Extension API type declarations |

### 10.4 Pi Documentation References

| Document | Location |
|----------|----------|
| Session file format | `docs/session.md` (in pi package) |
| Tree navigation | `docs/tree.md` |
| Extension API | `docs/extensions.md` |
| TUI components | `docs/tui.md` |
| Compaction | `docs/compaction.md` |
| Shared extension framework | `docs/pi-shared-extension-framework-guide.md` (this repo) |
| TUI authoring guide | `docs/pi-tui-ui-authoring-guide.md` (this repo) |
| Compaction textbook | `docs/pi-compaction-textbook.md` (this repo) |

---

## 11. Edge Cases and Gotchas

### 11.1 Compacted Entries Are Not in the Branch

After compaction, `getBranch()` only returns entries from `firstKeptEntryId` onward. Tool calls in the compacted region are not in the branch. The compaction summary is a text string, not structured tool-call data.

**Mitigation:** The initial version only searches the current branch. Add a "search compacted" option that reads the raw JSONL file and walks all entries, not just the current branch path.

### 11.2 Orphaned Tool Results

A `ToolResultMessage` references a `toolCallId` from an `AssistantMessage`. If the branch was rewound, the assistant message might not be on the current branch path, but the tool result might still be present (unlikely in practice, but possible).

**Mitigation:** The scanner only processes tool results that have a matching pending tool call. Orphaned results are skipped.

### 11.3 Very Long Tool Results

Bash commands and `read` results can be thousands of lines. Storing the full result text in `ToolCallMatch.resultText` could use a lot of memory.

**Mitigation:** Truncate `resultText` to a reasonable size (e.g., 10KB) for display purposes. Store a flag indicating truncation. The full result is available in the session entry if needed.

### 11.4 Parallel Tool Calls

Pi executes multiple tool calls in parallel within a single assistant message. All tool calls from the same message have the same parent user message. The scanner must handle multiple pending tool calls.

**Mitigation:** The `pendingToolCalls` map in the scanner handles this naturally — each tool call is tracked by its ID, and each result matches its specific call.

### 11.5 Navigating to the First User Message

If a tool call happens in response to the very first user message, there is no parent entry to navigate to. `navigateTree` with `null` leaf resets the session to empty.

**Mitigation:** When `parentUserEntryId` is null, offer to navigate to the root (resetLeaf) or show a warning that forking from this point would restart the session.

### 11.6 Search Performance

A session with 500 entries and 100 tool calls is small. Scanning should take less than 50ms. But sessions with very large tool results (e.g., reading entire codebases) could be slower.

**Mitigation:** Don't concatenate full tool results for every call. Use `includes()` on individual content blocks first. Only build the full `resultText` for matches.

---

## 12. Future Enhancements

1. **Regex search** — Allow regular expressions instead of simple substring matching
2. **Search all branches** — Parse the full JSONL file to find matches in abandoned branches
3. **File filter** — Pre-fill with a file path to search only tool calls involving that file
4. **Tool filter** — Search only specific tools (e.g., only `read` and `write`)
5. **Time range filter** — Search only within a time window
6. **Match diff** — For `edit` tool calls, show a diff of what changed around the match
7. **Pre-select in /tree** — If Pi exposes an API for `ctx.showTree({ preselectEntryId })`, use it instead of `navigateTree` directly
8. **Cross-session search** — Search across all sessions in `~/.pi/agent/sessions/`
9. **Search index persistence** — Cache the scan results in a `CustomEntry` so re-opening the overlay is instant
10. **Fuzzy search** — Use fuzzy matching (like the `/px` launcher) instead of exact substring matching

---

## 13. Full Pseudocode: End-to-End Flow

```
USER INVOKES /session-search "myFunction"
│
├─ Command handler receives args = "myFunction"
│
├─ Create SessionSearchOverlay with prefill = "myFunction"
│   │
│   ├─ Overlay.render() draws the modal frame
│   │   ├─ Search header with query "myFunction█"
│   │   ├─ Match list (empty, scanning...)
│   │   └─ Footer with key hints
│   │
│   ├─ Scanner runs on first render:
│   │   ├─ Get branch from sessionManager.getBranch()
│   │   ├─ Walk entries root→leaf
│   │   ├─ Track turn boundaries (user messages)
│   │   ├─ Collect tool calls from assistant messages
│   │   ├─ Match tool results against pending calls
│   │   ├─ Search arguments and result text for "myFunction"
│   │   └─ Build ToolCallMatch[] (3 matches found)
│   │
│   ├─ Overlay re-renders with matches:
│   │   ├─ Turn 3 · read · src/auth/validate.ts → result line 23
│   │   ├─ Turn 5 · write · src/auth/handler.ts → arguments (content)
│   │   └─ Turn 8 · bash · grep -rn "myFunction" → result line 3
│   │
│   ├─ User presses ↓ to select "Turn 5"
│   ├─ User presses Tab to expand → shows file content snippet
│   ├─ User presses Enter (navigate)
│   │
│   └─ done({ match: turn5Match, action: "navigate" })
│
├─ Command handler receives result
│
├─ Find parentUserEntryId for the match
│   └─ parentUserEntryId = "a1b2c3d4"
│
├─ Call ctx.navigateTree("a1b2c3d4", { summarize: true })
│   ├─ Pi prompts user: "Summarize abandoned branch?"
│   ├─ User selects "Summarize"
│   ├─ Pi generates branch summary
│   ├─ Leaf pointer moves to parent of "a1b2c3d4"
│   ├─ User message text placed in editor
│   └─ User edits and re-submits → new branch created
│
└─ Session continues from the fork point
```

---

## 14. Checklist

Before considering the extension complete:

- [ ] Extension calls `registerPiExtension()` at load time
- [ ] `id: "session-search"` is stable, lowercase, unique
- [ ] `/px` shows the extension with clear name and description
- [ ] Default `run` action opens the search overlay (safe, non-destructive)
- [ ] Named actions have stable IDs and user-facing titles
- [ ] Documentation answers the user's first questions
- [ ] Dashboard widget is cheap to render (just reads `lastSearchSummary` string)
- [ ] `/session-search [query]` command works
- [ ] `timeout 20 pi --list-models` passes (no load errors)
- [ ] `/reload` and `/px` manual smoke tests pass
- [ ] Search finds matches in tool call arguments
- [ ] Search finds matches in tool results
- [ ] Match list shows turn number, timestamp, tool name, file path
- [ ] Selecting a match navigates to the parent user message
- [ ] Fork action creates a new session from the match point
- [ ] Compacted sessions are handled gracefully (warning if matches might be missing)
- [ ] Very long tool results don't crash the overlay
- [ ] Empty sessions show a helpful "No tool calls found" message
