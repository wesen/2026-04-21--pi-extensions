---
Title: PI Agent Metadata Env Vars — Design
Ticket: PI-EXT-AGENT-ENV
Status: active
Topics:
  - pi-extensions
  - agent
  - environment
  - metadata
DocType: design-doc
Intent: long-term
Owners:
  - manuel
RelatedFiles:
  - /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/index.ts:Extension implementation
ExternalSources: []
Summary: >
  Design document for the PI_AGENT_* environment variable injection extension.
  Specifies architecture, variable schema, event handling, shell escaping,
  and implementation plan.
LastUpdated: 2026-04-26
---

# PI Agent Metadata Env Vars — Design

> **Superseded safety note (2026-04-26):** This first-pass design contains an unsafe double-quote shell escaping sketch in the `Shell Escaping` section. Implementers must follow `../design-doc/01-plan-review-and-revised-design.md` instead: use single-quote shell quoting, idempotence markers, `isToolCallEventType("bash", event)`, and the revised `user_bash` strategy.

## Executive Summary

Build a PI extension named `agent-env` that automatically injects agent
metadata (session ID, turn index, model info, etc.) as `PI_AGENT_*`
environment variables into every `bash` tool execution and user `!` / `!!`
command. The extension uses the `tool_call` event mutation approach for LLM
bash calls and `user_bash` event interception for user shell commands.

## Architecture

```
┌─────────────────────────────────────────────┐
│           PI Coding Agent                   │
│                                             │
│  ┌─────────────┐    ┌──────────────────┐   │
│  │  LLM calls  │    │  User types      │   │
│  │  bash tool  │    │  !cmd or !!cmd   │   │
│  └──────┬──────┘    └────────┬─────────┘   │
│         │                    │             │
│         ▼                    ▼             │
│  ┌─────────────────────────────────────┐   │
│  │      agent-env extension            │   │
│  │                                     │   │
│  │  ┌─────────────────────────────┐    │   │
│  │  │  Mutable State Object       │    │   │
│  │  │  { turnIndex, sessionId,    │    │   │
│  │  │    model, cwd, ... }        │    │   │
│  │  └─────────────────────────────┘    │   │
│  │              ▲                      │   │
│  │  ┌───────────┴──────────┐           │   │
│  │  │  Event Handlers      │           │   │
│  │  │  • session_start     │           │   │
│  │  │  • turn_start        │           │   │
│  │  │  • model_select      │           │   │
│  │  └──────────────────────┘           │   │
│  │              │                      │   │
│  │  ┌───────────┴──────────┐           │   │
│  │  │  Injection Points    │           │   │
│  │  │  • tool_call (bash)  │──► export │   │
│  │  │  • user_bash         │──► env    │   │
│  │  └──────────────────────┘           │   │
│  └─────────────────────────────────────┘   │
│                    │                        │
│                    ▼                        │
│  ┌─────────────────────────────────────┐   │
│  │  child_process.spawn(bash -c cmd)   │   │
│  │  with PI_AGENT_* in environment     │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## State Management

The extension maintains a single mutable state object at module scope:

```typescript
interface AgentEnvState {
  /** Set once at session_start */
  sessionId: string;
  sessionFile: string | undefined;
  sessionDir: string;
  sessionName: string | undefined;
  startTime: string;

  /** Updated on turn_start */
  turnIndex: number;

  /** Updated on model_select */
  modelProvider: string | undefined;
  modelId: string | undefined;
  modelName: string | undefined;

