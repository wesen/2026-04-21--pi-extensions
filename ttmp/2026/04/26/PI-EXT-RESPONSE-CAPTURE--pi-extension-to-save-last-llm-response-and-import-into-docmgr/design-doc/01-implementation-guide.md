---
Title: Implementation Guide
Ticket: PI-EXT-RESPONSE-CAPTURE
Status: active
Topics:
    - pi-extensions
    - documentation
    - tooling
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
      Note: Pi extension events and command API reference
    - Path: extensions/docmgr/docmgr-cli.ts
      Note: |-
        Existing docmgr extension CLI-wrapper patterns to reuse
        Existing docmgr CLI wrapper patterns
    - Path: extensions/response-capture/README.md
      Note: Planned extension usage documentation
    - Path: extensions/response-capture/index.ts
      Note: Planned extension entry point
    - Path: extensions/session-summary/index.ts
      Note: |-
        Existing assistant message extraction pattern
        Existing assistant message text extraction pattern
ExternalSources:
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md:Pi extension event and command API
Summary: |
    Implementation guide for a Pi extension that captures the last assistant/LLM response, saves it as a markdown file, and optionally imports that file into a selected docmgr ticket via `docmgr import file --file ... --ticket ...`.
LastUpdated: 2026-04-26T13:58:00-04:00
WhatFor: Use when implementing the response-capture extension.
WhenToUse: Before writing code for saving/importing the last LLM response into docmgr.
---


# Implementation Guide

## Executive Summary

Build a Pi extension named `response-capture` that remembers the most recent assistant response, writes it to a timestamped markdown file on demand, and optionally imports that file into a docmgr ticket selected interactively by the user.

The core workflow should feel like this:

1. The LLM responds in Pi.
2. The extension records the final assistant message at `turn_end`.
3. The user runs `/response-save` to write that response to a local markdown file.
4. The user runs `/response-import`, chooses a docmgr ticket, and the extension runs:

```bash
docmgr import file --file <saved-response.md> --ticket <chosen-ticket>
```

This should be implemented as a small source-controlled extension under:

```text
extensions/response-capture/
├── index.ts
├── response.ts
├── docmgr.ts
└── README.md
```

The extension should be installed by symlink into:

```text
~/.pi/agent/extensions/response-capture
```

## Problem Statement

Pi sessions often produce useful LLM responses that should become durable project documentation: design sketches, review notes, summaries, implementation plans, or debugging explanations. Today the user can copy/paste manually, but that loses provenance, is tedious, and makes it easy to forget which ticket the content belongs to.

Docmgr already has an import command:

```bash
docmgr import file --file /path/to/doc.md --ticket TICKET-ID
```

The missing piece is a Pi UI workflow that bridges from "the last assistant answer" to "a markdown source imported into this ticket".

## Design Goals

- Capture the last complete assistant response without needing the model to write special tags.
- Save the response as a normal markdown file with useful frontmatter/provenance.
- Let the user choose the target docmgr ticket from active tickets.
- Use docmgr's existing import command rather than reimplementing docmgr internals.
- Make commands safe when there is no assistant response yet.
- Keep saved files in a predictable local cache folder so users can inspect or re-import them.

## Non-Goals

- Do not automatically import every assistant response.
- Do not mutate the assistant response before saving, except for optional metadata/frontmatter wrapping.
- Do not create docmgr tickets. This extension imports into existing tickets.
- Do not parse or classify the response into docmgr doc types. `docmgr import file` imports it into `sources/`.

## Extension API Surface

Use these Pi extension APIs:

```typescript
import type { AssistantMessage, ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function responseCapture(pi: ExtensionAPI): void {
  pi.on("turn_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    // record final assistant response
  });

  pi.registerCommand("response-save", { ... });
  pi.registerCommand("response-import", { ... });
  pi.registerCommand("response-preview", { ... });
}
```

The existing `session-summary` extension demonstrates how to extract text from an assistant message by walking `message.content` and collecting blocks.

## Command UX

### `/response-preview`

Shows a short preview of the currently captured assistant response.

Behavior:

- If no response has been captured, notify: `No assistant response captured yet.`
- If one exists, show turn index, timestamp, length, and first ~1000 characters.

### `/response-save [optional-name]`

Saves the last assistant response as markdown.

Behavior:

- If no response exists, warn and return.
- Build a filename from either the optional name or a timestamp.
- Write to `.pi/response-capture/` under the current project root.
- Store the path as `lastSavedPath` in extension state.
- Notify the user with the saved path.

Example output file:

```markdown
---
Title: Last LLM Response
Source: pi-response-capture
SessionId: 019dc9f2-55cb-7130-a062-c816c36628b6
SessionFile: /home/manuel/.pi/agent/sessions/...jsonl
TurnIndex: 4
CapturedAt: 2026-04-26T14:00:00.000Z
ModelProvider: claude-agent-sdk
ModelId: claude-haiku-4-5
---

# Last LLM Response

<assistant response markdown here>
```

### `/response-import [optional-ticket-or-name]`

Saves if necessary, asks the user to choose a ticket if no ticket argument is provided, then imports the saved file through docmgr.

