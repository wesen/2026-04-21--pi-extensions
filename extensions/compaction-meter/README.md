# compaction-meter

`compaction-meter` is a Pi extension that shows how many tokens remain before Pi's automatic compaction threshold in the status bar.

Typical footer/status text:

```text
compact:42.1k left
```

Other states:

```text
compact:off
compact:? left
compact:due 1.2k over
```

## Install

From this repository:

```bash
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-meter \
  ~/.pi/agent/extensions/compaction-meter
```

Pi auto-discovers extensions in `~/.pi/agent/extensions/`.

## Commands

| Command | Purpose |
|---|---|
| `/compact-meter` | Show detailed token/threshold information. |
| `/cm` | Alias for `/compact-meter`. |

## How the number is calculated

Pi compacts when context usage crosses this threshold:

```text
contextTokens > contextWindow - compaction.reserveTokens
```

This extension computes:

```text
threshold = contextWindow - reserveTokens
remaining = threshold - currentTokens
```

The current token count and context window come from Pi's extension context:

```ts
ctx.getContextUsage()
```

The reserve-token setting is read from the documented settings files:

- global: `~/.pi/agent/settings.json`
- project: `<cwd>/.pi/settings.json`

Project settings override global settings. If no setting exists, the extension uses Pi's default:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

## Limitations

- The meter follows global/project settings files. If Pi is started with command-line overrides that change compaction settings, this extension cannot currently see those overrides because `ExtensionContext` does not expose the effective `SettingsManager`.
- `ctx.getContextUsage()` may report unknown tokens immediately after startup or compaction before the next model usage record is available. In that case the status shows `compact:? left`.
- The value is approximate when Pi itself is estimating trailing messages after the last model usage record.

## Validation

Smoke-load the extension and run the status command:

```bash
pi -e ./extensions/compaction-meter --no-session --no-tools -p "/compact-meter"
```

Interactive validation:

1. Install the symlink.
2. Start Pi in tmux.
3. Confirm `compaction-meter` appears in loaded extensions.
4. Run `/compact-meter`.
5. Ask a short question and confirm the footer/status item updates after the assistant response.
