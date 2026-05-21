import type { AssistantMessage, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapturedResponse {
	turnIndex: number;
	capturedAt: string;
	sessionId: string;
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
	lastResponse: CapturedResponse | undefined;
	lastSavedPath: string | undefined;
	settings: ResponseViewerSettings;
}

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

export function createState(): ResponseViewerState {
	return {
		lastResponse: undefined,
		lastSavedPath: undefined,
		settings: {
			openDark: false,
			noReload: false,
			autoOpen: false,
			browser: "",
		},
	};
}

// ---------------------------------------------------------------------------
// Response extraction & capture
// ---------------------------------------------------------------------------

export function extractAssistantText(message: AssistantMessage): string {
	const parts: string[] = [];
	for (const block of message.content) {
		if (block.type === "text") {
			parts.push(block.text);
		}
	}
	return parts.join("\n\n").trim();
}

export function captureResponse(
	ctx: ExtensionContext,
	turnIndex: number,
	message: AssistantMessage,
): CapturedResponse | undefined {
	const text = extractAssistantText(message);
	if (!text) return undefined;
	return {
		turnIndex,
		capturedAt: new Date().toISOString(),
		sessionId: ctx.sessionManager.getSessionId(),
		modelProvider: ctx.model?.provider,
		modelId: ctx.model?.id,
		modelName: ctx.model?.name,
		text,
		textLength: text.length,
	};
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

function yamlString(value: string | undefined): string {
	if (!value) return '""';
	return JSON.stringify(value);
}

export function renderMarkdown(response: CapturedResponse): string {
	return [
		"---",
		`Title: ${yamlString(`Pi Response — Turn ${response.turnIndex + 1}`)}`,
		`Source: ${yamlString("pi-response-viewer")}`,
		`SessionId: ${yamlString(response.sessionId)}`,
		`TurnIndex: ${response.turnIndex}`,
		`CapturedAt: ${yamlString(response.capturedAt)}`,
		`ModelProvider: ${yamlString(response.modelProvider)}`,
		`ModelId: ${yamlString(response.modelId)}`,
		`ModelName: ${yamlString(response.modelName)}`,
		"---",
		"",
		`# Pi Response — Turn ${response.turnIndex + 1}`,
		"",
		response.text,
		"",
	].join("\n");
}

export function saveToTempFile(response: CapturedResponse, overrideDir?: string): string {
	const dir = ensureTempDir(overrideDir);

	// Always write last-response.md (overwritten each time, md-view live-reloads)
	const lastPath = join(dir, "last-response.md");
	writeFileSync(lastPath, renderMarkdown(response), "utf-8");

	// Also write a timestamped copy for history
	const slug = timestampSlug();
	const timestampedPath = join(dir, `${slug}-turn-${response.turnIndex + 1}.md`);
	writeFileSync(timestampedPath, renderMarkdown(response), "utf-8");

	return lastPath;
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
