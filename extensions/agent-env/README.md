# agent-env extension

Injects PI coding agent metadata into `bash` tool calls and user `!` / `!!` shell commands as `PI_AGENT_*` environment variables.

## Install

The source-controlled extension lives at:

```text
extensions/agent-env/
```

Install it for PI auto-discovery with a symlink:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env ~/.pi/agent/extensions/agent-env
```

Reload PI with `/reload` or start a new PI session.

## How it works

The v1 implementation intentionally does **not** replace PI's built-in `bash` tool. Instead it listens for `tool_call` events, narrows to built-in `bash` calls with `isToolCallEventType("bash", event)`, and prepends a safe export preamble to the command before execution.

This keeps PI's built-in bash behavior, including shell path and shell command prefix settings.

For user `!` / `!!` commands, the extension wraps `createLocalBashOperations()` and prepends the same export preamble. It does not pass a partial `env` object, because doing so would bypass PI's normal shell environment setup.

## Variables

The extension exports these variables:

| Variable | Description |
|---|---|
| `PI_AGENT` | Always `1` when injected |
| `PI_AGENT_EXTENSION_VERSION` | Schema version (`1`) |
| `PI_AGENT_TRIGGER` | `tool_call`, `user_bash`, or `self_test` |
| `PI_AGENT_TOOL_NAME` | Usually `bash` |
| `PI_AGENT_TOOL_CALL_ID` | PI tool call ID for LLM bash calls |
| `PI_AGENT_SESSION_ID` | Current PI session ID |
| `PI_AGENT_SESSION_FILE` | Current PI session JSONL file, if available |
| `PI_AGENT_SESSION_DIR` | Current PI session directory |
| `PI_AGENT_SESSION_NAME` | User-visible session name, if set |
| `PI_AGENT_LEAF_ID` | Current conversation tree leaf ID |
| `PI_AGENT_CWD` | PI working directory |
| `PI_AGENT_TURN_INDEX` | 0-based current turn index |
| `PI_AGENT_TURN_NUMBER` | 1-based current turn number |
| `PI_AGENT_MODEL_PROVIDER` | Active model provider |
| `PI_AGENT_MODEL_ID` | Active model ID |
| `PI_AGENT_MODEL_NAME` | Active model display name |
| `PI_AGENT_START_TIME` | Extension session start time as ISO-8601 |
| `PI_AGENT_START_TIME_MS` | Extension session start time as epoch milliseconds |

## Safety notes

The export preamble uses single-quote shell quoting, not double quotes. This is critical because Bash expands `$(...)`, backticks, and `$VAR` inside double quotes.

The preamble includes idempotence markers:

```bash
# PI_AGENT_ENV_BEGIN v1
# ... exports ...
# PI_AGENT_ENV_END v1
```

If the marker is already present, the extension does not inject a second preamble.

## Capability event

When loaded, Agent Env emits `agent-env:capability` on Pi's shared extension event bus at session start and whenever injection is toggled. The event describes the capability as scoped to Bash child processes so prompt-aware extensions can explain the boundary to the model without importing Agent Env's private state.

```typescript
{
  installed: true,
  enabled: true,
  extensionVersion: "1",
  scope: "bash-child-process",
  variablePrefix: "PI_AGENT_",
  fields: ["PI_AGENT_SESSION_ID", "PI_AGENT_TURN_NUMBER", "PI_AGENT_MODEL_ID", "PI_AGENT_START_TIME"]
}
```

## Commands

| Command | Description |
|---|---|
| `/agent-env` | Show current variable preview and state |
| `/ae` | Short preview alias |
| `/agent-env-toggle [on|off|toggle]` | Enable/disable injection |
| `/ae-toggle [on|off|toggle]` | Toggle alias |
| `/agent-env-self-test` | Run internal and shell quoting tests |

## Quick validation

Ask PI to run a bash tool call like:

```bash
printf '%s\n' "$PI_AGENT" "$PI_AGENT_SESSION_ID" "$PI_AGENT_TOOL_CALL_ID" "$PI_AGENT_TURN_NUMBER"
```

Expected:

- `PI_AGENT` is `1`
- `PI_AGENT_SESSION_ID` is non-empty
- `PI_AGENT_TOOL_CALL_ID` is non-empty for LLM `bash` calls
Also run:

```text
/agent-env-self-test
```

Expected: `agent-env self-test: PASS`.
