import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapturedResponse {
	turnIndex: number;
	capturedAt: string;
	sessionId: string;
	entryId: string;
	modelProvider: string | undefined;
	modelId: string | undefined;
	modelName: string | undefined;
	text: string;
	textLength: number;
}

export interface ResponseViewerSettings {
	openDark: boolean;
	noReload: boolean;
	autoOpen: boolean;
	browser: string;
}

export interface ResponseViewerState {
	lastSavedPath: string | undefined;
	lastSavedTurnIndex: number | undefined;
	settings: ResponseViewerSettings;
}

export type ResponseDocumentKind = "generated" | "read";
export type ResponseDocumentToolName = "write" | "edit" | "read";

export interface ResponseDocumentContextItem {
	kind: ResponseDocumentKind;
	toolName: ResponseDocumentToolName;
	toolCallId: string;
	entryId: string;
	absolutePath: string;
	displayPath: string;
	linkTarget: string;
	exists: boolean;
	timestamp: string | undefined;
}

export interface ResponseOutputPaths {
	lastResponsePath: string;
	timestampedPath: string;
}

export interface ResponseMarkdownContext {
	title: string;
	source: "pi-response-viewer";
	cwd: string;
	outputPath: string;
	outputPaths: ResponseOutputPaths;
	documents: ResponseDocumentContextItem[];
}

interface ToolCallBlock {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

interface PendingDocumentToolCall {
	id: string;
	name: ResponseDocumentToolName;
	absolutePath: string;
}

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

export function createState(): ResponseViewerState {
	return {
		lastSavedPath: undefined,
		lastSavedTurnIndex: undefined,
		settings: {
			openDark: false,
			noReload: false,
			autoOpen: false,
			browser: "",
		},
	};
}

// ---------------------------------------------------------------------------
// Extract responses from session history (survives /reload)
// ---------------------------------------------------------------------------

function stripSummary(text: string): string {
	// Remove <summary>...</summary> blocks (including newlines inside)
	return text.replace(/\n?<summary>[\s\S]*?<\/summary>\n?/g, "").trim();
}

function extractTextFromContent(content: unknown[]): string {
	const parts: string[] = [];
	for (const block of content) {
		if (block && typeof block === "object" && "type" in block && (block as any).type === "text") {
			parts.push((block as any).text ?? "");
		}
	}
	return stripSummary(parts.join("\n\n").trim());
}

export function getResponsesFromSession(ctx: ExtensionContext): CapturedResponse[] {
	const entries = ctx.sessionManager.getBranch();
	const sessionId = ctx.sessionManager.getSessionId();
	const responses: CapturedResponse[] = [];
	let turnIndex = 0;

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const message = (entry as any).message;
		if (!message || message.role !== "assistant") continue;
		if (!Array.isArray(message.content)) continue;

		const text = extractTextFromContent(message.content);
		if (!text) continue;

		responses.push({
			turnIndex,
			capturedAt: entry.timestamp,
			sessionId,
			entryId: entry.id,
			modelProvider: ctx.model?.provider,
			modelId: ctx.model?.id,
			modelName: ctx.model?.name,
			text,
			textLength: text.length,
		});
		turnIndex++;
	}

	return responses;
}

export function lastResponse(responses: CapturedResponse[]): CapturedResponse | undefined {
	return responses.length > 0 ? responses[responses.length - 1] : undefined;
}

// ---------------------------------------------------------------------------
// Previous-turn document context
// ---------------------------------------------------------------------------

const DOCUMENT_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);

