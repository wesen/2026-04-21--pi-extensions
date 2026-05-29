---
Title: Metadata section for response-view Markdown
Ticket: RESPONSE-METADATA
Status: active
Topics:
    - markdown
    - md-view
    - pi-extension
    - response
    - session-history
DocType: design
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/markdown-recent-viewer/history.ts
      Note: Existing session-history parser for Markdown edit/write tool calls that can be reused or adapted.
    - Path: extensions/response-viewer/index.ts
      Note: Command and action entry points for /response-view, /rv-last, /rv-reopen, and auto-open.
    - Path: extensions/response-viewer/response.ts
      Note: Current response capture, frontmatter rendering, and temp-file write path to extend.
ExternalSources: []
Summary: "Design for adding orientation metadata to response-viewer generated Markdown: YAML frontmatter with absolute paths plus a readable intro with relative links."
LastUpdated: 2026-05-29T08:28:07.8586459-04:00
WhatFor: "Use when implementing richer metadata in /response-view generated Markdown documents."
WhenToUse: "Before changing response-viewer response extraction, Markdown rendering, or recent-document linking."
---

# Metadata section for response-view Markdown

## Problem

`/response-view`, `/rv-last`, and related response-viewer actions currently save the selected assistant response to Markdown and open it in `md-view`. The file contains a small YAML header with session/turn/model fields, followed immediately by the response body.

That is useful for reading, but not enough for later orientation. When a response is opened out of context, the reader should quickly see which session and turn it came from, what title/name was used, and which documents were generated or read in the previous turn. The same information should be available both to humans near the top of the rendered Markdown and to tools via YAML frontmatter.

## Goals

- Add a richer metadata object to response-viewer generated Markdown.
- Include session metadata such as session id, branch/entry id, turn index/number, captured timestamp, model provider/id/name, response title, source extension, and generated file path.
- Include document context from the previous turn:
  - Markdown/documents generated or modified by successful write/edit tool calls.
  - Documents read by successful read tool calls where feasible.
  - Tool call id, tool name, path, existence, and timestamp/entry id when available.
- Use **absolute paths in YAML frontmatter** for machine-readability and unambiguous indexing.
- Use **relative links in the rendered Markdown body** so `md-view` is pleasant to read and links are portable within the repository/session cwd.
- Keep `last-response.md` live-reload behavior unchanged.

## Non-goals

- Do not implement a full session browser in this ticket.
- Do not change md-view itself unless a defect is discovered while validating links.
- Do not capture arbitrary non-document files unless they are part of the immediately relevant previous-turn context.
- Do not add backwards-compatibility shims beyond preserving existing commands and settings.

## Current implementation points

- `extensions/response-viewer/response.ts`
  - `CapturedResponse` already stores `turnIndex`, `capturedAt`, `sessionId`, `entryId`, model fields, `text`, and `textLength`.
  - `getResponsesFromSession(ctx)` walks `ctx.sessionManager.getBranch()` and extracts assistant text blocks.
  - `renderMarkdown(response)` currently emits frontmatter and the response body.
  - `saveToTempFile(response, overrideDir?)` writes both `last-response.md` and a timestamped copy.
- `extensions/response-viewer/index.ts`
  - Commands/actions call `saveToTempFile()` and `openWithMdView()`.
- `extensions/markdown-recent-viewer/history.ts`
  - Shows how to pair assistant `toolCall` blocks with successful `toolResult` messages and normalize paths relative to `ctx.cwd`.
  - Currently handles `edit` and `write` for Markdown files; this ticket needs a narrower previous-turn version that can also include `read` results.

## Proposed data model

Introduce a render context so Markdown rendering can include session/document metadata without overloading `CapturedResponse` with view-only details.

```ts
export interface ResponseDocumentContextItem {
  kind: "generated" | "read";
  toolName: "write" | "edit" | "read";
  toolCallId: string;
  entryId: string;
  absolutePath: string;
  relativePath: string;
  exists: boolean;
  timestamp: string | undefined;
}

export interface ResponseMarkdownMetadata {
  title: string;
  source: "pi-response-viewer";
  sessionId: string;
  responseEntryId: string;
  turnIndex: number;
  turnNumber: number;
  capturedAt: string;
  modelProvider?: string;
  modelId?: string;
  modelName?: string;
  generatedPath?: string;        // absolute path of the file currently being written, if known
  lastResponsePath?: string;     // absolute path to last-response.md, if known
  documents: ResponseDocumentContextItem[];
}
```

The exact TypeScript shape can be adjusted during implementation, but the important boundary is: frontmatter gets absolute paths; body rendering gets relative links.

## Previous-turn document discovery

Recommended approach:

