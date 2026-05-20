/**
 * session-search — Search tool call arguments/results in session history
 * and navigate to match points for forking.
 *
 * Commands:
 *   /session-search [query]   Open the search overlay
 *
 * Actions (via /px):
 *   search           Search session history (default)
 *   search-file      Search current file path in tool calls
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";
import { SessionSearchOverlay } from "./ui";

const COMMAND = "session-search";
const WIDGET_KEY = "session-search";

/** In-memory status for the dashboard widget. */
let lastSearchSummary: string | null = null;

export default function sessionSearchExtension(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "session-search",
		name: "Session Search",
		description:
			"Search tool call arguments and results in session history. Navigate to match points to fork.",
		commands: [COMMAND],
		tags: ["search", "history", "fork", "navigation"],

		// Default action: open search overlay
		run: async (ctx) => {
			await openSearchOverlay(ctx);
		},

		actions: [
			{
				id: "search",
				title: "Search session history",
				description:
					"Search for a string in tool call arguments and results.",
				default: true,
				run: async (ctx) => {
					await openSearchOverlay(ctx);
				},
			},
			{
				id: "search-file",
				title: "Search current file history",
				description:
					"Search for the active file path in tool calls (reads, writes, edits).",
				run: async (ctx) => {
					await openSearchOverlay(ctx);
				},
			},
		],

		docs: [
			{
				id: "overview",
				title: "Session Search overview",
				markdown: `# Session Search

Search for strings in tool call arguments and results across the session history.
Select a match to navigate to that point in the conversation and fork.

## Commands
- \`/session-search [query]\` — Open the search overlay
- \`/session-search myFunction\` — Search for "myFunction" immediately

## Features
- Searches tool call arguments (file paths, content, commands)
- Searches tool results (file content returned by read, output from bash)
- Shows chronological match list with turn numbers and timestamps
- Navigate to match points to fork the conversation
- Fork from match points to create new sessions

## Key bindings (in search overlay)
- \`↑↓\` navigate matches
- \`Enter\` navigate to match point (rewind session)
- \`f\` fork from match point (new session)
- \`Tab\` cycle detail (compact/expanded/full)
- \`Ctrl+U\` clear query
- \`Esc\` close
`,
			},
		],

		widgets: [
			{
				id: "last-search",
				title: "Session Search Status",
				defaultZone: "statusBar",
				defaultVariant: "short",
				priority: 70,
				render: ({ variant }) => {
					if (!lastSearchSummary) return "";
					if (variant === "short") return `search:${lastSearchSummary}`;
					return [
						"Session Search",
						`Last: ${lastSearchSummary}`,
					];
				},
			},
		],
	});

	// ── /session-search command ────────────────────────────
	pi.registerCommand(COMMAND, {
		description:
			"Search tool call arguments and results in session history",
		handler: async (args, ctx) => {
			await openSearchOverlay(ctx, args.trim() || undefined);
		},
	});


}

// ── Search overlay flow ──────────────────────────────────────

async function openSearchOverlay(
	ctx: ExtensionCommandContext,
	prefill?: string,
): Promise<void> {
	const result = await ctx.ui.custom<import("./types").SessionSearchResult | null>(
		(tui, theme, _keybindings, done) =>
			new SessionSearchOverlay({
				tui,
				theme,
				done,
				sessionManager: ctx.sessionManager,
				prefill,
			}),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "85%",
				maxHeight: "80%",
				margin: 1,
			},
		},
	);

	if (!result) return;

	const { match, action } = result;

	// Update dashboard widget
	lastSearchSummary = `${match.toolName} T${match.turnIndex} ${match.matchLocation}`;

	const targetId = match.parentUserEntryId;
	if (!targetId) {
		ctx.ui.notify(
			"Cannot find parent user message for this tool call — it may be in a compacted region",
			"warning",
		);
		return;
	}

	if (action === "navigate") {
		const navResult = await ctx.navigateTree(targetId, {
			summarize: true,
			label: `search:${match.toolName}:${match.toolCallId}`,
		});

		if (navResult.cancelled) {
			ctx.ui.notify("Navigation cancelled", "info");
		}
		// If not cancelled, the session has been rewound and
		// the user message is in the editor for re-submission
	}

	if (action === "fork") {
		const forkResult = await ctx.fork(targetId, {
			withSession: async (newCtx) => {
				newCtx.ui.notify(
					`Forked from search match: ${match.toolName} in turn ${match.turnIndex}`,
					"info",
				);
			},
		});

		if (forkResult.cancelled) {
			ctx.ui.notify("Fork cancelled", "info");
		}
	}
}
