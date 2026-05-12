---
Title: Analysis, Architecture & Implementation Guide
Ticket: TAG-EXT-001
Status: active
Topics:
    - pi-extension
    - session-analysis
    - tagging
    - tui
    - transcript-mining
DocType: design
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Comprehensive intern-ready guide for building a pi extension that lets users tag conversation moments with labels like 'refactor' or 'struggle', then mine those tags across session transcripts."
LastUpdated: 2026-05-12T10:59:15.093783168-04:00
WhatFor: "Build the session-tagger pi extension from scratch"
WhenToUse: "When implementing or reviewing the session-tagger extension"
---

# Session Tagger Extension — Analysis, Architecture & Implementation Guide

## Audience

You are a new intern joining the team. You know TypeScript and have used CLI tools before, but you have **no prior experience with pi's extension system**. This document teaches you everything you need: what pi is, how its session store works, how extensions plug into it, and finally how to build the session-tagger extension end-to-end.

Read this document top-to-bottom. Each section builds on the previous one. Code examples are complete and runnable — copy them into a `.ts` file and they work.

---

## 1. Problem Statement

When you work with pi for hours on a complex refactor, the conversation becomes a long, branching timeline of attempts, failures, and breakthroughs. After the session ends, it's nearly impossible to answer questions like:

- *"Where did I get stuck for 30 minutes?"*
- *"Which turns led to the key insight?"*
- *"I want to fork from that moment where I was struggling with the database migration"*

You could re-read the entire transcript, but a 3-hour session might contain 200+ turns. You need **bookmarks with metadata** — short, searchable markers that you drop into the timeline as you work, so you can later mine them for patterns.

### What "session-tagger" does

Session-tagger is a pi extension that lets you:

1. **Tag the current moment** with one or more labels (e.g. `refactor`, `struggle`, `breakthrough`) and an optional free-text comment.
2. **Browse tags in the current session** — see a filterable list of all tagged moments, jump to any of them.
3. **Mine tags across all sessions** — a CLI tool scans every `.jsonl` session file on disk and produces a report of tagged moments, filterable by tag, date range, or project.
4. **Fork from a tagged point** — resume work from any previously tagged moment in the session tree.

### User stories

- **As a developer mid-refactor**, I type `/tag refactor struggle` to mark that I'm stuck, with a comment "can't figure out the join query". Later I can find all "struggle" moments across weeks of sessions.
- **As a developer reviewing past work**, I run `pi-tag scan --tag struggle` and get a chronological list of every time I was stuck, with the surrounding context summarized.
- **As a developer wanting to retry an approach**, I use `/tags` to find my earlier "checkpoint" tag, then fork from that point in the tree.

---

## 2. Background: What Is Pi?

Pi is a coding agent — a terminal-based AI assistant that reads your code, edits files, runs commands, and reasons about your project. You interact with it by typing prompts in a TUI (Terminal User Interface). The LLM (Claude, GPT, etc.) responds by calling tools: `read` a file, `edit` code, `bash` commands, etc.

### Key concepts

| Concept | What it means |
|---------|--------------|
| **Session** | A conversation with pi, stored as a `.jsonl` file on disk. Every user prompt, assistant response, and tool call is recorded. |
| **Entry** | One line in the `.jsonl` file. Entries form a **tree** (not just a list) because you can fork/branch conversations. |
| **Branch** | A path from the tree's root to the current "leaf" entry. The active branch is what the LLM sees. |
| **Tool** | A function the LLM can call (e.g., `bash`, `read`, `edit`). Extensions can register custom tools. |
| **Extension** | A TypeScript module that hooks into pi's lifecycle events and adds custom behavior. |
| **TUI** | The terminal user interface — the editor where you type, the message list, the status bar. |
| **Compaction** | When the conversation gets too long, pi summarizes earlier messages to free up context tokens. |

### Session files on disk

Sessions live under `~/.pi/agent/sessions/`, organized by working directory:

```
~/.pi/agent/sessions/
└── --home-manuel-code-myproject/
    ├── 2026-05-10_14-30-00_abc123.jsonl
    ├── 2026-05-11_09-15-00_def456.jsonl
    └── 2026-05-12_08-00-00_ghi789.jsonl
```

Each `.jsonl` file is one session. You read them line-by-line; each line is a self-contained JSON object.

---

## 3. The Session File Format (In Depth)

Understanding the session file format is **critical** for this extension because we need to both **write** tag entries and **scan** them later. Let's break it down.

### 3.1 Entry types

Every line in a `.jsonl` file is a JSON object with a `type` field. Here are the types that matter:

```
Entry types in a session file:

┌─ session          (header, line 1 — metadata only, not in the tree)
├─ message          (user, assistant, toolResult, bashExecution, custom)
├─ custom_message   (extension-injected messages visible to the LLM)
├─ compaction       (summary of older messages when context overflows)
├─ branch_summary   (summary when switching branches in /tree)
├─ model_change     (user switched models mid-session)
├─ thinking_level_change
├─ session_info     (session display name)
├─ label            (bookmark on an entry — this is what we build on)
└─ custom           (extension state — NOT visible to LLM)
```

### 3.2 The tree structure

Entries form a **tree**, not a flat list. Each entry has an `id` (8-char hex) and a `parentId` pointing to the previous entry:

```
entry_01 (parentId: null)           ← root (first user message)
  └─ entry_02 (parentId: entry_01)  ← assistant response
      └─ entry_03 (parentId: entry_02)  ← user message
          ├─ entry_04 (parentId: entry_03)  ← assistant (branch A)
          │   └─ entry_05 (parentId: entry_04)
          └─ entry_06 (parentId: entry_03)  ← user forked here (branch B)
              └─ entry_07 (parentId: entry_06)
```

The "leaf" is the current position in the tree. When you fork (`/fork`), a new child is created under an earlier entry.

### 3.3 Message entry example

A typical user→assistant→toolResult sequence looks like this in the `.jsonl`:

