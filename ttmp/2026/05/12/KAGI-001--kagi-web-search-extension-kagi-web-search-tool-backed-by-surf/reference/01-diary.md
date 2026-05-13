---
Title: Diary
Ticket: KAGI-001
Status: active
Topics:
    - pi-extension
    - web-search
    - tools
    - kagi
    - surf
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/kagi-web-search/README.md
      Note: User-facing extension docs (commit e299797)
    - Path: extensions/kagi-web-search/index.ts
      Note: Main extension implementation (commit e299797)
ExternalSources: []
Summary: Implementation diary for kagi-web-search extension
LastUpdated: 2026-05-12T22:00:00-04:00
WhatFor: Track implementation progress and decisions for kagi-web-search
WhenToUse: Read before resuming KAGI-001
---



# Diary

## Goal

Track the implementation of the `kagi-web-search` Pi extension that exposes a `kagi_web_search` tool backed by `surf kagi search --query ...`.

## Step 1: Ticket creation and design

Created the docmgr ticket KAGI-001, confirmed the `surf kagi search` CLI shape, and wrote a concise design document for the extension.

### Prompt Context

**User prompt (verbatim):** "Now create another extension with the kagi_web_search tool that calls `surf kagi search --query ...` ."

**Assistant interpretation:** Implement another Pi extension, analogous to image-qa, registering an LLM-callable `kagi_web_search` tool that delegates to the surf Kagi search command.

**Inferred user intent:** Add a reusable web search capability for the agent, backed by the local surf CLI and discoverable through the shared extension framework.

### What I did
- Confirmed `surf` exists at `/home/manuel/.local/bin/surf`
- Confirmed `surf kagi search --help` exposes `--query`, `--max-results`, and `--timeout-ms`
- Created docmgr ticket KAGI-001
- Added design doc and tasks

### Why
The extension is non-trivial enough to deserve ticket tracking and a diary, especially because it wraps an external/browser-backed CLI.

### What worked
- `surf kagi search --help` returned a clear command contract
- The previous image-qa extension provides a direct implementation pattern

### What didn't work
- N/A

### What I learned
- The command renders Markdown by default and supports structured output only with `--with-glaze-output`; Markdown is the right default for an LLM tool result.

### What was tricky to build
- Nothing tricky yet — this was setup/design.

### What warrants a second pair of eyes
- Whether to expose more surf options later (tab/window/socket path). For v1, keep the tool minimal.

### What should be done in the future
- Implement extension files
- Validate load and smoke test

### Code review instructions
- Start with the design doc, then compare implementation to the `surf kagi search --help` contract.

### Technical details
- Base command: `surf kagi search --query "..."`
- Optional flags planned: `--max-results`, `--timeout-ms`

## Step 2: Implement extension files

Implemented the `kagi-web-search` extension with shared framework registration, an LLM-callable `kagi_web_search` tool, schema settings, a status command, and README docs. The extension passes the standard load check.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Continue from the ticket/design and create the actual extension.

**Inferred user intent:** Deliver a working Kagi web search tool that can be enabled in Pi and discovered through `/px`.

**Commit (code):** e299797 — "feat(kagi-web-search): add kagi_web_search tool backed by surf"

### What I did
- Created `extensions/kagi-web-search/index.ts`
- Created `extensions/kagi-web-search/README.md`
- Registered `kagi_web_search` with parameters `query` and optional `max_results`
- Added schema settings: `maxResults=10`, `timeoutMs=120000`
- Added `/kagi-web-search` status command
- Validated with `timeout 20 pi --list-models` (exit code 0)
- Checked off implementation/docs/validation tasks

### Why
The tool should be available to the agent as a first-class Pi tool, not as ad-hoc bash command text.

### What worked
- `pi.exec("surf", args, ...)` keeps the query out of shell interpolation, so complex queries are safe.
- Load validation passed on the first implementation.

### What didn't work
- N/A

### What I learned
- `surf kagi search` returns Markdown by default, which is ideal for tool output.
- Keeping only `query` + optional `max_results` in the tool schema avoids exposing surf/browser implementation details to the agent.

### What was tricky to build
- Choosing where to put defaults: `maxResults` and `timeoutMs` are extension settings, while `max_results` is an optional per-call override. This keeps the tool convenient without bloating the parameter schema.

### What warrants a second pair of eyes
- Whether `timeoutMs + 5000` is the right Pi exec timeout buffer around surf's own socket timeout.
- Whether `max_results` should allow `0` to mean "all discovered results" like surf does. Current implementation requires positive integers.

### What should be done in the future
- Symlink into `~/.pi/agent/extensions`
- Smoke test command registration and real search

### Code review instructions
- Start at `extensions/kagi-web-search/index.ts`, especially `execute()` arg construction and error handling.
- Validate with `timeout 20 pi --list-models` and a real `surf kagi search --query` call.

### Technical details
- Command built by tool: `surf kagi search --query <query> --max-results <N> --timeout-ms <timeoutMs>`
- Tool returns `stdout.trim() || stderr.trim()` so browser/surf messages are not lost if stdout is empty.
