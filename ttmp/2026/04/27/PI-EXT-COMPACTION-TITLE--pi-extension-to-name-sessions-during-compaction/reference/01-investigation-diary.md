---
Title: Investigation diary
Ticket: PI-EXT-COMPACTION-TITLE
Status: active
Topics:
    - pi-extensions
    - compaction
    - tokens
    - tooling
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/custom-compaction.ts
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/session-name.ts
ExternalSources: []
Summary: "Chronological notes for investigating whether compaction can generate and store session titles."
LastUpdated: 2026-04-27T10:45:00-04:00
WhatFor: "Use this to resume the compaction-title extension design."
WhenToUse: "Read before implementing or changing the proposed compaction-title extension."
---

# Investigation diary

## Goal

Analyze whether a Pi extension can ask the compaction process to create or update a proper title for the session and store that title durably.

## Context

The user asked for a new docmgr ticket and a detailed intern-facing analysis/design/implementation guide. The task is primarily design analysis, but the ticket also includes scaffold and smoke-test scripts that can be used when implementation begins.

## Timeline

### 2026-04-27 — Ticket creation

Created docmgr ticket:

```bash
docmgr ticket create-ticket \
  --ticket PI-EXT-COMPACTION-TITLE \
  --title "Pi extension to name sessions during compaction" \
  --topics pi-extensions,compaction,tokens,tooling
```

Workspace:

```text
ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction
```

### 2026-04-27 — API research

Read these sources:

```text
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/custom-compaction.ts
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/session-name.ts
```

Confirmed that the required APIs exist:

- `session_before_compact` can provide a custom `CompactionResult`.
- `CompactionPreparation` contains messages, previous summary, first kept entry id, token count, and file operations.
- `session_compact` fires after compaction and exposes the written compaction entry.
- `pi.setSessionName(name)` stores the session display name.
- `pi.getSessionName()` reads the current name.
- `pi.appendEntry(customType, data)` can persist extension metadata.

### 2026-04-27 — Feasibility conclusion

Conclusion: yes, this is possible.

Recommended design: intercept `session_before_compact`, generate both `<session-title>` and `<compaction-summary>` in a single model call, call `pi.setSessionName(title)`, and return the custom compaction summary.

Alternative design: leave compaction untouched, listen to `session_compact`, generate a title from `event.compactionEntry.summary`, and store it with `pi.setSessionName(title)`.

### 2026-04-27 — Ticket scripts

Created scripts:

```text
scripts/01-scaffold-compaction-title-extension.sh
scripts/02-smoke-test-compaction-title-extension.sh
```

The scaffold script writes a proposed extension implementation to:

```text
extensions/compaction-title/index.ts
```

The smoke-test script loads the extension with:

```bash
pi --no-session --no-extensions -e ./extensions/compaction-title --list-models no-such-model
```

## Quick Reference

Recommended event hook:

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  // generate title + summary
  pi.setSessionName(title);
  return { compaction: { summary, firstKeptEntryId, tokensBefore } };
});
```

Relevant title storage API:

```typescript
pi.setSessionName("Readable Session Name");
const current = pi.getSessionName();
```

Relevant compaction data:

```typescript
event.preparation.messagesToSummarize
event.preparation.turnPrefixMessages
event.preparation.previousSummary
event.preparation.firstKeptEntryId
event.preparation.tokensBefore
event.preparation.fileOps
```

## Usage Examples

To scaffold the proposed extension:

```bash
./ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction/scripts/01-scaffold-compaction-title-extension.sh
```

To smoke-test extension loading:

```bash
./ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction/scripts/02-smoke-test-compaction-title-extension.sh
```

To install after scaffolding:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title ~/.pi/agent/extensions/compaction-title
```

## Related

- Design guide: `design/01-analysis-design-and-implementation-guide.md`
- Playbook: `playbooks/01-implementation-and-test-playbook.md`

### 2026-04-27 — Option A implementation

Verified that `compact` is exported from the root `@mariozechner/pi-coding-agent` package. Built the live extension at:

```text
extensions/compaction-title/index.ts
extensions/compaction-title/title.ts
extensions/compaction-title/README.md
```

The implementation uses `session_before_compact`, appends title instructions to `event.customInstructions`, calls Pi's built-in `compact()` helper, parses `## Session Title`, stores the result with `pi.setSessionName(title)`, strips the title section by default, and returns the compaction result.

Installed symlink:

```text
~/.pi/agent/extensions/compaction-title -> /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title
```

Smoke test passed:

```bash
pi --no-session --no-extensions -e ./extensions/compaction-title --list-models no-such-model
./ttmp/2026/04/27/PI-EXT-COMPACTION-TITLE--pi-extension-to-name-sessions-during-compaction/scripts/02-smoke-test-compaction-title-extension.sh
```

Observed:

```text
No models matching "no-such-model"
PASS: compaction-title extension loaded successfully
```
