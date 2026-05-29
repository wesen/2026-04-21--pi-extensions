---
Title: Umans GLM compaction parameter conflict investigation
Ticket: UMANS-GLM-COMPACTION
Status: active
Topics:
    - pi
    - compaction
    - pi-extensions
    - settings
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js
      Note: Core compaction summarization options and turn-prefix error path
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/openai-completions.js
      Note: OpenAI-compatible request parameter construction for deepseek thinking format
    - Path: ../../../../../../../../../.pi/agent/npm/node_modules/pi-provider-umans/index.ts
      Note: Umans provider registration
    - Path: ../../../../../../../../../.pi/agent/settings.json
      Note: Global Pi thinking
    - Path: extensions/compaction-title/README.md
      Note: Documents Umans compatibility behavior for compaction-title
    - Path: extensions/compaction-title/index.ts
      Note: Custom compaction hook that calls compact without a streamFn
ExternalSources: []
Summary: Investigates why Umans GLM 5.1 compaction can send both thinking and reasoning_effort, and outlines configuration workarounds plus durable fixes.
LastUpdated: 2026-05-29T17:20:00-04:00
WhatFor: Use when fixing Pi compaction failures with umans/umans-glm-5.1 or reviewing compaction-title/provider request normalization.
WhenToUse: Use before changing pi-provider-umans, compaction-title, or Pi core compaction request plumbing.
---



# Umans GLM compaction parameter conflict investigation

## Executive Summary

The observed failure is consistent with Pi constructing an OpenAI-compatible chat request for `umans/umans-glm-5.1` that contains both:

```json
{
  "thinking": { "type": "enabled" },
  "reasoning_effort": "..."
}
```

Umans GLM rejects that combination with `400 cannot specify both 'thinking' and 'reasoning_effort'`.

The immediate cause is the Umans provider model compatibility metadata: `umans-glm-5.1` is registered as `reasoning: true` with `compat.thinkingFormat: "deepseek"`. Pi's OpenAI-completions provider maps that format to both `thinking` and `reasoning_effort` whenever a Pi thinking level is enabled. The local `pi-provider-umans` package already tries to strip `reasoning_effort` in a `before_provider_request` hook, but compaction can bypass that hook when compaction uses `completeSimple()` directly or when the interactive agent stream function is plain `streamSimple` rather than the SDK wrapper that attaches `onPayload`.

There are two user-facing mitigations:

1. Turn Pi thinking off before compaction. This prevents `reasoning_effort` from being added while still sending `thinking: { type: "disabled" }` for the DeepSeek-style path.
2. Disable `compaction-title` while debugging (`/compaction-title off`) because that extension currently calls `compact(...)` without passing Pi's stream function, which guarantees the Umans `before_provider_request` hook cannot normalize the payload.

The durable fix should happen in code: either Pi core should consistently run provider payload hooks for compaction summarization, or `pi-provider-umans` should register model compat that never produces the invalid pair in the first place. The cleanest provider-side fix likely requires a Pi AI library change: make the `deepseek` `thinkingFormat` branch respect `compat.supportsReasoningEffort === false`, then set Umans models to `supportsReasoningEffort: false`.

## Problem Statement

When running Pi compaction with the `umans/umans-glm-5.1` model, the UI reports:

```text
Warning: compaction-title failed; falling back to default compaction: Turn prefix summarization failed: 400 cannot specify both 'thinking' and 'reasoning_effort'

Auto-compaction failed: Turn prefix summarization failed: 400 cannot specify both 'thinking' and 'reasoning_effort'
```

This happens specifically during split-turn compaction. Pi has detected that a single turn is too large to keep intact, so it generates a separate "turn prefix" summary. The thrown error text is produced by `generateTurnPrefixSummary()` when the provider response terminates with `stopReason === "error"`.

Scope of this ticket:

- Explain why the invalid request shape can be generated.
- Identify configuration workarounds that do not require code changes.
- Design where the durable code fix should land.
- Preserve evidence for a follow-up implementation.

Out of scope for this initial investigation:

- Actually patching installed global npm packages.
- Running a live compaction call against Umans, because that may consume user API quota and requires a large/synthetic session.

