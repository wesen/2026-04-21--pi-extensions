---
Title: Plan Review and Revised Design
Ticket: PI-EXT-AGENT-ENV
Status: active
Topics:
    - pi-extensions
    - agent
    - environment
    - metadata
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/01-analysis.md
      Note: Original API analysis being reviewed
    - Path: ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/02-design.md
      Note: Original implementation design being reviewed
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts
      Note: Source evidence for extension context, tool_call, user_bash, and command APIs
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/tools/bash.d.ts
      Note: Source evidence for BashToolInput, BashOperations, and BashSpawnHook
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/tools/bash.js
      Note: Source evidence for bash spawning and environment behavior
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js
      Note: Source evidence for beforeToolCall hook and tool registry override behavior
    - Path: /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/settings-manager.d.ts
      Note: Source evidence that SettingsManager and shell settings are accessible from public exports
ExternalSources: []
Summary: |
    Review of the prior PI_AGENT_* environment variable extension plan. The prior research found the right APIs, but the proposed double-quoted export preamble is unsafe because Bash still expands command substitutions inside double quotes. The revised plan keeps the simple tool_call-mutation path as the recommended conservative v1, but requires single-quote shell quoting, idempotence markers, runtime self-tests, and a safer user_bash strategy. It also documents a cleaner spawnHook-based v2 path.
LastUpdated: 2026-04-26T09:35:00-04:00
WhatFor: "Use when taking over PI-EXT-AGENT-ENV implementation or reviewing the existing design."
WhenToUse: "Before implementing the agent-env extension, especially to avoid shell quoting and user_bash environment-merging pitfalls."
---

# Plan Review and Revised Design

## Executive Summary

The previous plan is a strong first pass: it found the relevant PI extension APIs, correctly identified the two viable injection families (`tool_call` mutation and `bash` tool override with `spawnHook`), and made the right high-level tradeoff for a conservative v1: avoid overriding the built-in `bash` tool unless necessary.

However, the plan must be revised before implementation. The highest-severity issue is the proposed shell escaping strategy: it uses double quotes (`export VAR="value"`), but Bash still performs command substitution and parameter expansion inside double quotes. A value such as `$(printf injected)` would be executed during the injected preamble, not treated as literal data. This turns metadata injection into a command-injection primitive if any metadata value is ever attacker-influenced or unexpectedly shell-shaped.

The revised recommendation is:

1. Keep the **`tool_call` mutation** approach for v1, because it preserves PI's built-in `bash` behavior and shell settings.
2. Replace double-quote escaping with **single-quote shell quoting**: `export KEY='literal value'`, with embedded single quotes encoded using Bash's standard close-quote/backslash/reopen-quote pattern.
3. Use PI's `isToolCallEventType("bash", event)` type guard instead of direct `event.toolName === "bash"` checks.
4. Make injection idempotent so multiple extensions/retries/replayed tool calls cannot stack duplicate preambles.
5. Treat `user_bash` separately: either use the same preamble mutation path or wrap `BashOperations` without clobbering the shell environment.
6. Add a small `/agent-env-self-test` command before relying on the extension interactively.

Bottom line: the previous research was good, but the implementation design should not be used as-is. With the changes in this review, the design becomes safe and implementable.

## Review Verdict

### What the prior plan got right

1. **It found the correct primary hook.** `ToolCallEvent` is explicitly fired before execution, and its input is mutable. The type declaration says: "Mutate it in place to patch tool arguments before execution" (`types.d.ts:611-615`). AgentSession wires this event through `beforeToolCall` and passes the actual `args` object into `runner.emitToolCall()` (`agent-session.js:171-184`).
2. **It identified the correct bash input surface.** The bash tool input only contains `command` and optional `timeout` (`bash.d.ts:5-9`), so a `tool_call` handler cannot inject an `env` field into a supported schema.
3. **It recognized why overriding `bash` is consequential.** Extension-registered tools overwrite built-ins by name (`agent-session.js:1805-1810` and `1832-1835`). A custom `bash` tool would become the authoritative bash implementation.
4. **It correctly observed the `spawnHook` option.** `BashToolOptions` exposes `spawnHook` to adjust `command`, `cwd`, or `env` before execution (`bash.d.ts:50-58`), and `bash.js` applies that hook to the spawn context (`bash.js:107-110`).
5. **It made a defensible v1 tradeoff.** Choosing command mutation over tool override preserves PI's built-in bash factory path, including the shell command prefix and shell path that are applied when built-in tools are constructed (`agent-session.js:1859-1871`).

