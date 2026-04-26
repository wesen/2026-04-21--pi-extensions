---
Title: PI Agent Metadata Env Vars — Analysis
Ticket: PI-EXT-AGENT-ENV
Status: active
Topics:
  - pi-extensions
  - agent
  - environment
  - metadata
DocType: analysis
Intent: long-term
Owners:
  - manuel
RelatedFiles:
  - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:ExtensionAPI event types and ToolCallEvent
  - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/tools/bash.d.ts:Bash tool schema, BashOperations, BashSpawnHook
  - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/tools/bash.js:Bash tool implementation with resolveSpawnContext
  - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/bash-spawn-hook.ts:Official spawnHook example
ExternalSources:
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md:Pi extensions documentation
Summary: >
  Analysis of available PI extension APIs for injecting agent metadata as
  environment variables into bash tool executions. Compares tool_call event
  mutation, spawnHook override, and user_bash interception approaches.
LastUpdated: 2026-04-26
---

# PI Agent Metadata Env Vars — Analysis

## Problem Statement

When the PI coding agent executes a `bash` tool call, the spawned shell has no
way to know it is running inside PI or which session/turn it belongs to. This
makes it impossible for scripts, build tools, or hooks to:

- Tag telemetry with the current PI session ID
- Log which turn generated a command
- Conditionally behave differently when running under PI
- Correlate shell activity with the PI conversation tree

The goal is to expose selected PI agent metadata as `PI_AGENT_*` environment
variables automatically on every `bash` tool execution.

## Available Metadata Sources

From `ExtensionContext` (available in all event handlers):

| Source | API Path | Example Value |
|--------|----------|---------------|
| Working directory | `ctx.cwd` | `/home/manuel/code/wesen/myproject` |
| Session ID | `ctx.sessionManager.getSessionId()` | `550e8400-e29b-41d4-a716-446655440000` |
| Session file | `ctx.sessionManager.getSessionFile()` | `~/.pi/agent/sessions/.../2026-04-26T12-00-00.jsonl` |
| Session dir | `ctx.sessionManager.getSessionDir()` | `~/.pi/agent/sessions/...` |
| Session name | `ctx.sessionManager.getSessionName()` | `my-project-feature` |
| Leaf entry ID | `ctx.sessionManager.getLeafId()` | `entry-uuid` |
| Current model provider | `ctx.model?.provider` | `anthropic` |
| Current model ID | `ctx.model?.id` | `claude-opus-4` |
| Current model name | `ctx.model?.name` | `Claude 4 Opus` |

Tracked from lifecycle events:

| Source | Event | Example Value |
|--------|-------|---------------|
| Turn index | `turn_start` → `event.turnIndex` | `3` |
| Session start reason | `session_start` → `event.reason` | `startup`, `reload`, `resume` |

## API Exploration

### 1. `tool_call` Event Mutation

The `ToolCallEvent` is fired **before** tool execution and allows in-place
mutation of `event.input`:

> "`event.input` is mutable. Mutate it in place to patch tool arguments before
> execution." — `types.d.ts`

For `BashToolCallEvent`, `event.input` is `BashToolInput`:

```typescript
type BashToolInput = {
  command: string;
  timeout?: number;
};
```

**Mechanism**: prepend `export PI_AGENT_XXX="value"` lines to
`event.input.command`.

**Pros**:
- Extremely simple (~20 lines of code)
- No need to override built-in tools
- Preserves all bash settings (`commandPrefix`, `shellPath`, etc.)
- Works with the existing tool registry

**Cons**:
- Mutated command is visible to the LLM in conversation history
- `renderCall` displays the prepended exports alongside the real command
- Session file stores the mutated command string
- Requires shell-safe value escaping

### 2. Custom `bash` Tool with `spawnHook`

The `createBashToolDefinition(cwd, options)` factory accepts a `spawnHook`:

```typescript
type BashSpawnHook = (context: BashSpawnContext) => BashSpawnContext;
interface BashSpawnContext {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}
```

**Mechanism**: register a custom `bash` tool via `pi.registerTool()` that
overrides the built-in one. The `execute` method dynamically creates a bash
tool definition with the current `ctx.cwd` and a `spawnHook` that injects env
vars.

**Pros**:
- Invisible to the LLM — displayed command is unchanged
- Clean separation of concerns
- No session history pollution
- Uses the proper `env` field of `child_process.spawn`

**Cons**:
- Overrides the built-in `bash` tool entirely
- Must handle dynamic `cwd` (the factory pins `cwd` at creation time)
- Loses user settings like `commandPrefix` and `shellPath` unless explicitly read
- More complex (~60–80 lines)
- Risk of diverging from built-in bash behavior on PI upgrades

