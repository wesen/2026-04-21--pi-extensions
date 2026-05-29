---
Title: Diary
Ticket: UMANS-GLM-COMPACTION
Status: active
Topics:
    - pi
    - compaction
    - pi-extensions
    - settings
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md
      Note: Pi compaction internals documentation used to trace split-turn summarization
    - Path: ../../../../../../../go-go-golems/go-go-parc/Projects/2026/05/29/PROJ - Pi Extensions - Response Viewer Metadata Report.md
      Note: Prior Pi extensions project report supplied as starting context
    - Path: extensions/compaction-title/README.md
      Note: Updated in Step 2 with validation and behavior notes
    - Path: extensions/compaction-title/index.ts
      Note: Patched in Step 2 to disable thinking for Umans title compaction
ExternalSources: []
Summary: Chronological investigation diary for Umans GLM Pi compaction failures caused by thinking/reasoning parameter conflicts.
LastUpdated: 2026-05-29T17:20:00-04:00
WhatFor: Use to resume the UMANS-GLM-COMPACTION ticket without rediscovering evidence, commands, and likely fixes.
WhenToUse: Read before changing Umans provider metadata, Pi compaction request plumbing, or the compaction-title extension.
---



# Diary

## Goal

This diary captures the investigation into Pi compaction failures for `umans/umans-glm-5.1`, especially the `400 cannot specify both 'thinking' and 'reasoning_effort'` error. It records the ticket setup, evidence gathered, likely root cause, workarounds, and follow-up implementation direction.

## Step 1: Create ticket and trace the compaction request path

I created a dedicated docmgr ticket in the Pi extensions repository rather than the current RAG evaluation workspace, because the problem involves Pi extension/provider code and the referenced prior work lives in `/home/manuel/code/wesen/2026-04-21--pi-extensions`. I then traced the failure from the user-visible error string back to Pi's split-turn compaction summarizer and the Umans provider's model compatibility settings.

The initial evidence points to a request-shape conflict: Umans GLM receives both a `thinking` field and a `reasoning_effort` field. Pi's OpenAI-compatible DeepSeek thinking format emits exactly that pair when a reasoning-capable model has thinking enabled. The installed Umans provider already has a defensive hook to remove `reasoning_effort`, but compaction paths can bypass that hook, especially the `compaction-title` extension's direct `compact(...)` call.

### Prompt Context

**User prompt (verbatim):** "WHen I run compaction in pi-agent with umans-glm-5.1 model, I get:  Warning: compaction-title failed; falling back to default compaction: Turn prefix summarization failed: 400 cannot specify both 'thinking' and 'reasoning_effort'

 Auto-compaction failed: Turn prefix summarization failed: 400 cannot specify both 'thinking' and 'reasoning_effort'

Can you investigate why this could happen / if i can configure it differently? we did some work earlier which could give you some starting points: /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/05/29/PROJ - Pi Extensions - Response Viewer Metadata Report.md

Create a new docmgr ticket for fixing the umans-glm pi compaction."

**Assistant interpretation:** Create a new docmgr ticket for the Umans GLM compaction bug, inspect the prior Pi extensions project context, trace why Pi sends incompatible thinking/reasoning parameters during compaction, and identify configuration workarounds.

**Inferred user intent:** Make Pi compaction reliable with `umans/umans-glm-5.1` and preserve the investigation in a structured ticket so a code fix can be implemented later.

### What I did

- Read the referenced Obsidian project report:
  - `/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/05/29/PROJ - Pi Extensions - Response Viewer Metadata Report.md`
- Read Pi's compaction documentation:
  - `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md`
- Searched installed Pi and extension code for:
  - `compaction`
  - `Turn prefix summarization failed`
  - `thinking`
  - `reasoning_effort`
  - `before_provider_request`
- Created the docmgr ticket:
  - `UMANS-GLM-COMPACTION`
  - Path: `/home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/29/UMANS-GLM-COMPACTION--fix-umans-glm-pi-compaction-thinking-reasoning-parameter-conflict`
- Added design doc and diary docs.
- Added initial tasks for confirmation, workaround selection, durable fix design, and validation.
- Ran `pi --list-models umans-glm-5.1` and confirmed Pi sees:
  - provider: `umans`
  - model: `umans-glm-5.1`
  - thinking: `yes`

