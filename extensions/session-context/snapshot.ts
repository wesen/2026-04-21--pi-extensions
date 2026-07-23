import type { ExtensionContext, SessionEntry } from "@mariozechner/pi-coding-agent";

export interface SessionContextSettings {
	includeCwd: boolean;
	includeSessionFile: boolean;
	includeCost: boolean;
	maxSystemChars: number;
	maxInputChars: number;
}

export interface UsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	costTotal: number;
	knownMessages: number;
}

export interface SessionModelStat {
	provider: string;
	id: string;
	name?: string;
	assistantResponses: number;
}

export interface AgentEnvCapability {
	installed: true;
	enabled: boolean;
	extensionVersion?: string;
	scope: "bash-child-process";
	variablePrefix: "PI_AGENT_";
	fields?: string[];
}

export interface SessionContextSnapshot {
	schemaVersion: 1;
	generatedAt: string;
	session: {
		id: string;
		name?: string;
		cwd?: string;
		sessionFile?: string;
		leafId?: string;
	};
	time: {
		startedAt?: string;
		lastRecordedAt?: string;
		dateSpanStart?: string;
		dateSpanEnd?: string;
		elapsedWallMs?: number;
		elapsedWallHuman?: string;
		note: "elapsed wall-clock span; not active CPU time";
	};
	turns: {
		completedUserPrompts: number;
		assistantResponses: number;
		nextSessionPromptNumber: number;
		contextWindowUserPrompts: number;
		nextContextWindowPromptNumber: number;
		currentPiTurnIndex?: number;
	};
	models: SessionModelStat[];
	activeModel?: {
		provider: string;
		id: string;
		name?: string;
	};
	activity: {
		toolCalls: number;
		bashCalls: number;
		toolErrors: number;
		compactions: number;
		branchSummaries: number;
	};
	usage?: UsageTotals & { complete: boolean };
	capabilities?: {
		agentEnv?: AgentEnvCapability;
	};
}

interface ModelAccumulator {
	provider: string;
	id: string;
	name?: string;
	assistantResponses: number;
}

function emptyUsage(): UsageTotals {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		costTotal: 0,
		knownMessages: 0,
	};
}

function addUsage(target: UsageTotals, usage: any): void {
	if (!usage || typeof usage !== "object") return;
	target.input += finiteNumber(usage.input);
	target.output += finiteNumber(usage.output);
	target.cacheRead += finiteNumber(usage.cacheRead);
	target.cacheWrite += finiteNumber(usage.cacheWrite);
	target.totalTokens += finiteNumber(usage.totalTokens);
	target.costTotal += finiteNumber(usage.cost?.total);
	target.knownMessages++;
}

function finiteNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function boundedString(value: unknown, max: number): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`;
}

function isoFromUnknown(value: unknown): string | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return new Date(value).toISOString();
	}
	if (typeof value !== "string") return undefined;
	const time = Date.parse(value);
	return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function entryTimestamp(entry: SessionEntry): string | undefined {
	return isoFromUnknown(entry.timestamp);
}

function timestampMs(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function earliestTimestamp(entries: SessionEntry[]): string | undefined {
	const values = entries.map(entryTimestamp).filter((value): value is string => value !== undefined);
	return values.sort()[0];
}

function latestTimestamp(entries: SessionEntry[]): string | undefined {
	const values = entries.map(entryTimestamp).filter((value): value is string => value !== undefined);
	return values.sort().at(-1);
}

function rememberModel(
	models: Map<string, ModelAccumulator>,
	provider: unknown,
	id: unknown,
	assistantResponses = 0,
	name?: unknown,
): void {
	const providerText = boundedString(provider, 128);
	const idText = boundedString(id, 160);
	if (!providerText || !idText) return;
	const key = `${providerText}/${idText}`;
	const existing = models.get(key);
	if (existing) {
		existing.assistantResponses += assistantResponses;
		if (!existing.name) existing.name = boundedString(name, 160);
		return;
	}
	models.set(key, {
		provider: providerText,
		id: idText,
		name: boundedString(name, 160),
		assistantResponses,
	});
}

function countUserPrompts(entries: SessionEntry[]): number {
	return entries.filter((entry) => entry.type === "message" && entry.message.role === "user").length;
}

function countAssistantResponses(entries: SessionEntry[]): number {
	return entries.filter((entry) => entry.type === "message" && entry.message.role === "assistant").length;
}

export function humanDuration(milliseconds: number): string {
	let seconds = Math.floor(Math.max(0, milliseconds) / 1000);
	const days = Math.floor(seconds / 86400);
	seconds %= 86400;
	const hours = Math.floor(seconds / 3600);
	seconds %= 3600;
	const minutes = Math.floor(seconds / 60);
	seconds %= 60;

	const parts: string[] = [];
	if (days) parts.push(`${days}d`);
	if (hours || parts.length > 0) parts.push(`${hours}h`);
	if (minutes || parts.length > 0) parts.push(`${minutes}m`);
	parts.push(`${seconds}s`);
	return parts.join(" ");
}

export interface SnapshotOptions {
	settings: SessionContextSettings;
	currentPiTurnIndex?: number;
	agentEnvCapability?: AgentEnvCapability;
	now?: number;
}

export function buildSnapshotFromEntries(
	ctx: Pick<ExtensionContext, "cwd" | "model" | "sessionManager">,
	branch: SessionEntry[],
	contextEntries: SessionEntry[],
	options: SnapshotOptions,
): SessionContextSnapshot {
	const now = options.now ?? Date.now();
	const header = ctx.sessionManager.getHeader();
	const startedAt = isoFromUnknown(header?.timestamp) ?? earliestTimestamp(branch);
	const lastRecordedAt = latestTimestamp(branch);
	const startedMs = timestampMs(startedAt);
	const elapsedWallMs = startedMs === undefined ? undefined : Math.max(0, now - startedMs);
	const models = new Map<string, ModelAccumulator>();
	const usage = emptyUsage();
	let toolCalls = 0;
	let bashCalls = 0;
	let toolErrors = 0;
	let compactions = 0;
	let branchSummaries = 0;

	for (const entry of branch) {
		if (entry.type === "compaction") {
			compactions++;
			addUsage(usage, entry.usage);
			continue;
		}
		if (entry.type === "branch_summary") {
			branchSummaries++;
			addUsage(usage, entry.usage);
			continue;
		}
		if (entry.type === "model_change") {
			rememberModel(models, entry.provider, entry.modelId);
			continue;
		}
		if (entry.type !== "message") continue;

		const message = entry.message;
		if (message.role === "assistant") {
			rememberModel(models, message.provider, message.model, 1);
			addUsage(usage, message.usage);
			for (const block of message.content) {
				if (block.type !== "toolCall") continue;
				toolCalls++;
				if (block.name === "bash") bashCalls++;
			}
		} else if (message.role === "toolResult") {
			if (message.isError) toolErrors++;
			addUsage(usage, message.usage);
		}
	}

	if (ctx.model) {
		rememberModel(models, ctx.model.provider, ctx.model.id, 0, ctx.model.name);
	}

	const completedUserPrompts = countUserPrompts(branch);
	const contextWindowUserPrompts = countUserPrompts(contextEntries);
	const activeModel = ctx.model
		? {
			provider: boundedString(ctx.model.provider, 128) ?? "unknown",
			id: boundedString(ctx.model.id, 160) ?? "unknown",
			name: boundedString(ctx.model.name, 160),
		}
		: undefined;
	const modelList = [...models.values()]
		.sort((a, b) => `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`))
		.map((model) => ({
			...model,
			name: model.name || undefined,
		}));
	const sessionFile = options.settings.includeSessionFile ? boundedString(ctx.sessionManager.getSessionFile(), 512) : undefined;
	const cwd = options.settings.includeCwd ? boundedString(ctx.cwd, 512) : undefined;

	return {
		schemaVersion: 1,
		generatedAt: new Date(now).toISOString(),
		session: {
			id: ctx.sessionManager.getSessionId(),
			name: boundedString(ctx.sessionManager.getSessionName(), 256),
			cwd,
			sessionFile,
			leafId: boundedString(ctx.sessionManager.getLeafId() ?? undefined, 128),
		},
		time: {
			startedAt,
			lastRecordedAt,
			dateSpanStart: startedAt,
			dateSpanEnd: lastRecordedAt,
			elapsedWallMs,
			elapsedWallHuman: elapsedWallMs === undefined ? undefined : humanDuration(elapsedWallMs),
			note: "elapsed wall-clock span; not active CPU time",
		},
		turns: {
			completedUserPrompts,
			assistantResponses: countAssistantResponses(branch),
			nextSessionPromptNumber: completedUserPrompts + 1,
			contextWindowUserPrompts,
			nextContextWindowPromptNumber: contextWindowUserPrompts + 1,
			currentPiTurnIndex: options.currentPiTurnIndex,
		},
		models: modelList,
		activeModel,
		activity: { toolCalls, bashCalls, toolErrors, compactions, branchSummaries },
		usage: usage.knownMessages === 0 ? undefined : {
			...usage,
			costTotal: options.settings.includeCost ? usage.costTotal : 0,
			complete: false,
		},
		capabilities: options.agentEnvCapability ? { agentEnv: options.agentEnvCapability } : undefined,
	};
}

export function buildSnapshot(ctx: ExtensionContext, options: SnapshotOptions): SessionContextSnapshot {
	return buildSnapshotFromEntries(
		ctx,
		ctx.sessionManager.getBranch(),
		ctx.sessionManager.buildContextEntries(),
		options,
	);
}

export interface SelfTestResult {
	name: string;
	ok: boolean;
	details: string;
}

export function runSnapshotSelfTests(): SelfTestResult[] {
	const base = {
		settings: { includeCwd: false, includeSessionFile: false, includeCost: true, maxSystemChars: 4000, maxInputChars: 800 },
		now: Date.parse("2026-07-23T12:00:00.000Z"),
	};
	const header = {
		type: "session",
		version: 3,
		id: "session-id",
		timestamp: "2026-07-23T11:00:00.000Z",
		cwd: "/tmp/project",
	} as any;
	const user = (id: string, timestamp: string): any => ({ type: "message", id, parentId: null, timestamp, message: { role: "user", content: "prompt", timestamp: Date.parse(timestamp) } });
	const assistant = (id: string, timestamp: string, model = "model-a"): any => ({ type: "message", id, parentId: null, timestamp, message: { role: "assistant", content: [{ type: "text", text: "ok" }], provider: "provider-a", model, usage: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 5, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 } } } });
	const compaction: any = { type: "compaction", id: "c", parentId: null, timestamp: "2026-07-23T11:30:00.000Z", summary: "old", firstKeptEntryId: "u2", tokensBefore: 100 };
	const branch = [user("u1", "2026-07-23T11:01:00.000Z"), assistant("a1", "2026-07-23T11:02:00.000Z"), compaction, user("u2", "2026-07-23T11:31:00.000Z")];
	const contextEntries = [compaction, user("u2", "2026-07-23T11:31:00.000Z")];
	const fakeCtx = {
		cwd: "/tmp/project",
		model: { provider: "provider-a", id: "model-a", name: "Model A" },
		sessionManager: {
			getHeader: () => header,
			getSessionId: () => "session-id",
			getSessionName: () => undefined,
			getSessionFile: () => undefined,
			getLeafId: () => "leaf",
		},
	} as any;
	const snapshot = buildSnapshotFromEntries(fakeCtx, branch, contextEntries, base);
	return [
		{ name: "counts total and context-window prompts separately", ok: snapshot.turns.nextSessionPromptNumber === 3 && snapshot.turns.nextContextWindowPromptNumber === 2, details: JSON.stringify(snapshot.turns) },
		{ name: "counts compactions", ok: snapshot.activity.compactions === 1, details: String(snapshot.activity.compactions) },
		{ name: "counts known usage", ok: snapshot.usage?.totalTokens === 5 && snapshot.usage.costTotal === 0.01, details: JSON.stringify(snapshot.usage) },
		{ name: "formats wall-clock duration", ok: snapshot.time.elapsedWallHuman === "1h 0m 0s", details: snapshot.time.elapsedWallHuman ?? "unknown" },
	];
}
