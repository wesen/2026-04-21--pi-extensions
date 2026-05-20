/**
 * Session scanner — walks the current branch (or full JSONL) and finds
 * tool call arguments/results that contain a search string.
 */

import { readFileSync } from "node:fs";
import type { ReadonlySessionManager, SessionEntry, SessionMessageEntry } from "@mariozechner/pi-coding-agent";
import type { ScanResult, ScannerOptions, ToolCallMatch } from "./types";
import {
	buildSnippet,
	concatTextContent,
	findMatchLines,
	matchesQuery,
	searchInObject,
	truncateResultText,
} from "./types";

/** Default max result text stored per match. */
const DEFAULT_MAX_RESULT_BYTES = 10_000;

interface PendingToolCall {
	assistantEntryId: string;
	arguments: Record<string, unknown>;
	toolName: string;
	timestamp: number;
	parentUserEntryId: string | null;
	turnIndex: number;
}

/**
 * Scan the current branch of the session for tool calls matching the query.
 *
 * Walks root→leaf, tracking turn boundaries, collecting tool calls from
 * assistant messages, and matching them against tool results. Returns every
 * occurrence where the query appears in the tool call arguments or the
 * tool result text.
 */
export function scanBranch(
	sessionManager: ReadonlySessionManager,
	query: string,
	options: ScannerOptions = {},
): ScanResult {
	const startTime = performance.now();
	const maxResultBytes = options.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
	const mode = options.mode ?? "plain";

	// getBranch() returns root→leaf (chronological order)
	const branch = sessionManager.getBranch();

	const matches: ToolCallMatch[] = [];
	let currentUserEntryId: string | null = null;
	let turnIndex = -1;
	let totalToolCalls = 0;

	// Map from toolCallId to the pending assistant-side tool call
	const pending = new Map<string, PendingToolCall>();

	for (const entry of branch) {
		if (entry.type !== "message") continue;

		const message = (entry as SessionMessageEntry).message;

		// Track turn boundaries
		if (message.role === "user") {
			currentUserEntryId = entry.id;
			turnIndex++;
		}

		// Collect tool calls from assistant messages
		if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const block of message.content) {
				if (
					block.type === "toolCall" &&
					typeof (block as any).id === "string" &&
					typeof (block as any).name === "string"
				) {
					const tc = block as {
						type: "toolCall";
						id: string;
						name: string;
						arguments: Record<string, unknown>;
					};
					pending.set(tc.id, {
						assistantEntryId: entry.id,
						arguments: tc.arguments ?? {},
						toolName: tc.name,
						timestamp:
							typeof message.timestamp === "number"
								? message.timestamp
								: Date.parse(entry.timestamp),
						parentUserEntryId: currentUserEntryId,
						turnIndex,
					});
					totalToolCalls++;
				}
			}
		}

		// Match tool results against pending calls
		if (message.role === "toolResult") {
			const tr = message as {
				role: "toolResult";
				toolCallId: string;
				toolName: string;
				content: Array<{ type: string; text?: string }>;
			};
			const pendingCall = pending.get(tr.toolCallId);
			if (!pendingCall) continue; // orphaned result

			const resultText = concatTextContent(tr.content);
			const argMatch = searchInObject(pendingCall.arguments, query, mode);
			const resultMatch = matchesQuery(resultText, query, mode);

			if (argMatch || resultMatch) {
				const matchLocation: ToolCallMatch["matchLocation"] =
					argMatch && resultMatch
						? "both"
						: argMatch
							? "arguments"
							: "result";

				// Determine which text to compute match lines from
				const matchSource = argMatch ? pendingCall.arguments : resultText;
				const argText = JSON.stringify(pendingCall.arguments, null, 2);
				const matchText =
					matchLocation === "result" ? resultText : argText;
				const matchLines = findMatchLines(matchText, query, mode);

				const snippet = buildSnippet(
					matchLocation === "result" ? resultText : argText,
					query,
					1,
					80,
					mode,
				);

				const truncated = truncateResultText(
					resultText,
					maxResultBytes,
				);

				matches.push({
					assistantEntryId: pendingCall.assistantEntryId,
					resultEntryId: entry.id,
					parentUserEntryId: pendingCall.parentUserEntryId,
					toolName: pendingCall.toolName,
					toolCallId: tr.toolCallId,
					arguments: pendingCall.arguments,
					resultText: truncated.text,
					resultTruncated: truncated.truncated,
					timestamp: pendingCall.timestamp,
					turnIndex: pendingCall.turnIndex,
					matchLocation,
					matchLines,
					snippet,
				});
			}

			// Clean up pending call regardless of match
			pending.delete(tr.toolCallId);
		}
	}

	return {
		matches,
		scanDurationMs: performance.now() - startTime,
		totalEntriesScanned: branch.length,
		totalToolCallsScanned: totalToolCalls,
	};
}