```json
{"type":"message","id":"a1b2c3d4","parentId":null,"timestamp":"2026-05-12T14:00:01.000Z","message":{"role":"user","content":"Refactor the auth module"}}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2026-05-12T14:00:03.000Z","message":{"role":"assistant","content":[{"type":"text","text":"I'll start by..."},{"type":"toolCall","id":"call_123","name":"read","arguments":{"path":"src/auth.ts"}}],"provider":"anthropic","model":"claude-sonnet-4-5","usage":{...},"stopReason":"toolUse"}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"2026-05-12T14:00:04.000Z","message":{"role":"toolResult","toolCallId":"call_123","toolName":"read","content":[{"type":"text","text":"// auth.ts contents..."}],"isError":false}}
```

### 3.4 The entry types we care about

For the session-tagger extension, two existing entry types are especially relevant:

#### `custom_message` — Extension messages visible to the LLM

```json
{
  "type": "custom_message",
  "id": "i9j0k1l2",
  "parentId": "h8i9j0k1",
  "timestamp": "2026-05-12T14:25:00.000Z",
  "customType": "session-tagger",
  "content": "🏷️ [refactor, struggle] can't figure out the join query",
  "display": true,
  "details": {
    "tags": ["refactor", "struggle"],
    "comment": "can't figure out the join query",
    "timestamp": 1747063500000
  }
}
```

Key fields:
- `customType: "session-tagger"` — our unique identifier, used for both **rendering** and **scanning**.
- `content` — the text shown in the TUI (and sent to the LLM). We format it as a human-readable tag line.
- `display: true` — makes it visible in the TUI timeline.
- `details` — structured metadata for our extension to parse later. Not sent to the LLM.

#### `label` — Bookmarks shown in `/tree`

```json
{
  "type": "label",
  "id": "j0k1l2m3",
  "parentId": "i9j0k1l2",
  "timestamp": "2026-05-12T14:25:00.000Z",
  "targetId": "a1b2c3d4",
  "label": "🏷️ refactor/struggle"
}
```

Key fields:
- `targetId` — which entry this label is attached to.
- `label` — the display text shown in `/tree` navigator.

**Our strategy:** When the user tags a moment, we create *both* a `custom_message` entry (for the visible timeline marker + structured data) *and* a `label` entry (so the tag appears in the `/tree` navigator). This gives us two independent ways to find tagged moments.

---

## 4. The Pi Extension System

Extensions are TypeScript modules that plug into pi's lifecycle. They live in specific directories and are auto-discovered at startup.

### 4.1 Where extensions live

| Location | Scope |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` | Global (all projects) |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdirectory) |
| `.pi/extensions/*.ts` | Project-local |
| `.pi/extensions/*/index.ts` | Project-local (subdirectory) |

Our extension will live at `~/.pi/agent/extensions/session-tagger/index.ts` (global, since tags should work in every project).

### 4.2 Anatomy of an extension

Every extension exports a default function that receives an `ExtensionAPI` object:

```typescript
// ~/.pi/agent/extensions/session-tagger/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subscribe to lifecycle events
  pi.on("session_start", async (event, ctx) => { /* ... */ });

  // Register slash commands
  pi.registerCommand("tag", { /* ... */ });

  // Register custom message renderers
  pi.registerMessageRenderer("session-tagger", (msg, opts, theme) => { /* ... */ });
}
```

The `ExtensionAPI` (`pi`) is your control panel. The `ExtensionContext` (`ctx`) is passed to every event handler and gives you access to the current session, UI, and working directory.

### 4.3 Key APIs we'll use

Here's a quick reference of the APIs this extension uses:

| API | What it does | Where we use it |
|-----|-------------|----------------|
| `pi.registerCommand(name, opts)` | Register a `/command` | `/tag`, `/tags` |
| `pi.registerMessageRenderer(type, fn)` | Custom TUI rendering for `custom_message` entries | Showing tags with colors |
| `pi.sendMessage(msg, opts)` | Inject a `custom_message` entry into the session | Creating the tag entry |
| `pi.setLabel(entryId, label)` | Set a label on an entry (visible in `/tree`) | Tag appears in tree navigator |
| `ctx.sessionManager.getEntries()` | Get all entries in the session | Scanning for existing tags |
| `ctx.sessionManager.getLabel(id)` | Get label for an entry | Checking if already tagged |
| `ctx.sessionManager.getBranch()` | Get entries on current branch | Scanning current branch |
| `ctx.ui.notify(msg, level)` | Show a notification toast | Confirmation messages |
| `ctx.ui.select(title, items)` | Show a selection dialog | Picking from tag list |
| `ctx.ui.input(title, placeholder)` | Text input dialog | Entering tag comment |
| `ctx.ui.custom(factory)` | Custom TUI component | Tag browser overlay |
| `ctx.fork(entryId, opts)` | Fork session from an entry | Fork from tagged point |

### 4.4 Lifecycle events

Pi fires events in a predictable order. For our extension, the most important ones are:

```
pi starts
  │
  ├─► session_start { reason: "startup" }
  │
  ▼
user sends prompt
  │
  ├─► before_agent_start                    ← Could auto-tag here (future)
  ├─► agent_start
  ├─► turn_start / turn_end (repeats)
  └─► agent_end
  │
user types /tag or /tags
  │
  └─► command handler runs directly
  │
/reload or /new
  └─► session_shutdown                       ← Cleanup
