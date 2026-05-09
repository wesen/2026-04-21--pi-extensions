# pinned-skills Pi extension

`pinned-skills` keeps selected Pi skills fully loaded in the system prompt for a prompt epoch. It is intended for workflows where a few high-value skills should always be available without waiting for the model to decide to read their `SKILL.md` files.

## Configuration

The extension reads JSON config from:

1. `~/.pi/agent/pinned-skills.json`
2. `.pi/pinned-skills.json`

Project config overrides global config.

Example:

```json
{
  "version": 1,
  "enabled": true,
  "skills": ["docmgr", "diary"],
  "maxSkillBytes": 50000,
  "maxTotalBytes": 150000,
  "includeDisabledModelInvocation": false,
  "showStatus": true
}
```

## Commands

```text
/pinned-skills
/pinned-skills list
/pinned-skills preview
/pinned-skills add docmgr diary
/pinned-skills remove diary
/pinned-skills clear
/pinned-skills on
/pinned-skills off
/pinned-skills edit
```

`/pinned-skills edit` opens a small editor where each line is a pinned skill name.

## Cache-safe behavior

The extension tries not to trash provider prompt/KV caches. Once a session already has an assistant turn and an active pinned-skills prompt, config changes are saved but deferred.

When that happens, the extension warns:

```text
Pinned skills config changed. To preserve prompt-cache stability, this session will keep using the currently loaded pinned-skills prompt until /compact or a new session. The new selection is saved and pending.
```

The pending config takes effect after `/compact` or in a new session.

## Status

The footer status uses this shape:

```text
pins:3/42.1KB
pins:pending:3/42.1KB
pins:off
```

## Implementation notes

- `before_agent_start` is the only hook that mutates the system prompt.
- `session_start` restores extension metadata and UI status.
- `session_compact` clears the active prompt epoch so pending config can apply on the next prompt.
- Extension metadata is persisted with `pi.appendEntry("pinned-skills-state", ...)` and does not participate in LLM context.
