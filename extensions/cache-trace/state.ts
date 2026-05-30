import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export const CACHE_TRACE_CUSTOM_TYPE = "cache-trace-snapshot";
export const CACHE_TRACE_ENTRY_TYPE = "cache-trace-event";

export interface CacheTraceUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	costTotal: number;
}

export interface CacheTraceRecord {
	id: number;
	timestamp: number;
	agentRunId: number;
	turnIndex: number | null;
	callIndexInAgent: number;
	provider: string;
	model: string;
	api?: string;
	stopReason?: string;
	usage: CacheTraceUsage;
	contextTokens: number | null;
	contextPercent: number | null;
	contextWindow: number | null;
	providerRequestCount: number;
	providerResponseCount: number;
	toolResultCount: number;
	cacheEvent: "hit" | "miss" | "write-only" | "clear-suspected" | "unknown";
	notes: string[];
}

export interface ProviderRequestRecord {
	id: number;
	timestamp: number;
	agentRunId: number;
	turnIndex: number | null;
	requestIndexInAgent: number;
	payloadKind: string;
	messageCount?: number;
	toolCount?: number;
}

export interface ProviderResponseRecord {
	id: number;
	timestamp: number;
	agentRunId: number;
	turnIndex: number | null;
	status: number;
	headers: Record<string, string>;
}

export interface CacheTraceState {
	nextRecordId: number;
	agentRunId: number;
	activeAgentRunId: number;
	turnIndex: number | null;
	callIndexInAgent: number;
	requestIndexInAgent: number;
	lastRequestCountAtSnapshot: number;
	lastResponseCountAtSnapshot: number;
	toolResultCountInAgent: number;
	compactionSinceLastSnapshot: boolean;
	records: CacheTraceRecord[];
	providerRequests: ProviderRequestRecord[];
	providerResponses: ProviderResponseRecord[];
	maxRecords: number;
}

export function createCacheTraceState(maxRecords = 200): CacheTraceState {
	return {
		nextRecordId: 1,
		agentRunId: 0,
		activeAgentRunId: 0,
		turnIndex: null,
		callIndexInAgent: 0,
		requestIndexInAgent: 0,
		lastRequestCountAtSnapshot: 0,
		lastResponseCountAtSnapshot: 0,
		toolResultCountInAgent: 0,
		compactionSinceLastSnapshot: false,
		records: [],
		providerRequests: [],
		providerResponses: [],
		maxRecords,
	};
}

export function startAgentRun(state: CacheTraceState): void {
	state.agentRunId += 1;
	state.activeAgentRunId = state.agentRunId;
	state.callIndexInAgent = 0;
	state.requestIndexInAgent = 0;
	state.lastRequestCountAtSnapshot = state.providerRequests.length;
	state.lastResponseCountAtSnapshot = state.providerResponses.length;
	state.toolResultCountInAgent = 0;
}

export function finishAgentRun(_state: CacheTraceState): void {
	// Keep the active agent id available for late message_end hooks.
}

export function rememberProviderRequest(state: CacheTraceState, event: { payload: unknown }): ProviderRequestRecord {
	state.requestIndexInAgent += 1;
	const record: ProviderRequestRecord = {
		id: state.nextRecordId++,
		timestamp: Date.now(),
		agentRunId: state.activeAgentRunId,
		turnIndex: state.turnIndex,
		requestIndexInAgent: state.requestIndexInAgent,
		...describePayload(event.payload),
	};
	state.providerRequests.push(record);
	trim(state.providerRequests, state.maxRecords * 3);
	return record;
}

export function rememberProviderResponse(state: CacheTraceState, event: { status: number; headers: Record<string, string> }): ProviderResponseRecord {
	const record: ProviderResponseRecord = {
		id: state.nextRecordId++,
		timestamp: Date.now(),
		agentRunId: state.activeAgentRunId,
		turnIndex: state.turnIndex,
		status: event.status,
		headers: event.headers,
	};
	state.providerResponses.push(record);
	trim(state.providerResponses, state.maxRecords * 3);
	return record;
}