/**
 * Scan the full JSONL session file, including compacted regions.
 *
 * This parses every entry in the file (not just the current branch),
 * so it can find tool calls that were compacted out of the active context.
 * Returns matches along with their branch membership status.
 */
export function scanFullFile(
	sessionFilePath: string,
	query: string,
	options: ScannerOptions = {},
): ScanResult & { matches: (ToolCallMatch & { onCurrentBranch: boolean })[] } {
	const startTime = performance.now();
	const maxResultBytes = options.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
	const mode = options.mode ?? "plain";

	const content = readFileSync(sessionFilePath, "utf8");
	const lines = content.trim().split("\n");

	// Parse all entries
	const allEntries: SessionEntry[] = [];
	for (const line of lines) {
		try {
			const entry = JSON.parse(line);
			if (entry.type !== "session") {
				allEntries.push(entry);
			}
		} catch {
			// Skip malformed lines
		}
	}

	// Build set of entry IDs on the current branch for marking
	// (We don't have sessionManager here, but the caller can supply branch IDs)
	const matches: (ToolCallMatch & { onCurrentBranch: boolean })[] = [];
	let currentUserEntryId: string | null = null;
	let turnIndex = -1;
	let totalToolCalls = 0;
	const pending = new Map<string, PendingToolCall>();

	for (const entry of allEntries) {
		if (entry.type !== "message") continue;

		const message = (entry as SessionMessageEntry).message;

		if (message.role === "user") {
			currentUserEntryId = entry.id;
			turnIndex++;
		}

		if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const block of message.content) {
				if (
					block.type === "toolCall" &&
					typeof (block as any).id === "string"
				) {
					const tc = block as {
						type: "toolCall";
						id: string;
						name: string;
						arguments: Record<string, unknown>;
					};
					pending.set(tc.id, {
						assistantEntryId: entry.id,
						arguments: tc.arguments ?? {},
						toolName: tc.name,
						timestamp:
							typeof message.timestamp === "number"
								? message.timestamp
								: Date.parse(entry.timestamp),
						parentUserEntryId: currentUserEntryId,
						turnIndex,
					});
					totalToolCalls++;
				}
			}
		}

		if (message.role === "toolResult") {
			const tr = message as {
				role: "toolResult";
				toolCallId: string;
				toolName: string;
				content: Array<{ type: string; text?: string }>;
			};
			const pendingCall = pending.get(tr.toolCallId);
			if (!pendingCall) continue;

			const resultText = concatTextContent(tr.content);
			const argMatch = searchInObject(pendingCall.arguments, query, mode);
			const resultMatch = matchesQuery(resultText, query, mode);

			if (argMatch || resultMatch) {
				const matchLocation: ToolCallMatch["matchLocation"] =
					argMatch && resultMatch
						? "both"
						: argMatch
							? "arguments"
							: "result";

				const argText = JSON.stringify(pendingCall.arguments, null, 2);
				const matchText =
					matchLocation === "result" ? resultText : argText;
				const matchLines = findMatchLines(matchText, query, mode);
				const snippet = buildSnippet(
					matchLocation === "result" ? resultText : argText,
					query,
					1,
					80,
					mode,
				);
				const truncated = truncateResultText(
					resultText,
					maxResultBytes,
				);

				matches.push({
					assistantEntryId: pendingCall.assistantEntryId,
					resultEntryId: entry.id,
					parentUserEntryId: pendingCall.parentUserEntryId,
					toolName: pendingCall.toolName,
					toolCallId: tr.toolCallId,
					arguments: pendingCall.arguments,
					resultText: truncated.text,
					resultTruncated: truncated.truncated,
					timestamp: pendingCall.timestamp,
					turnIndex: pendingCall.turnIndex,
					matchLocation,
					matchLines,
					snippet,
					onCurrentBranch: false, // caller should fill this in
				});
			}

			pending.delete(tr.toolCallId);
		}
	}

	return {
		matches,
		scanDurationMs: performance.now() - startTime,
		totalEntriesScanned: allEntries.length,
		totalToolCallsScanned: totalToolCalls,
	};
}

/**
 * Format a timestamp (Unix ms) to a short time string.
 */
export function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

/**
 * Build a one-line summary of a tool call match for display.
 */
export function matchSummaryLine(m: ToolCallMatch, width: number): string {
	const time = formatTime(m.timestamp);
	const turn = `T${m.turnIndex}`;
	const tool = m.toolName;

	// Extract file path from arguments if available
	const filePath =
		typeof m.arguments.path === "string" ? m.arguments.path : "";
	const filePart = filePath ? ` · ${filePath}` : "";

	const loc = m.matchLocation === "both" ? "args+result"
		: m.matchLocation === "arguments" ? "args"
		: "result";

	const lines = m.matchLines.length > 0 ? ` L${m.matchLines[0]}` : "";

	const base = `${turn} ${time} ${tool}${filePart} → ${loc}${lines}`;
	// Truncate if needed
	if (base.length <= width) return base;
	return base.slice(0, width - 1) + "…";
}