```

We don't maintain any in-memory cache. Sessions rarely exceed a few thousand entries, and scanning for `customType === "session-tagger"` is a simple filter that takes under a millisecond. Every command handler calls `findTags()` fresh from `ctx.sessionManager.getEntries()`. This eliminates stale-cache bugs after compaction, branching, or `/reload`.

---

## 5. Architecture

### 5.1 Component diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     session-tagger extension                     │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  /tag command │  │ /tags command │  │ custom message renderer│ │
│  │              │  │              │  │                        │ │
│  │ • Parse args │  │ • findTags() │  │ • Format tag message   │ │
│  │ • Prompt for │  │ • Show UI    │  │ • Color-coded tags     │ │
│  │   comment    │  │ • Jump/fork  │  │ • Expandable details   │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────────┘ │
│         │                 │                                       │
│         ▼                 ▼                                       │
│  ┌──────────────────────────────────┐                            │
│  │    findTags() helper function     │                            │
│  │                                   │                            │
│  │  Scans session entries on demand. │                            │
│  │  No state, no cache, no rebuild. │                            │
│  │  A few thousand entries = <1ms.  │                            │
│  └──────────┬───────────────────────┘                            │
│             │                                                     │
│             ▼                                                     │
│  ┌──────────────────────────────────┐                            │
│  │    pi APIs (write to session)     │                            │
│  │                                   │                            │
│  │  sendMessage() → custom_message   │                            │
│  │  setLabel()    → label entry      │                            │
│  └──────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              pi-tag CLI (separate script)                        │
│                                                                   │
│  Reads .jsonl files directly from ~/.pi/agent/sessions/          │
│  No pi runtime needed — runs as standalone node script           │
│                                                                   │
│  • scan   — list all tagged moments across sessions              │
│  • report — aggregate stats (tag frequency, struggle density)    │
│  • export — dump tags as JSON for external analysis              │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Data flow: Tagging a moment

```
User types: /tag refactor struggle "can't figure out the join query"
                    │
                    ▼
        ┌───── /tag command handler ─────┐
        │                                  │
        │  1. Parse args:                  │
        │     tags = ["refactor", "struggle"]
        │     comment = "can't figure out..."
        │                                  │
        │  2. Find target entry:           │
        │     last assistant message       │
        │                                  │
        │  3. pi.sendMessage({             │
        │       customType: "session-tagger",
        │       content: "🏷️ [refactor, struggle]",
        │       display: true,               │
        │       details: { tags, comment,   │
        │                  targetEntryId }   │
        │     })                            │
        │                                  │
        │  4. pi.setLabel(targetEntryId,    │
        │       "🏷️ refactor/struggle")     │
        │                                  │
        │  4. pi.setLabel(targetEntryId,    │
        │       "🏷️ refactor/struggle")     │
        │                                  │
        │  5. ctx.ui.notify("Tagged!")      │
        └──────────────────────────────────┘
```

### 5.3 Data flow: Browsing tags

```
User types: /tags
            │
            ▼
  ┌─── /tags command handler ────┐
  │                               │
  │  1. findTags(ctx.sessionManager    │
  │       .getEntries())               │
  │     → all TagEntry[]               │
  │                               │
  │  2. Show selection UI:        │
  │     ┌──────────────────────┐  │
  │     │ 🏷️ refactor/struggle  │  │
  │     │   "can't figure out"  │  │
  │     │   14:25 · entry a1b2  │  │
  │     ├──────────────────────┤  │
  │     │ 🏷️ breakthrough       │  │
  │     │   "found the bug"    │  │
  │     │   15:01 · entry d4e5  │  │
  │     └──────────────────────┘  │
  │                               │
  │  3. On select: offer actions: │
  │     • Jump (scroll to entry)  │
  │     • Fork from this point    │
  │     • Remove tag              │
  └───────────────────────────────┘
```

### 5.4 Data model

```typescript
// The structured data stored in custom_message.details
interface TagDetails {
  /** The tag labels (e.g. ["refactor", "struggle"]) */
  tags: string[];
  /** Free-text comment from the user */
  comment: string;
  /** The entry ID that was tagged (usually last assistant message) */
  targetEntryId: string;
  /** Unix timestamp in ms */
  timestamp: number;
}
```

There is no separate in-memory model. The `findTags()` helper scans session entries and returns plain objects derived directly from `TagDetails`. No class, no Maps, no state to manage.

---

## 6. Implementation Guide: `findTags()` Helper

Instead of maintaining an in-memory cache, we use a single pure function that scans session entries on demand. Sessions rarely exceed a few thousand entries (compaction keeps them bounded). Filtering for `customType === "session-tagger"` is a simple string comparison — sub-millisecond even for large sessions.

### 6.1 Implementation

```typescript
/** Scanned tag returned by findTags() */
interface ScannedTag {
  /** The custom_message entry ID */
  entryId: string;
  /** The entry that was tagged */
  targetEntryId: string;
  /** Tag labels */
  tags: string[];
  /** User comment */
  comment: string;
  /** ISO timestamp from the entry */
  timestamp: string;
}

/** Scan session entries for tag markers. No state, no cache. */
function findTags(entries: SessionEntry[]): ScannedTag[] {
  const results: ScannedTag[] = [];
  for (const entry of entries) {
    if (
      entry.type === "custom_message" &&
      (entry as any).customType === "session-tagger" &&
      (entry as any).details
    ) {
      const details = (entry as any).details as TagDetails;
      results.push({
        entryId: entry.id,
        targetEntryId: details.targetEntryId,
        tags: details.tags,
        comment: details.comment,
        timestamp: entry.timestamp,
      });
    }
  }
  return results;
}

/** Extract all unique tag names from a list of scanned tags */
function allTagNames(tags: ScannedTag[]): string[] {
  return [...new Set(tags.flatMap((t) => t.tags))];
}

