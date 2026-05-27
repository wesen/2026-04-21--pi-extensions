/**
 * session-tagger — Tag conversation moments for later analysis.
 *
 * Commands:
 *   /tag <tag1> [tag2] ... ["optional comment"]  — tag the current moment
 *   /tags [filter]                                — browse tags in this session
 *
 * Shortcut:
 *   ctrl+shift+t  — quick-tag dialog
 *
 * Tags are stored as custom_message entries (visible in timeline + LLM context)
 * and as labels on the tagged entry (visible in /tree navigator).
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { findTags, allTagNames, filterByTag, type TagDetails } from "./find-tags";
import { parseTagArgs } from "./parse-args";
import { tagColor } from "./tag-colors";
import { registerPiExtension } from "../_shared/registry";

const TAG_COMMAND = "tag";
const TAGS_COMMAND = "tags";

export default function sessionTagger(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "session-tagger",
		name: "Session Tagger",
		description: "Tag conversation moments for later analysis and fork from them.",
		commands: [TAG_COMMAND, TAGS_COMMAND],
		tags: ["session", "navigation", "analysis"],
		run: async (ctx) => quickTagDialog(pi, ctx),
		actions: [
			{
				id: "tag",
				title: "Tag current moment",
				description: 'Tag the current moment (usage: /tag <tag1> [tag2] ... ["comment"])',
				default: true,
				run: async (ctx) => quickTagDialog(pi, ctx),
			},
			{
				id: "browse-tags",
				title: "Browse tags in session",
				description: "Browse and act on tags in this session (optional filter: /tags <filter>)",
				run: async (ctx) => browseTags(pi, ctx, ""),
			},
		],

		palette: [
			{
				id: "quick-tag",
				title: "Quick tag",
				key: "t",
				description: "Tag the current conversation moment.",
				run: async (ctx) => quickTagDialog(pi, ctx),
			},
			{
				id: "browse-tags",
				title: "Browse tags",
				key: "b",
				description: "Browse and act on tags in this session.",
				run: async (ctx) => browseTags(pi, ctx, ""),
			},
		],
	});

	// ── Custom message renderer ──────────────────────────────
	pi.registerMessageRenderer(
		"session-tagger",
		(message, { expanded }, theme) => {
			const details = message.details as TagDetails | undefined;
			const tags = details?.tags ?? [];
			const comment = details?.comment ?? "";

			const tagParts = tags.map((t) => theme.fg(tagColor(t), t));
			const tagLine = tagParts.join(theme.fg("dim", ", "));

			let header = theme.fg("accent", "🏷️ ") + "[" + tagLine + "]";
			if (comment) {
				header += " " + theme.fg("text", comment);
			}

			let fullText = header;
			if (expanded && details) {
				const time = new Date(details.timestamp).toLocaleString();
				fullText +=
					"\n" + theme.fg("dim", `  Entry: ${details.targetEntryId}`);
				fullText += "\n" + theme.fg("dim", `  At: ${time}`);
			}

			const box = new Box(1, 0, (t) => theme.bg("customMessageBg", t));
			box.addChild(new Text(fullText, 0, 0));
			return box;
		},
	);

	// ── /tag command ─────────────────────────────────────────
	pi.registerCommand(TAG_COMMAND, {
		description:
			'Tag the current moment (usage: /tag <tag1> [tag2] ... ["comment"])',
		handler: async (args, ctx) => {
			const parsed = parseTagArgs(args);
			if (!parsed) {
				ctx.ui.notify(
					'Usage: /tag <tag1> [tag2] ... ["comment"]',
					"warning",
				);
				return;
			}
			await applyTag(pi, parsed.tags, parsed.comment, ctx);
		},
	});

	// ── /tags command ────────────────────────────────────────
	pi.registerCommand(TAGS_COMMAND, {
		description: "Browse tags in current session (optional: /tags <filter>)",
		handler: async (args, ctx) => {
			await browseTags(pi, ctx, args);
		},
	});

	// ── Quick-tag shortcut ───────────────────────────────────
	pi.registerShortcut("ctrl+shift+t", {
		description: "Quick-tag the current moment",
		handler: async (ctx) => {
			await quickTagDialog(pi, ctx);
		},
	});
}

// ── Flow helpers ─────────────────────────────────────────────

async function quickTagDialog(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const known = allTagNames(
		findTags(ctx.sessionManager.getEntries()),
	);
	const common = [
		"struggle",
		"breakthrough",
		"refactor",
		"debugging",
		"checkpoint",
		"question",
		"insight",
	];
	const available = [
		...new Set([...common, ...known]),
		"(custom)",
	];

	const tag = await ctx.ui.select("Pick tag:", available);
	if (!tag) return;

	let tags: string[];
	if (tag === "(custom)") {
		const custom = await ctx.ui.input("Tag name:", "my-tag");
		if (!custom) return;
		tags = [custom.toLowerCase().trim().replace(/\s+/g, "-")];
	} else {
		tags = [tag.toLowerCase()];
	}

	const comment = await ctx.ui.input("Comment (optional):", "");
	await applyTag(pi, tags, comment ?? "", ctx);
}

async function browseTags(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string): Promise<void> {
	const all = findTags(ctx.sessionManager.getEntries());
	if (all.length === 0) {
		ctx.ui.notify("No tags in this session", "info");
		return;
	}

	const filterTag = args.trim() || undefined;
	const entries = filterTag ? filterByTag(all, filterTag) : all;

	if (entries.length === 0) {
		ctx.ui.notify(`No tags matching "${filterTag}"`, "info");
		return;
	}

	// Build display strings for selection
	const displayItems = entries.map((e) => {
		const time = new Date(e.timestamp).toLocaleTimeString();
		const tagStr = e.tags.join(", ");
		const commentStr = e.comment ? ` — ${e.comment}` : "";
		return {
			display: `[${tagStr}]${commentStr}  ${time}`,
			entry: e,
		};
	});

	const selected = await ctx.ui.select(
		`Tags (${entries.length})${filterTag ? ` · filter: ${filterTag}` : ""}:`,
		displayItems.map((d) => d.display),
	);

	if (!selected) return;

	const idx = displayItems.findIndex((d) => d.display === selected);
	if (idx === -1) return;
	const tagEntry = entries[idx];

	const action = await ctx.ui.select("Action:", [
		"Fork from this point",
		"Cancel",
	]);

	if (action === "Fork from this point") {
		const result = await ctx.fork(tagEntry.targetEntryId, {
			position: "at",
			withSession: async (newCtx) => {
				newCtx.ui.notify(
					`Forked from tag: [${tagEntry.tags.join(", ")}]`,
					"info",
				);
			},
		});
		if (result.cancelled) {
			ctx.ui.notify("Fork cancelled", "info");
		}
	}
}

// ── Shared tagging logic ────────────────────────────────────

async function applyTag(
	pi: ExtensionAPI,
	tags: string[],
	comment: string,
	ctx: {
		sessionManager: {
			getBranch: () => Array<{
				type: string;
				id: string;
				message?: { role?: string };
				[key: string]: unknown;
			}>;
			getLeafId: () => string | undefined;
		};
		ui: { notify: (msg: string, level: string) => void };
	},
): Promise<void> {
	// Find target: last assistant message on the current branch
	const branch = ctx.sessionManager.getBranch();
	let targetId: string | undefined;
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (
			entry.type === "message" &&
			(entry.message as { role?: string })?.role === "assistant"
		) {
			targetId = entry.id;
			break;
		}
	}
	if (!targetId) {
		targetId = ctx.sessionManager.getLeafId();
	}
	if (!targetId) {
		ctx.ui.notify("No entry to tag", "warning");
		return;
	}

	const details: TagDetails = {
		tags,
		comment,
		targetEntryId: targetId,
		timestamp: Date.now(),
	};

	const tagStr = tags.join(", ");
	const content = comment ? `🏷️ [${tagStr}] ${comment}` : `🏷️ [${tagStr}]`;

	pi.sendMessage({
		customType: "session-tagger",
		content,
		display: true,
		details,
	});

	pi.setLabel(targetId, `🏷️ ${tagStr}`);

	ctx.ui.notify(`Tagged: [${tagStr}]`, "info");
}
