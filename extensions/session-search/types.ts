/**
 * Shared types for the session-search extension.
 */

/** A single searchable occurrence of a string in a tool call or result. */
export interface ToolCallMatch {
	/** Session entry ID of the assistant message containing the tool call. */
	assistantEntryId: string;

	/** Session entry ID of the tool result message. */
	resultEntryId: string;

	/** Session entry ID of the parent user message for this turn. */
	parentUserEntryId: string | null;

	/** Tool name: "read", "write", "edit", "bash", etc. */
	toolName: string;

	/** Tool call ID (links assistant content block to tool result). */
	toolCallId: string;

	/** Tool call arguments. */
	arguments: Record<string, unknown>;

	/** Tool result content (concatenated text), truncated for display. */
	resultText: string;

	/** Whether resultText was truncated. */
	resultTruncated: boolean;

	/** Timestamp of the assistant message (Unix ms). */
	timestamp: number;

	/** 0-based turn index (counting user messages from start). */
	turnIndex: number;

	/** Where the query was found. */
	matchLocation: "arguments" | "result" | "both";

	/** 1-based line numbers within the matched text where the query appears. */
	matchLines: number[];

	/** Snippet of matching context (first match line ± 1 line). */
	snippet: string;
}

/** Summary of a scan result. */
export interface ScanResult {
	matches: ToolCallMatch[];
	scanDurationMs: number;
	totalEntriesScanned: number;
	totalToolCallsScanned: number;
}

/** Result returned when user selects a match in the overlay. */
export interface SessionSearchResult {
	match: ToolCallMatch;
	action: "navigate" | "fork";
}

/** Options for the scanner. */
export interface ScannerOptions {
	/** Search the full JSONL file (including compacted regions) instead of just the current branch. */
	includeCompacted?: boolean;

	/** Maximum result text size to store (bytes). Default: 10KB. */
	maxResultBytes?: number;
}

const DEFAULT_MAX_RESULT_BYTES = 10_000;

/**
 * Recursively search for a query string in the string values of an object.
 * Returns true if any string value contains the query.
 */
export function searchInObject(obj: unknown, query: string): boolean {
	if (typeof obj === "string") {
		return obj.includes(query);
	}
	if (Array.isArray(obj)) {
		return obj.some((item) => searchInObject(item, query));
	}
	if (typeof obj === "object" && obj !== null) {
		return Object.values(obj as Record<string, unknown>).some((v) =>
			searchInObject(v, query),
		);
	}
	return false;
}

/**
 * Find line numbers (1-based) where the query appears in a multi-line text.
 */
export function findMatchLines(text: string, query: string): number[] {
	const lines = text.split("\n");
	const matchLines: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i]!.includes(query)) {
			matchLines.push(i + 1);
		}
	}
	return matchLines;
}

/**
 * Build a short snippet showing context around the first match line.
 */
export function buildSnippet(
	text: string,
	query: string,
	contextLines: number = 1,
	maxWidth: number = 80,
): string {
	const lines = text.split("\n");
	const firstMatch = lines.findIndex((l) => l.includes(query));
	if (firstMatch === -1) return "";

	const start = Math.max(0, firstMatch - contextLines);
	const end = Math.min(lines.length, firstMatch + contextLines + 1);
	const snippet = lines.slice(start, end);
	const prefix = start > 0 ? "…" : "";
	const suffix = end < lines.length ? "…" : "";
	return (
		prefix +
		snippet
			.map((l) => (l.length > maxWidth ? l.slice(0, maxWidth - 1) + "…" : l))
			.join("\n") +
		suffix
	);
}

/**
 * Truncate text to a maximum byte size, preserving line boundaries.
 */
export function truncateResultText(
	text: string,
	maxBytes: number = DEFAULT_MAX_RESULT_BYTES,
): { text: string; truncated: boolean } {
	if (Buffer.byteLength(text, "utf8") <= maxBytes) {
		return { text, truncated: false };
	}

	// Cut by lines to stay under the limit
	const lines = text.split("\n");
	let result = "";
	for (const line of lines) {
		const candidate = result.length === 0 ? line : result + "\n" + line;
		if (Buffer.byteLength(candidate, "utf8") > maxBytes) {
			break;
		}
		result = candidate;
	}
	return { text: result, truncated: true };
}

/**
 * Concatenate text content blocks from a ToolResultMessage.
 */
export function concatTextContent(
	content: Array<{ type: string; text?: string }>,
): string {
	return content
		.filter((c) => c.type === "text" && typeof c.text === "string")
		.map((c) => c.text!)
		.join("\n");
}