/** Filter scanned tags by a specific tag name */
function filterByTag(tags: ScannedTag[], tagName: string): ScannedTag[] {
  return tags.filter((t) => t.tags.includes(tagName));
}
```

### 6.2 Why no cache?

An in-memory `TagStore` with Maps and rebuild logic would add:
- A class with two Maps, 5 methods, and rebuild logic
- A sync problem: after `sendMessage()` we'd need to find the just-created entry to add it to the store
- Staleness bugs after compaction, branching, or `/reload`
- Extra complexity to explain and maintain

The scan-on-demand approach is a 15-line function. It's always correct because it reads fresh from `ctx.sessionManager.getEntries()` every time. There's nothing to get out of sync.

---

## 7. Implementation Guide: `/tag` Command

The `/tag` command is the primary user entry point. It accepts tags as positional arguments and an optional quoted comment.

### 7.1 Command syntax

```
/tag <tag1> [tag2] [tag3] ... ["optional comment"]
```

Examples:
```
/tag refactor struggle "can't figure out the join query"
/tag breakthrough
/tag checkpoint "before database migration"
/tag refactor struggle debugging "null pointer in UserService"
```

### 7.2 Implementation

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("tag", {
    description: "Tag the current moment (usage: /tag <tag1> [tag2] ... [\"comment\"])",
    handler: async (args, ctx) => {
      // Parse arguments
      const parsed = parseTagArgs(args);
      if (!parsed) {
        ctx.ui.notify(
          "Usage: /tag <tag1> [tag2] ... [\"comment\"]",
          "warning"
        );
        return;
      }

      const { tags, comment } = parsed;

      // Find the target entry: last assistant message on the current branch
      const branch = ctx.sessionManager.getBranch();
      let targetId: string | undefined;
      for (let i = branch.length - 1; i >= 0; i--) {
        const entry = branch[i];
        if (
          entry.type === "message" &&
          (entry.message as any).role === "assistant"
        ) {
          targetId = entry.id;
          break;
        }
      }
      if (!targetId) {
        // Fall back to the leaf entry
        targetId = ctx.sessionManager.getLeafId();
      }

      const details: TagDetails = {
        tags,
        comment,
        targetEntryId: targetId,
        timestamp: Date.now(),
      };

      // Build display content
      const tagStr = tags.join(", ");
      const content = comment
        ? `🏷️ [${tagStr}] ${comment}`
        : `🏷️ [${tagStr}]`;

      // 1. Inject a custom_message entry (visible in timeline + LLM context)
      pi.sendMessage({
        customType: "session-tagger",
        content,
        display: true,
        details,
      });

      // 2. Set a label on the target entry (visible in /tree)
      pi.setLabel(targetId, `🏷️ ${tagStr}`);

      ctx.ui.notify(`Tagged: [${tagStr}]`, "info");
    },
  });
}

/** Parse "/tag refactor struggle \"comment\"" into { tags, comment } */
function parseTagArgs(
  args: string
): { tags: string[]; comment: string } | null {
  const trimmed = args.trim();
  if (!trimmed) return null;

  // Split respecting quoted strings
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === " " && !inQuotes) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);

  if (parts.length === 0) return null;

  // Last part might be the comment if it was quoted or if it contains spaces
  // Simple heuristic: everything after the tags is the comment
  // Tags are single words; the comment is the last quoted string or multi-word tail
  const tags: string[] = [];
  let comment = "";

  for (const part of parts) {
    // If we've already started collecting comment, append to it
    if (comment) {
      comment += " " + part;
    } else if (part.includes(" ")) {
      // This shouldn't happen with our parser, but be safe
      comment = part;
    } else {
      tags.push(part);
    }
  }

  if (tags.length === 0) return null;
  return { tags, comment };
}
```

### 7.3 Why tag the last *assistant* message, not the leaf?

The "leaf" entry could be a `toolResult` or a `label` — not a meaningful conversation point. The last **assistant** message represents what the AI was doing when you decided to tag. This makes the tag semantically meaningful: *"I was struggling with whatever the AI was doing right here."*

If there's no assistant message (e.g., the user tags before the first AI response), we fall back to the leaf entry.

---

## 8. Implementation Guide: Custom Message Renderer

When we `sendMessage({ customType: "session-tagger", ... })`, pi creates a `custom_message` entry in the session. By default, it renders as plain text. We register a custom renderer to make tags visually distinctive — color-coded, with expandable details.

### 8.1 How registerMessageRenderer works

You call `pi.registerMessageRenderer(customType, renderer)` once during extension setup. Pi calls `renderer(message, options, theme)` every time it needs to draw a message with that `customType` in the TUI.

Parameters:
- `message` — the full message object, with `.content`, `.details`, `.customType`
- `options` — `{ expanded: boolean }` — whether the user has expanded this message
- `theme` — the current TUI theme for colors

You must return a `Component` (from `@mariozechner/pi-tui`). Typically a `Text` or `Box` with themed content.

### 8.2 Implementation

```typescript
import { Box, Text } from "@mariozechner/pi-tui";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Inside the extension factory:
pi.registerMessageRenderer(
  "session-tagger",
  (message, { expanded }, theme) => {
    const details = message.details as TagDetails | undefined;
    const tags = details?.tags ?? [];
    const comment = details?.comment ?? "";

    // Build the tag line
    const tagParts = tags.map((t) => theme.fg("accent", t));
    const tagLine = tagParts.join(theme.fg("dim", ", "));

    // Header: emoji + tags
    let header = theme.fg("accent", "🏷️ ") + "[" + tagLine + "]";
    if (comment) {
      header += " " + theme.fg("text", comment);
    }

    // When expanded, show more detail
    let fullText = header;
    if (expanded && details) {
      const time = new Date(details.timestamp).toLocaleString();
      fullText += "\n" + theme.fg("dim", `  Tagged entry: ${details.targetEntryId}`);
      fullText += "\n" + theme.fg("dim", `  At: ${time}`);
    }

    // Use Box with customMessageBg for consistent styling
    const box = new Box(1, 0, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(fullText, 0, 0));
    return box;
  }
);
```

### 8.3 Tag color coding (optional enhancement)

You could map specific tags to specific colors for quick visual scanning:

```typescript
function tagColor(tag: string): string {
  const map: Record<string, string> = {
    struggle: "error",     // red
    breakthrough: "success", // green
    refactor: "warning",   // yellow
    checkpoint: "accent",   // blue/highlight
    debugging: "muted",     // gray
  };
  return map[tag] ?? "accent";
}

// In the renderer:
const tagParts = tags.map((t) => theme.fg(tagColor(t), t));
```

