import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { registerPiExtension } from "../_shared/registry";
import { CacheTraceOverlay } from "./ui";
import {
	CACHE_TRACE_CUSTOM_TYPE,
	CACHE_TRACE_ENTRY_TYPE,
	createCacheTraceState,
	finishAgentRun,
	formatSnapshot,
	loadPersistedRecords,
	rememberAssistantMessage,
	rememberProviderRequest,
	rememberProviderResponse,
	startAgentRun,
	type CacheTraceRecord,
} from "./state";

const STATUS_KEY = "cache-trace";

export default function cacheTrace(pi: ExtensionAPI): void {
	const state = createCacheTraceState();

	registerPiExtension({
		id: "cache-trace",
		name: "Cache Trace",
		description: "Records LLM cache usage after each assistant call and opens an ASCII plot/query modal for cache behavior.",
		commands: ["cache-trace", "ct-cache"],
		tags: ["tokens", "cache", "observability", "tui"],
		run: async (ctx) => openOverlay(ctx),
		actions: [
			{ id: "open", title: "Open cache trace plots", description: "Inspect cache hits, misses, provider request counts, and ASCII plots.", default: true, run: async (ctx) => openOverlay(ctx) },
			{ id: "status", title: "Show latest cache status", description: "Notify with the latest cache usage summary.", run: async (ctx) => showStatus(ctx) },
			{ id: "clear", title: "Clear in-memory trace", description: "Clear collected in-memory records for this Pi process.", dangerous: true, run: async (ctx) => clearTrace(ctx) },
		],
		palette: [
			{ id: "open", title: "Open cache trace", key: "o", run: async (ctx) => openOverlay(ctx) },
			{ id: "status", title: "Latest cache status", key: "s", run: async (ctx) => showStatus(ctx) },
		],
		docs: [
			{ id: "overview", title: "Cache Trace overview", path: "extensions/cache-trace/README.md" },
		],
		widgets: [
			{
				id: "status",
				title: "Cache Trace",
				description: "Latest LLM cache usage snapshot.",
				defaultZone: "statusBar",
				defaultVariant: "short",
				priority: 15,
				render: () => formatStatus(state.records[state.records.length - 1]),
			},
		],
	});

	pi.registerMessageRenderer<CacheTraceRecord>(CACHE_TRACE_CUSTOM_TYPE, (message, { expanded }, theme) => {
		const record = message.details;
		if (!record) return new Text(String(message.content ?? "Cache Trace"), 0, 0);
		const lines = [
			`${theme.fg("accent", theme.bold("Cache Trace"))} ${theme.fg("dim", `run ${record.agentRunId}.${record.callIndexInAgent}`)} ${badge(record.cacheEvent, theme)}`,
			`read ${record.usage.cacheRead} · write ${record.usage.cacheWrite} · input ${record.usage.input} · output ${record.usage.output} · req ${record.providerRequestCount}`,
		];
		if (expanded && record.notes.length > 0) lines.push(`notes: ${record.notes.join("; ")}`);
		return new Text(lines.join("\n"), 0, 0);
	});

	pi.on("session_start", async (_event, ctx) => {
		loadPersistedRecords(state, ctx);
		updateStatus(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		startAgentRun(state);
		updateStatus(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		finishAgentRun(state);
		updateStatus(ctx);
	});

	pi.on("turn_start", async (event, _ctx) => {
		state.turnIndex = event.turnIndex;
	});

	pi.on("before_provider_request", async (event) => {
		rememberProviderRequest(state, event);
	});

	pi.on("after_provider_response", async (event) => {
		rememberProviderResponse(state, event);
	});

	pi.on("tool_execution_end", async () => {
		state.toolResultCountInAgent += 1;
	});

	pi.on("session_compact", async (_event, ctx) => {
		state.compactionSinceLastSnapshot = true;
		updateStatus(ctx);
	});

	pi.on("message_end", async (event, ctx) => {
		const record = rememberAssistantMessage(state, ctx, event.message as any);
		if (!record) return;
		pi.appendEntry(CACHE_TRACE_ENTRY_TYPE, record);
		enqueueTimelineMessage(ctx, record);
		updateStatus(ctx);
	});

	pi.registerCommand("cache-trace", {
		description: "Open cache usage plots. Args: status, clear",
		handler: async (args, ctx) => handleCommand(args, ctx),
	});

	pi.registerCommand("ct-cache", {
		description: "Alias for /cache-trace",
		handler: async (args, ctx) => handleCommand(args, ctx),
	});

	async function handleCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
		const arg = args.trim().toLowerCase();
		if (arg === "status") return showStatus(ctx);
		if (arg === "clear") return clearTrace(ctx);
		return openOverlay(ctx);
	}

	async function openOverlay(ctx: ExtensionCommandContext): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify(renderTextReport(), "info");
			return;
		}
		await ctx.ui.custom<void>(
			(tui, theme, _keybindings, done) => new CacheTraceOverlay({ tui, theme, state, done }),
			{ overlay: true, overlayOptions: { width: "88%", maxHeight: "88%", anchor: "center", margin: 1 } },
		);
	}

	async function showStatus(ctx: ExtensionCommandContext): Promise<void> {
		ctx.ui.notify(renderTextReport(), "info");
	}

	async function clearTrace(ctx: ExtensionCommandContext): Promise<void> {
		state.records = [];
		state.providerRequests = [];
		state.providerResponses = [];
		state.callIndexInAgent = 0;
		state.requestIndexInAgent = 0;
		updateStatus(ctx);
		ctx.ui.notify("Cache Trace in-memory records cleared. Persisted custom entries remain in the session file.", "warning");
	}

	function renderTextReport(): string {
		const latest = state.records[state.records.length - 1];
		if (!latest) return "Cache Trace: no LLM usage snapshots recorded yet.";
		return [
			formatSnapshot(latest),
			`records: ${state.records.length}, provider requests: ${state.providerRequests.length}, responses: ${state.providerResponses.length}`,
			latest.notes.length > 0 ? `notes: ${latest.notes.join("; ")}` : undefined,
		].filter(Boolean).join("\n");
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(STATUS_KEY, formatStatus(state.records[state.records.length - 1]));
	}

	function enqueueTimelineMessage(ctx: ExtensionContext, record: CacheTraceRecord): void {
		if (!ctx.hasUI) return;
		let attempts = 0;
		const sendWhenIdle = () => {
			attempts += 1;
			if (!ctx.isIdle() && attempts < 200) {
				setTimeout(sendWhenIdle, 100);
				return;
			}
			if (!ctx.isIdle()) return;
			pi.sendMessage({
				customType: CACHE_TRACE_CUSTOM_TYPE,
				content: formatSnapshot(record),
				display: true,
				details: record,
			}, { triggerTurn: false });
		};
		setTimeout(sendWhenIdle, 0);
	}
}

function formatStatus(record: CacheTraceRecord | undefined): string {
	if (!record) return "cache:—";
	return `cache:${record.cacheEvent} r${compactNumber(record.usage.cacheRead)} w${compactNumber(record.usage.cacheWrite)} req${record.providerRequestCount}`;
}

function compactNumber(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return String(value);
}

function badge(event: CacheTraceRecord["cacheEvent"], theme: any): string {
	if (event === "hit") return theme.fg("success", "hit");
	if (event === "clear-suspected") return theme.fg("warning", "clear?");
	if (event === "miss") return theme.fg("error", "miss");
	return theme.fg("muted", event);
}
