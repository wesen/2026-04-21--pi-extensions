import type { AssistantMessage, ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import {
	captureResponse,
	createState,
	openWithMdView,
	previewResponse,
	saveToTempFile,
	type ResponseViewerState,
} from "./response";
import { registerPiExtension } from "../_shared/registry";

const STATUS_KEY = "response-viewer";

function requireResponse(ctx: ExtensionCommandContext, state: ResponseViewerState) {
	if (!state.lastResponse) {
		ctx.ui.notify("No assistant response captured yet. Ask Pi for a response first.", "warning");
		return undefined;
	}
	return state.lastResponse;
}

function setStatus(ctx: ExtensionCommandContext, state: ResponseViewerState): void {
	if (!ctx.hasUI) return;
	if (!state.lastResponse) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	const turn = String(state.lastResponse.turnIndex + 1);
	const chars = state.lastResponse.textLength.toLocaleString();
	const saved = state.lastSavedPath ? "saved" : "unsaved";
	ctx.ui.setStatus(STATUS_KEY, `rv:turn:${turn}/chars:${chars}/${saved}`);
}

async function saveAndOpen(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: ResponseViewerState): Promise<void> {
	const response = requireResponse(ctx, state);
	if (!response) return;
	try {
		const path = saveToTempFile(response);
		state.lastSavedPath = path;
		setStatus(ctx, state);
		await openWithMdView(pi, ctx, state, path);
	} catch (error) {
		ctx.ui.notify(
			`Failed to save/open response: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

async function reopenLast(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: ResponseViewerState): Promise<void> {
	if (!state.lastSavedPath || !existsSync(state.lastSavedPath)) {
		ctx.ui.notify("No saved response file found. Run /rv first.", "warning");
		return;
	}
	await openWithMdView(pi, ctx, state, state.lastSavedPath);
}

export default function responseViewerExtension(pi: ExtensionAPI): void {
	const state = createState();

	registerPiExtension({
		id: "response-viewer",
		name: "Response Viewer",
		description: "Save the last model response as a temp Markdown file and open it with md-view for comfortable reading.",
		commands: ["rv", "response-view", "rv-preview", "rv-reopen"],
		tags: ["response", "viewer", "markdown", "md-view"],

		run: async (ctx) => saveAndOpen(pi, ctx, state),

		actions: [
			{
				id: "open",
				title: "Save and open last response",
				description: "Save the last assistant response as a temp Markdown file and open it in md-view.",
				default: true,
				run: async (ctx) => saveAndOpen(pi, ctx, state),
			},
			{
				id: "preview",
				title: "Preview last response",
				description: "Show a text preview of the last assistant response in the terminal.",
				run: async (ctx) => {
					const response = requireResponse(ctx, state);
					if (response) ctx.ui.notify(previewResponse(response), "info");
				},
			},
			{
				id: "reopen",
				title: "Re-open last saved file",
				description: "Re-open the last saved response file in md-view without re-saving.",
				run: async (ctx) => reopenLast(pi, ctx, state),
			},
		],

		docs: [
			{
				id: "overview",
				title: "Response Viewer overview",
				path: "extensions/response-viewer/README.md",
			},
		],
	});

	// Capture assistant responses on turn_end
	pi.on("turn_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		const captured = captureResponse(ctx, event.turnIndex, event.message as AssistantMessage);
		if (!captured) return;
		state.lastResponse = captured;
		state.lastSavedPath = undefined;
		setStatus(ctx as ExtensionCommandContext, state);

		// Auto-open if enabled
		if (state.settings.autoOpen) {
			try {
				const path = saveToTempFile(captured);
				state.lastSavedPath = path;
				setStatus(ctx as ExtensionCommandContext, state);
				await openWithMdView(pi, ctx as ExtensionCommandContext, state, path);
			} catch {
				// Silent fail for auto-open — user can manually trigger
			}
		}
	});

	// Commands
	pi.registerCommand("rv", {
		description: "Save last assistant response as temp Markdown and open in md-view",
		handler: async (_args, ctx) => saveAndOpen(pi, ctx, state),
	});

	pi.registerCommand("response-view", {
		description: "Save last assistant response as temp Markdown and open in md-view",
		handler: async (_args, ctx) => saveAndOpen(pi, ctx, state),
	});

	pi.registerCommand("rv-preview", {
		description: "Preview the last captured assistant response in the terminal",
		handler: async (_args, ctx) => {
			const response = requireResponse(ctx, state);
			if (response) ctx.ui.notify(previewResponse(response), "info");
		},
	});

	pi.registerCommand("rv-reopen", {
		description: "Re-open the last saved response file in md-view",
		handler: async (_args, ctx) => reopenLast(pi, ctx, state),
	});
}