This gives you a visual language: red = struggling, green = breakthrough, yellow = refactoring.

---

## 9. Implementation Guide: `/tags` Command (Tag Browser)

The `/tags` command opens an interactive browser showing all tagged moments in the current session. The user can filter by tag, and select a tag to jump to or fork from that point.

### 9.1 Implementation

```typescript
pi.registerCommand("tags", {
  description: "Browse tags in the current session",
  handler: async (args, ctx) => {
    const allTags = findTags(ctx.sessionManager.getEntries());
    if (allTags.length === 0) {
      ctx.ui.notify("No tags in this session", "info");
      return;
    }

    // Check if user provided a filter
    const filterTag = args.trim() || undefined;
    const entries = filterTag
      ? filterByTag(allTags, filterTag)
      : allTags;

    if (entries.length === 0) {
      ctx.ui.notify(`No tags matching "${filterTag}"`, "info");
      return;
    }

    // Build selection items
    const items = entries.map((e) => ({
      value: e.entryId,
      label: `[${e.tags.join(", ")}] ${e.comment || "(no comment)"}`,
      description: new Date(e.timestamp).toLocaleTimeString(),
    }));

    // Show selection dialog
    const selected = await ctx.ui.select(
      `Tags (${entries.length})${filterTag ? ` filtered: ${filterTag}` : ""}:`,
      items.map((i) => `${i.label}  ${i.description}`)
    );

    if (!selected) return; // cancelled

    // Parse the selected index
    const idx = items.findIndex(
      (i) => `${i.label}  ${i.description}` === selected
    );
    if (idx === -1) return;
    const tagEntry = entries[idx];

    // Ask what to do
    const action = await ctx.ui.select("Action:", [
      "Fork from this point",
      "Remove tag",
      "Cancel",
    ]);

    if (action === "Fork from this point") {
      const result = await ctx.fork(tagEntry.targetEntryId, {
        position: "at",
        withSession: async (newCtx) => {
          newCtx.ui.notify(
            `Forked from tag: [${tagEntry.tags.join(", ")}]`,
            "info"
          );
        },
      });
      if (result.cancelled) {
        ctx.ui.notify("Fork cancelled", "info");
      }
    } else if (action === "Remove tag") {
      // Clear the label (the custom_message entry stays in the session,
      // but without a label it won't show in /tree)
      pi.setLabel(tagEntry.targetEntryId, undefined);
      ctx.ui.notify("Tag removed", "info");
    }
  },
});
```

### 9.2 Why use `ctx.ui.select` instead of a custom component?

For the initial version, `ctx.ui.select` is simpler and sufficient — it shows a scrollable list the user can pick from. A future version could use `ctx.ui.custom()` to build a rich overlay with tag color-coding, search-as-you-type, and inline previews. But `select` gets us 80% of the value with 10% of the code.

---

## 10. Implementation Guide: Keyboard Shortcut

For quick tagging mid-flow, a keyboard shortcut is faster than typing `/tag ...`.

```typescript
pi.registerShortcut("ctrl+shift+t", {
  description: "Quick-tag the current moment",
  handler: async (ctx) => {
    // Show a dialog to pick tags + enter comment
    const allTags = allTagNames(findTags(ctx.sessionManager.getEntries()));
    const commonTags = [
      "struggle",
      "breakthrough",
      "refactor",
      "debugging",
      "checkpoint",
      "question",
      "insight",
    ];

    // Merge known tags with common tags
    const availableTags = [
      ...new Set([...commonTags, ...allTags]),
    ];

    // Multi-step: pick tag, then comment
    const tag = await ctx.ui.select(
      "Pick tag:",
      [...availableTags, "(custom)"]
    );
    if (!tag) return;

    let tags: string[];
    if (tag === "(custom)") {
      const custom = await ctx.ui.input("Tag name:", "my-tag");
      if (!custom) return;
      tags = [custom.trim()];
    } else {
      tags = [tag];
    }

    const comment = await ctx.ui.input("Comment (optional):", "");

    // Now do the same logic as /tag
    // ... (extract the tagging logic into a shared function)
  },
});
```

This gives you a two-step flow: `Ctrl+Shift+T` → pick tag → optional comment → done.

---

## 11. Implementation Guide: Transcript Mining CLI (`pi-tag`)

The `pi-tag` CLI is a **standalone script** that reads `.jsonl` session files directly from disk. It does **not** run inside pi — it's a separate tool you run in a regular terminal.

### 11.1 Why a separate CLI?

- pi extensions only have access to the **current** session. To mine tags across sessions, we need to read files directly.
- The CLI can be used in shell pipelines, cron jobs, or analysis scripts.
- It has zero runtime overhead — no pi startup, no LLM context.

### 11.2 File layout

```
~/.pi/agent/extensions/session-tagger/
├── index.ts          ← the extension (sections 6-10)
└── pi-tag.ts         ← the CLI script
```

### 11.3 Session file discovery

Session files live under `~/.pi/agent/sessions/` in subdirectories named after the working directory (with `/` replaced by `-`):

```typescript
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const SESSION_DIR = join(homedir(), ".pi/agent/sessions");

async function discoverSessionFiles(): Promise<string[]> {
  const files: string[] = [];
  const dirs = await readdir(SESSION_DIR);
  for (const dir of dirs) {
    const dirPath = join(SESSION_DIR, dir);
    const stat = await stat(dirPath);
    if (!stat.isDirectory()) continue;
    const sessionFiles = await readdir(dirPath);
    for (const f of sessionFiles) {
      if (f.endsWith(".jsonl")) {
        files.push(join(dirPath, f));
      }
    }
  }
  return files.sort();
}
```

### 11.4 Scanning for tags

For each session file, read line-by-line and extract `custom_message` entries with `customType === "session-tagger"`:

