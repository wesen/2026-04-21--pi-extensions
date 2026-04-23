-- Search bash tool calls for keywords related to extension development
-- Usage:
--   go-minitrace query duckdb \
--     --archive-glob './analysis/*/active/*/*.minitrace.json' \
--     --sql-file ./scripts/query-commands/pi-extensions/bash-keyword-search.sql

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
    OR json_extract_string(tc, '$.input.command') LIKE '%hello-world%'
    OR json_extract_string(tc, '$.input.command') LIKE '%reload%'
    OR json_extract_string(tc, '$.output.result') LIKE '%extension%'
    OR json_extract_string(tc, '$.output.result') LIKE '%error%'
  )
ORDER BY started_at, turn_index
LIMIT 50;
