import type { Message } from "@mariozechner/pi-ai";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import type { MessageEntry, SelectivePartition } from "./session";

export const SELECTIVE_COMPACTION_SYSTEM_PROMPT = `You are Pi's selective session compaction summarizer.

Your job is to replace a selected middle range of a coding-agent conversation with a compact, technically precise summary and a linkage message. The messages before the selected range and after the selected range will remain verbatim in the new session.

Optimize for recovering context-window budget while preserving continuity. Do not continue the conversation. Do not solve new tasks. Summarize only the selected range.

Write for a future assistant that will see:
1. The original messages before the selected range.
2. Your summary of the selected range.
3. Your linkage message.
4. The original messages after the selected range.

Your summary must answer:
- What happened in the selected range?
- What decisions, constraints, facts, commands, files, errors, and artifacts remain relevant?
- What can safely be forgotten because it was exploratory, superseded, or redundant?
- How should the future assistant understand references in the preserved following messages?

Return exactly this Markdown structure:

## Selective Compaction Summary

### What happened
[Concise prose plus bullets.]

### Relevant outcomes and decisions
- [Decision/fact and why it matters.]

### Files, commands, and artifacts
- [Paths, commands, generated docs, test outputs, uploads, etc.]

### Errors, blockers, and corrected assumptions
- [Failures with exact error snippets when important.]

### What is safe to forget
- [Exploration or repeated details that need not remain verbatim.]

### What remains relevant going forward
- [Specific state needed to continue after the compacted range.]

<read-files>
[path per line, if known]
</read-files>

<modified-files>
[path per line, if known]
</modified-files>

## Linkage Message
[A short bridge, written as context for the future assistant, explaining how the preserved messages after the compacted range relate to the summary.]`;

export interface GeneratedSelectiveCompaction {
	summary: string;
	linkage: string;
	raw: string;
	readFiles: string[];
	modifiedFiles: string[];
}

export function buildSelectiveCompactionUserMessage(partition: SelectivePartition): Message {
	const previousTail = serializeEntries(partition.before.slice(-6));
	const selected = serializeEntries(partition.selected);
	const followingHead = serializeEntries(partition.after.slice(0, 6));
	return {
		role: "user",
		content: [
			{
				type: "text",
				text: [
					"## Task",
					"Summarize SELECTED_RANGE and write a linkage message.",
					"",
					"## Previous context tail (A, limited)",
					"<previous-context-tail>",
					previousTail || "(No previous context.)",
					"</previous-context-tail>",
					"",
					"## Selected range to compact (B, full)",
					"<selected-range>",
					selected || "(No selected range.)",
					"</selected-range>",
					"",
					"## Following context head (C, limited)",
					"<following-context-head>",
					followingHead || "(No following context.)",
					"</following-context-head>",
					"",
					"## Notes",
					"- A and C will remain verbatim in the new session.",
					"- Only B is being replaced.",
					"- Focus the summary on what C and future work may still need.",
				].join("\n"),
			},
		],
		timestamp: Date.now(),
	};
}

export function parseSelectiveCompactionResponse(raw: string): GeneratedSelectiveCompaction {
	const trimmed = raw.trim();
	const linkageMatch = trimmed.match(/\n##\s+Linkage Message\s*\n/i);
	let summary = trimmed;
	let linkage = "The previous middle section of the conversation was selectively compacted. Continue with the preserved following messages using the summary above as the bridge for any references to the compacted material.";

	if (linkageMatch?.index !== undefined) {
		summary = trimmed.slice(0, linkageMatch.index).trim();
		linkage = trimmed.slice(linkageMatch.index + linkageMatch[0].length).trim() || linkage;
	}

	return {
		summary,
		linkage,
		raw: trimmed,
		readFiles: extractTagLines(trimmed, "read-files"),
		modifiedFiles: extractTagLines(trimmed, "modified-files"),
	};
}

function serializeEntries(entries: MessageEntry[]): string {
	if (entries.length === 0) return "";
	return serializeConversation(convertToLlm(entries.map((entry) => entry.message)));
}

function extractTagLines(text: string, tag: string): string[] {
	const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
	const match = text.match(pattern);
	if (!match?.[1]) return [];
	return match[1]
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("["));
}