## Current-State Analysis

### 1. The Umans provider marks GLM as reasoning-capable with DeepSeek thinking format

The installed Umans provider package is:

```text
/home/manuel/.pi/agent/npm/node_modules/pi-provider-umans/index.ts
```

Relevant evidence:

- Fallback `umans-glm-5.1` model is registered at lines 48-55 with `reasoning: true` and `compat.thinkingFormat: "deepseek"`.
- Dynamically fetched models are mapped through `mapUmansModel()`, which also sets `reasoning: true` and the same compat object at lines 80-88.
- The provider is registered as OpenAI-compatible chat completions at lines 238-244.

```text
index.ts:48-55
id: "umans-glm-5.1"
reasoning: true
compat: { supportsDeveloperRole: false, supportsReasoningEffort: true, thinkingFormat: "deepseek", ... }

index.ts:80-88
return { ... reasoning: true, compat: { ... supportsReasoningEffort: true, thinkingFormat: "deepseek", ... } }

index.ts:239-244
pi.registerProvider("umans", { baseUrl: "https://api.code.umans.ai/v1", api: "openai-completions", ... })
```

### 2. Pi's OpenAI-completions DeepSeek branch sends both fields when thinking is on

The installed Pi AI provider code is:

```text
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/openai-completions.js
```

At lines 449-454, `compat.thinkingFormat === "deepseek"` produces:

```js
params.thinking = { type: options?.reasoningEffort ? "enabled" : "disabled" };
if (options?.reasoningEffort) {
  params.reasoning_effort = model.thinkingLevelMap?.[options.reasoningEffort] ?? options.reasoningEffort;
}
```

This exactly matches the upstream error: when Pi thinking is enabled, `options.reasoningEffort` is truthy, so both `thinking` and `reasoning_effort` are present.

### 3. Compaction passes the current Pi thinking level into summarization

Pi's compaction code is:

```text
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js
```

At lines 422-426, `createSummarizationOptions()` adds `options.reasoning = thinkingLevel` when the model supports reasoning and the current thinking level is not `off`.

At lines 598-612, `generateTurnPrefixSummary()` calls the summarizer and throws the exact error prefix seen in the UI:

```js
if (response.stopReason === "error") {
  throw new Error(`Turn prefix summarization failed: ${response.errorMessage || "Unknown error"}`);
}
```

This explains why the message says `Turn prefix summarization failed` rather than a normal assistant-turn failure.

### 4. The Umans package already contains a payload-normalization hook

The provider package tries to compensate for the invalid pair:

```text
/home/manuel/.pi/agent/npm/node_modules/pi-provider-umans/index.ts:253-271
```

It registers `before_provider_request` and removes `reasoning_effort` for payloads whose `model` starts with `umans-`.

```ts
pi.on("before_provider_request", (event) => {
  const p = event.payload as Record<string, any>;
  const model: string = p.model ?? "";
  if (!model.startsWith("umans-")) return;

  if ("reasoning_effort" in p) {
    const { reasoning_effort: _, ...rest } = p as any;
    Object.assign(p, rest);
    delete (p as any).reasoning_effort;
  }
});
```

The comment explicitly states the intended invariant: Umans upstream models should receive `thinking` but not `reasoning_effort`.

### 5. The hook is not guaranteed to run for compaction summarization

Pi extension runner can emit `before_provider_request` at:

```text
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js:668-698
```

But repository search found `emitBeforeProviderRequest` wired only through SDK request options:

```text
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js:224-229
```

The SDK wrapper adds `onPayload` and calls `runner.emitBeforeProviderRequest(payload)`. Direct `completeSimple()` calls do not get that hook unless a custom `streamFn` with `onPayload` is passed.

Pi core compaction has two paths:

- Default manual/auto compaction calls `compact(..., this.agent.streamFn)` from `agent-session.js` lines 1314 and 1552.
- The `compaction-title` extension calls exported `compact(...)` directly without a `streamFn` at `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts:148-157`.

