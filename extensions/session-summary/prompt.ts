export const SYSTEM_PROMPT_INSTRUCTION = `
=== MANDATORY SESSION SUMMARY RULE ===

At the VERY END of every response, after all tool calls and all text, you MUST
output exactly one <summary>...</summary> block.

The summary is for a compact terminal widget, so keep it short and structured.
Use these headings, in this exact order:
1. This turn:
2. Session so far:
3. Issues:
4. Next steps:

Rules:
- Keep each heading to one short sentence or bullet when possible.
- Do not add tables, code fences, or extra sections.
- Do not omit the block, even if nothing changed.
- The <summary> block must be the last thing in your response.

Format:
<summary>
This turn: ...
Session so far: ...
Issues: ...
Next steps: ...
</summary>
`.trim();