### What needs correction before implementation

#### 1. Double-quote shell escaping is unsafe

The original design proposes:

```typescript
function shellEscape(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
```

This appears in the design doc at `design/02-design.md:139-145`. It is not safe for Bash command construction. Double quotes still allow:

- command substitution: `$(...)`
- backtick command substitution
- parameter expansion: `$HOME`, `${VAR}`
- history expansion in some interactive shell modes

Observed shell behavior:

```bash
bash -lc 'export PI_AGENT_TEST="$(printf injected)"; printf "%s\n" "$PI_AGENT_TEST"'
# prints: injected
```

The review command run during this takeover confirmed it:

```text
double:injected
single:$(printf injected)
```

This is the most important fix.

#### 2. Direct `event.toolName === "bash"` is not the recommended TypeScript narrowing

The type definitions explicitly warn that direct narrowing is problematic because `CustomToolCallEvent.toolName` is a general `string` that overlaps built-in literal names. The exported helper is `isToolCallEventType("bash", event)` (`types.d.ts:666-686`). The implementation should use the helper so `event.input.command` is properly typed.

#### 3. The `user_bash` env wrapper can accidentally remove the normal shell environment

The original design proposes:

```typescript
env: options.env ? { ...options.env, ...env } : env
```

This appears at `design/02-design.md:161-167`. But `createLocalBashOperations()` uses PI's shell environment only when `env` is omitted; if an env object is supplied, it uses that object directly (`bash.js:42-46`). Therefore, supplying only `PI_AGENT_*` variables can remove PATH and other expected shell variables.

Safer options:

1. For `user_bash`, prepend the same `export` preamble to `command` instead of supplying `env`; this preserves `createLocalBashOperations()` behavior.
2. If wrapping `BashOperations.env`, merge with `process.env` and document that this is not exactly PI's internal `getShellEnv()`.
3. Prefer a `spawnHook`-style override for invisible user-bash injection if PI later exposes a first-class shell-env builder.

#### 4. The metadata set is missing explicit execution identity

The planned schema includes `PI_AGENT_TURN_INDEX`, session fields, model fields, and leaf ID. It should also include:

- `PI_AGENT_TOOL_CALL_ID` from `ToolCallEvent.toolCallId`
- `PI_AGENT_TOOL_NAME=bash`
- `PI_AGENT_TRIGGER=tool_call` or `user_bash`
- `PI_AGENT_TURN_NUMBER` as 1-based display value, while retaining `PI_AGENT_TURN_INDEX` as 0-based internal value

The tool call ID is especially important for correlating logs with a specific command inside a turn.

#### 5. Idempotence is missing

A mutation-based design must avoid adding duplicate export blocks if:

- another extension re-emits or wraps commands,
- a future PI retry path reuses mutated args,
- the handler is accidentally registered twice during extension development,
- the user manually includes a copied preamble.

Add a marker comment and test for it:

```bash
# PI_AGENT_ENV_BEGIN v1
export PI_AGENT_SESSION_ID='...'
# PI_AGENT_ENV_END v1
```

If the command already contains the begin marker, do not inject again.

## Revised Design Recommendation

### Conservative v1: mutate bash command with a safe export preamble

This remains the best first implementation because it:

- fulfills the user's requirement for `bash` tool calls,
- uses the explicit pre-execution mutation API,
- preserves built-in bash behavior and settings,
- avoids the risk of replacing a core tool too early.

The cost is visible preamble noise in tool displays and session history. That is acceptable for v1 if the extension includes a toggle and clearly documents the behavior.

### Clean v2: optional bash-tool override with `spawnHook`

After v1 works, implement an optional mode that registers a replacement `bash` tool using `createBashToolDefinition()` and `spawnHook`. This avoids command pollution and uses `child_process.spawn`'s environment field directly.

This path is viable but should not be the first implementation unless visible command mutation becomes unacceptable. If implemented, it must preserve shell settings:

