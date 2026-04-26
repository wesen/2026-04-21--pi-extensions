---
Title: Diary
Ticket: PI-EXT-AGENT-ENV
Status: active
Topics:
    - pi-extensions
    - agent
    - environment
    - metadata
DocType: reference
Intent: long-term
Owners:
    - manuel
RelatedFiles:
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design-doc/01-plan-review-and-revised-design.md
      Note: Plan review recorded in diary Step 3
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/01-analysis.md
      Note: Analysis document referenced in diary Step 1
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/01-analysis.md:Analysis document with API exploration
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/02-design.md
      Note: Design document referenced in diary Step 2
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/02-design.md:Design document with architecture
ExternalSources: []
Summary: |
    Step-by-step implementation diary for the PI_AGENT_* environment variable injection extension. Records prompts, decisions, failures, and open items.
LastUpdated: 2026-04-26T00:00:00Z
WhatFor: ""
WhenToUse: ""
---




# Diary

## Goal

Build a PI extension that exposes agent metadata as `PI_AGENT_*` environment
variables during `bash` tool calls and `!` / `!!` user commands. Keep a
chronological record of research, design decisions, implementation, and testing.

---

## Step 1: Ticket Creation and API Research

Created the docmgr ticket `PI-EXT-AGENT-ENV` and began researching how PI
extensions can intercept bash execution to inject environment variables.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to build an extension that exposes PI coding agent metadata as PI_AGENT_XXX environment variables when doing a bash tool call, things like session_id, turn_id, etc... Create a design / analysis / implementation document to the ticket. Keep a diary (see skill) as you work."

**Assistant interpretation:** Create a structured docmgr ticket with analysis and design documents, and keep a running diary of the work.

**Inferred user intent:** The user wants a well-documented, planned extension implementation with full traceability via docmgr and a diary.

### What I did
- Ran `docmgr ticket create-ticket --ticket PI-EXT-AGENT-ENV --title "PI Agent Metadata Environment Variables Extension" --topics pi-extensions,agent,environment,metadata`
- Added 5 tasks to the ticket covering research, design, implementation, testing, and documentation
- Read the PI extension type definitions at `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`
- Read the bash tool implementation at `dist/core/tools/bash.js` and `dist/core/tools/bash.d.ts`
- Read the official `bash-spawn-hook.ts` example
- Read the `AgentSession._buildRuntime` and `_refreshToolRegistry` methods to understand how extension tools override built-in tools
- Read existing extensions in this repo (`session-summary`, `docmgr`) for patterns

### Why

I needed to understand:
1. What PI extension events are available for intercepting bash execution
2. Whether I can mutate tool inputs vs. overriding the entire tool
3. What metadata is accessible from `ExtensionContext` and lifecycle events
4. How built-in tools interact with extension-registered tools

### What worked

- `docmgr ticket create-ticket` worked immediately
- The `ExtensionEvent` union in `types.d.ts` is comprehensive: `tool_call`, `user_bash`, `session_start`, `turn_start`, `model_select`, etc.
- The `tool_call` event explicitly allows in-place mutation of `event.input`
- Built-in tools and extension tools live in the same registry; extension tools overwrite built-in ones by name (`definitionRegistry.set()` overwrites)
- `BashOperations.exec` accepts an `env?: NodeJS.ProcessEnv` parameter
- `createLocalBashOperations` is exported from the public API

### What didn't work

- `getShellEnv` is NOT exported from the public API (only used internally in `createLocalBashOperations`). This means if I want to build env from the shell's base env, I have to either call `createLocalBashOperations` and let it handle it, or use `process.env` as a proxy.

### What I learned

- The bash tool spawns `bash -c` (or `sh -c` fallback) via `child_process.spawn`
- `commandPrefix` and `shellPath` are applied inside `createBashToolDefinition`, not in the event layer
- `ExtensionContext` does NOT expose `settingsManager`, so an extension cannot easily read the user's `commandPrefix` or `shellPath` settings
- `ReadonlySessionManager` exposes: `getSessionId`, `getSessionFile`, `getSessionDir`, `getSessionName`, `getLeafId`, `getCwd`, `getBranch`, etc.
- `_refreshToolRegistry` shows that extension-registered tools override built-ins by name, but overriding the `bash` tool means losing `commandPrefix`/`shellPath` unless we re-implement them

### What was tricky to build

Deciding between the two main approaches:
1. **Tool call mutation** (prepend `export` to command) — simple, safe, but LLM-visible
2. **spawnHook override** (register custom bash tool) — clean, invisible, but complex and risks divergence

The trade-off is cosmetic noise vs. implementation complexity + upgrade risk. I chose approach 1 for v1 because the user values functionality and the exports are actually informative. Approach 2 is documented as a future enhancement.

### What warrants a second pair of eyes