  /** Updated on every event (from ctx) */
  cwd: string;
  leafId: string | undefined;
}
```

State update rules:
- `session_start`: populate all static fields, reset `turnIndex` to `0`
- `turn_start`: update `turnIndex`, `cwd`, `leafId`
- `model_select`: update model fields, `cwd`, `leafId`
- `tool_call` / `user_bash`: snapshot current state, update `cwd` and `leafId`

## Injection: LLM `bash` Tool Calls

Hook: `pi.on("tool_call", handler)`

```typescript
pi.on("tool_call", (event, ctx) => {
  if (event.toolName !== "bash") return;

  // Update state from current context
  state.cwd = ctx.cwd;
  state.leafId = ctx.sessionManager.getLeafId();

  // Build export preamble
  const exports = buildExportPreamble(state);

  // Mutate command in place
  event.input.command = exports + "\n" + event.input.command;
});
```

The `buildExportPreamble` function produces:

```bash
export PI_AGENT_SESSION_ID="550e8400-..."
export PI_AGENT_TURN_INDEX="3"
export PI_AGENT_CWD="/home/manuel/code/..."
# ... etc
```

### Shell Escaping

```typescript
// Historical sketch only — do not implement.
// Bash still expands $(...) inside double quotes.
// See ../design-doc/01-plan-review-and-revised-design.md for the safe single-quote implementation.
function shellEscape(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
```

### Value Truncation

Values longer than 4096 characters are truncated to 4093 characters plus `...`
to prevent command bloat. Documented in README.

## Injection: User `!` / `!!` Commands

Hook: `pi.on("user_bash", handler)`

```typescript
pi.on("user_bash", (_event, ctx) => {
  const ops = createLocalBashOperations();
  const env = buildAgentEnv(state);

  return {
    operations: {
      exec: (command, cwd, options) =>
        ops.exec(command, cwd, {
          ...options,
          env: options.env ? { ...options.env, ...env } : env,
        }),
    },
  };
});
```

## Environment Variable Schema (v1)

| Variable | Source | Updated |
|----------|--------|---------|
| `PI_AGENT_SESSION_ID` | `ctx.sessionManager.getSessionId()` | `session_start` |
| `PI_AGENT_SESSION_NAME` | `ctx.sessionManager.getSessionName()` | `session_start` |
| `PI_AGENT_SESSION_FILE` | `ctx.sessionManager.getSessionFile()` | `session_start` |
| `PI_AGENT_SESSION_DIR` | `ctx.sessionManager.getSessionDir()` | `session_start` |
| `PI_AGENT_CWD` | `ctx.cwd` | Every event |
| `PI_AGENT_TURN_INDEX` | `turn_start` event | `turn_start` |
| `PI_AGENT_MODEL_PROVIDER` | `ctx.model?.provider` | `model_select` |
| `PI_AGENT_MODEL_ID` | `ctx.model?.id` | `model_select` |
| `PI_AGENT_MODEL_NAME` | `ctx.model?.name` | `model_select` |
| `PI_AGENT_LEAF_ID` | `ctx.sessionManager.getLeafId()` | Every event |
| `PI_AGENT_START_TIME` | `Date.now()` at session start | `session_start` |

Future v2 additions (documented but not implemented):
- `PI_AGENT_CONTEXT_TOKENS` — from `ctx.getContextUsage()`
- `PI_AGENT_BRANCH_DEPTH` — computed from session tree

## Toggle / Commands

The extension registers two commands:

| Command | Description |
|---------|-------------|
| `/agent-env` or `/ae` | Show current env var values in a notification |
| `/agent-env-toggle` or `/ae-toggle` | Enable/disable injection (default: enabled) |

## File Layout

```
extensions/agent-env/
├── index.ts          # Main extension factory
├── env-builder.ts    # buildExportPreamble + buildAgentEnv + shellEscape
├── state.ts          # AgentEnvState interface + initial state
└── README.md         # User-facing documentation
```

## Error Handling

- If `ctx.model` is `undefined`, model vars are set to empty string
- If `ctx.sessionManager.getSessionFile()` returns `undefined`, the var is omitted
- If `shellEscape` fails on a value, that specific var is skipped and a warning is logged
- The extension never blocks tool execution; failures in injection are logged and bypassed

## Testing Plan

1. **Unit test**: `buildExportPreamble` with edge-case values (quotes, newlines, empty, 4096+ chars)
2. **Integration test**: Start a PI session, run `bash` tool with `env | grep PI_AGENT`, assert all vars present
3. **Integration test**: Run `!env | grep PI_AGENT`, assert vars present
4. **Integration test**: Toggle off with `/ae-toggle`, run `bash`, assert vars absent
5. **Integration test**: Switch model mid-session, assert `PI_AGENT_MODEL_ID` updates

## Open Questions

1. Should we prefix with `PI_AGENT_` or a shorter prefix like `PI_`? → `PI_AGENT_` is more explicit and collision-resistant.
2. Should `PI_AGENT_CWD` update on every turn or only on bash calls? → Update on every event; `cwd` can change between turns via `cd` in bash.
3. Should we include `PI_AGENT_CONTEXT_TOKENS`? → Defer to v2; requires `getContextUsage()` which may be `undefined`.