- `shellPath`
- `shellCommandPrefix`
- output truncation behavior
- render behavior
- active tool behavior

`SettingsManager` is publicly exported and can read shell settings with `SettingsManager.create(cwd)` (`settings-manager.d.ts:125-127`, `199-204`). That weakens the prior objection that settings are inaccessible, but it does not eliminate all risks: CLI overrides or future runtime-only settings may still not be visible through a fresh manager instance.

## Revised Variable Schema

### Required v1 variables

| Variable | Value | Notes |
|---|---|---|
| `PI_AGENT` | `1` | Simple boolean marker for scripts |
| `PI_AGENT_TRIGGER` | `tool_call` or `user_bash` | Distinguish LLM vs user shell |
| `PI_AGENT_TOOL_NAME` | `bash` | Stable even if hook expands later |
| `PI_AGENT_TOOL_CALL_ID` | `event.toolCallId` | Empty for `user_bash` unless synthesized |
| `PI_AGENT_SESSION_ID` | `ctx.sessionManager.getSessionId()` | Stable session identity |
| `PI_AGENT_SESSION_FILE` | `ctx.sessionManager.getSessionFile() ?? ""` | Good for transcript correlation |
| `PI_AGENT_SESSION_DIR` | `ctx.sessionManager.getSessionDir()` | Useful for local tooling |
| `PI_AGENT_SESSION_NAME` | `ctx.sessionManager.getSessionName() ?? ""` | Human-readable if set |
| `PI_AGENT_LEAF_ID` | `ctx.sessionManager.getLeafId() ?? ""` | Current conversation tree position |
| `PI_AGENT_CWD` | `ctx.cwd` | Current PI working directory |
| `PI_AGENT_TURN_INDEX` | tracked from `turn_start` | 0-based for internal alignment |
| `PI_AGENT_TURN_NUMBER` | `turnIndex + 1` | 1-based for scripts and humans |
| `PI_AGENT_MODEL_PROVIDER` | `ctx.model?.provider ?? ""` | Empty if no model |
| `PI_AGENT_MODEL_ID` | `ctx.model?.id ?? ""` | Empty if no model |
| `PI_AGENT_MODEL_NAME` | `ctx.model?.name ?? ""` | Empty if no model |
| `PI_AGENT_EXTENSION_VERSION` | e.g. `1` | Allows scripts to branch on schema |

### Optional later variables

| Variable | Why defer |
|---|---|
| `PI_AGENT_CONTEXT_TOKENS` | `ctx.getContextUsage()` may be undefined or null after compaction |
| `PI_AGENT_CONTEXT_WINDOW` | Useful but not essential to execution correlation |
| `PI_AGENT_BRANCH_DEPTH` | Requires session tree computation; avoid in v1 |

## Revised Implementation Sketch

### File layout

Keep the extension modular, but do not over-split prematurely:

```text
extensions/agent-env/
├── index.ts          # Extension registration and event handlers
├── env.ts            # State, env snapshot builder, shell quoting, preamble builder
└── README.md         # User-facing notes and examples
```

A separate `state.ts` is not necessary unless the state logic grows.

### Safe shell quoting

Use single-quote quoting for Bash:

```typescript
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
```

Examples:

| Input | Output behavior |
|---|---|
| `hello world` | literal `hello world` |
| `$(printf injected)` | literal `$(printf injected)`, not executed |
| `a'b` | literal `a'b` |
| `line1\nline2` | literal multiline value |

### Preamble builder

```typescript
const MARKER_BEGIN = "# PI_AGENT_ENV_BEGIN v1";
const MARKER_END = "# PI_AGENT_ENV_END v1";

function buildExportPreamble(vars: Record<string, string>): string {
  const lines = [MARKER_BEGIN];
  for (const [key, value] of Object.entries(vars).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^PI_AGENT[A-Z0-9_]*$/.test(key)) continue;
    lines.push(`export ${key}=${shellQuote(truncateValue(value))}`);
  }
  lines.push(MARKER_END);
  return lines.join("\n");
}

function injectPreamble(command: string, preamble: string): string {
  if (command.includes(MARKER_BEGIN)) return command;
  return `${preamble}\n${command}`;
}
```

