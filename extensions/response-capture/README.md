# response-capture extension

Capture the last assistant response, save it as markdown, and optionally import it into a docmgr ticket.

## Install

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/response-capture ~/.pi/agent/extensions/response-capture
```

Reload Pi with `/reload` or start a new session.

## Commands

| Command | Purpose |
|---|---|
| `/response-preview` | Show a preview of the last captured assistant response. |
| `/response-save [name]` | Save the last assistant response to `.pi/response-capture/`. |
| `/response-import [ticket]` | Save the current response if needed, choose/use a ticket, and run `docmgr import file`. |
| `/response-import-last [ticket]` | Import the last saved file without re-saving, useful after manual edits. |

## Workflow

1. Ask Pi for something worth saving.
2. Run `/response-preview` to confirm the captured content.
3. Run `/response-save design-note` to write a markdown file.
4. Run `/response-import PI-EXT-RESPONSE-CAPTURE` or `/response-import` and select a ticket.

The extension imports with:

```bash
docmgr import file --file <saved-response.md> --ticket <ticket> --name <saved-response>
```

## Saved files

Saved files are written under the current project:

```text
.pi/response-capture/<timestamp>-<slug>.md
```

Each file includes provenance frontmatter:

```yaml
---
Title: "Last LLM Response"
Source: "pi-response-capture"
SessionId: "..."
SessionFile: "..."
TurnIndex: 4
CapturedAt: "..."
ModelProvider: "..."
ModelId: "..."
ModelName: "..."
---
```

Only assistant text blocks are saved. Thinking blocks are intentionally excluded in v1.

## Notes

- `/response-import` with no argument opens a ticket picker.
- `/response-import TICKET-ID` uses the ticket directly when it exists.
- `/response-import-last` is useful if you saved a response, edited the markdown file, and then want to import the edited file.
