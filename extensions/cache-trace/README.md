# Cache Trace

Cache Trace records cache-related usage after every assistant LLM call and shows the result in the Pi timeline as a compact custom card.

Use it to inspect:

- cache reads and writes reported by `AssistantMessage.usage`,
- apparent cache hits, misses, write-only calls, and suspected clears,
- how many provider requests happened before one assistant message,
- how many tool results happened within the current agent run,
- whether a stable prefix appears to survive retries or tool-use loops.

## Commands

| Command | Purpose |
| --- | --- |
| `/cache-trace` | Open the interactive cache analytics modal. |
| `/ct-cache` | Alias for `/cache-trace`. |
| `/cache-trace status` | Show the latest text summary. |
| `/cache-trace clear` | Clear in-memory trace records for the current Pi process. |

## Modal keys

- `h` / `l` or `←` / `→` — switch tabs.
- `↑` / `↓` or `k` / `j` — move in record lists.
- `/` — filter cache records.
- `Esc` — leave filter mode or close the modal.

## Implementation notes

The extension uses Pi lifecycle hooks:

- `before_provider_request` and `after_provider_response` count provider attempts and statuses.
- `message_end` reads assistant `usage` after the normalized assistant message is finalized.
- `agent_start`, `turn_start`, `tool_execution_end`, and `agent_end` group calls into one agent run.
- `session_compact` marks the next snapshot as potentially affected by a cache clear.

The visible timeline card is intentionally concise because custom messages become part of future context in Pi's session model.
