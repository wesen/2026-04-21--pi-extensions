import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createSnapshot, formatDetails, formatStatus, type CompactionMeterSnapshot } from "./meter";
import { readCompactionSettings } from "./settings";
import { registerPiExtension } from "../_shared/registry";

const STATUS_KEY = "compaction-meter";

interface CompactionMeterState {
	lastSnapshot: CompactionMeterSnapshot | undefined;
	lastWarningText: string | undefined;
}

function createState(): CompactionMeterState {
	return {
		lastSnapshot: undefined,
		lastWarningText: undefined,
	};
}

function refreshSnapshot(ctx: ExtensionContext): CompactionMeterSnapshot {
	const settingsResult = readCompactionSettings(ctx.cwd);
	return createSnapshot(ctx.getContextUsage(), settingsResult.settings, settingsResult.warnings);
}

function updateStatus(ctx: ExtensionContext, state: CompactionMeterState): void {
	const snapshot = refreshSnapshot(ctx);
	state.lastSnapshot = snapshot;
	if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, formatStatus(snapshot));
}

function maybeNotifyWarnings(ctx: ExtensionCommandContext, snapshot: CompactionMeterSnapshot, state: CompactionMeterState): void {
	const warningText = snapshot.warnings.join("\n");
	if (!warningText || warningText === state.lastWarningText) return;
	state.lastWarningText = warningText;
	ctx.ui.notify(`compaction-meter settings warning:\n${warningText}`, "warning");
}

export default function compactionMeter(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "compaction-meter",
		name: "Compaction Meter",
		description: "Shows remaining context tokens before automatic compaction and exposes compact-meter status commands.",
		commands: ["compact-meter", "cm"],
		tags: ["compaction", "status"],
	});
	const state = createState();

	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx, state);
	});

	pi.on("model_select", async (_event, ctx) => {
		updateStatus(ctx, state);
	});

	pi.on("turn_start", async (_event, ctx) => {
		updateStatus(ctx, state);
	});

	pi.on("message_end", async (_event, ctx) => {
		updateStatus(ctx, state);
	});

	pi.on("turn_end", async (_event, ctx) => {
		updateStatus(ctx, state);
	});

	pi.on("session_compact", async (_event, ctx) => {
		updateStatus(ctx, state);
	});

	pi.registerCommand("compact-meter", {
		description: "Show tokens remaining before automatic compaction",
		handler: async (_args, ctx) => {
			const snapshot = refreshSnapshot(ctx);
			state.lastSnapshot = snapshot;
			if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, formatStatus(snapshot));
			maybeNotifyWarnings(ctx, snapshot, state);
			ctx.ui.notify(formatDetails(snapshot), snapshot.remainingTokens !== null && snapshot.remainingTokens < 0 ? "warning" : "info");
		},
	});

	pi.registerCommand("cm", {
		description: "Alias for /compact-meter",
		handler: async (_args, ctx) => {
			const snapshot = refreshSnapshot(ctx);
			state.lastSnapshot = snapshot;
			if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, formatStatus(snapshot));
			maybeNotifyWarnings(ctx, snapshot, state);
			ctx.ui.notify(formatDetails(snapshot), snapshot.remainingTokens !== null && snapshot.remainingTokens < 0 ? "warning" : "info");
		},
	});
}
