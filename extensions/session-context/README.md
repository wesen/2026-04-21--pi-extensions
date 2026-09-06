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

By default, a compact block is appended on the first eligible user prompt and every **5 prompts** thereafter (1, 6, 11, …). Periodic input blocks contain counters/statistics but omit unchanged session ID and active model. A session/model identity change, compaction, or tree navigation forces fresh identity information on the next eligible prompt. Reload starts a fresh cadence.

The system snapshot also refreshes every 5 agent starts (not tool-loop turns), or when identity changes. Between refreshes its text stays byte-for-byte stable and is explicitly labelled as a snapshot accurate as of `generatedAt`. It remains present rather than disappearing on skipped prompts. The input and system channels count independently: input excludes extension-generated and skipped slash-command input, whereas system refresh counts `before_agent_start` events.

Both blocks state that the data is additional information, not a new request or instruction. Slash commands, skill/template commands, and extension-generated input are not transformed. `/sc` always shows a current snapshot regardless of cadence.

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

Open `/px`, select Session Context, and press `s`. **Repeat every N prompts (global)** is saved to `~/.pi/agent/session-context.json` and survives reload. The picker offers 1–20; the config accepts integers 1–100. Set 1 for per-prompt counters (unchanged identity is still omitted from periodic input blocks).

```json
{
  "repeatEveryPrompts": 5
}
```

Manual file changes take effect on `/reload`; applying settings takes effect immediately in the current session and resets cadence. Other already-running Pi processes pick up changes on reload. Invalid/missing configuration uses the default interval of 5; saving refuses to overwrite malformed JSON.

Other settings control system/input injection, cwd and session-file visibility, cost visibility, the optional agent-env capability, and character limits. These other settings remain in-memory and reset on reload. Cwd, session file, and cost are disabled by default.

## Install

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/session-context ~/.pi/agent/extensions/session-context
```

This enables the extension globally for all projects. Do not also list its entrypoint in project settings. Reload Pi with `/reload` or start a new session.

## Tests

```bash
PI_PACKAGE_ROOT="$(npm root -g)/@earendil-works/pi-coding-agent" \
  node extensions/session-context/test-cadence.mjs
```

Tests cover interval boundaries, global config persistence/validation, input filtering, stable system text, identity changes, compaction/tree resets, and existing snapshot self-tests without touching real user configuration.