- The shell escaping function: `shellEscape(value)` uses `"` + backslash escaping. Need to verify this handles edge cases like `$(cmd)` — actually, double-quote escaping prevents interpolation, so `$()` is treated as literal text. This is the correct behavior for env vars.
- Value truncation at 4096 chars: need to confirm this doesn't break multi-byte UTF-8 characters.

### What should be done in the future

1. **v2: spawnHook mode** — Add a toggle to use the invisible `spawnHook` approach once PI provides a cleaner way to override built-in tools without losing settings.
2. **v2: Additional vars** — `PI_AGENT_CONTEXT_TOKENS`, `PI_AGENT_CONTEXT_WINDOW`, `PI_AGENT_BRANCH_DEPTH`.
3. **v2: Per-tool opt-in** — Allow configuring which tools get env vars (e.g., also `exec` or custom tools).

### Code review instructions

- Start with `design/01-analysis.md` to understand the API exploration
- Then `design/02-design.md` for the architecture decisions
- The eventual implementation will be in `extensions/agent-env/index.ts`
- Key correctness risks: shell escaping, state consistency across events

### Technical details

Key APIs used:

```typescript
// Event hooks
pi.on("tool_call", (event, ctx) => { ... });
pi.on("user_bash", (event, ctx) => { ... });
pi.on("session_start", (event, ctx) => { ... });
pi.on("turn_start", (event, ctx) => { ... });
pi.on("model_select", (event, ctx) => { ... });

// Context metadata
ctx.cwd
ctx.sessionManager.getSessionId()
ctx.sessionManager.getSessionFile()
ctx.sessionManager.getSessionDir()
ctx.sessionManager.getSessionName()
ctx.sessionManager.getLeafId()
ctx.model?.provider
ctx.model?.id
ctx.model?.name

// Bash operations factory (exported from public API)
import { createLocalBashOperations } from "@mariozechner/pi-coding-agent";
```

---

## Step 2: Design Document Production

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Produce formal design and analysis documents in the ticket workspace based on the API research.

**Inferred user intent:** Create durable documentation that captures the design decisions and enables future implementation or hand-off.

### What I did

- Wrote `design/01-analysis.md` with:
  - Problem statement
  - Available metadata sources table
  - Three API approaches compared (tool_call mutation, spawnHook override, user_bash interception)
  - Comparison matrix
  - Recommendation with rationale
  - Proposed env var schema
  - Shell escaping strategy
  - Risks and mitigations

- Wrote `design/02-design.md` with:
  - Executive summary
  - Architecture diagram (ASCII)
  - State management specification
  - Injection mechanisms for both LLM bash and user bash
  - Complete environment variable schema
  - Toggle commands
  - File layout
  - Error handling policy
  - Testing plan
  - Open questions

### What worked

- The analysis document clearly articulates why `tool_call` mutation is the right v1 choice
- The design document provides enough detail for implementation without ambiguity
- Both documents follow the docmgr `_templates/design-doc.md` frontmatter format

### What didn't work

- N/A — documents were produced without issues

### What I learned

- Writing the comparison matrix forced me to explicitly weigh `commandPrefix`/`shellPath` preservation, which tipped the decision toward mutation for v1
- The `user_bash` path is straightforward with `createLocalBashOperations` but only covers `!`/`!!` commands
- Documenting the state update rules revealed that `cwd` and `leafId` should be refreshed on every event, not just `turn_start`

### What was tricky to build

Nothing tricky in this step — the challenge was the prior research step of understanding the PI internals.

### What warrants a second pair of eyes

- Confirm the env var schema matches what downstream scripts actually need
- Verify that `PI_AGENT_TURN_INDEX` starting at 0 (from `turn_start`) matches user expectations vs. 1-based display

### What should be done in the future

- Implement the extension in `extensions/agent-env/`
- Create integration tests
- Add the extension to the repo README

### Code review instructions

- Review `design/01-analysis.md` for factual correctness about PI APIs
- Review `design/02-design.md` for completeness of the state machine and error handling
- Check that all metadata sources are actually available at the documented event times

### Technical details

Ticket path: `ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/`

Files created:
- `design/01-analysis.md` — 9.4 KB
- `design/02-design.md` — 7.9 KB
- `reference/01-diary.md` — this file
---

## Step 3: Independent Plan Review and Revised Design

We took over the ticket from the prior planning pass and reviewed the existing analysis/design as if preparing to implement it. The review found that the API research was mostly solid, but the proposed shell escaping strategy was unsafe and needed correction before any implementation work.

The resulting review document keeps the conservative v1 direction but changes key implementation details: use single-quote shell quoting, add idempotence markers, use PI's `isToolCallEventType()` helper, avoid clobbering the shell environment for `user_bash`, and add command-level identity variables such as `PI_AGENT_TOOL_CALL_ID`.

