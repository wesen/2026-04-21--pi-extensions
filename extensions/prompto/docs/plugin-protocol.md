# Prompto JSONL plugin protocol

A prompto plugin is any **executable** file inside a prompts layer
(`<project>/.pi/prompts/**` or `~/.pi/agent/prompts/**`). Executables in the
project layer only run when `allowProjectPlugins: true` is set in
`~/.pi/agent/prompto.json`; global-layer plugins always run.

The extension talks to the plugin over stdin/stdout in JSONL (one JSON
object per line), in two independent, short-lived invocations. There is no
daemon and no handshake. stderr is never parsed (log freely there). Unknown
frame `type`s are ignored, junk stdout lines are skipped — but keep stdout
clean anyway.

## 1. Describe — `plugin --describe`

Invoked at scan time (`/prompto reload` or first use, cached per session).
Emit one `template` frame per template you provide, then `end`:

```json
{"type":"template","name":"close-ticket","title":"Close a docmgr ticket","description":"…","fields":[{"name":"ticket","type":"choice","choices":["A","B"],"required":true}],"submit":"editor"}
{"type":"end"}
```

- `name` — required, `[a-zA-Z0-9_][a-zA-Z0-9_-]*`. The addressable name
  becomes `<group>/<name>` where the group is the plugin's directory under
  the prompts layer.
- `fields` — same schema as template frontmatter (see the authoring guide):
  `name`, `type` (`string`/`text`/`boolean`/`choice`/`multichoice`/`number`),
  `label`, `help`, `placeholder`, `default`, `required`, `choices`.
  Because describe runs at scan time, choice lists may be **computed**
  (e.g. existing ticket ids).
- `prefill` — optional, same schema as frontmatter `prefill:`; the LLM call
  runs in the extension, not in your plugin.
- `submit` — optional `editor` (default) or `auto`.
- Timeout: 5 s. Exit 0. Invalid announcements are reported as warnings and
  skipped; other templates still load.

## 2. Render — request on stdin

After the user submits the form, the plugin is spawned again with one
request line on stdin (stdin is closed after it):

```json
{"type":"render","template":"close-ticket","values":{"ticket":"A","summary":"…"},"cwd":"/home/user/project"}
```

- The subprocess cwd is set to the user's `cwd`; `PROMPTO_TEMPLATE` and
  `PROMPTO_PLUGIN_PATH` env vars are set.
- Respond with any number of `log` frames (shown as working status), then
  exactly one terminal frame:

```json
{"type":"log","message":"querying docmgr…"}
{"type":"prompt","text":"the full expanded prompt"}
```

or `{"type":"error","message":"what went wrong"}`.

- Timeout: 60 s, then the process is killed.

## Minimal plugin (python)

```python
#!/usr/bin/env python3
import json, sys
if "--describe" in sys.argv:
    print(json.dumps({"type": "template", "name": "hello",
                      "fields": [{"name": "who", "type": "string", "required": True}]}))
    print(json.dumps({"type": "end"}))
    sys.exit(0)
req = json.loads(sys.stdin.readline())
print(json.dumps({"type": "prompt", "text": f"Say hello to {req['values']['who']}!"}))
```

Full examples: `examples/tickets.plugin.py` (multi-template, computed
choices) and `examples/git-diff.plugin.sh` (single template, live git
state).