That direct extension call explains the first warning: `compaction-title failed; falling back to default compaction`. The default fallback can still fail if the active agent stream function does not include the SDK `onPayload` wrapper, which is plausible because `agent-session.js` contains a special branch for `this.agent.streamFn === streamSimple` at lines 1490-1498.

### 6. Current local settings make the issue likely

Global Pi settings contain:

```json
"defaultThinkingLevel": "xhigh",
"enabledModels": [
  "umans/umans-glm-5.1"
],
"compaction": {
  "enabled": true,
  "keepRecentTokens": 16384,
  "reservetokens": 16384
},
"extensions": [
  "/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts"
]
```

Evidence path:

```text
/home/manuel/.pi/agent/settings.json:5
/home/manuel/.pi/agent/settings.json:21
/home/manuel/.pi/agent/settings.json:28-31
/home/manuel/.pi/agent/settings.json:40
```

Notes:

- `defaultThinkingLevel: "xhigh"` means reasoning is enabled by default for reasoning-capable models.
- `compaction-title` is enabled globally and intercepts `session_before_compact`.
- `reservetokens` is misspelled with a lowercase `t`. Pi's documented setting is `reserveTokens`. This typo probably does not cause the reported 400 because defaults still provide `reserveTokens`, but it is worth fixing separately to make compaction thresholds explicit.

## Configuration Workarounds

### Workaround A: turn thinking off before compaction

Use `/settings` and set Thinking Level to `off`, or use the relevant shortcut if configured. Then run `/compact` again.

Why it helps: Pi only adds `options.reasoning` for compaction when the thinking level is not `off`. With no `reasoningEffort`, the DeepSeek branch sends `thinking: { type: "disabled" }` and does not add `reasoning_effort`.

Tradeoff: the main assistant turn also runs without reasoning until thinking is turned back on.

### Workaround B: disable compaction-title

Run:

```text
/compaction-title off
```

Why it helps: the extension's custom compaction path calls `compact(...)` directly and therefore bypasses provider request normalization. Disabling it removes one failing pre-compaction attempt and lets only default compaction run.

Tradeoff: compaction summaries will no longer auto-generate/update the session title.

### Workaround C: disable auto-compaction temporarily

Edit `~/.pi/agent/settings.json`:

```json
{
  "compaction": {
    "enabled": false,
    "keepRecentTokens": 16384,
    "reserveTokens": 16384
  }
}
```

Why it helps: avoids surprise failed auto-compaction while investigating. Manual `/compact` can still be tested after setting thinking off.

Tradeoff: long sessions may hit context overflow if not compacted manually.

### Workaround D: switch to a model/provider whose compaction payload is accepted

For a one-off compaction, switch to a known-working model, run `/compact`, then switch back to Umans GLM.

Tradeoff: summary style and cost/latency change; the compaction summary is produced by a different model.

## Proposed Durable Fix

### Preferred fix: make provider compat express "thinking only, no reasoning_effort"

The provider package already documents that Umans upstream models only understand the `thinking` field. The model metadata should express that directly instead of relying on a payload hook.

However, the current Pi AI DeepSeek branch ignores `compat.supportsReasoningEffort` and always sends `reasoning_effort` when `options.reasoningEffort` is present. Therefore the preferred durable fix has two steps:

1. Change Pi AI OpenAI-completions DeepSeek handling:

```ts
if (compat.thinkingFormat === "deepseek" && model.reasoning) {
  params.thinking = { type: options?.reasoningEffort ? "enabled" : "disabled" };
  if (options?.reasoningEffort && compat.supportsReasoningEffort !== false) {
    params.reasoning_effort = model.thinkingLevelMap?.[options.reasoningEffort] ?? options.reasoningEffort;
  }
}
```

2. Change `pi-provider-umans` model compat:

```ts
compat: {
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  thinkingFormat: "deepseek",
  requiresReasoningContentOnAssistantMessages: true,
}
```

This fix removes the invalid pair for all Umans requests, including direct `completeSimple()` calls, compaction-title, manual compaction, auto-compaction, and any future extension model calls.

### Secondary fix: make compaction-title use the same request path as Pi core

