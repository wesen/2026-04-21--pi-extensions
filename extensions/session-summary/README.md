# session-summary

`session-summary` is a Pi extension that asks the assistant for a compact `<summary>...</summary>` block only in its final handoff when work is complete or genuinely blocked, then renders the latest summary above the editor for quick session orientation.

It is useful for long coding sessions where you want a persistent, machine-readable handoff at the bottom of every assistant turn.

## What it does

- Appends a final-handoff summary instruction to the system prompt before each agent run.
- Adds a short final-handoff reminder to user prompts while reminders are enabled.
- Detects the last `<summary>...</summary>` block in each assistant response.
- Displays the parsed summary as an above-editor widget after the turn completes.
- Shows a warning widget if the assistant response did not include a summary.
- Writes diagnostic logs to `~/.pi/agent/logs/session-summary.log`.

Expected summary format:

```xml
<summary>
This turn: ...
Session so far: ...
Issues: ...
Next steps: ...
</summary>
```

The widget recognizes the four headings above and renders them as compact labeled lines.

## Commands

| Command | Purpose |
| --- | --- |
| `/summary` | Show the last detected summary preview. |
| `/summary-toggle` | Toggle per-user-prompt final-handoff reminder injection on or off. The system prompt instruction still applies. |
| `/summary-logs` | Show the last diagnostic log lines. |
| `/summary-debug` | Render the last diagnostic log lines as an above-editor widget. |

## Runtime behavior

On `before_agent_start`, the extension appends the final-handoff summary rule from `prompt.ts` to Pi's system prompt. On user `input`, it appends a shorter reminder unless reminders were toggled off with `/summary-toggle`.

On `turn_end`, the extension inspects assistant text and thinking blocks, finds all `<summary>...</summary>` matches, and uses the last non-empty match. If found, it stores the summary in memory and renders an above-editor widget. If not found, it renders an informational widget: missing summaries are expected while work continues.

On `turn_start`, the previous widget is cleared to avoid showing stale summary state while the next turn is running.

## Files

- `index.ts` — extension registration, prompt hooks, summary parsing, widget rendering, commands, and logging.
- `prompt.ts` — the mandatory summary instruction injected into the system prompt.

## Notes and cautions

This extension intentionally changes prompt behavior. It should be enabled only in sessions where the mandatory summary convention is desired.

Logs are local diagnostics only and are written under `~/.pi/agent/logs/`; they are not stored in the repository.