```typescript
interface ScanResult {
  sessionFile: string;
  sessionCwd: string;
  sessionId: string;
  tags: ScannedTag[];
}

interface ScannedTag {
  entryId: string;
  tags: string[];
  comment: string;
  targetEntryId: string;
  timestamp: number;
  // Context: the user message before this tag
  precedingUserMessage?: string;
}

async function scanSession(filePath: string): Promise<ScanResult> {
  const content = await readFile(filePath, "utf8");
  const lines = content.trim().split("\n");

  let sessionCwd = "";
  let sessionId = "";
  const tags: ScannedTag[] = [];
  let lastUserMessage = "";

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      if (entry.type === "session") {
        sessionCwd = entry.cwd ?? "";
        sessionId = entry.id ?? "";
        continue;
      }

      // Track last user message for context
      if (
        entry.type === "message" &&
        entry.message?.role === "user"
      ) {
        const content = entry.message.content;
        lastUserMessage =
          typeof content === "string"
            ? content.slice(0, 200)
            : content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text?.slice(0, 200))
                .join(" ");
      }

      // Extract our tags
      if (
        entry.type === "custom_message" &&
        entry.customType === "session-tagger" &&
        entry.details
      ) {
        tags.push({
          entryId: entry.id,
          tags: entry.details.tags ?? [],
          comment: entry.details.comment ?? "",
          targetEntryId: entry.details.targetEntryId ?? "",
          timestamp: entry.details.timestamp ?? 0,
          precedingUserMessage: lastUserMessage,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { sessionFile: filePath, sessionCwd, sessionId, tags };
}
```

### 11.5 CLI interface

```typescript
#!/usr/bin/env npx tsx
// Usage:
//   pi-tag scan [--tag struggle] [--project myproject] [--from 2026-05-01] [--to 2026-05-12]
//   pi-tag report
//   pi-tag export --format json

const command = process.argv[2] ?? "scan";
const args = parseCliArgs(process.argv.slice(3));

async function main() {
  const files = await discoverSessionFiles();
  const results: ScanResult[] = [];

  for (const file of files) {
    const result = await scanSession(file);
    if (result.tags.length > 0) {
      results.push(result);
    }
  }

  // Apply filters
  let filtered = results;
  if (args.tag) {
    filtered = filtered.map((r) => ({
      ...r,
      tags: r.tags.filter((t) => t.tags.includes(args.tag)),
    })).filter((r) => r.tags.length > 0);
  }
  if (args.project) {
    filtered = filtered.filter((r) =>
      r.sessionCwd.includes(args.project)
    );
  }
  if (args.from) {
    const from = new Date(args.from).getTime();
    filtered = filtered.map((r) => ({
      ...r,
      tags: r.tags.filter((t) => t.timestamp >= from),
    })).filter((r) => r.tags.length > 0);
  }
  if (args.to) {
    const to = new Date(args.to).getTime();
    filtered = filtered.map((r) => ({
      ...r,
      tags: r.tags.filter((t) => t.timestamp <= to),
    })).filter((r) => r.tags.length > 0);
  }

  switch (command) {
    case "scan":
      printScanResults(filtered);
      break;
    case "report":
      printReport(filtered);
      break;
    case "export":
      printExport(filtered, args.format ?? "json");
      break;
  }
}

function printScanResults(results: ScanResult[]): void {
  for (const r of results) {
    const relPath = r.sessionCwd.split("/").slice(-2).join("/");
    console.log(`\n📁 ${relPath} (${r.tags.length} tags)`);
    for (const tag of r.tags) {
      const time = new Date(tag.timestamp).toLocaleString();
      const tagStr = tag.tags.join(", ");
      console.log(
        `  🏷️  [${tagStr}] ${tag.comment || ""}`
      );
      console.log(
        `     ${time} · entry ${tag.entryId}`
      );
      if (tag.precedingUserMessage) {
        console.log(
          `     Context: ${tag.precedingUserMessage.slice(0, 100)}...`
        );
      }
    }
  }
}

function printReport(results: ScanResult[]): void {
  const tagCounts = new Map<string, number>();
  let totalTags = 0;

  for (const r of results) {
    for (const tag of r.tags) {
      totalTags++;
      for (const name of tag.tags) {
        tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
      }
    }
  }

  console.log(`\n📊 Tag Report`);
  console.log(`   Sessions with tags: ${results.length}`);
  console.log(`   Total tagged moments: ${totalTags}`);
  console.log(`\n   Tag frequency:`);
  const sorted = [...tagCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  for (const [name, count] of sorted) {
    const bar = "█".repeat(Math.min(count, 40));
    console.log(`   ${name.padEnd(15)} ${bar} (${count})`);
  }
}

main().catch(console.error);
```

---

## 12. Full File Layout & Wiring

### 12.1 Extension directory structure

```
~/.pi/agent/extensions/session-tagger/
├── index.ts           ← Extension entry point (sections 6-10)
│                       Exports default function(pi: ExtensionAPI)
│                       Registers: /tag, /tags, Ctrl+Shift+T,
│                       message renderer
├── find-tags.ts       ← findTags(), allTagNames(), filterByTag() (section 6)
├── tag-colors.ts      ← tagColor() mapping (section 8.3)
├── parse-args.ts      ← parseTagArgs() utility (section 7.2)
└── pi-tag.ts          ← Standalone CLI (section 11)
```

### 12.2 Complete index.ts skeleton

