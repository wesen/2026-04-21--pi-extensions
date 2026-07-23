# Session Context

`session-context` adds bounded, deterministic session metadata to Pi model prompts. It reports session identity, duration, date span, prompt numbers, assistant response count, models, compactions, tool activity, and available usage.

## Prompt numbers

The extension reports two prompt numbers:

- **Prompt number (this context window)** counts user messages in Pi's current compaction-aware context and adds one for the prompt being submitted.
- **Prompt number (total session)** counts all user messages on the active session branch and adds one for the prompt being submitted.

These are user-prompt numbers, not assistant/tool-loop counts. The prompt also reports assistant response count separately.

## Prompt injection

The full snapshot is appended to the system prompt by `before_agent_start` inside a section labelled:

```text
Additional Pi Session Context
```

A compact block is appended to ordinary interactive/RPC input at submission time. Both blocks state that the data is additional information, not a new request or instruction. Slash commands, skill/template commands, and extension-generated input are not transformed.

## Agent Env relationship

The existing `agent-env` extension exports `PI_AGENT_*` variables into Bash child processes. The model does not automatically share that environment. It learns a value when Bash prints it or when another extension places equivalent metadata in the prompt.

When `agent-env` emits its optional `agent-env:capability` event, Session Context describes the capability as Bash-child-only. It never claims the model process already has those variables.

## Commands

| Command | Purpose |
|---|---|
| `/session-context` | Show the current human-readable snapshot. |
| `/sc` | Alias for `/session-context`. |
| `/session-context-toggle [on\|off\|toggle]` | Enable or disable prompt injection. |
| `/session-context-self-test` | Run pure snapshot self-tests. |

## Settings

Settings control system/input injection, cwd and session-file visibility, cost visibility, the optional agent-env capability, and character limits. Cwd, session file, and cost are disabled by default.

## Install

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/session-context ~/.pi/agent/extensions/session-context
```

Reload Pi with `/reload` or start a new session.
