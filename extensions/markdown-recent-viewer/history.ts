import { existsSync } from "fs";
import { extname, relative, resolve } from "path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export type MarkdownToolName = "edit" | "write";

export interface RecentMarkdownItem {
	path: string;
	relativePath: string;
	toolName: MarkdownToolName;
	toolCallId: string;
	timestamp: number;
	entryId: string;
	occurrence: number;
}

export interface RecentMarkdownOptions {
	includeExtensions: string[];
	maxResults: number;
	currentBranchOnly: boolean;
	hideMissingFiles: boolean;
}

interface PendingMarkdownToolCall {
	path: string;
	relativePath: string;
	toolName: MarkdownToolName;
	toolCallId: string;
}

function normalizeExtensions(extensions: string[]): Set<string> {
	return new Set(
		extensions
			.map((ext) => ext.trim().toLowerCase())
			.filter(Boolean)
			.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`)),
	);
}

function isMarkdownPath(path: string, includeExtensions: Set<string>): boolean {
	return includeExtensions.has(extname(path).toLowerCase());
}

function displayPath(cwd: string, absolutePath: string): string {
	const rel = relative(cwd, absolutePath);
	if (!rel || rel.startsWith("..") || rel === absolutePath) return absolutePath;
	return rel;
}

function isToolCallBlock(block: unknown): block is { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> } {
	if (!block || typeof block !== "object") return false;
	const candidate = block as Record<string, unknown>;
	return (
		candidate.type === "toolCall" &&
		typeof candidate.id === "string" &&
		typeof candidate.name === "string" &&
		!!candidate.arguments &&
		typeof candidate.arguments === "object"
	);
}

function isMarkdownToolName(name: string): name is MarkdownToolName {
	return name === "edit" || name === "write";
}

export function parseIncludeExtensions(value: string): string[] {
	const parsed = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	return parsed.length > 0 ? parsed : [".md", ".markdown"];
}

export function getRecentMarkdownItems(ctx: ExtensionContext, options: RecentMarkdownOptions): RecentMarkdownItem[] {
	const entries = options.currentBranchOnly ? ctx.sessionManager.getBranch() : ctx.sessionManager.getEntries();
	const includeExtensions = normalizeExtensions(options.includeExtensions);
	const pendingById = new Map<string, PendingMarkdownToolCall>();
	const latestByPath = new Map<string, RecentMarkdownItem>();
	let occurrence = 0;

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const message = entry.message as any;

		if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const block of message.content) {
				if (!isToolCallBlock(block)) continue;
				if (!isMarkdownToolName(block.name)) continue;
				const rawPath = block.arguments.path;
				if (typeof rawPath !== "string" || !rawPath.trim()) continue;
				const absolutePath = resolve(ctx.cwd, rawPath);
				if (!isMarkdownPath(absolutePath, includeExtensions)) continue;
				pendingById.set(block.id, {
					path: absolutePath,
					relativePath: displayPath(ctx.cwd, absolutePath),
					toolName: block.name,
					toolCallId: block.id,
				});
			}
			continue;
		}

		if (message.role !== "toolResult") continue;
		if (!isMarkdownToolName(message.toolName)) continue;
		if (message.isError === true) continue;
		const pending = pendingById.get(message.toolCallId);
		if (!pending) continue;
		if (options.hideMissingFiles && !existsSync(pending.path)) continue;

		occurrence++;
		latestByPath.set(pending.path, {
			path: pending.path,
			relativePath: pending.relativePath,
			toolName: pending.toolName,
			toolCallId: pending.toolCallId,
			timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.parse(entry.timestamp),
			entryId: entry.id,
			occurrence,
		});
	}

	return [...latestByPath.values()]
		.sort((a, b) => b.occurrence - a.occurrence)
		.slice(0, Math.max(1, Math.floor(options.maxResults)));
}

export function formatItemTime(item: RecentMarkdownItem): string {
	if (!Number.isFinite(item.timestamp)) return "--:--";
	const date = new Date(item.timestamp);
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
}
