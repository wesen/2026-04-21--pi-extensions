export const TITLE_HEADING = "Session Title";

export interface ParsedTitleSummary {
	title: string | undefined;
	summary: string;
}

export interface TitleSectionOptions {
	stripTitleSection?: boolean;
}

export function buildTitleInstructions(existingTitle: string | undefined): string {
	const existing = existingTitle?.trim() ? existingTitle.trim() : "(none)";
	return [
		"Also create or update a concise session title for this Pi session.",
		"",
		"Add this section near the top of the compaction summary, before the normal Goal section:",
		"",
		"## Session Title",
		"A short 4-10 word noun phrase naming this session.",
		"",
		"Title rules:",
		"- Prefer the concrete project, ticket, PR, feature, bug, or research task.",
		"- Use a noun phrase, not a sentence.",
		"- Do not use quotes, emoji, inline markdown, XML/HTML, or trailing punctuation.",
		"- Avoid generic titles like 'Code Help', 'Debugging', or 'Project Work'.",
		"- If the existing title is already accurate, keep or lightly refine it.",
		`- Existing title: ${existing}`,
		"",
		"After the Session Title section, keep the normal Pi compaction structure and preserve all continuation context.",
	].join("\n");
}

export function combineInstructions(customInstructions: string | undefined, titleInstructions: string): string {
	return [customInstructions?.trim(), titleInstructions.trim()].filter(Boolean).join("\n\n");
}

export function sanitizeTitle(input: string | undefined): string | undefined {
	if (!input) return undefined;
	const title = input
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.join(" ")
		.replace(/^[-*]\s*/, "")
		.replace(/^#+\s*/, "")
		.replace(/^['\"`]+|['\"`]+$/g, "")
		.replace(/[<>]/g, "")
		.replace(/[.!?]+$/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80)
		.trim();
	return title || undefined;
}

export function parseSessionTitle(summary: string): string | undefined {
	const match = summary.match(/^##\s+Session Title\s*\n+([\s\S]*?)(?=\n##\s+|\s*$)/im);
	return sanitizeTitle(match?.[1]);
}

export function stripSessionTitleSection(summary: string): string {
	return summary
		.replace(/^##\s+Session Title\s*\n+[\s\S]*?(?=\n##\s+|\s*$)/im, "")
		.replace(/^\s+/, "")
		.trimEnd();
}

export function parseTitleAndSummary(summary: string, options: TitleSectionOptions = {}): ParsedTitleSummary {
	const title = parseSessionTitle(summary);
	return {
		title,
		summary: title && options.stripTitleSection !== false ? stripSessionTitleSection(summary) : summary,
	};
}

export interface TitleParserSelfTest {
	name: string;
	ok: boolean;
	details: string;
}

export function runTitleParserSelfTests(): TitleParserSelfTest[] {
	const sample = "## Session Title\nCompaction Title Session Naming.\n\n## Goal\nKeep context.";
	const parsed = parseTitleAndSummary(sample);
	const combined = combineInstructions("Focus on files", buildTitleInstructions("Old Title"));
	return [
		{
			name: "extracts title section",
			ok: parsed.title === "Compaction Title Session Naming",
			details: `title=${parsed.title ?? "(none)"}`,
		},
		{
			name: "strips title section by default",
			ok: parsed.summary.startsWith("## Goal") && !parsed.summary.includes("## Session Title"),
			details: parsed.summary.split("\n")[0] ?? "",
		},
		{
			name: "combines user instructions with title instructions",
			ok: combined.includes("Focus on files") && combined.includes("Existing title: Old Title"),
			details: "custom instructions are preserved",
		},
	];
}