Behavior:

1. Ensure there is a captured response.
2. If no file has been saved for the current response, save it first.
3. Resolve the ticket:
   - If the command argument matches a ticket ID, use it.
   - Otherwise list active tickets and prompt with `ctx.ui.select()`.
4. Run:

```bash
docmgr import file --file <path> --ticket <ticket>
```

5. Notify success/failure.

### `/response-import-last`

Optional convenience command. Imports `lastSavedPath` without re-saving. This is useful if the user edited the saved markdown file before import.

## State Model

Keep only runtime state. Do not persist by default; the saved file is the persistence boundary.

```typescript
interface CapturedResponse {
  turnIndex: number;
  capturedAt: string;
  sessionId: string;
  sessionFile: string | undefined;
  modelProvider: string | undefined;
  modelId: string | undefined;
  modelName: string | undefined;
  text: string;
  textLength: number;
}

interface ResponseCaptureState {
  lastResponse: CapturedResponse | undefined;
  lastSavedPath: string | undefined;
  lastSavedResponseTurnIndex: number | undefined;
}
```

Important invariant:

```typescript
lastSavedPath is only reusable if lastSavedResponseTurnIndex === lastResponse.turnIndex
```

If a new response arrives, the extension should keep `lastSavedPath` for user reference but not assume it represents the current response.

## Response Extraction

Start with text blocks only. Thinking blocks are not normally appropriate to export as documentation.

```typescript
import type { AssistantMessage } from "@mariozechner/pi-coding-agent";

function extractAssistantText(message: AssistantMessage): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts.join("\n\n").trim();
}
```

Future enhancement: add `/response-save --include-thinking` or a config flag. Keep v1 simple.

## Markdown Serialization

Use a small YAML/string escaping helper. Avoid pulling in a dependency.

```typescript
function yamlString(value: string | undefined): string {
  if (!value) return '""';
  return JSON.stringify(value);
}

function renderCapturedResponse(response: CapturedResponse): string {
  return [
    "---",
    `Title: ${yamlString("Last LLM Response")}`,
    `Source: ${yamlString("pi-response-capture")}`,
    `SessionId: ${yamlString(response.sessionId)}`,
    `SessionFile: ${yamlString(response.sessionFile)}`,
    `TurnIndex: ${response.turnIndex}`,
    `CapturedAt: ${yamlString(response.capturedAt)}`,
    `ModelProvider: ${yamlString(response.modelProvider)}`,
    `ModelId: ${yamlString(response.modelId)}`,
    `ModelName: ${yamlString(response.modelName)}`,
    "---",
    "",
    "# Last LLM Response",
    "",
    response.text,
    "",
  ].join("\n");
}
```

## File Paths

Use project-local cache directory:

```text
.pi/response-capture/
```

Rationale:

- It is near project settings and session-local artifacts.
- It is easy to inspect.
- It avoids polluting the repo root.

Implementation:

```typescript
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function ensureCaptureDir(cwd: string): string {
  const dir = join(cwd, ".pi", "response-capture");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
```

Filename strategy:

```typescript
function safeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "response";
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
```

Saved filename examples:

```text
.pi/response-capture/2026-04-26T14-00-00-000Z-response.md
.pi/response-capture/2026-04-26T14-02-31-000Z-design-review.md
```

## Docmgr Integration

Use CLI calls and JSON output. Do not import docmgr internals.

### List tickets

`docmgr ticket list --with-glaze-output --output json` returns JSON records like:

```json
{
  "ticket": "PI-EXT-RESPONSE-CAPTURE",
  "title": "Pi extension to save last LLM response and import into docmgr",
  "status": "active",
  "path": "2026/04/26/...",
  "tasks_open": 7,
  "tasks_done": 0,
  "topics": "documentation, pi-extensions, tooling"
}
```

Implementation helper:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface TicketRecord {
  ticket: string;
  title: string;
  status: string;
  path: string;
}

