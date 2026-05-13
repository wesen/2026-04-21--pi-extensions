import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";
import { getRecentMarkdownItems, parseIncludeExtensions, type RecentMarkdownItem } from "./history";
import { RecentMarkdownPicker, type RecentMarkdownPickerResult } from "./ui";

interface MarkdownRecentViewerState {
	maxResults: number;
	includeExtensions: string;
	currentBranchOnly: boolean;
	openDark: boolean;
	noReload: boolean;
	hideMissingFiles: boolean;
}

function createState(): MarkdownRecentViewerState {
	return {
		maxResults: 50,
		includeExtensions: ".md,.markdown",
		currentBranchOnly: true,
		openDark: false,
		noReload: false,
		hideMissingFiles: true,
	};
}

function positiveInteger(value: unknown, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.floor(parsed);
}

function boolValue(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	return fallback;
}

function getItems(ctx: ExtensionContext, state: MarkdownRecentViewerState): RecentMarkdownItem[] {
	return getRecentMarkdownItems(ctx, {
		includeExtensions: parseIncludeExtensions(state.includeExtensions),
		maxResults: state.maxResults,
		currentBranchOnly: state.currentBranchOnly,
		hideMissingFiles: state.hideMissingFiles,
	});
}

function formatStatus(ctx: ExtensionContext, state: MarkdownRecentViewerState): string {
	const count = getItems(ctx, state).length;
	return [
		`markdown-recent-viewer: ${count} markdown file(s) from session ${state.currentBranchOnly ? "branch" : "entries"}`,
		`maxResults=${state.maxResults}`,
		`includeExtensions=${state.includeExtensions}`,
		`hideMissingFiles=${state.hideMissingFiles}`,
	].join("\n");
}

async function openWithMdView(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: MarkdownRecentViewerState, item: RecentMarkdownItem): Promise<void> {
	const args = ["view"];
	if (state.openDark) args.push("--dark");
	if (state.noReload) args.push("--no-reload");
	args.push(item.path);

	const result = await pi.exec("md-view", args, { cwd: ctx.cwd, timeout: 15_000 });
	if (result.code !== 0) {
		ctx.ui.notify(
			[
				`md-view failed for ${item.relativePath}`,
				`exit code: ${result.code}`,
				result.stderr.trim() || result.stdout.trim(),
			].filter(Boolean).join("\n"),
			"error",
		);
		return;
	}
	ctx.ui.notify(`Opened ${item.relativePath} with md-view`, "info");
}

async function openPicker(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: MarkdownRecentViewerState): Promise<void> {
	let items = getItems(ctx, state);
	if (items.length === 0) {
		ctx.ui.notify("No Markdown files found in successful edit/write tool calls for this session.", "warning");
	}

	while (true) {
		const result = await ctx.ui.custom<RecentMarkdownPickerResult>(
			(tui, theme, _keybindings, done) =>
				new RecentMarkdownPicker({
					items,
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
		if (result.action === "refresh") {
			items = getItems(ctx, state);
			ctx.ui.notify(`Refreshed: ${items.length} markdown file(s) from session history`, "info");
			continue;
		}
		await openWithMdView(pi, ctx, state, result.item);
		return;
	}
}

function formatItemList(items: RecentMarkdownItem[]): string {
	if (items.length === 0) return "No Markdown files found in successful edit/write tool calls for this session.";
	return items.map((item, index) => `${index + 1}. ${item.toolName.padEnd(5)} ${item.relativePath}`).join("\n");
}

export default function markdownRecentViewerExtension(pi: ExtensionAPI): void {
	const state = createState();

	registerPiExtension({
		id: "markdown-recent-viewer",
		name: "Markdown Recent Viewer",
		description: "Browse Markdown files edited or written by this Pi session and open them with md-view.",
		commands: ["markdown-recent-viewer", "md-recent"],
		tags: ["markdown", "docs", "viewer", "session", "tui"],
		run: async (ctx) => openPicker(pi, ctx, state),
		actions: [
			{
				id: "open",
				title: "Open recent Markdown picker",
				description: "Pick a Markdown file from successful edit/write tool calls and open it with md-view.",
				default: true,
				run: async (ctx) => openPicker(pi, ctx, state),
			},
			{
				id: "list",
				title: "List recent Markdown files",
				description: "Show a compact text list of recent Markdown files from session history.",
				run: async (ctx) => ctx.ui.notify(formatItemList(getItems(ctx, state)), "info"),
			},
		],
		docs: [
			{
				id: "overview",
				title: "Markdown Recent Viewer overview",
				path: "extensions/markdown-recent-viewer/README.md",
			},
		],
		settings: {
			kind: "schema",
			schema: {
				version: 1,
				title: "Markdown Recent Viewer Settings",
				description: "Configure how recent Markdown files are collected and opened.",
				sections: [
					{
						id: "main",
						title: "Main",
						fields: [
							{ id: "maxResults", label: "Max results", type: "number", description: "Maximum files shown in the picker." },
							{ id: "includeExtensions", label: "Include extensions", type: "string", description: "Comma-separated markdown extensions to include." },
							{ id: "currentBranchOnly", label: "Current branch only", type: "boolean", description: "Use active conversation branch instead of all session entries." },
							{ id: "hideMissingFiles", label: "Hide missing files", type: "boolean", description: "Hide files that no longer exist on disk." },
							{ id: "openDark", label: "Open dark", type: "boolean", description: "Pass --dark to md-view view." },
							{ id: "noReload", label: "No reload", type: "boolean", description: "Pass --no-reload to md-view view." },
						],
					},
				],
			},
			load: () => ({ ...state }),
			onApply: (values, ctx) => {
				state.maxResults = positiveInteger(values.maxResults, state.maxResults);
				if (typeof values.includeExtensions === "string") state.includeExtensions = values.includeExtensions;
				state.currentBranchOnly = boolValue(values.currentBranchOnly, state.currentBranchOnly);
				state.hideMissingFiles = boolValue(values.hideMissingFiles, state.hideMissingFiles);
				state.openDark = boolValue(values.openDark, state.openDark);
				state.noReload = boolValue(values.noReload, state.noReload);
				ctx.ui.notify(formatStatus(ctx, state), "info");
			},
		},
	});

	pi.registerCommand("markdown-recent-viewer", {
		description: "Open recent Markdown files from session edit/write history with md-view",
		handler: async (_args, ctx) => openPicker(pi, ctx, state),
	});

	pi.registerCommand("md-recent", {
		description: "Alias for /markdown-recent-viewer",
		handler: async (_args, ctx) => openPicker(pi, ctx, state),
	});
}