### Prompt Context

**User prompt (verbatim):** "We're taking over. Your brother has create a plan, and we would like to review it and give advice, see if it's the right way of approaching the problem, what they could do better, how well their thinking and research was, etc... Write a new detailed review and design plan and store in the ticket and upload to remarkable as well."

**Assistant interpretation:** Review the prior ticket plan critically, produce a new detailed review/revised design document in the ticket, update the diary/bookkeeping, and publish the result to reMarkable.

**Inferred user intent:** The user wants a second-engineer design review before implementation, with concrete advice about whether the current plan is safe and what should change.

### What I did

- Read the existing ticket documents:
  - `design/01-analysis.md`
  - `design/02-design.md`
  - `reference/01-diary.md`
- Re-inspected PI source/type evidence:
  - `dist/core/extensions/types.d.ts`
  - `dist/core/tools/bash.d.ts`
  - `dist/core/tools/bash.js`
  - `dist/core/agent-session.js`
  - `dist/core/settings-manager.d.ts`
  - `examples/extensions/bash-spawn-hook.ts`
- Ran a shell sanity check showing that double-quoted values still execute command substitution:
  - Command: `bash -lc 'export PI_AGENT_TEST="$(printf injected)"; printf "double:%s\n" "$PI_AGENT_TEST"; export PI_AGENT_TEST='\''$(printf injected)'\''; printf "single:%s\n" "$PI_AGENT_TEST"'`
  - Output included `double:injected` and `single:$(printf injected)`.
- Created `design-doc/01-plan-review-and-revised-design.md`.
- Ran `docmgr doctor --ticket PI-EXT-AGENT-ENV --stale-after 30`; after adding missing topic vocabulary entries, doctor reported all checks passed.
- Ran reMarkable dry-run upload for the review bundle, then uploaded it to `/ai/2026/04/26/PI-EXT-AGENT-ENV`.
- Verified remote listing with `remarquee cloud ls /ai/2026/04/26/PI-EXT-AGENT-ENV --long --non-interactive`, which returned `[f]	PI-EXT-AGENT-ENV Plan Review and Revised Design`.

### Why

The previous plan was almost ready for implementation, but it relied on shell command mutation. In that design, quoting correctness is security-critical because every bash command would begin with generated shell syntax.

### What worked

- The prior research had already found the right API surfaces: `tool_call`, `user_bash`, `BashOperations`, and `spawnHook`.
- The PI type definitions and implementation files provided enough evidence to evaluate the plan without speculation.
- The shell test produced a clear, reproducible demonstration of the quoting bug.

### What didn't work

- The original plan's claim that double-quote escaping prevents `$(...)` interpolation was wrong. Bash expands command substitutions inside double quotes.
- The original `user_bash` pseudocode would pass a custom `env` object and thereby bypass `createLocalBashOperations()` default shell env setup when `options.env` is absent.

### What I learned

- `SettingsManager` is publicly exported and exposes `getShellPath()` / `getShellCommandPrefix()`, so a future spawnHook override can preserve more settings than the original plan implied.
- Mutation remains the best conservative v1, but it needs idempotence markers and a self-test command to be safe in day-to-day extension development.
- `PI_AGENT_TOOL_CALL_ID` should be part of v1 because it is the best command-level correlation key.

### What was tricky to build

The tricky part was balancing implementation simplicity against correctness. Tool-call mutation is much easier and preserves built-in bash behavior, but it makes generated shell syntax part of every command. That makes shell quoting and idempotence mandatory rather than optional polish.

### What warrants a second pair of eyes

- The proposed single-quote shell quoting helper should be reviewed before implementation.
- The exact behavior of `user_bash` with preamble mutation should be tested in PI interactive mode.
- If the team chooses spawnHook mode earlier than recommended, verify shell settings and active tool behavior carefully.

### What should be done in the future

- Treat `design-doc/01-plan-review-and-revised-design.md` as the authoritative implementation plan.
- Update or supersede `design/02-design.md` so implementers do not copy the unsafe double-quote escaping snippet.
- Implement the extension with self-tests before symlinking it into `~/.pi/agent/extensions/`.

### Code review instructions

- Start with `design-doc/01-plan-review-and-revised-design.md`.
- Cross-check shell quoting against the reproduced shell test.
- Validate that `tool_call` handling uses `isToolCallEventType("bash", event)`.
- Validate that `user_bash` does not pass a partial environment that drops PATH.

### Technical details

Review doc path: `ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design-doc/01-plan-review-and-revised-design.md`

reMarkable upload path: `/ai/2026/04/26/PI-EXT-AGENT-ENV/PI-EXT-AGENT-ENV Plan Review and Revised Design`

---

## Step 4: Implementation Kickoff and v1 Extension Code

