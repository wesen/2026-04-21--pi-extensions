import type { AssistantMessage, ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import {
	captureResponse,
	createState,
	formatStatusShort,
	lastResponse,
	openWithMdView,
	previewResponse,
	saveToTempFile,
	type CapturedResponse,
	type ResponseViewerState,
} from "./response";
import { ResponsePicker, type ResponsePickerResult } from "./ui";
import { registerPiExtension } from "../_shared/registry";

const STATUS_KEY = "response-viewer";

function requireResponses(ctx: ExtensionCommandContext, state: ResponseViewerState): CapturedResponse[] | undefined {
	if (state.responses.length === 0) {
		ctx.ui.notify("No assistant responses captured yet. Ask Pi for a response first.", "warning");
		return undefined;
	}
	return state.responses;
}

function setStatus(ctx: ExtensionCommandContext, state: ResponseViewerState): void {
	if (!ctx.hasUI) return;
	if (state.responses.length === 0) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	ctx.ui.setStatus(STATUS_KEY, formatStatusShort(state));
}

async function saveAndOpenResponse(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: ResponseViewerState,
	response: CapturedResponse,
): Promise<void> {
	try {
		const path = saveToTempFile(response);
		state.lastSavedPath = path;
		state.lastSavedTurnIndex = response.turnIndex;
		setStatus(ctx, state);
		await openWithMdView(pi, ctx, state, path);
	} catch (error) {
		ctx.ui.notify(
			`Failed to save/open response: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

async function openPicker(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: ResponseViewerState): Promise<void> {
	const responses = requireResponses(ctx, state);
	if (!responses) return;

	// Show most recent first in the picker
	const reversed = [...responses].reverse();

	while (true) {
		const result = await ctx.ui.custom<ResponsePickerResult>(
			(tui, theme, _keybindings, done) =>
				new ResponsePicker({
					responses: reversed,
					theme,
					tui,
					done,
				}),
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: "90%",
					maxHeight: "85%",
					margin: 1,
				},
			},
		);

		if (result.action === "cancel") return;
		if (result.action === "open") {
			await saveAndOpenResponse(pi, ctx, state, result.response);
			return;
		}
	}
}

async function saveAndOpenLast(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: ResponseViewerState): Promise<void> {
	const response = lastResponse(state);
	if (!response) {
		ctx.ui.notify("No assistant response captured yet. Ask Pi for a response first.", "warning");
		return;
	}
	await saveAndOpenResponse(pi, ctx, state, response);
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
		description: "Browse all assistant responses from this session, pick one, and open it in md-view for comfortable reading.",
		commands: ["rv", "response-view", "rv-last", "rv-preview", "rv-reopen"],
		tags: ["response", "viewer", "markdown", "md-view"],

		run: async (ctx) => openPicker(pi, ctx, state),

		actions: [
			{
				id: "browse",
				title: "Browse responses",
				description: "Open a picker showing all assistant responses from this session. Select one to save and open in md-view.",
				default: true,
				run: async (ctx) => openPicker(pi, ctx, state),
			},
			{
				id: "open-last",
				title: "Open last response",
				description: "Save and open the most recent assistant response directly (no picker).",
				run: async (ctx) => saveAndOpenLast(pi, ctx, state),
			},
			{
				id: "preview",
				title: "Preview last response",
				description: "Show a text preview of the most recent assistant response in the terminal.",
				run: async (ctx) => {
					const response = lastResponse(state);
					if (!response) {
						ctx.ui.notify("No assistant response captured yet.", "warning");
						return;
					}
					ctx.ui.notify(previewResponse(response), "info");
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

		settings: {
			kind: "schema",
			schema: {
				version: 1,
				title: "Response Viewer Settings",
				description: "Configure how responses are saved and opened with md-view.",
				sections: [
					{
						id: "main",
						title: "Main",
						fields: [
							{
								id: "openDark",
								label: "Open dark",
								type: "boolean",
								description: "Pass --dark to md-view view for a dark theme.",
							},
							{
								id: "noReload",
								label: "No reload",
								type: "boolean",
								description: "Pass --no-reload to md-view view to disable live reload.",
							},
							{
								id: "autoOpen",
								label: "Auto-open",
								type: "boolean",
								description: "Automatically open every new assistant response in md-view.",
							},
							{
								id: "browser",
								label: "Browser command",
								type: "string",
								description: "Browser command for md-view (e.g. 'google-chrome'). Leave empty for default (firefox --new-window).",
								placeholder: "firefox --new-window",
							},
						],
					},
				],
			},
			load: () => ({ ...state.settings }),
			onApply: (values, ctx) => {
				state.settings.openDark = values.openDark === true;
				state.settings.noReload = values.noReload === true;
				state.settings.autoOpen = values.autoOpen === true;
				if (typeof values.browser === "string") state.settings.browser = values.browser;
				ctx.ui.notify(
					`response-viewer settings: dark=${state.settings.openDark} noreload=${state.settings.noReload} auto=${state.settings.autoOpen} browser=${state.settings.browser || "(default)"}`,
					"info",
				);
			},
		},

		widgets: [
			{
				id: "status",
				title: "Response Viewer Status",
				description: "Shows captured response count and last turn info.",
				defaultZone: "statusBar",
				defaultVariant: "short",
				priority: 70,
				render: () => formatStatusShort(state),
			},
		],
	});

	// Capture assistant responses on turn_end
	pi.on("turn_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		const captured = captureResponse(ctx, event.turnIndex, event.message as AssistantMessage);
		if (!captured) return;

		// Replace existing entry for the same turn index (e.g. after tree navigation)
		const existing = state.responses.findIndex((r) => r.turnIndex === captured.turnIndex);
		if (existing >= 0) {
			state.responses[existing] = captured;
		} else {
			state.responses.push(captured);
		}

		setStatus(ctx as ExtensionCommandContext, state);

		// Auto-open if enabled
		if (state.settings.autoOpen) {
			try {
				const path = saveToTempFile(captured);
				state.lastSavedPath = path;
				state.lastSavedTurnIndex = captured.turnIndex;
				setStatus(ctx as ExtensionCommandContext, state);
				await openWithMdView(pi, ctx as ExtensionCommandContext, state, path);
			} catch {
				// Silent fail for auto-open — user can manually trigger
			}
		}
	});

	// Commands
	pi.registerCommand("rv", {
		description: "Browse all captured assistant responses and open one in md-view",
		handler: async (_args, ctx) => openPicker(pi, ctx, state),
	});

	pi.registerCommand("response-view", {
		description: "Browse all captured assistant responses and open one in md-view",
		handler: async (_args, ctx) => openPicker(pi, ctx, state),
	});

	pi.registerCommand("rv-last", {
		description: "Save and open the most recent assistant response directly in md-view",
		handler: async (_args, ctx) => saveAndOpenLast(pi, ctx, state),
	});

	pi.registerCommand("rv-preview", {
		description: "Preview the most recent captured assistant response in the terminal",
		handler: async (_args, ctx) => {
			const response = lastResponse(state);
			if (!response) {
				ctx.ui.notify("No assistant response captured yet.", "warning");
				return;
			}
			ctx.ui.notify(previewResponse(response), "info");
		},
	});

	pi.registerCommand("rv-reopen", {
		description: "Re-open the last saved response file in md-view",
		handler: async (_args, ctx) => reopenLast(pi, ctx, state),
	});
}