### 3. `user_bash` Event Interception

The `user_bash` event fires when the user types `!command` or `!!command`.

**Mechanism**: return custom `BashOperations` from the handler that wraps
`createLocalBashOperations()` and injects env into the `exec` call.

**Pros**:
- Clean, uses the proper `env` parameter
- Does not affect LLM-called bash

**Cons**:
- Only covers user-initiated `!` / `!!` commands, not LLM `bash` tool calls
- The user's primary request is about LLM tool calls

## Bash Tool Internals

From `bash.js`, the execution flow is:

```javascript
function resolveSpawnContext(command, cwd, spawnHook) {
  const baseContext = { command, cwd, env: { ...getShellEnv() } };
  return spawnHook ? spawnHook(baseContext) : baseContext;
}

// In execute:
const spawnContext = resolveSpawnContext(resolvedCommand, cwd, spawnHook);
ops.exec(spawnContext.command, spawnContext.cwd, {
  onData: handleData,
  signal,
  timeout,
  env: spawnContext.env,
});
```

The shell is always spawned with `bash -c` (or `sh -c` on systems without bash).
This means prepending `export VAR=value` to the command string is syntactically
valid.

## Comparison Matrix

| Criteria | `tool_call` Mutation | `spawnHook` Override | `user_bash` Only |
|----------|----------------------|----------------------|------------------|
| Implementation complexity | Low | Medium | Low |
| LLM visibility | High (shows exports) | None | N/A |
| Session history pollution | Yes | No | N/A |
| Preserves `commandPrefix` | Yes | No (unless re-implemented) | Yes |
| Preserves `shellPath` | Yes | No (unless re-implemented) | Yes |
| Covers LLM `bash` calls | Yes | Yes | No |
| Covers `!` / `!!` commands | No | No | Yes |
| Upgrade safety | High | Medium (divergence risk) | High |

## Recommendation

**Primary approach for v1**: `tool_call` event mutation.

Rationale:
1. The user explicitly asked for LLM `bash` tool call injection
2. Simplicity and upgrade-safety outweigh the cosmetic downside of LLM-visible exports
3. The exports are actually informative — they make the agent context explicit
4. Can be enhanced later with a toggle command (`/agent-env off`)

**Future enhancement**: Add `spawnHook` override as an optional mode for users
who want invisible injection, once PI exposes settings reading to extensions or
accepts a cleaner override mechanism.

**Also implement**: `user_bash` event handler so `!` and `!!` commands get the
same env vars via wrapped `BashOperations`.

## Proposed Environment Variable Schema

| Variable | Source | Format | Example |
|----------|--------|--------|---------|
| `PI_AGENT_SESSION_ID` | `ctx.sessionManager.getSessionId()` | UUID | `550e8400-...` |
| `PI_AGENT_SESSION_NAME` | `ctx.sessionManager.getSessionName()` | string or empty | `feature-branch` |
| `PI_AGENT_SESSION_FILE` | `ctx.sessionManager.getSessionFile()` | absolute path | `/home/manuel/.pi/...` |
| `PI_AGENT_CWD` | `ctx.cwd` | absolute path | `/home/manuel/code/...` |
| `PI_AGENT_TURN_INDEX` | tracked from `turn_start` | integer string | `3` |
| `PI_AGENT_MODEL_PROVIDER` | `ctx.model?.provider` | string | `anthropic` |
| `PI_AGENT_MODEL_ID` | `ctx.model?.id` | string | `claude-opus-4` |
| `PI_AGENT_MODEL_NAME` | `ctx.model?.name` | string | `Claude 4 Opus` |
| `PI_AGENT_LEAF_ID` | `ctx.sessionManager.getLeafId()` | UUID | `entry-uuid` |
| `PI_AGENT_START_TIME` | `Date.now()` at session start | epoch ms string | `1745668800000` |

All values are strings (environment variables are always strings). Numeric values
are serialized with `String(value)`.

## Shell Escaping Strategy

Values must be escaped for safe use in `export VAR="value"` syntax. The
recommended approach is:

1. Replace `\` with `\\`
2. Replace `"` with `\"`
3. Wrap the result in double quotes: `"escaped-value"`

This handles newlines, spaces, and most special characters safely within a
bash `export` statement.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Very long values blow up command display | Truncate values > 4096 chars; document truncation |
| Values contain `$()` or backticks causing command injection | Strict `"` escaping prevents interpolation |
| Extension breaks on PI API changes | Keep implementation minimal; use stable `tool_call` API |
| Conflicts with user-defined `PI_AGENT_*` vars | Document the namespace; prefix with `PI_AGENT_` |
| Performance: building env string on every bash call | Negligible overhead (<1ms); state is pre-computed |