### Why

- The visible error names the compaction phase: `Turn prefix summarization failed`. Pi docs explain that turn-prefix summarization happens when compaction splits an oversized turn.
- The error text `cannot specify both 'thinking' and 'reasoning_effort'` is a provider request validation error, so the investigation needed to inspect model compat metadata and request-building code rather than only compaction thresholds.
- The warning starts with `compaction-title failed`, so the installed compaction-title extension had to be inspected as part of the request path.

### What worked

- `rg` found the compaction-title extension and prior selective compaction docs in the Pi extensions repo.
- The installed Pi compaction docs directly identified the relevant source modules.
- The installed `pi-provider-umans` code contains an explicit comment explaining the same conflict: Pi's `deepseek` thinking format adds `reasoning_effort` alongside `thinking`, but Umans upstream models only understand `thinking`.
- `pi --list-models umans-glm-5.1` confirmed the active model id starts with `umans-`, which means the provider hook's model-prefix guard should match when the hook runs.

### What didn't work

- `git status --short` in the original working directory failed because `/home/manuel/workspaces/2026-05-27/rag-evaluation-system` is not a git repository:

```text
fatal: not a git repository (or any of the parent directories): .git
```

- A broad `rg` over the installed Pi package produced a huge sourcemap/minified output and was truncated. I switched to focused reads of `dist/core/compaction/compaction.js`, `dist/core/agent-session.js`, `dist/core/sdk.js`, and `pi-ai/dist/providers/openai-completions.js`.
- I did not run a live compaction reproduction against Umans because it would require constructing or using a large session and may consume API quota.
- I first validated frontmatter with paths prefixed by `ttmp/`, which docmgr resolved under the docs root as `ttmp/ttmp/...` and failed with:

```text
Error: open /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/ttmp/2026/05/29/UMANS-GLM-COMPACTION--fix-umans-glm-pi-compaction-thinking-reasoning-parameter-conflict/design-doc/01-umans-glm-compaction-parameter-conflict-investigation.md: no such file or directory
```

  Re-running with paths relative to the doc root, without the leading `ttmp/`, succeeded.

### What I learned

- Umans provider metadata currently sets `compat.thinkingFormat: "deepseek"` and `supportsReasoningEffort: true` for `umans-glm-5.1` and dynamically fetched models.
- Pi AI's `openai-completions` DeepSeek branch does not check `supportsReasoningEffort`; it sends `reasoning_effort` whenever Pi thinking is enabled.
- Pi compaction passes the current Pi thinking level into summarization. With `defaultThinkingLevel: "xhigh"`, compaction summarization is very likely to request reasoning.
- `compaction-title` calls exported `compact(...)` without a `streamFn`, which means it uses `completeSimple()` directly and cannot benefit from extension `before_provider_request` normalization.
- `before_provider_request` is emitted by the extension runner, but the evidence found it wired through SDK `onPayload`. Any compaction or extension path that does not use that wrapper can bypass provider normalization.

### What was tricky to build

The tricky part was distinguishing three related but separate paths:

1. **The core request builder** creates the invalid field pair for `thinkingFormat: "deepseek"` plus enabled thinking.
2. **The Umans provider hook** tries to remove the invalid field pair, but only if a request path runs `before_provider_request`.
3. **Compaction paths** are not all equal: default compaction can receive a stream function, while compaction-title directly calls `compact(...)` without one.

The symptom made this easy to conflate because both the compaction-title attempt and fallback auto-compaction report the same `Turn prefix summarization failed` prefix. The way through was to follow the exact error string into `generateTurnPrefixSummary()`, then follow how `thinkingLevel` becomes `options.reasoning`, and finally inspect how OpenAI-compatible request params are built.

### What warrants a second pair of eyes

- Confirm whether interactive Pi sessions always use the SDK stream function that wires `onPayload`, or whether some interactive paths still use raw `streamSimple`.
- Confirm from Umans API documentation or a redacted payload capture whether the correct field for all Umans reasoning models is indeed `thinking` without `reasoning_effort`.
- Review whether `supportsReasoningEffort: false` should be honored by the `deepseek` branch in Pi AI. The branch currently ignores it, but changing that behavior could affect other DeepSeek-compatible providers.
- Review whether `compaction-title` should be fixed locally or whether Pi core should expose a safe compaction helper for extensions.

