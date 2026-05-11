import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { registerPiExtension } from "../_shared/registry";
import {
	buildSelectiveCompactionUserMessage,
	parseSelectiveCompactionResponse,
	SELECTIVE_COMPACTION_SYSTEM_PROMPT,
	type GeneratedSelectiveCompaction,
} from "./prompt";
import {
	appendCompactedSession,
	choosePartition,
	LINKAGE_CUSTOM_TYPE,
	SUMMARY_CUSTOM_TYPE,
	type SelectivePartition,
} from "./session";

const COMMAND = "selective-compact";
const ALIAS = "scompact";

export default function selectiveCompaction(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "selective-compaction",
		name: "Selective Compaction",
		description: "Summarize a selected middle range of the current session into a new conversation.",
		commands: [COMMAND, ALIAS],
		tags: ["compaction", "session", "context"],
		run: async (ctx) => openSelectiveCompactionFlow(ctx),
		actions: [
			{
				id: "open",
				title: "Open selective compaction flow",
				description: "Select a range, summarize it, and create a replacement session.",
				default: true,
				run: async (ctx) => openSelectiveCompactionFlow(ctx),
			},
		],
		docs: [
			{
				id: "overview",
				title: "Selective Compaction overview",
				path: "extensions/selective-compaction/README.md",
			},
		],
	});

	pi.registerMessageRenderer(SUMMARY_CUSTOM_TYPE, (message, _options, theme) => {
		return new Text(`${theme.fg("accent", theme.bold("Selective Compaction Summary"))}\n${messageContentText(message.content)}`, 0, 0);
	});

	pi.registerMessageRenderer(LINKAGE_CUSTOM_TYPE, (message, _options, theme) => {
		return new Text(`${theme.fg("muted", theme.bold("Selective Compaction Linkage"))}\n${messageContentText(message.content)}`, 0, 0);
	});

	pi.registerCommand(COMMAND, {
		description: "Compact a selected middle range into a new session",
		handler: async (_args, ctx) => openSelectiveCompactionFlow(ctx),
	});

	pi.registerCommand(ALIAS, {
		description: "Alias for /selective-compact",
		handler: async (_args, ctx) => openSelectiveCompactionFlow(ctx),
	});
}

async function openSelectiveCompactionFlow(ctx: ExtensionCommandContext): Promise<void> {
	await ctx.waitForIdle();

	if (!ctx.hasUI) {
		ctx.ui.notify("selective-compaction requires interactive mode", "error");
		return;
	}
	if (!ctx.model) {
		ctx.ui.notify("No model selected", "error");
		return;
	}

	const partition = await choosePartition(ctx);
	if (!partition) return;

	const generated = await generateWithLoader(ctx, partition);
	if (!generated) return;

	const edited = await ctx.ui.editor("Edit selective compaction output", generated.raw);
	if (edited === undefined) {
		ctx.ui.notify("Selective compaction cancelled", "info");
		return;
	}
	const finalGenerated = parseSelectiveCompactionResponse(edited);
	const create = await ctx.ui.confirm(
		"Create new selective-compaction session?",
		"This will switch to a new session containing A + compacted B + linkage + C. The current session will remain unchanged.",
	);
	if (!create) return;

	const sourceSession = ctx.sessionManager.getSessionFile();
	const result = await ctx.newSession({
		parentSession: sourceSession,
		setup: async (sm) => {
			appendCompactedSession(sm, partition, finalGenerated, sourceSession);
		},
		withSession: async (replacementCtx) => {
			replacementCtx.ui.notify("Selective compaction session created.", "info");
		},
	});
	if (result.cancelled) {
		ctx.ui.notify("New session creation cancelled", "info");
	}
}

async function generateWithLoader(
	ctx: ExtensionCommandContext,
	partition: SelectivePartition,
): Promise<GeneratedSelectiveCompaction | undefined> {
	const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const loader = new BorderedLoader(tui, theme, "Generating selective compaction summary...");
		loader.onAbort = () => done(null);

		generateSelectiveCompaction(ctx, partition, loader.signal)
			.then((generated) => done(generated.raw))
			.catch((error) => {
				console.error("Selective compaction generation failed:", error);
				done(null);
			});

		return loader;
	});

	if (result === null) {
		ctx.ui.notify("Selective compaction generation cancelled or failed", "warning");
		return undefined;
	}
	return parseSelectiveCompactionResponse(result);
}

async function generateSelectiveCompaction(
	ctx: ExtensionCommandContext,
	partition: SelectivePartition,
	signal: AbortSignal,
): Promise<GeneratedSelectiveCompaction> {
	if (!ctx.model) throw new Error("No model selected");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) {
		throw new Error(auth.ok ? `No API key for ${ctx.model.provider}/${ctx.model.id}` : auth.error);
	}

	const response = await complete(
		ctx.model,
		{
			systemPrompt: SELECTIVE_COMPACTION_SYSTEM_PROMPT,
			messages: [buildSelectiveCompactionUserMessage(partition)],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			maxTokens: 8192,
			signal,
		},
	);

	if (response.stopReason === "aborted") {
		throw new Error("Generation aborted");
	}
	const raw = response.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
	if (!raw) throw new Error("Model returned an empty selective compaction summary");
	return parseSelectiveCompactionResponse(raw);
}

function messageContentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return String(content ?? "");
	return content
		.map((part) => {
			if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) return String(part.text);
			return "";
		})
		.filter(Boolean)
		.join("\n");
}