function isToolCallBlock(block: unknown): block is ToolCallBlock {
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

function isDocumentToolName(name: string): name is ResponseDocumentToolName {
	return name === "read" || name === "write" || name === "edit";
}

function isDocumentPath(path: string): boolean {
	return DOCUMENT_EXTENSIONS.has(extname(path).toLowerCase());
}

function documentKindForTool(toolName: ResponseDocumentToolName): ResponseDocumentKind {
	return toolName === "read" ? "read" : "generated";
}

function displayPath(cwd: string, absolutePath: string): string {
	const rel = relative(cwd, absolutePath);
	if (!rel || rel.startsWith("..") || rel === absolutePath) return absolutePath;
	return rel;
}

function linkTarget(_outputPath: string, absolutePath: string): string {
	return `/render?file=${encodeURIComponent(absolutePath)}`;
}

function isAssistantTextEntry(entry: unknown): boolean {
	if (!entry || typeof entry !== "object") return false;
	const candidate = entry as any;
	if (candidate.type !== "message") return false;
	const message = candidate.message;
	return message?.role === "assistant" && Array.isArray(message.content) && !!extractTextFromContent(message.content);
}

function previousTurnWindow(entries: unknown[], responseEntryId: string): unknown[] {
	const selectedIndex = entries.findIndex((entry: any) => entry?.id === responseEntryId);
	if (selectedIndex < 0) return [];

	let start = 0;
	for (let i = selectedIndex - 1; i >= 0; i--) {
		if (isAssistantTextEntry(entries[i])) {
			start = i + 1;
			break;
		}
	}

	return entries.slice(start, selectedIndex);
}

function itemTimestamp(entry: any, message: any): string | undefined {
	if (typeof message?.timestamp === "number") return new Date(message.timestamp).toISOString();
	if (typeof entry?.timestamp === "string") return entry.timestamp;
	return undefined;
}

function collectDocumentsFromWindow(ctx: ExtensionContext, entries: unknown[], outputPath: string): ResponseDocumentContextItem[] {
	const pendingById = new Map<string, PendingDocumentToolCall>();
	const latestByKey = new Map<string, ResponseDocumentContextItem>();

	for (const entry of entries) {
		if (!entry || typeof entry !== "object" || (entry as any).type !== "message") continue;
		const message = (entry as any).message;
		if (!message) continue;

		if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const block of message.content) {
				if (!isToolCallBlock(block)) continue;
				if (!isDocumentToolName(block.name)) continue;
				const rawPath = block.arguments.path;
				if (typeof rawPath !== "string" || !rawPath.trim()) continue;
				const absolutePath = resolve(ctx.cwd, rawPath);
				if (!isDocumentPath(absolutePath)) continue;
				pendingById.set(block.id, { id: block.id, name: block.name, absolutePath });
			}
			continue;
		}

		if (message.role !== "toolResult") continue;
		if (message.isError === true) continue;
		const pending = pendingById.get(message.toolCallId);
		if (!pending) continue;

		const kind = documentKindForTool(pending.name);
		const item: ResponseDocumentContextItem = {
			kind,
			toolName: pending.name,
			toolCallId: pending.id,
			entryId: (entry as any).id,
			absolutePath: pending.absolutePath,
			displayPath: displayPath(ctx.cwd, pending.absolutePath),
			linkTarget: linkTarget(outputPath, pending.absolutePath),
			exists: existsSync(pending.absolutePath),
			timestamp: itemTimestamp(entry, message),
		};
		latestByKey.set(`${kind}:${pending.absolutePath}`, item);
	}

	return [...latestByKey.values()];
}

export function getPreviousTurnDocumentContext(
	ctx: ExtensionContext,
	response: CapturedResponse,
	outputPath: string,
): ResponseDocumentContextItem[] {
	const entries = ctx.sessionManager.getBranch();
	return collectDocumentsFromWindow(ctx, previousTurnWindow(entries, response.entryId), outputPath);
}

// ---------------------------------------------------------------------------
// Temp file management
// ---------------------------------------------------------------------------

export function ensureTempDir(overrideDir?: string): string {
	const dir = overrideDir?.trim() || join(tmpdir(), "pi-response-viewer");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

export function timestampSlug(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

function yamlScalar(value: string | number | boolean | undefined): string {
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	if (!value) return '""';
	return JSON.stringify(value);
}

function markdownCode(value: string | undefined): string {
	return `\`${(value || "").replace(/`/g, "\\`")}\``;
}

function markdownLinkLabel(value: string): string {
	return value.replace(/]/g, "\\]");
}

function markdownLinkTarget(value: string): string {
	return value;
}