### What should be done in the future

- Fix `~/.pi/agent/settings.json` to use `reserveTokens`, not `reservetokens`.
- Try the safe workaround sequence: `/compaction-title off`, set thinking to `off`, run `/compact`, and record whether it succeeds.
- Add request-shape logging or a test harness that asserts Umans GLM requests do not include both `thinking` and `reasoning_effort`.
- Implement the provider/core compatibility fix and validate manual plus auto-compaction.

### Code review instructions

- Start with the design doc:
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/29/UMANS-GLM-COMPACTION--fix-umans-glm-pi-compaction-thinking-reasoning-parameter-conflict/design-doc/01-umans-glm-compaction-parameter-conflict-investigation.md`
- Then inspect request metadata in:
  - `/home/manuel/.pi/agent/npm/node_modules/pi-provider-umans/index.ts`
  - `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/openai-completions.js`
- Then inspect compaction paths in:
  - `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js`
  - `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`
  - `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts`
- Validate with:
  - `pi --list-models umans-glm-5.1`
  - a redacted request-shape smoke test
  - manual `/compact`
  - auto-compaction threshold/overflow test

### Technical details

Key commands run:

```bash
docmgr status --summary-only
cd /home/manuel/code/wesen/2026-04-21--pi-extensions && docmgr status --summary-only
cd /home/manuel/code/wesen/2026-04-21--pi-extensions && docmgr ticket create-ticket --ticket UMANS-GLM-COMPACTION --title "Fix Umans GLM Pi compaction thinking/reasoning parameter conflict" --topics pi,compaction,pi-extensions,settings
cd /home/manuel/code/wesen/2026-04-21--pi-extensions && docmgr doc add --ticket UMANS-GLM-COMPACTION --doc-type design-doc --title "Umans GLM compaction parameter conflict investigation"
cd /home/manuel/code/wesen/2026-04-21--pi-extensions && docmgr doc add --ticket UMANS-GLM-COMPACTION --doc-type reference --title "Diary"
pi --list-models umans-glm-5.1
```

Most important evidence points:

```text
/home/manuel/.pi/agent/npm/node_modules/pi-provider-umans/index.ts:48-55
/home/manuel/.pi/agent/npm/node_modules/pi-provider-umans/index.ts:80-88
/home/manuel/.pi/agent/npm/node_modules/pi-provider-umans/index.ts:253-271
/home/manuel/.pi/agent/settings.json:5
/home/manuel/.pi/agent/settings.json:28-31
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js:422-431
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js:598-612
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/openai-completions.js:449-454
/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js:224-229
/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts:148-157
```

## Step 2: Patch compaction-title to avoid Umans thinking/reasoning conflict

I patched the `compaction-title` extension so its internal title-generation compaction call no longer enables Pi thinking for Umans OpenAI-compatible models. This is intentionally a narrow first fix: it addresses the extension-specific failure path that produced the warning `compaction-title failed; falling back to default compaction`, without changing Pi core or the installed `pi-ai` dependency yet.

The change records in compaction details when the compatibility guard was applied and documents the behavior in the extension README. The normal title prompt, title parsing, state updates, and fallback behavior are otherwise unchanged.

### Prompt Context

**User prompt (verbatim):** "ok, fix compaction-title in /home/manuel/code/wesen/2026-04-21--pi-extensions first. If we were to create a fix for the deepseek, and wanted to test it locally, since it's a npm dependency, how would that work?"

**Assistant interpretation:** First apply a local source fix to the compaction-title extension so it stops triggering the Umans GLM parameter conflict; also explain the later workflow for locally testing a Pi AI dependency patch.

**Inferred user intent:** Reduce the immediate compaction-title failure noise now, then understand the safest way to develop and validate the deeper `deepseek` request-builder fix before publishing or installing it.

### What I did

- Edited `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts`.
- Added `shouldDisableThinkingForProviderCompat(...)`, which returns true for `provider === "umans"` or Umans-looking OpenAI-completions models with `compat.thinkingFormat === "deepseek"`.
- Changed the internal `compact(...)` call to pass `undefined` as the thinking level for those provider-compatible models instead of `pi.getThinkingLevel()`.
- Added `thinkingDisabledForProviderCompat` to the compaction-title details object so future session entries show when the guard was applied.
- Updated `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/README.md` to explain why Umans title compaction disables thinking.
- Ran the extension smoke command:

```bash
cd /home/manuel/code/wesen/2026-04-21--pi-extensions && pi --no-session --no-extensions -e ./extensions/compaction-title --list-models no-such-model 2>&1 | tee /tmp/compaction-title-smoke.log
```

### Why

- `compaction-title` calls Pi's exported `compact()` helper directly from an extension event handler.
- That direct call does not have access to Pi core's normal stream/request wrapper, so provider `before_provider_request` hooks may not run.
- For Umans GLM, passing a non-off thinking level lets Pi AI's DeepSeek request builder emit both `thinking` and `reasoning_effort`, which Umans rejects.
- Disabling thinking only for the extension's internal title-generation call avoids the invalid pair while keeping the main model/session thinking setting unchanged.

### What worked

- The smoke command loaded the extension without syntax/import failure and printed the expected terminal result:

```text
No models matching "no-such-model"
```

- The smoke command also printed enabled-model warnings because package-provided models were not loaded under `--no-extensions`; those warnings were not caused by this patch.

### What didn't work

- I did not run a live `/compact` against `umans/umans-glm-5.1` yet. That remains open because it needs an active Pi session with enough context to trigger compaction and may consume Umans API quota.

### What I learned

- The smallest safe extension-side fix is to avoid passing a thinking level into `compact()` for Umans models.
- A generic hook-preserving fix is not currently available from the extension API: `session_before_compact` exposes preparation data and an abort signal, but not Pi core's provider-normalized stream function.
- The extension can record compatibility behavior in `CompactionEntry.details`, which is useful when inspecting session history later.

### What was tricky to build

The tricky part was choosing between a provider-specific workaround and a more generic request-hook bridge. The generic fix would be cleaner, but `compaction-title` does not currently receive the core `streamFn` that injects `onPayload`, auth headers, timeout, retry settings, and provider request hooks. Importing `streamSimple` directly would still require duplicating hook behavior in the extension.

The resulting patch is deliberately conservative: it only changes the thinking argument for Umans-compatible models in the extension's own compaction call. That avoids broad behavior changes for Anthropic, OpenAI, Google, or other providers where thinking may be important for compaction quality.

### What warrants a second pair of eyes

- Confirm that the model predicate is neither too broad nor too narrow. It currently catches `provider === "umans"` and an Umans-looking DeepSeek/OpenAI-completions shape.
- Confirm whether title-generation compaction quality is acceptable without thinking for Umans GLM.
- Confirm whether the fallback default compaction path still fails with thinking enabled. If it does, the deeper Pi AI/provider fix is still required before auto-compaction is fully reliable.

### What should be done in the future

- Run a real `/compact` smoke with `umans/umans-glm-5.1` and `/compaction-title on`.
- Then implement the deeper Pi AI DeepSeek compatibility fix so default compaction and other direct model calls also stop emitting the invalid field pair.
- Consider adding a Pi extension API for calling core compaction with the same provider-normalized stream path Pi uses internally.

### Code review instructions

- Start with `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts`.
- Review `shouldDisableThinkingForProviderCompat(...)` and the `compact(...)` call in the `session_before_compact` handler.
- Review `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/README.md` for user-facing explanation.
- Validate with:

```bash
cd /home/manuel/code/wesen/2026-04-21--pi-extensions
pi --no-session --no-extensions -e ./extensions/compaction-title --list-models no-such-model
```

- Functional validation still needs a real Pi `/compact` run with `umans/umans-glm-5.1`.

### Technical details

The essential code shape is:

```ts
const thinkingDisabledForProviderCompat = shouldDisableThinkingForProviderCompat(model);
const result = await compact(
  event.preparation,
  model,
  auth.apiKey,
  auth.headers,
  customInstructions,
  event.signal,
  thinkingDisabledForProviderCompat ? undefined : pi.getThinkingLevel(),
);
```

This means the extension still uses Pi's normal compaction helper and prompt, but avoids setting `options.reasoning` for the problematic Umans request shape.