```typescript
// ~/.pi/agent/extensions/session-tagger/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { findTags, allTagNames, filterByTag } from "./find-tags";
import { parseTagArgs } from "./parse-args";
import { tagColor } from "./tag-colors";

export default function (pi: ExtensionAPI) {
  // ── Message renderer ──────────────────────────────────────
  pi.registerMessageRenderer(
    "session-tagger",
    (message, { expanded }, theme) => {
      const details = message.details as TagDetails | undefined;
      const tags = details?.tags ?? [];
      const comment = details?.comment ?? "";

      const tagParts = tags.map((t) => theme.fg(tagColor(t), t));
      const tagLine = tagParts.join(theme.fg("dim", ", "));

      let header = theme.fg("accent", "🏷️ ") + "[" + tagLine + "]";
      if (comment) {
        header += " " + theme.fg("text", comment);
      }

      let fullText = header;
      if (expanded && details) {
        const time = new Date(details.timestamp).toLocaleString();
        fullText += "\n" + theme.fg("dim", `  Entry: ${details.targetEntryId}`);
        fullText += "\n" + theme.fg("dim", `  At: ${time}`);
      }

      const box = new Box(1, 0, (t) => theme.bg("customMessageBg", t));
      box.addChild(new Text(fullText, 0, 0));
      return box;
    }
  );

  // ── /tag command ──────────────────────────────────────────
  pi.registerCommand("tag", {
    description:
      "Tag the current moment (usage: /tag <tag1> [tag2] ... [\"comment\"])",
    handler: async (args, ctx) => {
      const parsed = parseTagArgs(args);
      if (!parsed) {
        ctx.ui.notify(
          "Usage: /tag <tag1> [tag2] ... [\"comment\"]",
          "warning"
        );
        return;
      }
      await applyTag(pi, parsed.tags, parsed.comment, ctx);
    },
  });

  // ── /tags command ─────────────────────────────────────────
  pi.registerCommand("tags", {
    description: "Browse tags in current session",
    handler: async (args, ctx) => {
      // ... (see section 9)
    },
  });

  // ── Quick-tag shortcut ────────────────────────────────────
  pi.registerShortcut("ctrl+shift+t", {
    description: "Quick-tag the current moment",
    handler: async (ctx) => {
      // ... (see section 10)
    },
  });
}

// ── Shared tagging logic ────────────────────────────────────
async function applyTag(
  pi: ExtensionAPI,
  tags: string[],
  comment: string,
  ctx: any
): Promise<void> {
  const branch = ctx.sessionManager.getBranch();
  let targetId: string | undefined;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (
      entry.type === "message" &&
      (entry.message as any).role === "assistant"
    ) {
      targetId = entry.id;
      break;
    }
  }
  if (!targetId) {
    targetId = ctx.sessionManager.getLeafId();
  }

  const details: TagDetails = {
    tags,
    comment,
    targetEntryId: targetId,
    timestamp: Date.now(),
  };

  const tagStr = tags.join(", ");
  const content = comment
    ? `🏷️ [${tagStr}] ${comment}`
    : `🏷️ [${tagStr}]`;

  pi.sendMessage({
    customType: "session-tagger",
    content,
    display: true,
    details,
  });

  pi.setLabel(targetId, `🏷️ ${tagStr}`);

  ctx.ui.notify(`Tagged: [${tagStr}]`, "info");
}
```

---

## 13. Edge Cases, Gotchas & Design Decisions

### 13.1 Compaction and tags

When pi compacts a session (summarizes old messages), it replaces a range of entries with a single `compaction` entry. **Compaction may delete our `custom_message` entries if they are in the compacted range.**

**Mitigation:** Tags are cheap to create and compacted tags are old tags. If the user really cares about a tag, they can re-tag after compaction. For the CLI scanner, we always read the raw `.jsonl` file — but note that compacted sessions will have fewer tags.

**Future enhancement:** The `session_before_compact` event lets us inject our tags into the compaction summary text so they survive compaction.

### 13.2 Branching and tags

When the user branches via `/fork` or `/tree`, the new branch only includes entries on that branch. Tags on other branches are still in the `.jsonl` file but not in the current `getBranch()`. Since `findTags()` reads from `getEntries()` (all entries), it includes tags from all branches. The `/tags` browser should indicate which branch each tag belongs to.

### 13.3 Why custom_message instead of custom entry?

Pi offers two persistence mechanisms:
- `custom` entry (`pi.appendEntry()`) — persisted, but **NOT** visible in the TUI timeline and **NOT** sent to the LLM.
- `custom_message` entry (`pi.sendMessage()`) — persisted, visible in the TUI (with `display: true`), and **IS** sent to the LLM.

We use `custom_message` because:
1. The tag appears visually in the timeline — the user can see it.
2. The tag content goes to the LLM, so the AI knows the user tagged a moment and can adjust its behavior (e.g., if you tag "struggle", the AI might offer a different approach).

### 13.4 Why also set a label?

Labels appear in the `/tree` navigator, which is pi's built-in way to browse conversation history. By setting a label alongside the custom_message, we get **two independent discovery mechanisms**:
1. The `/tags` command (our custom browser).
2. The built-in `/tree` navigator (shows labels, including ours).

This is a belt-and-suspenders approach that gives maximum flexibility.

### 13.5 Tag name normalization

Tag names should be case-insensitive and normalized:

```typescript
function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, "-");
}
```

So `/tag Refactor` and `/tag refactor` produce the same tag.

### 13.6 Multiple tags on the same entry

If the user tags the same assistant message twice, we get two `custom_message` entries. `findTags()` returns them both, and the `/tags` browser shows them both. This is fine — it's like adding multiple annotations. The label is overwritten (only one label per entry), but the latest tag wins for the label text.

---

## 14. API Reference Cheat Sheet

### pi.registerCommand(name, options)

```typescript
pi.registerCommand(name: string, {
  description: string,
  getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null,
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
}): void
```

### pi.registerMessageRenderer(customType, renderer)

```typescript
pi.registerMessageRenderer(
  customType: string,
  renderer: (message, options: { expanded: boolean }, theme: Theme) => Component
): void
```

### pi.sendMessage(message, options?)

```typescript
pi.sendMessage({
  customType: string,      // Your unique identifier
  content: string,          // Text shown in TUI + sent to LLM
  display: boolean,         // true = visible in TUI
  details?: any,            // Structured data (not sent to LLM)
}, {
  triggerTurn?: boolean,    // true = trigger LLM if idle
  deliverAs?: "steer" | "followUp" | "nextTurn",
}): void
```

