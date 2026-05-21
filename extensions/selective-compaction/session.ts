import type { ExtensionCommandContext, SessionEntry, SessionManager, SessionMessageEntry } from "@mariozechner/pi-coding-agent";
import type { GeneratedSelectiveCompaction } from "./prompt";

export type MessageEntry = SessionMessageEntry;

export interface SelectableTurn {
	id: string;
	startIndex: number;
	endIndex: number;
	startEntryId: string;
	endEntryId: string;
	entries: MessageEntry[];
	label: string;
	description: string;
}

export interface SelectivePartition {
	before: MessageEntry[];
	selected: MessageEntry[];
	after: MessageEntry[];
	startEntryId: string;
	endEntryId: string;
	startTurn: SelectableTurn;
	endTurn: SelectableTurn;
}

export interface ValidationResult {
	ok: boolean;
	errors: string[];
	warnings: string[];
}

export interface SelectiveCompactionStateEntry {
	version: 1;
	sourceSession?: string;
	createdAt: string;
	startEntryId: string;
	endEntryId: string;
	beforeEntryIds: string[];
	selectedEntryIds: string[];
	afterEntryIds: string[];
	readFiles: string[];
	modifiedFiles: string[];
}

export const SUMMARY_CUSTOM_TYPE = "selective-compaction-summary";
export const LINKAGE_CUSTOM_TYPE = "selective-compaction-linkage";
export const STATE_CUSTOM_TYPE = "selective-compaction-state";

export function getMessageEntries(branch: SessionEntry[]): MessageEntry[] {
	return branch.filter((entry): entry is MessageEntry => entry.type === "message");
}

export function buildTurns(entries: MessageEntry[]): SelectableTurn[] {
	if (entries.length === 0) return [];
	const turns: SelectableTurn[] = [];
	let start = 0;
	for (let i = 1; i < entries.length; i++) {
		if (entries[i]?.message.role === "user") {
			turns.push(createTurn(entries, start, i - 1, turns.length));
			start = i;
		}
	}
	turns.push(createTurn(entries, start, entries.length - 1, turns.length));
	return turns;
}

export function buildPartition(entries: MessageEntry[], startTurn: SelectableTurn, endTurn: SelectableTurn): SelectivePartition {
	return {
		before: entries.slice(0, startTurn.startIndex),
		selected: entries.slice(startTurn.startIndex, endTurn.endIndex + 1),
		after: entries.slice(endTurn.endIndex + 1),
		startEntryId: startTurn.startEntryId,
		endEntryId: endTurn.endEntryId,
		startTurn,
		endTurn,
	};
}

export function validatePartition(partition: SelectivePartition): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	if (partition.selected.length === 0) errors.push("Selected range is empty.");
	if (partition.startTurn.startIndex > partition.endTurn.endIndex) errors.push("Start turn must be before or equal to end turn.");
	if (partition.selected.length < 4) warnings.push("Selected range is small; compaction may not recover much context.");
	if (partition.before.length === 0) warnings.push("There are no messages before the selected range; this is closer to normal prefix compaction.");
	if (partition.after.length === 0) warnings.push("There are no messages after the selected range; no linkage to later context is needed.");
	return { ok: errors.length === 0, errors, warnings };
}

export function formatTurnOption(turn: SelectableTurn): string {
	return `${turn.id} ${turn.label}`;
}

export function turnIdFromOption(option: string): string {
	return option.split(/\s+/, 1)[0] ?? "";
}

