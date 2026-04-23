__section__("filters", {
  fields: {
    extension: { type: "string", help: "Extension name to filter by" },
    limit:     { type: "int",    default: 10, help: "Max sessions to return" },
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
