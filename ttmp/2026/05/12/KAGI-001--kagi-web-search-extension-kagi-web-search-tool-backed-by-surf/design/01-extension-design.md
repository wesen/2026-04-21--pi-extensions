---
Title: Extension Design
Ticket: KAGI-001
Status: active
Topics:
    - pi-extension
    - web-search
    - tools
    - kagi
    - surf
DocType: design
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design for the kagi-web-search Pi extension exposing kagi_web_search backed by surf kagi search"
LastUpdated: 2026-05-12T22:00:00-04:00
WhatFor: "Implementation reference for the kagi-web-search extension"
WhenToUse: "Read before implementing or modifying kagi-web-search"
---

# kagi-web-search Extension Design

## Goal

Create a Pi extension (`kagi-web-search`) that registers an LLM-callable tool `kagi_web_search`. The tool delegates to the local surf browser automation CLI:

```bash
surf kagi search --query "search terms"
```

The result is returned to the agent as Markdown text.

## Tool Contract

### Tool name

`kagi_web_search`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | yes | Search query to run on Kagi. |
| `max_results` | `number` | no | Optional per-call maximum result count. Defaults to extension setting (`10`). |

### Behavior

1. Validate that `query` is not empty.
2. Choose `max_results` from the parameter if present, otherwise from extension state.
3. Execute:

```bash
surf kagi search \
  --query "..." \
  --max-results "N" \
  --timeout-ms "120000"
```

4. Return stdout as the tool result.
5. If `surf` exits non-zero, return stdout/stderr and mark details as an error.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `maxResults` | `number` | `10` | Default maximum result rows. |
| `timeoutMs` | `number` | `120000` | surf socket timeout in milliseconds and Pi exec timeout. |

## Extension Contributions

- `registerPiExtension()` metadata for `/px` discovery
- Schema settings for `maxResults` and `timeoutMs`
- README registered as extension docs
- `/kagi-web-search` slash command that shows current settings
- `kagi_web_search` LLM-callable tool

## Implementation Notes

Use `pi.exec("surf", args, { signal, timeout: timeoutMs + 5000 })` rather than shell interpolation. Passing argv directly avoids quoting issues for complex search queries.