export function formatPartitionPreview(partition: SelectivePartition, validation: ValidationResult): string {
	return [
		"Selective compaction preview",
		"",
		`Before range (A): ${partition.before.length} messages`,
		`Selected range (B): ${partition.selected.length} messages`,
		`After range (C): ${partition.after.length} messages`,
		"",
		`Start: ${partition.startTurn.label}`,
		`End (included): ${partition.endTurn.label}`,
		"Range semantics: compacts from the start turn up to and including the end turn; later turns stay verbatim in C.",
		"",
		validation.errors.length ? `Errors:\n${validation.errors.map((e) => `- ${e}`).join("\n")}` : "Validation: OK, whole-turn boundary safe",
		validation.warnings.length ? `Warnings:\n${validation.warnings.map((w) => `- ${w}`).join("\n")}` : undefined,
		"",
		"This will create a new session. The old session will not be modified.",
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

export async function choosePartition(ctx: ExtensionCommandContext): Promise<SelectivePartition | undefined> {
	const branch = ctx.sessionManager.getBranch();
	if (branch.some((entry) => entry.type === "compaction")) {
		ctx.ui.notify(
			"This branch already contains one or more compaction entries. Selective compaction will copy visible message entries on the current branch, not reconstruct hidden pre-compaction history.",
			"warning",
		);
	}
	const entries = getMessageEntries(branch);
	const turns = buildTurns(entries);
	if (turns.length === 0) {
		ctx.ui.notify("No messages in the current branch.", "error");
		return undefined;
	}

	const startOption = await ctx.ui.select(
		"Select compact start turn",
		turns.map((turn) => formatTurnOption(turn)),
	);
	if (!startOption) return undefined;
	const startId = turnIdFromOption(startOption);
	const startTurn = turns.find((turn) => turn.id === startId);
	if (!startTurn) return undefined;

	const endCandidates = turns.filter((turn) => turn.startIndex >= startTurn.startIndex);
	const endOption = await ctx.ui.select(
		"Select last turn to compact (included)",
		endCandidates.map((turn) => formatTurnOption(turn)),
	);
	if (!endOption) return undefined;
	const endId = turnIdFromOption(endOption);
	const endTurn = endCandidates.find((turn) => turn.id === endId);
	if (!endTurn) return undefined;

	const partition = buildPartition(entries, startTurn, endTurn);
	const validation = validatePartition(partition);
	const preview = formatPartitionPreview(partition, validation);
	if (!validation.ok) {
		ctx.ui.notify(preview, "error");
		return undefined;
	}
	const confirmed = await ctx.ui.confirm("Create selective compaction?", preview);
	return confirmed ? partition : undefined;
}

export function appendCompactedSession(
	sm: SessionManager,
	partition: SelectivePartition,
	generated: GeneratedSelectiveCompaction,
	sourceSession: string | undefined,
): void {
	appendMessages(sm, partition.before);
	const now = new Date().toISOString();
	const baseDetails = {
		sourceSession,
		compactedStartEntryId: partition.startEntryId,
		compactedEndEntryId: partition.endEntryId,
		compactedMessageCount: partition.selected.length,
		generatedAt: now,
		readFiles: generated.readFiles,
		modifiedFiles: generated.modifiedFiles,
	};
	sm.appendCustomMessageEntry(SUMMARY_CUSTOM_TYPE, generated.summary, true, baseDetails);
	sm.appendCustomMessageEntry(LINKAGE_CUSTOM_TYPE, generated.linkage, true, { ...baseDetails, followsSummary: true });
	appendMessages(sm, partition.after);
	sm.appendCustomEntry(STATE_CUSTOM_TYPE, {
		version: 1,
		sourceSession,
		createdAt: now,
		startEntryId: partition.startEntryId,
		endEntryId: partition.endEntryId,
		beforeEntryIds: partition.before.map((entry) => entry.id),
		selectedEntryIds: partition.selected.map((entry) => entry.id),
		afterEntryIds: partition.after.map((entry) => entry.id),
		readFiles: generated.readFiles,
		modifiedFiles: generated.modifiedFiles,
	} satisfies SelectiveCompactionStateEntry);
}

function appendMessages(sm: SessionManager, entries: MessageEntry[]): void {
	for (const entry of entries) {
		sm.appendMessage(cloneMessage(entry.message));
	}
}

function cloneMessage(message: MessageEntry["message"]): MessageEntry["message"] {
	return structuredClone(message) as MessageEntry["message"];
}

function createTurn(entries: MessageEntry[], startIndex: number, endIndex: number, ordinal: number): SelectableTurn {
	const turnEntries = entries.slice(startIndex, endIndex + 1);
	const first = turnEntries[0]!;
	const last = turnEntries[turnEntries.length - 1]!;
	const id = `T${String(ordinal + 1).padStart(3, "0")}`;
	const preview = messagePreview(first.message);
	return {
		id,
		startIndex,
		endIndex,
		startEntryId: first.id,
		endEntryId: last.id,
		entries: turnEntries,
		label: `${roleLabel(first.message.role)} ${formatTimestamp(first.timestamp)} ${preview}`,
		description: `${turnEntries.length} messages, ${first.id}..${last.id}`,
	};
}

function roleLabel(role: string): string {
	return role.padEnd(13, " ").slice(0, 13);
}

function formatTimestamp(timestamp: string): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return timestamp;
	return date.toISOString().replace("T", " ").slice(0, 16);
}

function messagePreview(message: MessageEntry["message"]): string {
	const text = messageToText(message).replace(/\s+/g, " ").trim();
	return truncate(text || "(no text)", 96);
}

function messageToText(message: MessageEntry["message"]): string {
	const content = "content" in message ? message.content : undefined;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (part.type === "text") return part.text;
				if (part.type === "thinking") return part.thinking;
				if (part.type === "toolCall") return `${part.name}(${JSON.stringify(part.arguments)})`;
				if (part.type === "image") return "[image]";
				return "";
			})
			.filter(Boolean)
			.join(" ");
	}
	if (message.role === "bashExecution") return `${message.command}\n${message.output}`;
	if (message.role === "compactionSummary") return message.summary;
	if (message.role === "branchSummary") return message.summary;
	return "";
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