### pi.setLabel(entryId, label)

```typescript
pi.setLabel(entryId: string, label: string | undefined): void
// undefined clears the label
```

### ctx.sessionManager.getEntries()

```typescript
ctx.sessionManager.getEntries(): SessionEntry[]
// Returns all entries (including all branches)
```

### ctx.sessionManager.getBranch(fromId?)

```typescript
ctx.sessionManager.getBranch(fromId?: string): SessionEntry[]
// Returns entries from root to leaf (or from fromId to leaf)
```

### ctx.ui.select(title, items)

```typescript
const choice = await ctx.ui.select(title: string, items: string[]): Promise<string | undefined>
// Returns selected item string, or undefined if cancelled
```

### ctx.ui.input(title, placeholder)

```typescript
const text = await ctx.ui.input(title: string, placeholder: string): Promise<string | undefined>
// Returns entered text, or undefined if cancelled
```

### ctx.fork(entryId, options?)

```typescript
const result = await ctx.fork(entryId: string, {
  position?: "before" | "at",       // "before" = fork before entry, "at" = duplicate through entry
  withSession?: (ctx) => Promise<void>,  // Callback in new session
}): Promise<{ cancelled: boolean }>
```

---

## 15. File Reference Map

### Pi source (read-only, for understanding internals)

| File | What it contains |
|------|-----------------|
| `packages/coding-agent/src/core/session-manager.ts` | SessionManager class, entry types, tree logic |
| `packages/coding-agent/src/core/messages.ts` | Message type definitions (BashExecutionMessage, CustomMessage, etc.) |
| `packages/agent/src/types.ts` | AgentMessage union type |
| `packages/coding-agent/src/modes/interactive/components/tool-execution.ts` | How tool rows are rendered |

### Pi extension examples (copy patterns from these)

| File | What it demonstrates |
|------|---------------------|
| `examples/extensions/bookmark.ts` | `setLabel()` for entry bookmarks |
| `examples/extensions/message-renderer.ts` | `registerMessageRenderer()` for custom messages |
| `examples/extensions/todo.ts` | Stateful tool with session persistence |
| `examples/extensions/send-user-message.ts` | Injecting messages into the session |
| `examples/extensions/status-line.ts` | Footer status indicators |

### Pi documentation

| File | What it covers |
|------|---------------|
| `docs/extensions.md` | Full extension API reference |
| `docs/session.md` | Session file format, entry types, SessionManager API |
| `docs/tui.md` | TUI component system, custom rendering |
| `docs/keybindings.md` | Keyboard shortcut registration |

---

## 16. Testing Strategy

### 16.1 Manual testing checklist

1. **Basic tagging:** Run `/tag refactor struggle "test comment"` — verify notification appears.
2. **Timeline rendering:** Scroll up — verify the tag message shows with colored tags.
3. **Expand details:** Press `Ctrl+O` on the tag message — verify target entry ID and timestamp appear.
4. **Tree labels:** Run `/tree` — verify `🏷️ refactor/struggle` label appears on the tagged entry.
5. **Browse tags:** Run `/tags` — verify the selection dialog lists the tag.
6. **Filter:** Run `/tags struggle` — verify only matching tags appear.
7. **Fork:** Select a tag → "Fork from this point" — verify new session starts.
8. **Quick tag:** Press `Ctrl+Shift+T` — verify the multi-step dialog works.
9. **Rebuild:** Run `/reload` — verify `/tags` still shows all tags (store rebuilt from entries).
10. **CLI scan:** Run `npx tsx ~/.pi/agent/extensions/session-tagger/pi-tag.ts scan` — verify output.

### 16.2 Edge case testing

- Tag before first AI response (should fall back to leaf entry).
- Tag with no comment.
- Tag with very long comment (should not break rendering).
- Tag with special characters in comment.
- Two tags on the same entry.
- Tag in a branched session (verify tag appears in both branches).
- Session compaction with existing tags.

---

## 17. Future Enhancements

These are **not** in scope for the initial implementation but are natural extensions:

1. **Tag autocomplete:** Use `ctx.ui.addAutocompleteProvider()` to suggest tag names when the user types `/tag ` based on previously used tags.

2. **Tag persistence across compaction:** Hook into `session_before_compact` to embed tag metadata into the compaction summary.

3. **Rich `/tags` browser:** Replace the `ctx.ui.select()` dialog with a `ctx.ui.custom()` overlay component showing tag color-coding, search-as-you-type, and inline message previews.

4. **Tag statistics in the TUI:** Show a footer widget with tag counts (e.g., "🏷️ 3 struggles this session").

5. **Auto-tagging:** Use `agent_end` event to detect patterns (e.g., many failed tool calls → suggest "struggle" tag).

6. **Cross-session timeline:** The `pi-tag` CLI could generate an HTML timeline view showing tagged moments across all sessions.

7. **Tag-based session naming:** Auto-set session name based on the most common tag.

8. **Export to Obsidian:** Use the obsidian-vault-writing skill to push tagged moment summaries into Obsidian notes.

---

## 18. Glossary

| Term | Definition |
|------|-----------|
| **pi** | The coding agent TUI application. Short for "pi-coding-agent". |
| **Extension** | A TypeScript plugin that hooks into pi's lifecycle. |
| **Session** | A conversation stored as a `.jsonl` file on disk. |
| **Entry** | One line in a session file; a node in the conversation tree. |
| **Branch** | A path from root to leaf in the entry tree. |
| **Leaf** | The current end of the active branch. |
| **custom_message** | An entry type for extension-injected messages visible to the LLM. |
| **label** | A bookmark annotation on an entry, visible in `/tree`. |
| **findTags()** | Our scan-on-demand helper that filters session entries for tag markers. No state, no cache. |
| **Compaction** | Summarizing old messages to free context window space. |
| **TUI** | Terminal User Interface — pi's interactive mode. |
| **pi-tag** | Standalone CLI for mining tags across session files. |