async function listTickets(cwd: string): Promise<TicketRecord[]> {
  const { stdout } = await execFileAsync(
    "docmgr",
    ["ticket", "list", "--with-glaze-output", "--output", "json"],
    { cwd, maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as TicketRecord[];
}
```

Filter active tickets first, but allow importing into complete tickets if the user passes the exact ticket ID.

### Select ticket

```typescript
async function chooseTicket(ctx: ExtensionCommandContext, arg: string): Promise<string | undefined> {
  const tickets = await listTickets(ctx.cwd);
  const trimmed = arg.trim();

  if (trimmed) {
    const direct = tickets.find((t) => t.ticket === trimmed);
    if (direct) return direct.ticket;
  }

  const active = tickets.filter((t) => t.status === "active");
  const labels = active.map((t) => `${t.ticket} — ${t.title}`);
  const choice = await ctx.ui.select("Import response into ticket", labels);
  if (!choice) return undefined;
  return choice.split(" — ")[0];
}
```

### Import file

```typescript
async function importFile(cwd: string, file: string, ticket: string, name?: string): Promise<string> {
  const args = ["import", "file", "--file", file, "--ticket", ticket];
  if (name) args.push("--name", name);
  const { stdout, stderr } = await execFileAsync("docmgr", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return [stdout, stderr].filter(Boolean).join("\n");
}
```

## Extension Skeleton

```typescript
import type { AssistantMessage, ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export default function responseCapture(pi: ExtensionAPI): void {
  const state: ResponseCaptureState = {
    lastResponse: undefined,
    lastSavedPath: undefined,
    lastSavedResponseTurnIndex: undefined,
  };

  pi.on("turn_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const text = extractAssistantText(event.message as AssistantMessage);
    if (!text) return;

    state.lastResponse = {
      turnIndex: event.turnIndex,
      capturedAt: new Date().toISOString(),
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile(),
      modelProvider: ctx.model?.provider,
      modelId: ctx.model?.id,
      modelName: ctx.model?.name,
      text,
      textLength: text.length,
    };
  });

  pi.registerCommand("response-preview", {
    description: "Preview the last captured assistant response",
    handler: async (_args, ctx) => previewResponse(ctx, state),
  });

  pi.registerCommand("response-save", {
    description: "Save the last assistant response to .pi/response-capture",
    handler: async (args, ctx) => {
      const path = saveLastResponse(ctx, state, args.trim() || undefined);
      if (path) ctx.ui.notify(`Saved response: ${path}`, "info");
    },
  });

  pi.registerCommand("response-import", {
    description: "Save and import the last assistant response into a docmgr ticket",
    handler: async (args, ctx) => importLastResponse(ctx, state, args),
  });
}
```

## Error Handling

| Situation | Behavior |
|---|---|
| No captured response | Warn: `No assistant response captured yet.` |
| Last response is empty text | Do not overwrite existing state; optionally warn in debug command. |
| Save directory cannot be created | Notify error with path and exception message. |
| `docmgr` not found | Notify error: `docmgr executable not found on PATH`. |
| Ticket list JSON parse fails | Notify error and include first 500 chars of stdout. |
| User cancels ticket select | Do nothing and notify `Import cancelled`. |
| Import command fails | Notify error with stderr/stdout. |

Use `execFile`, not shell string concatenation, for docmgr commands. This avoids quoting bugs when file paths contain spaces.

## Testing Plan

### Local command tests

1. Start Pi with the extension installed.
2. Ask a trivial question so the assistant responds.
3. Run:

```text
/response-preview
```

Expected: preview notification contains the response.

4. Run:

```text
/response-save test-response
```

Expected: file exists under `.pi/response-capture/`.

5. Inspect the file:

```bash
ls -la .pi/response-capture
sed -n '1,80p' .pi/response-capture/*test-response*.md
```

### Import tests

1. Run:

```text
/response-import PI-EXT-RESPONSE-CAPTURE
```

Expected: docmgr imports the markdown file into this ticket's `sources/` directory.

2. Run with no arg:

```text
/response-import
```

Expected: ticket picker appears and import succeeds after selecting a ticket.

3. Verify:

```bash
docmgr doc list --ticket PI-EXT-RESPONSE-CAPTURE
find ttmp/2026/04/26/PI-EXT-RESPONSE-CAPTURE--pi-extension-to-save-last-llm-response-and-import-into-docmgr/sources -type f -maxdepth 2
```

### Failure tests

- Run `/response-save` before any assistant response; expect warning.
- Temporarily move `docmgr` out of PATH or run in a constrained PATH; expect useful error.
- Run `/response-import DOES-NOT-EXIST`; expect ticket picker or clear error.

## Implementation Phases

### Phase 1: Pure capture and save

Create:

```text
extensions/response-capture/response.ts
extensions/response-capture/index.ts
```

Implement:

- assistant text extraction,
- runtime state,
- markdown rendering,
- `/response-preview`,
- `/response-save`.

Commit after this phase.

### Phase 2: Docmgr ticket selection and import

Create:

```text
extensions/response-capture/docmgr.ts
```

Implement:

- `listTickets(cwd)`,
- `chooseTicket(ctx, arg)`,
- `importFile(cwd, file, ticket, name?)`,
- `/response-import`.

Commit after tmux validation.

### Phase 3: Documentation and install

Create:

```text
extensions/response-capture/README.md
```

Install symlink:

```bash
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-capture ~/.pi/agent/extensions/response-capture
```

Validate in tmux and update this doc if implementation differs.

## Open Questions

1. Should the extension include assistant thinking blocks? Recommendation: no for v1.
2. Should import use `--name` automatically? Recommendation: yes, pass the generated title/slug when available.
3. Should saved files be committed? Recommendation: no; `.pi/response-capture/` should remain a local cache unless the user intentionally imports or copies a file.
4. Should the extension persist state across reloads? Recommendation: no for v1; saved files are the persistence layer.

## Changelog Notes for Implementation

When implementing, update the ticket changelog with entries like:

```bash
docmgr changelog update --ticket PI-EXT-RESPONSE-CAPTURE \
  --entry "Implemented response-capture save command and markdown renderer" \
  --file-note "/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-capture/index.ts:Extension entry point" \
  --file-note "/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-capture/response.ts:Response serialization helpers"
```