I converted the revised design into a source-controlled `extensions/agent-env` implementation. The first implementation keeps the conservative v1 strategy: it mutates bash command text through `tool_call` rather than overriding PI's built-in bash tool.

The implementation includes the safety corrections from the review document: single-quote shell quoting, idempotent preamble markers, the PI `isToolCallEventType("bash", event)` helper, command-level metadata, and a self-test command.

### Prompt Context

**User prompt (verbatim):** "Add detailed tasks to the ticket, th en implement, commit at appropriate intervals, keep a diary as you work. You can test by running pi in a tmux."

**Assistant interpretation:** Break implementation into detailed docmgr tasks, implement the extension, commit at sensible milestones, maintain the diary, and use tmux/PI for interactive validation.

**Inferred user intent:** The user wants the reviewed plan turned into working code with disciplined task tracking, commits, and test evidence.

**Commit (docs):** e8b4bfde29f552b6ff426d11220575ae759590ac — "Plan agent-env implementation tasks"

### What I did

- Added detailed implementation tasks to `tasks.md`.
- Updated the original analysis/design docs to warn that the double-quote shell escaping snippet is superseded.
- Created `extensions/agent-env/env.ts` with:
  - `shellQuote()` using single-quote shell quoting
  - `truncateValue()` using code points
  - `buildAgentEnv()` for `PI_AGENT_*` variables
  - `buildExportPreamble()` with markers
  - `injectPreamble()` idempotence
  - `runInternalSelfTests()`
- Created `extensions/agent-env/index.ts` with:
  - session/turn/model event handling
  - `tool_call` injection for built-in bash
  - `user_bash` injection via wrapped `createLocalBashOperations()`
  - footer status
  - `/agent-env`, `/ae`, `/agent-env-toggle`, `/ae-toggle`, `/agent-env-self-test`
- Created `extensions/agent-env/README.md`.
- Ran `pi -e ./extensions/agent-env --no-session --no-tools -p "/agent-env-self-test"` as a load/syntax smoke test.

### Why

The reviewed design needed to become executable while preserving PI's built-in bash behavior. The helper module isolates the security-sensitive shell quoting and preamble logic so it can be reviewed independently from PI event handling.

### What worked

- PI loaded the extension in print mode without reporting a TypeScript/runtime import error.
- `docmgr doc relate` successfully linked the new implementation files into the ticket index.
- The implementation follows the review doc's main requirements: single-quote quoting, markers, type guard, and self-test command.

### What didn't work

- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck extensions/agent-env/*.ts` failed because this repo does not have TypeScript installed. Exact output included: `This is not the tsc command you are looking for` and `Use npm install typescript to first add TypeScript to your project before using npx`.
- `node -e "try{require('typescript')...` failed with `Cannot find module 'typescript'`.
- The print-mode `/agent-env-self-test` smoke test produced no visible output because extension notifications are UI-oriented in print mode.

### What I learned

- For this repository, PI itself is the practical TypeScript loader smoke test because extensions are loaded through PI's runtime rather than a project-local TS build.
- A tmux-based interactive PI test is still needed to see command notifications and verify actual bash tool injection.

### What was tricky to build

The main sharp edge was `user_bash`: returning a custom `BashOperations` wrapper is easy, but passing a partial env object would drop PI's normal shell environment. The implementation instead prepends the same preamble to the command and delegates all other execution behavior to `createLocalBashOperations()`.

### What warrants a second pair of eyes

- Review the exact `shellQuote()` replacement string in `env.ts`.
- Review the duplicate command handlers for `/agent-env-toggle` and `/ae-toggle`; they are intentionally simple but could be deduplicated.
- Confirm that exposing `PI_AGENT_QUOTE_TEST` in all injected preambles is desirable, or decide to keep it only for self-test mode.

### What should be done in the future

- Run interactive PI in tmux and verify an actual LLM bash tool call sees `PI_AGENT_*` variables.
- Install/update the symlink in `~/.pi/agent/extensions/agent-env`.
- Commit the implementation files after reviewing the diff.

### Code review instructions

- Start with `extensions/agent-env/env.ts`, especially `shellQuote`, `buildExportPreamble`, and `injectPreamble`.
- Then review `extensions/agent-env/index.ts` event handlers.
- Validate with `/agent-env-self-test` and a bash tool call printing `$PI_AGENT`, `$PI_AGENT_TOOL_CALL_ID`, and `$PI_AGENT_QUOTE_TEST`.

### Technical details

Smoke commands run:

```bash
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck extensions/agent-env/*.ts
node -e "try{require('typescript'); console.log('typescript require ok')}catch(e){console.error(e.message); process.exit(1)}"
pi -e ./extensions/agent-env --no-session --no-tools -p "/agent-env-self-test"
```