The compaction-title extension should not call `compact(...)` in a way that bypasses provider request hooks. Options:

1. Add a Pi extension API method for custom compaction summarization that preserves core auth, timeout, retry, and payload hooks.
2. Extend `session_before_compact` event context to expose a safe `streamFn` or `completeSimple` wrapper.
3. Locally implement a Umans-specific `streamFn` wrapper inside compaction-title as a temporary patch.

The best long-term shape is option 1 or 2. Option 3 is too provider-specific for a generic title extension.

### Secondary fix: ensure interactive mode wires `before_provider_request` for default compaction

The code evidence suggests `before_provider_request` is attached via SDK `onPayload`, not universally. A follow-up implementation should verify whether interactive mode always uses the SDK stream function. If any interactive path uses raw `streamSimple`, provider payload hooks will not run for normal turns or default compaction.

## Implementation Plan

### Phase 1: Safe configuration cleanup

1. Change `~/.pi/agent/settings.json` `reservetokens` to `reserveTokens`.
2. In a fresh Pi session, run `/compaction-title off`.
3. Set thinking level to `off` and run manual `/compact` against `umans/umans-glm-5.1`.
4. Record whether compaction succeeds.

### Phase 2: Reproduce and capture payload shape

1. Add temporary diagnostic logging in a local provider hook or wrapper that redacts API keys and writes the request field names to a temp file.
2. Trigger manual split-turn compaction.
3. Confirm whether the failing request contains both `thinking` and `reasoning_effort`.
4. Confirm whether `before_provider_request` fires during:
   - normal assistant turn,
   - compaction-title summarization,
   - default manual compaction,
   - default auto-compaction.

### Phase 3: Patch provider/core compatibility

1. Patch `@earendil-works/pi-ai` OpenAI-completions DeepSeek branch to honor `supportsReasoningEffort === false`.
2. Patch `pi-provider-umans` to set `supportsReasoningEffort: false` for all Umans models.
3. Keep the existing hook as a defensive safety net for one release if desired.
4. Add a small regression test or smoke script that builds a request for a reasoning-enabled Umans model with thinking on and asserts `thinking` is present while `reasoning_effort` is absent.

### Phase 4: Patch compaction-title request path

1. Replace direct `compact(...)` call with a core-provided compaction helper when available.
2. If no helper exists, open a Pi core API issue or add the helper first.
3. Validate that the extension no longer bypasses payload hooks, retry settings, timeout settings, and provider-specific headers.

## Testing and Validation Strategy

Minimum smoke tests:

1. `pi --list-models umans-glm-5.1` still shows `umans/umans-glm-5.1`.
2. Normal assistant turn with `umans/umans-glm-5.1` and thinking on works.
3. Manual `/compact` with thinking off works.
4. Manual `/compact` with thinking on works after the code fix.
5. Auto-compaction threshold trigger works after the code fix.
6. `/compaction-title on` plus `/compact` works after the compaction-title/core fix.

Suggested request-shape assertion:

```ts
assert("thinking" in payload);
assert(!("reasoning_effort" in payload));
```

for `provider === "umans"`, `model === "umans-glm-5.1"`, and thinking enabled.

## Risks and Open Questions

1. **Provider semantics:** The Umans comment says upstream models understand `thinking`, not `reasoning_effort`. Validate whether `thinking: { type: "enabled" }` is accepted by all current Umans models, especially Kimi and Qwen variants.
2. **Interactive request hooks:** Confirm whether interactive Pi uses raw `streamSimple` in some modes. If so, `before_provider_request` may not be a reliable provider-normalization mechanism outside SDK paths.
3. **Installed-package editing:** Directly editing global npm package files is fast but brittle. Prefer source repository changes or package updates where possible.
4. **Compaction-title API gap:** Extension authors need a safe way to reuse core compaction behavior without bypassing provider hooks.

## References

- `/home/manuel/.pi/agent/npm/node_modules/pi-provider-umans/index.ts`
- `/home/manuel/.pi/agent/settings.json`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/openai-completions.js`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js`
- `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts`
- `/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/05/29/PROJ - Pi Extensions - Response Viewer Metadata Report.md`
