export const SYSTEM_PROMPT_INSTRUCTION = `
=== MANDATORY SESSION SUMMARY RULE ===

Only when the requested job is complete and you are intentionally stopping,
output exactly one <summary>...</summary> block at the very end of the final
response. Do not output a summary for intermediate progress, commits, tool
results, or a continuation response; continue working instead.

The summary is for a compact terminal widget, so keep it short and structured.
Use these headings, in this exact order:
1. This turn:
2. Session so far:
3. Issues:
4. Next steps:

Rules:
- Keep each heading to one short sentence or bullet when possible.
- Do not add tables, code fences, or extra sections.
- Omit the block while work is ongoing.
- Include it when handing off completed work, reporting a genuine blocker, or responding to an explicit request to stop.
- The <summary> block must be the last thing in your response.

Format:
<summary>
This turn: ...
Session so far: ...
Issues: ...
Next steps: ...
</summary>
`.trim();