### Tool-call handler

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", (event, ctx) => {
  if (!enabled) return;
  if (!isToolCallEventType("bash", event)) return;

  const vars = buildAgentEnv(ctx, {
    trigger: "tool_call",
    toolName: "bash",
    toolCallId: event.toolCallId,
    turnIndex: state.turnIndex,
  });

  event.input.command = injectPreamble(event.input.command, buildExportPreamble(vars));
});
```

### User-bash handler

For v1, use command preamble injection rather than env replacement to preserve PI's default shell environment:

```typescript
pi.on("user_bash", (event, ctx) => {
  if (!enabled) return;

  const ops = createLocalBashOperations();
  const vars = buildAgentEnv(ctx, {
    trigger: "user_bash",
    toolName: "bash",
    toolCallId: "",
    turnIndex: state.turnIndex,
  });

  return {
    operations: {
      exec: (command, cwd, options) =>
        ops.exec(injectPreamble(command, buildExportPreamble(vars)), cwd, options),
    },
  };
});
```

This is visibly noisy for `!` commands too, but it avoids the environment-clobbering bug.

### Commands

Add three commands, not two:

| Command | Purpose |
|---|---|
| `/agent-env` | Show current variables and enabled state |
| `/agent-env-toggle` | Enable/disable injection |
| `/agent-env-self-test` | Run shell quoting and preamble tests through `pi.exec` or internal string tests |

## Review of the Previous Research Quality

### Strengths

- The research was not superficial. It inspected the PI extension API, the bash tool types, the bash implementation, the official spawn-hook example, and the tool registry path.
- The alternatives were real alternatives, not strawmen.
- The comparison matrix captured important operational dimensions: LLM visibility, session history pollution, shell setting preservation, and upgrade safety.
- The selected conservative approach is reasonable if the quoting bug is fixed.

### Weaknesses

- The shell escaping analysis was incorrect and should have been validated with a one-line Bash test before writing the implementation recommendation.
- The `user_bash` plan did not account for `createLocalBashOperations()` using `env ?? getShellEnv()`; passing a custom env object bypasses PI's shell env.
- The plan did not include `toolCallId`, which is one of the most useful metadata fields for command-level correlation.
- The implementation pseudocode ignored the exported type guard that the PI types specifically document for `ToolCallEvent` narrowing.
- The plan should have included idempotence from the beginning because mutation-based extensions are easy to stack accidentally.

## Phased Implementation Plan

### Phase 0: Pre-implementation corrections

1. Update `design/02-design.md` or mark this review as authoritative.
2. Replace all double-quote escaping language with single-quote shell quoting.
3. Add `PI_AGENT_TOOL_CALL_ID`, `PI_AGENT_TRIGGER`, `PI_AGENT_TOOL_NAME`, `PI_AGENT_TURN_NUMBER`, and `PI_AGENT_EXTENSION_VERSION` to the schema.
4. Add idempotence marker requirements.

### Phase 1: Implement conservative v1

Files:

- `extensions/agent-env/index.ts`
- `extensions/agent-env/env.ts`
- `extensions/agent-env/README.md`

Implementation steps:

1. Define state: `enabled`, `turnIndex`, `sessionStartedAt`, `extensionVersion`.
2. Register `session_start`, `turn_start`, and `model_select` handlers only for state refresh and UI status.
3. Implement `buildAgentEnv(ctx, details)` so it derives most fields directly from `ctx` at injection time.
4. Implement `shellQuote`, `truncateValue`, `buildExportPreamble`, and `injectPreamble`.
5. Register `tool_call` using `isToolCallEventType("bash", event)`.
6. Register `user_bash` using command preamble injection, not env replacement.
7. Register commands `/agent-env`, `/agent-env-toggle`, and `/agent-env-self-test`.
8. Add a footer status only if it stays compact, e.g. `agent-env:on t=4`.

### Phase 2: Validate safety and behavior

Manual tests:

```bash
# Through PI bash tool
printf '%s\n' "$PI_AGENT" "$PI_AGENT_SESSION_ID" "$PI_AGENT_TOOL_CALL_ID" "$PI_AGENT_TURN_INDEX"

