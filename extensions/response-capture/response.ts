import type { AssistantMessage, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CapturedResponse {
	turnIndex: number;
	capturedAt: string;
	sessionId: string;
	sessionFile: string | undefined;
	modelProvider: string | undefined;
	modelId: string | undefined;
	modelName: string | undefined;
	text: string;
	textLength: number;
}

export interface ResponseCaptureState {
	lastResponse: CapturedResponse | undefined;
	lastSavedPath: string | undefined;
	lastSavedResponseTurnIndex: number | undefined;
}

export function createState(): ResponseCaptureState {
	return {
		lastResponse: undefined,
		lastSavedPath: undefined,
		lastSavedResponseTurnIndex: undefined,
	};
}

export function extractAssistantText(message: AssistantMessage): string {
	const parts: string[] = [];
	for (const block of message.content) {
		if (block.type === "text") {
			parts.push(block.text);
		}
	}
	return parts.join("\n\n").trim();
}

export function captureResponse(ctx: ExtensionContext, turnIndex: number, message: AssistantMessage): CapturedResponse | undefined {
	const text = extractAssistantText(message);
	if (!text) return undefined;
	return {
		turnIndex,
		capturedAt: new Date().toISOString(),
		sessionId: ctx.sessionManager.getSessionId(),
		sessionFile: ctx.sessionManager.getSessionFile(),
		modelProvider: ctx.model?.provider,
		modelId: ctx.model?.id,
		modelName: ctx.model?.name,
		text,
		textLength: text.length,
	};
}

function yamlString(value: string | undefined): string {
	if (!value) return "\"\"";
	return JSON.stringify(value);
}

export function renderCapturedResponse(response: CapturedResponse, title = "Last LLM Response"): string {
	return [
		"---",
		`Title: ${yamlString(title)}`,
		`Source: ${yamlString("pi-response-capture")}`,
		`SessionId: ${yamlString(response.sessionId)}`,
		`SessionFile: ${yamlString(response.sessionFile)}`,
		`TurnIndex: ${response.turnIndex}`,
		`CapturedAt: ${yamlString(response.capturedAt)}`,
		`ModelProvider: ${yamlString(response.modelProvider)}`,
		`ModelId: ${yamlString(response.modelId)}`,
		`ModelName: ${yamlString(response.modelName)}`,
		"---",
		"",
		`# ${title}`,
		"",
		response.text,
		"",
	].join("\n");
}

export function safeSlug(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "response";
}

export function timestampSlug(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

export function ensureCaptureDir(cwd: string): string {
	const dir = join(cwd, ".pi", "response-capture");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

export function saveCapturedResponse(cwd: string, response: CapturedResponse, name?: string): string {
	const title = name?.trim() || "Last LLM Response";
	const slug = safeSlug(name?.trim() || "response");
	const fileName = `${timestampSlug()}-${slug}.md`;
	const path = join(ensureCaptureDir(cwd), fileName);
	writeFileSync(path, renderCapturedResponse(response, title), "utf-8");
	return path;
}

export function hasSavedCurrentResponse(state: ResponseCaptureState): boolean {
	return !!state.lastResponse && !!state.lastSavedPath && state.lastSavedResponseTurnIndex === state.lastResponse.turnIndex;
}

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
