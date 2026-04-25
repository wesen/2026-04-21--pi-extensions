# pi-extensions

Documentation and experiments for Pi coding agent extensions.

## What's here

This repository contains design docs, implementation guides, and working extensions for the [Pi coding agent](https://github.com/badlogic/pi-mono). Each extension lives in `~/.pi/agent/extensions/` and is tracked here through docmgr tickets.

## Current extensions

| Extension | Purpose | File |
|-----------|---------|------|
| `hello-world-thinking` | Displays "Hello World" in a widget when the LLM emits a thinking block | [`ttmp/.../pi-ext-thinking-hello/design/implementation.md`](ttmp/2026/04/21/pi-ext-thinking-hello--pi-extension-hello-world-before-thinking-blocks/design/implementation.md) |
| `session-summary` | Forces the model to output `<summary>...</summary>` blocks at the end of every turn; shows parsed summary in a compact widget | [`extensions/session-summary/index.ts`](extensions/session-summary/index.ts) |

The installed `session-summary` extension is a symlink to the source-controlled directory in `extensions/`.

## Analyzing your extension sessions with go-minitrace

When you develop extensions, you run many Pi sessions. The raw JSONL session files are verbose and hard to read. [go-minitrace](https://github.com/go-go-golems/go-minitrace) converts them into a structured DuckDB-backed format you can query efficiently.

### The three-layer funnel

```text
Native Pi sessions (.jsonl)
    ↓  convert
.minitrace.json archives
    ↓  query with DuckDB
Structured evidence rows
    ↓  JS summarizers
Compact human-readable report
```

Don't read raw transcripts. Convert, query, summarize.

### Converting Pi sessions

```bash
# Convert all sessions for one working directory
go-minitrace convert pi \
  --source-dir ~/.pi/agent/sessions/--home-manuel-code-wesen-2026-04-21--pi-extensions-- \
  --output-dir ./analysis/pi-extensions

# Convert a single session
go-minitrace convert pi \
  --source-session ~/.pi/agent/sessions/--home-manuel-code-wesen-2026-04-21--pi-extensions--/2026-04-23T15-32-13-035Z_b12a8d9f-87a1-4693-b0a9-24ff8726b323.jsonl \
  --output-dir ./analysis/pi-extensions
```

### Useful SQL queries for extension development

Save these as `.sql` files in a `scripts/query-commands/` directory and run them with:

```bash
go-minitrace query duckdb \
  --archive-glob './analysis/pi-extensions/active/*/*.minitrace.json' \
  --sql-file ./scripts/query-commands/my-query.sql
```

#### 1. Find sessions where extensions loaded

```sql
SELECT
  id,
  title,
  timing->>'started_at' AS started_at,
  json_extract_string(environment, '$.model_name') AS model,
  json_extract_string(environment, '$.agent_framework') AS framework,
  tool_count,
  turn_count
FROM sessions_base
ORDER BY started_at DESC
LIMIT 25;
```

#### 2. Find extension-related bash commands

```sql
SELECT
  id AS session_id,
  title,
  timing->>'started_at' AS started_at,
  CAST(tc->>'emitting_turn_index' AS INT) AS turn_index,
  json_extract_string(tc, '$.input.command') AS bash_command,
  json_extract_string(tc, '$.output.result') AS bash_output
FROM sessions_base,
     UNNEST(tool_calls) AS t(tc)
WHERE (tc->>'tool_name') = 'bash'
  AND (
    json_extract_string(tc, '$.input.command') LIKE '%extension%'
    OR json_extract_string(tc, '$.input.command') LIKE '%session-summary%'
    OR json_extract_string(tc, '$.input.command') LIKE '%hello-world-thinking%'
    OR json_extract_string(tc, '$.output.result') LIKE '%extension%'
  )
ORDER BY started_at, turn_index
LIMIT 50;
```

#### 3. Find file reads/writes of extension files

```sql
SELECT
  id AS session_id,
  title,
  timing->>'started_at' AS started_at,
  CAST(tc->>'emitting_turn_index' AS INT) AS turn_index,
  (tc->>'tool_name') AS tool_name,
  COALESCE(
    json_extract_string(tc, '$.input.path'),
    json_extract_string(tc, '$.input.file_path'),
    json_extract_string(tc, '$.input.arguments.path')
  ) AS file_path,
  json_extract_string(tc, '$.output.result') AS result
FROM sessions_base,
     UNNEST(tool_calls) AS t(tc)
WHERE (tc->>'tool_name') IN ('read', 'write', 'edit')
  AND (
    COALESCE(
      json_extract_string(tc, '$.input.path'),
      json_extract_string(tc, '$.input.file_path'),
      json_extract_string(tc, '$.input.arguments.path')
    ) LIKE '%session-summary%'
    OR COALESCE(
      json_extract_string(tc, '$.input.path'),
      json_extract_string(tc, '$.input.file_path'),
      json_extract_string(tc, '$.input.arguments.path')
    ) LIKE '%extensions%'
  )
ORDER BY started_at, turn_index
LIMIT 50;
```

#### 4. Find errors in extension sessions

```sql
SELECT
  id AS session_id,
  title,
  timing->>'started_at' AS started_at,
  CAST(tc->>'emitting_turn_index' AS INT) AS turn_index,
  (tc->>'tool_name') AS tool_name,
  json_extract_string(tc, '$.input.command') AS bash_command,
  json_extract_string(tc, '$.output.result') AS bash_output
FROM sessions_base,
     UNNEST(tool_calls) AS t(tc)
WHERE (tc->>'tool_name') = 'bash'
  AND json_extract_string(tc, '$.output.result') LIKE '%error%'
ORDER BY started_at DESC
LIMIT 25;
```

#### 5. Count tool usage per session

```sql
SELECT
  id AS session_id,
  title,
  (tc->>'tool_name') AS tool_name,
  COUNT(*) AS call_count
FROM sessions_base,
     UNNEST(tool_calls) AS t(tc)
GROUP BY id, title, tc->>'tool_name'
ORDER BY call_count DESC
LIMIT 50;
```

### JS command example: extension activity summary

For more complex analysis, write a JS command. Save as `scripts/query-commands/pi-extensions/analysis/extension-activity.js`:

```javascript
__section__("filters", {
  fields: {
    extension: { type: "string", help: "Extension name to filter by" },
    limit:     { type: "int", default: 10, help: "Max sessions to return" },
  },
});

function extensionActivity(filters) {
  const mt = require("minitrace");

  const extensionPattern = filters.extension || "extension";

  const rows = mt.query(`
    SELECT
      id,
      title,
      timing->>'started_at' AS started_at,
      json_extract_string(environment, '$.model_name') AS model,
      turn_count,
      tool_count
    FROM ${mt.tableName}
    WHERE title LIKE ${mt.sql.string("%" + extensionPattern + "%")}
       OR EXISTS (
         SELECT 1 FROM UNNEST(tool_calls) AS t(tc)
         WHERE json_extract_string(tc, '$.input.command') LIKE ${mt.sql.string("%" + extensionPattern + "%")}
       )
    ORDER BY timing->>'started_at' DESC
    LIMIT ${filters.limit}
  `);

  return rows.map((r) => ({
    session_id: r.id,
    title: r.title,
    started_at: r.started_at,
    model: r.model,
    turns: r.turn_count,
    tools: r.tool_count,
  }));
}

__verb__("extensionActivity", {
  name: "extension-activity",
  short: "Summarize sessions related to extension development",
  fields: { filters: { bind: "filters" } },
});
```

Run it:

```bash
go-minitrace query commands \
  --query-repository ./scripts/query-commands \
  pi-extensions analysis extension-activity \
  --archive-glob './analysis/pi-extensions/active/*/*.minitrace.json' \
  --extension "session-summary" \
  --output json
```

### Key go-minitrace commands

```bash
# List all help pages
go-minitrace help --all

# Query with built-in preset
go-minitrace query duckdb \
  --archive-glob './analysis/*/active/*/*.minitrace.json' \
  --preset framework-summary

# Run a SQL file
go-minitrace query duckdb \
  --archive-glob './analysis/*/active/*/*.minitrace.json' \
  --sql-file ./scripts/my-query.sql

# List embedded query commands
go-minitrace query commands --help

# View a session as HTML
go-minitrace export html \
  --archive './analysis/pi-extensions/active/2026-04/session-id.minitrace.json' \
  --output ./exports/session.html
```

### Working rules

1. **Convert only relevant sessions** — don't convert the whole `~/.pi/agent/sessions/` tree
2. **Keep queries in `scripts/query-commands/`** — ticket-local, reusable, versioned
3. **Start with SQL, then JS** — SQL for filtering, JS for summarization
4. **Use `json_extract_string(...)`** — safe JSON access in DuckDB predicates
5. **Prefix JS helpers with `_`** — prevents scanner confusion with Glazed flags

## Docmgr tickets

Documentation is organized in docmgr ticket workspaces under `ttmp/`:

| Ticket | Topic | Date |
|--------|-------|------|
| `pi-ext-thinking-hello` | Hello World thinking block extension | 2026-04-21 |
| `pi-ext-session-summary` | Session summary block extension | 2026-04-23 |

Each ticket contains:
- `design/analysis.md` — system architecture and design decisions
- `design/implementation.md` — complete implementation guide with code
- `reference/api-cheatsheet.md` — quick API reference
- `playbooks/setup-and-test.md` — step-by-step testing commands
- `sources/` — saved upstream resources (defuddled docs, source files)

## Further reading

- [Pi extensions documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [go-minitrace help](https://github.com/go-go-golems/go-minitrace) — `go-minitrace help --all`
- Obsidian vault playbook: [[ARTICLE - Playbook - Efficient Past Transcript Analysis with go-minitrace]]
