import type { AssistantMessage, ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { basename, extname } from "node:path";
import { chooseTicket, importFile } from "./docmgr";
import {
	captureResponse,
	createState,
	hasSavedCurrentResponse,
	previewResponse,
	saveCapturedResponse,
	type ResponseCaptureState,
} from "./response";
import { registerPiExtension } from "../_shared/registry";

const STATUS_KEY = "response-capture";

function setStatus(ctx: ExtensionCommandContext, state: ResponseCaptureState): void {
	if (!ctx.hasUI) return;
	const turn = state.lastResponse ? String(state.lastResponse.turnIndex + 1) : "-";
	const saved = hasSavedCurrentResponse(state) ? "saved" : "unsaved";
	ctx.ui.setStatus(STATUS_KEY, `response:${turn}/${saved}`);
}

function requireResponse(ctx: ExtensionCommandContext, state: ResponseCaptureState) {
	if (!state.lastResponse) {
		ctx.ui.notify("No assistant response captured yet. Ask Pi for a response first.", "warning");
		return undefined;
	}
	return state.lastResponse;
}

function saveLastResponse(ctx: ExtensionCommandContext, state: ResponseCaptureState, name?: string): string | undefined {
	const response = requireResponse(ctx, state);
	if (!response) return undefined;
	try {
		const path = saveCapturedResponse(ctx.cwd, response, name);
		state.lastSavedPath = path;
		state.lastSavedResponseTurnIndex = response.turnIndex;
		setStatus(ctx, state);
		return path;
	} catch (error) {
		ctx.ui.notify(`Failed to save response: ${error instanceof Error ? error.message : String(error)}`, "error");
		return undefined;
	}
}

function ensureSaved(ctx: ExtensionCommandContext, state: ResponseCaptureState, name?: string): string | undefined {
	if (hasSavedCurrentResponse(state) && state.lastSavedPath && existsSync(state.lastSavedPath)) return state.lastSavedPath;
	return saveLastResponse(ctx, state, name);
}

function importNameFromPath(path: string): string {
	const base = basename(path);
	const ext = extname(base);
	return ext ? base.slice(0, -ext.length) : base;
}

async function importSavedResponse(ctx: ExtensionCommandContext, state: ResponseCaptureState, args: string, saveName?: string): Promise<void> {
	const response = requireResponse(ctx, state);
	if (!response) return;
	let ticket: string | undefined;
	try {
		ticket = await chooseTicket(ctx, args);
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return;
	}
	if (!ticket) {
		ctx.ui.notify("Response import cancelled", "info");
		return;
	}

	const path = ensureSaved(ctx, state, saveName ?? `response-turn-${response.turnIndex + 1}`);
	if (!path) return;

	try {
		const output = await importFile(ctx.cwd, path, ticket, importNameFromPath(path));
		ctx.ui.notify([`Imported response into ${ticket}`, `File: ${path}`, output].filter(Boolean).join("\n\n"), "info");
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}

export default function responseCapture(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "response-capture",
		name: "Response Capture",
		description: "Captures the last assistant response, previews it, saves it to disk, and imports it into docmgr tickets.",
		commands: ["response-preview", "response-save", "response-import", "response-import-last"],
		tags: ["response", "docmgr", "capture"],
	});
	const state = createState();

	pi.on("turn_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		const captured = captureResponse(ctx, event.turnIndex, event.message as AssistantMessage);
		if (!captured) return;
		state.lastResponse = captured;
		state.lastSavedResponseTurnIndex = undefined;
		// Keep lastSavedPath for reference, but it no longer represents the current response.
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, `response:${event.turnIndex + 1}/unsaved`);
	});

	pi.registerCommand("response-preview", {
		description: "Preview the last captured assistant response",
		handler: async (_args, ctx) => {
			if (!state.lastResponse) {
				ctx.ui.notify("No assistant response captured yet. Ask Pi for a response first.", "warning");
				return;
			}
			ctx.ui.notify(previewResponse(state.lastResponse), "info");
		},
	});

	pi.registerCommand("response-save", {
		description: "Save the last assistant response to .pi/response-capture",
		handler: async (args, ctx) => {
			const path = saveLastResponse(ctx, state, args.trim() || undefined);
			if (path) ctx.ui.notify(`Saved response:\n${path}`, "info");
		},
	});

	pi.registerCommand("response-import", {
		description: "Save and import the last assistant response into a docmgr ticket",
		handler: async (args, ctx) => {
			await importSavedResponse(ctx, state, args.trim());
		},
	});

	pi.registerCommand("response-import-last", {
		description: "Import the last saved response file into a docmgr ticket without re-saving",
		handler: async (args, ctx) => {
			if (!state.lastSavedPath || !existsSync(state.lastSavedPath)) {
				ctx.ui.notify("No saved response file found. Run /response-save first.", "warning");
				return;
			}
			let ticket: string | undefined;
			try {
				ticket = await chooseTicket(ctx, args.trim());
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}
			if (!ticket) {
				ctx.ui.notify("Response import cancelled", "info");
				return;
			}
			try {
				const output = await importFile(ctx.cwd, state.lastSavedPath, ticket, importNameFromPath(state.lastSavedPath));
				ctx.ui.notify([`Imported saved response into ${ticket}`, `File: ${state.lastSavedPath}`, output].filter(Boolean).join("\n\n"), "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
