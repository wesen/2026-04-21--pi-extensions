# Kagi Web Search

Search the web with Kagi via the local surf CLI and return Markdown results to the agent.

## Tool: `kagi_web_search`

This extension registers an LLM-callable tool backed by:

```bash
surf kagi search --query "search terms"
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Search query to run on Kagi. |
| `max_results` | `number` | Optional per-call maximum result count. Defaults to the extension setting. |

### Example use

Ask the agent:

```text
Use kagi_web_search to find current documentation for the Surf Kagi search CLI.
```

The tool returns Kagi's Markdown search report, including titles, URLs, and snippets.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `maxResults` | `10` | Default maximum number of result rows. |
| `timeoutMs` | `120000` | surf socket timeout in milliseconds. |

Access settings via `/px` → select **Kagi Web Search** → `s`.

## Commands

- `/kagi-web-search` — show current settings

## Notes

- Requires the local `surf` CLI and browser/native-host setup to be working.
- The tool uses direct argv execution (`pi.exec("surf", args, ...)`), so complex queries do not need shell quoting.