# Quoting test: must print literal value, not execute substitution
printf '%s\n' "$PI_AGENT_QUOTE_TEST"
```

Self-test cases:

1. `hello world`
2. `$(printf injected)`
3. `` `printf injected` ``
4. `a'b`
5. `line1\nline2`
6. strings longer than the truncation limit

Session-history test:

1. Run one bash tool call.
2. Inspect the displayed command and session JSONL.
3. Confirm exactly one marker block is present.

### Phase 3: Decide whether to implement spawnHook mode

Implement only if the visible preamble becomes too annoying.

If implemented:

1. Use `createBashToolDefinition(ctx.cwd, { commandPrefix, shellPath, spawnHook })`.
2. Obtain `shellPath` and `shellCommandPrefix` from `SettingsManager.create(ctx.cwd)` and refresh on `/reload` or per execution.
3. Preserve render behavior by spreading a base bash tool definition and overriding only `execute`.
4. Verify that active tool names and prompt snippets remain unchanged.

## Testing Strategy

### Unit-level tests

- `shellQuote()` does not allow command substitution.
- `buildExportPreamble()` sorts keys, rejects invalid names, and emits idempotence markers.
- `injectPreamble()` is idempotent.
- `buildAgentEnv()` serializes `undefined` as empty string, not the text `undefined`.

### Integration tests inside PI

- LLM `bash` tool sees `PI_AGENT=1`.
- LLM `bash` tool sees non-empty `PI_AGENT_SESSION_ID`.
- `PI_AGENT_TOOL_CALL_ID` differs across two tool calls in the same turn.
- `/agent-env-toggle` disables injection.
- `!env | grep PI_AGENT` behaves consistently with `bash` tool calls.

### Regression tests for the original plan's bug

The implementation must include a test equivalent to:

```bash
export PI_AGENT_TEST='$(printf injected)'
printf '%s\n' "$PI_AGENT_TEST"
```

Expected output is the literal string `$(printf injected)`, not `injected`.

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| Shell command injection through bad quoting | High | Use single-quote shell quoting and self-tests |
| Preamble noise in session history | Medium | Toggle command; consider spawnHook v2 |
| Duplicate preambles | Medium | Marker-based idempotence |
| `user_bash` loses PATH or shell setup | Medium | Do not pass a partial env object to `createLocalBashOperations()` |
| Incorrect TypeScript narrowing | Low | Use `isToolCallEventType` |
| Variable schema churn | Low | Include `PI_AGENT_EXTENSION_VERSION` from v1 |

## Final Recommendation to the Implementer

Do not implement the previous plan literally. Implement the revised conservative v1:

- `tool_call` mutation is acceptable and probably the right first step.
- The export preamble must use single-quote shell quoting.
- User-bash support should mutate command text, not pass a partial env object.
- Include command-level metadata (`PI_AGENT_TOOL_CALL_ID`) from day one.
- Build in idempotence and a self-test command.

Once v1 is validated, evaluate whether the visible preamble is painful enough to justify a `spawnHook` override. If it is, implement that as a deliberate v2, not as the first release.

## References

- Original analysis: `design/01-analysis.md`
- Original design: `design/02-design.md`
- `types.d.ts:202-230` — `ExtensionContext` exposes `cwd`, `sessionManager`, `model`, and `getContextUsage()`
- `types.d.ts:543-552` — `UserBashEvent`
- `types.d.ts:579-617` — `BashToolCallEvent` and mutable `ToolCallEvent`
- `types.d.ts:666-686` — `isToolCallEventType()` guidance
- `types.d.ts:708-713` — `UserBashEventResult` can return custom `BashOperations`
- `bash.d.ts:5-9` — bash schema has only `command` and `timeout`
- `bash.d.ts:18-33` — `BashOperations.exec` accepts optional `env`
- `bash.d.ts:50-58` — `BashToolOptions.spawnHook`
- `bash.js:33-46` — local bash operations use provided `env` or PI shell env
- `bash.js:107-110` — `spawnHook` mutates command/cwd/env before execution
- `agent-session.js:171-184` — `beforeToolCall` emits `tool_call`
- `agent-session.js:1805-1810` and `1832-1835` — extension tools override built-ins by name
- `agent-session.js:1859-1871` — built-in bash receives `commandPrefix` and `shellPath`
- `settings-manager.d.ts:125-127`, `199-204` — settings manager can read shell settings