function formatModel(response: CapturedResponse): string {
	return [response.modelProvider, response.modelId].filter(Boolean).join("/") || "unknown";
}

function plural(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function buildMarkdownContext(
	ctx: ExtensionContext,
	response: CapturedResponse,
	outputPath: string,
	outputPaths: ResponseOutputPaths,
): ResponseMarkdownContext {
	return {
		title: `Pi Response — Turn ${response.turnIndex + 1}`,
		source: "pi-response-viewer",
		cwd: ctx.cwd,
		outputPath,
		outputPaths,
		documents: getPreviousTurnDocumentContext(ctx, response, outputPath),
	};
}

function renderYamlDocumentList(items: ResponseDocumentContextItem[], indent: string): string[] {
	return items.flatMap((item) => [
		`${indent}- path: ${yamlScalar(item.absolutePath)}`,
		`${indent}  relativePath: ${yamlScalar(item.displayPath)}`,
		`${indent}  linkTarget: ${yamlScalar(item.linkTarget)}`,
		`${indent}  toolName: ${yamlScalar(item.toolName)}`,
		`${indent}  toolCallId: ${yamlScalar(item.toolCallId)}`,
		`${indent}  entryId: ${yamlScalar(item.entryId)}`,
		`${indent}  exists: ${yamlScalar(item.exists)}`,
		`${indent}  timestamp: ${yamlScalar(item.timestamp)}`,
	]);
}

function renderFrontmatter(response: CapturedResponse, metadata: ResponseMarkdownContext): string[] {
	const generated = metadata.documents.filter((item) => item.kind === "generated");
	const read = metadata.documents.filter((item) => item.kind === "read");
	return [
		"---",
		`title: ${yamlScalar(metadata.title)}`,
		`source: ${yamlScalar(metadata.source)}`,
		"session:",
		`  id: ${yamlScalar(response.sessionId)}`,
		`  responseEntryId: ${yamlScalar(response.entryId)}`,
		`  turnIndex: ${yamlScalar(response.turnIndex)}`,
		`  turnNumber: ${yamlScalar(response.turnIndex + 1)}`,
		`capturedAt: ${yamlScalar(response.capturedAt)}`,
		"model:",
		`  provider: ${yamlScalar(response.modelProvider)}`,
		`  id: ${yamlScalar(response.modelId)}`,
		`  name: ${yamlScalar(response.modelName)}`,
		"paths:",
		`  lastResponse: ${yamlScalar(metadata.outputPaths.lastResponsePath)}`,
		`  timestampedCopy: ${yamlScalar(metadata.outputPaths.timestampedPath)}`,
		"documents:",
		...(generated.length > 0 ? ["  generated:", ...renderYamlDocumentList(generated, "    ")] : ["  generated: []"]),
		...(read.length > 0 ? ["  read:", ...renderYamlDocumentList(read, "    ")] : ["  read: []"]),
		"---",
	];
}

function renderMarkdownDocumentList(items: ResponseDocumentContextItem[]): string[] {
	if (items.length === 0) return ["- None detected."];
	return items.map((item) => {
		const target = item.exists
			? `[${markdownLinkLabel(item.displayPath)}](${markdownLinkTarget(item.linkTarget)})`
			: markdownCode(item.displayPath);
		return `- ${target} — ${markdownCode(item.toolName)}, ${item.exists ? "exists" : "missing"}`;
	});
}

function renderIntro(response: CapturedResponse, metadata: ResponseMarkdownContext): string[] {
	const generated = metadata.documents.filter((item) => item.kind === "generated");
	const read = metadata.documents.filter((item) => item.kind === "read");
	const model = formatModel(response);
	return [
		`# ${metadata.title}`,
		"",
		`> Session ${markdownCode(response.sessionId)}, turn ${response.turnIndex + 1}, captured ${markdownCode(response.capturedAt)}.`,
		`> Model: ${markdownCode(model)}.`,
		`> Previous-turn context: ${plural(generated.length, "generated document")}, ${plural(read.length, "read document")}.`,
		"",
		"## Context metadata",
		"",
		`- **Session:** ${markdownCode(response.sessionId)}`,
		`- **Entry:** ${markdownCode(response.entryId)}`,
		`- **Turn:** ${response.turnIndex + 1} (index ${response.turnIndex})`,
		`- **Captured:** ${markdownCode(response.capturedAt)}`,
		`- **Model:** ${markdownCode(model)}${response.modelName ? ` (${markdownCode(response.modelName)})` : ""}`,
		"- **Saved files:**",
		`  - ${markdownCode("last-response.md")}: ${markdownCode(metadata.outputPaths.lastResponsePath)}`,
		`  - timestamped copy: ${markdownCode(metadata.outputPaths.timestampedPath)}`,
		"",
		"### Generated documents from previous turn",
		"",
		...renderMarkdownDocumentList(generated),
		"",
		"### Documents read in previous turn",
		"",
		...renderMarkdownDocumentList(read),
		"",
		"---",
		"",
		"## Response",
		"",
	];
}

export function renderMarkdown(response: CapturedResponse, metadata: ResponseMarkdownContext): string {
	return [
		...renderFrontmatter(response, metadata),
		"",
		...renderIntro(response, metadata),
		response.text,
		"",
	].join("\n");
}

export function saveToTempFile(ctx: ExtensionContext, response: CapturedResponse, overrideDir?: string): string {
	const dir = ensureTempDir(overrideDir);

	// Always write last-response.md (overwritten each time) for compatibility.
	const lastPath = join(dir, "last-response.md");

	// Also write a timestamped copy for stable viewing/history.
	const slug = timestampSlug();
	const timestampedPath = join(dir, `${slug}-turn-${response.turnIndex + 1}.md`);
	const outputPaths = { lastResponsePath: lastPath, timestampedPath };

	writeFileSync(lastPath, renderMarkdown(response, buildMarkdownContext(ctx, response, lastPath, outputPaths)), "utf-8");
	writeFileSync(timestampedPath, renderMarkdown(response, buildMarkdownContext(ctx, response, timestampedPath, outputPaths)), "utf-8");

	return timestampedPath;
}

// ---------------------------------------------------------------------------
// md-view invocation
// ---------------------------------------------------------------------------

export async function openWithMdView(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: ResponseViewerState,
	path: string,
): Promise<void> {
	const args = ["view"];
	if (state.settings.openDark) args.push("--dark");
	if (state.settings.noReload) args.push("--no-reload");
	if (state.settings.browser.trim()) args.push("--browser", state.settings.browser.trim());
	args.push(path);

	const result = await pi.exec("md-view", args, { cwd: ctx.cwd, timeout: 15_000 });
	if (result.code !== 0) {
		ctx.ui.notify(
			[
				`md-view failed for ${path}`,
				`exit code: ${result.code}`,
				result.stderr.trim() || result.stdout.trim(),
			].filter(Boolean).join("\n"),
			"error",
		);
		return;
	}
	ctx.ui.notify(`Opened in md-view: ${path}`, "info");
}

// ---------------------------------------------------------------------------
// Preview helper
// ---------------------------------------------------------------------------

export function previewResponse(response: CapturedResponse, maxChars = 1000): string {
	const prefix = response.text.length > maxChars ? `${response.text.slice(0, maxChars)}…` : response.text;
	return [
		`Turn: ${response.turnIndex + 1} (index ${response.turnIndex})`,
		`Captured: ${response.capturedAt}`,
		`Model: ${[response.modelProvider, response.modelId].filter(Boolean).join("/") || "(unknown)"}`,
		`Length: ${response.textLength.toLocaleString()} chars`,
		"",
		prefix,
	].join("\n");
}

// ---------------------------------------------------------------------------
// Status bar formatting
// ---------------------------------------------------------------------------

export function formatStatusShort(ctx: ExtensionContext): string {
	const responses = getResponsesFromSession(ctx);
	const count = responses.length;
	if (count === 0) return "rv:no-responses";
	const last = lastResponse(responses)!;
	const turn = String(last.turnIndex + 1);
	const chars = last.textLength.toLocaleString();
	return `rv:${count}turns/last:${turn}/chars:${chars}`;
}