1. Add a helper near response-viewer history/rendering code, for example `getPreviousTurnDocumentContext(ctx, response)`.
2. Walk `ctx.sessionManager.getBranch()` in order.
3. Find the branch entry matching `response.entryId`.
4. Inspect entries between the previous assistant response and the selected assistant response, or more conservatively the immediately preceding user/tool-result cluster for that selected response.
5. Track pending assistant `toolCall` blocks by id.
6. For successful `toolResult` messages:
   - `write`/`edit`: read path from the pending tool-call arguments, require Markdown/document-like extensions (`.md`, `.markdown`, maybe `.mdx`) initially.
   - `read`: read path from the pending tool-call arguments, include if the path is Markdown/document-like or if the user explicitly asks to include all read files in a later setting.
   - Skip errors (`message.isError === true`).
7. Convert paths with `resolve(ctx.cwd, rawPath)` for frontmatter and `relative(ctx.cwd, absolutePath)` for Markdown link labels/targets.
8. Deduplicate by absolute path, preserving whether it was generated, read, or both if implementation chooses to merge kinds.

The phrase “previous turn” should be documented in the implementation. For response-viewer, a practical definition is: files touched/read by tool calls after the previous assistant response and before the selected assistant response. This captures documents the assistant used or produced while composing the selected response.

## YAML frontmatter shape

Prefer lower-case, stable keys for new metadata while preserving existing fields only if needed by downstream tools. Example target:

```yaml
---
title: "Pi Response — Turn 12"
source: "pi-response-viewer"
session:
  id: "/absolute/or/raw/session-id"
  responseEntryId: "entry-..."
  turnIndex: 11
  turnNumber: 12
capturedAt: "2026-05-29T12:34:56.000Z"
model:
  provider: "..."
  id: "..."
  name: "..."
paths:
  lastResponse: "/tmp/pi-response-viewer/last-response.md"
  timestampedCopy: "/tmp/pi-response-viewer/2026-...-turn-12.md"
documents:
  generated:
    - path: "/home/manuel/code/.../ttmp/.../design/01-doc.md"
      relativePath: "ttmp/.../design/01-doc.md"
      toolName: "write"
      toolCallId: "..."
      entryId: "..."
      exists: true
  read:
    - path: "/home/manuel/code/.../extensions/response-viewer/response.ts"
      relativePath: "extensions/response-viewer/response.ts"
      toolName: "read"
      toolCallId: "..."
      entryId: "..."
      exists: true
---
```

Important: absolute paths belong in `documents.*[].path` and `paths.*`. Relative paths may be duplicated in frontmatter as labels, but they are not a substitute for absolute paths.

## Human-readable intro shape

Render a short orientation block before the response text:

```md
# Pi Response — Turn 12

> Session `abc123`, turn 12, captured 2026-05-29 12:34 by `provider/model`.
> This response was generated after reading 2 document(s) and writing 1 document(s).

## Context metadata

- **Session:** `abc123`
- **Turn:** 12 (index 11)
- **Entry:** `entry-...`
- **Model:** `provider/model` (`Model Name`)
- **Generated files from previous turn:**
  - [ttmp/.../design/01-doc.md](../../ttmp/.../design/01-doc.md)
- **Documents read in previous turn:**
  - [extensions/response-viewer/response.ts](../../extensions/response-viewer/response.ts)

---

## Response

<assistant response body>
```

The link target should be computed relative to the generated Markdown file location, not merely relative to `ctx.cwd`, otherwise links from `/tmp/pi-response-viewer/last-response.md` to repo files may break. The label can remain cwd-relative for readability.

## Implementation notes

- Change `renderMarkdown` to accept a richer object or options argument, for example `renderMarkdown(response, metadata)`.
- Change `saveToTempFile` so it knows the target paths before rendering; this allows links to be relative to the generated file location and lets frontmatter include both `lastResponse` and `timestampedCopy` absolute paths.
- Keep YAML escaping centralized. Existing `yamlString()` is minimal; nested metadata may be safer with a small YAML serializer or an explicit, tested renderer.
- Consider extracting shared session-history helpers instead of copying all of `markdown-recent-viewer/history.ts`.
- Validate both current branch and reload behavior because `getResponsesFromSession` intentionally reconstructs responses from session history.

## Acceptance criteria

- `/response-view` generated files include enriched YAML frontmatter with session, model, turn, response entry id, generated output paths, and previous-turn document context.
- The rendered Markdown begins with a concise orientation section before the response body.
- Frontmatter document paths are absolute.
- Markdown body links are relative links and open correctly from both `last-response.md` and timestamped copies.
- Missing files are marked rather than linked incorrectly, or omitted with an explicit count/notice.
- Existing commands (`/response-view`, `/rv`, `/rv-last`, `/rv-preview`, `/rv-reopen`) continue to work.
- Tests or a documented manual validation cover YAML escaping, path relativization, no previous documents, and previous-turn read/write/edit examples.