export function rememberAssistantMessage(state: CacheTraceState, ctx: ExtensionContext, message: any): CacheTraceRecord | undefined {
	if (!message || message.role !== "assistant" || !message.usage) return undefined;
	state.callIndexInAgent += 1;
	const usage = normalizeUsage(message.usage);
	const contextUsage = ctx.getContextUsage();
	const previous = state.records[state.records.length - 1];
	const requestCount = state.providerRequests.length - state.lastRequestCountAtSnapshot;
	const responseCount = state.providerResponses.length - state.lastResponseCountAtSnapshot;
	state.lastRequestCountAtSnapshot = state.providerRequests.length;
	state.lastResponseCountAtSnapshot = state.providerResponses.length;
	const notes: string[] = [];
	let cacheEvent: CacheTraceRecord["cacheEvent"] = "unknown";
	if (usage.cacheRead > 0) cacheEvent = "hit";
	else if (usage.cacheWrite > 0) cacheEvent = "write-only";
	else if (previous && previous.usage.cacheRead > 0) cacheEvent = "clear-suspected";
	else cacheEvent = "miss";
	if (state.compactionSinceLastSnapshot) {
		notes.push("compaction happened since previous snapshot");
		if (usage.cacheRead === 0) cacheEvent = "clear-suspected";
		state.compactionSinceLastSnapshot = false;
	}
	if (requestCount > 1) notes.push(`${requestCount} provider requests before this assistant message (retry or multi-request behavior)`);
	if (usage.cacheRead === 0) notes.push("no cache-read tokens reported");
	if (usage.cacheWrite > 0) notes.push("cache-write tokens reported");
	const record: CacheTraceRecord = {
		id: state.nextRecordId++,
		timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
		agentRunId: state.activeAgentRunId,
		turnIndex: state.turnIndex,
		callIndexInAgent: state.callIndexInAgent,
		provider: String(message.provider ?? ctx.model?.provider ?? "unknown"),
		model: String(message.model ?? ctx.model?.id ?? "unknown"),
		api: typeof message.api === "string" ? message.api : undefined,
		stopReason: typeof message.stopReason === "string" ? message.stopReason : undefined,
		usage,
		contextTokens: contextUsage?.tokens ?? null,
		contextPercent: contextUsage?.percent ?? null,
		contextWindow: contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? null,
		providerRequestCount: requestCount,
		providerResponseCount: responseCount,
		toolResultCount: state.toolResultCountInAgent,
		cacheEvent,
		notes,
	};
	state.records.push(record);
	trim(state.records, state.maxRecords);
	return record;
}

export function loadPersistedRecords(state: CacheTraceState, ctx: ExtensionContext): void {
	const records: CacheTraceRecord[] = [];
	for (const entry of ctx.sessionManager.getEntries() as any[]) {
		if (entry?.type !== "custom" || entry.customType !== CACHE_TRACE_ENTRY_TYPE) continue;
		if (isRecord(entry.data)) records.push(entry.data);
	}
	if (records.length === 0) return;
	state.records = records.slice(-state.maxRecords);
	state.nextRecordId = Math.max(state.nextRecordId, ...records.map((record) => record.id + 1));
}

export function formatSnapshot(record: CacheTraceRecord): string {
	const cache = `${record.cacheEvent} read=${record.usage.cacheRead} write=${record.usage.cacheWrite}`;
	const tokens = `in=${record.usage.input} out=${record.usage.output} total=${record.usage.totalTokens}`;
	const context = record.contextPercent === null ? "ctx=?" : `ctx=${record.contextPercent.toFixed(1)}%`;
	return `Cache Trace #${record.id} · run ${record.agentRunId}.${record.callIndexInAgent} · ${cache} · ${tokens} · ${context} · req=${record.providerRequestCount}`;
}

function normalizeUsage(usage: any): CacheTraceUsage {
	return {
		input: numberValue(usage.input),
		output: numberValue(usage.output),
		cacheRead: numberValue(usage.cacheRead),
		cacheWrite: numberValue(usage.cacheWrite),
		totalTokens: numberValue(usage.totalTokens),
		costTotal: numberValue(usage.cost?.total),
	};
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function describePayload(payload: unknown): Pick<ProviderRequestRecord, "payloadKind" | "messageCount" | "toolCount"> {
	if (!payload || typeof payload !== "object") return { payloadKind: typeof payload };
	const candidate = payload as any;
	const messages = Array.isArray(candidate.messages) ? candidate.messages : Array.isArray(candidate.input) ? candidate.input : undefined;
	const tools = Array.isArray(candidate.tools) ? candidate.tools : undefined;
	return {
		payloadKind: Array.isArray(payload) ? "array" : "object",
		messageCount: messages?.length,
		toolCount: tools?.length,
	};
}

function trim<T>(items: T[], max: number): void {
	if (items.length > max) items.splice(0, items.length - max);
}

function isRecord(value: unknown): value is CacheTraceRecord {
	return !!value && typeof value === "object" && typeof (value as any).id === "number" && !!(value as any).usage;
}
