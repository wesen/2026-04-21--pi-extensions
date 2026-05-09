import { compact, type CompactionResult, type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	buildTitleInstructions,
	combineInstructions,
	parseTitleAndSummary,
	runTitleParserSelfTests,
} from "./title";

const STATUS_KEY = "compaction-title";
const CUSTOM_TYPE = "compaction-title-state";

interface CompactionTitleState {
	enabled: boolean;
	stripTitleSection: boolean;
	lastTitle: string | undefined;
	lastUpdatedAt: string | undefined;
	updateCount: number;
	lastError: string | undefined;
}

interface CompactionTitleDetails {
	readFiles?: string[];
	modifiedFiles?: string[];
	sessionTitle?: string;
	previousSessionTitle?: string;
	titleGeneratedBy: "compaction-title";
	titleGeneratedAt: string;
	titleSectionStripped: boolean;
	customInstructionsAppended: boolean;
}

function createState(): CompactionTitleState {
	return {
		enabled: true,
		stripTitleSection: true,
		lastTitle: undefined,
		lastUpdatedAt: undefined,
		updateCount: 0,
		lastError: undefined,
	};
}

function restoreStateFromSession(ctx: ExtensionContext, state: CompactionTitleState): void {
	state.lastTitle = undefined;
	state.lastUpdatedAt = undefined;
	state.updateCount = 0;
	state.lastError = undefined;
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "custom" || entry.customType !== CUSTOM_TYPE) continue;
		Object.assign(state, entry.data ?? {});
	}
}

function setStatus(ctx: ExtensionContext, state: CompactionTitleState): void {
	if (!ctx.hasUI) return;
	const mode = state.enabled ? "on" : "off";
	const title = state.lastTitle ? state.lastTitle.slice(0, 32) : "unset";
	ctx.ui.setStatus(STATUS_KEY, `ct:${mode} ${title}`);
}

function mergeDetails(result: CompactionResult, details: CompactionTitleDetails): unknown {
	const existing = result.details;
	if (existing && typeof existing === "object" && !Array.isArray(existing)) {
		return { ...existing, ...details };
	}
	return details;
}

function formatState(state: CompactionTitleState, currentName: string | undefined): string {
	return [
		`compaction-title is ${state.enabled ? "enabled" : "disabled"}`,
		`strip title section: ${state.stripTitleSection ? "yes" : "no"}`,
		`current session name: ${currentName ?? "(none)"}`,
		`last generated title: ${state.lastTitle ?? "(none)"}`,
		`updates: ${state.updateCount}`,
		`last updated: ${state.lastUpdatedAt ?? "(never)"}`,
		`last error: ${state.lastError ?? "(none)"}`,
	].join("\n");
}

function applyArgs(args: string, state: CompactionTitleState): string[] {
	const changes: string[] = [];
	for (const token of args.trim().split(/\s+/).filter(Boolean)) {
		const normalized = token.toLowerCase();
		if (["on", "enable", "enabled"].includes(normalized)) {
			state.enabled = true;
			changes.push("enabled");
		} else if (["off", "disable", "disabled"].includes(normalized)) {
			state.enabled = false;
			changes.push("disabled");
		} else if (normalized === "toggle") {
			state.enabled = !state.enabled;
			changes.push(state.enabled ? "enabled" : "disabled");
		} else if (normalized === "strip") {
			state.stripTitleSection = true;
			changes.push("strip title section on");
		} else if (normalized === "keep") {
			state.stripTitleSection = false;
			changes.push("keep title section in summary");
		} else {
			changes.push(`ignored unknown option: ${token}`);
		}
	}
	return changes;
}

export default function compactionTitleExtension(pi: ExtensionAPI): void {
	const state = createState();

	pi.on("session_start", async (_event, ctx) => {
		restoreStateFromSession(ctx, state);
		state.lastTitle = pi.getSessionName() ?? state.lastTitle;
		setStatus(ctx, state);
	});

	pi.on("session_before_compact", async (event, ctx) => {
		if (!state.enabled) return;
		const model = ctx.model;
		if (!model) return;

		try {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok || !auth.apiKey) {
				state.lastError = auth.ok ? `No API key for ${model.provider}/${model.id}` : auth.error;
				setStatus(ctx, state);
				return;
			}

			const previousTitle = pi.getSessionName() ?? state.lastTitle;
			const titleInstructions = buildTitleInstructions(previousTitle);
			const customInstructions = combineInstructions(event.customInstructions, titleInstructions);
			const result = await compact(
				event.preparation,
				model,
				auth.apiKey,
				auth.headers,
				customInstructions,
				event.signal,
				pi.getThinkingLevel(),
			);

			const parsed = parseTitleAndSummary(result.summary, { stripTitleSection: state.stripTitleSection });
			const now = new Date().toISOString();
			if (parsed.title) {
				pi.setSessionName(parsed.title);
				state.lastTitle = parsed.title;
				state.lastUpdatedAt = now;
				state.updateCount++;
				state.lastError = undefined;
				pi.appendEntry(CUSTOM_TYPE, { ...state });
			}

			const details: CompactionTitleDetails = {
				...(event.preparation.fileOps as Partial<Pick<CompactionTitleDetails, "readFiles" | "modifiedFiles">>),
				sessionTitle: parsed.title,
				previousSessionTitle: previousTitle,
				titleGeneratedBy: "compaction-title",
				titleGeneratedAt: now,
				titleSectionStripped: state.stripTitleSection,
				customInstructionsAppended: Boolean(event.customInstructions?.trim()),
			};

			setStatus(ctx, state);
			return {
				compaction: {
					...result,
					summary: parsed.summary,
					details: mergeDetails(result, details),
				},
			};
		} catch (error) {
			if (event.signal.aborted) return;
			state.lastError = error instanceof Error ? error.message : String(error);
			setStatus(ctx, state);
			if (ctx.hasUI) ctx.ui.notify(`compaction-title failed; falling back to default compaction: ${state.lastError}`, "warning");
			return;
		}
	});

	pi.on("session_compact", async (_event, ctx) => {
		state.lastTitle = pi.getSessionName() ?? state.lastTitle;
		setStatus(ctx, state);
	});

	pi.registerCommand("compaction-title", {
		description: "Show/configure compaction-generated session titles (args: on off toggle strip keep)",
		handler: async (args, ctx) => {
			const changes = applyArgs(args, state);
			pi.appendEntry(CUSTOM_TYPE, { ...state });
			setStatus(ctx, state);
			ctx.ui.notify([formatState(state, pi.getSessionName()), changes.length ? "" : undefined, ...changes].filter(Boolean).join("\n"), "info");
		},
	});

	pi.registerCommand("ctitle", {
		description: "Alias for /compaction-title",
		handler: async (args, ctx) => {
			const changes = applyArgs(args, state);
			pi.appendEntry(CUSTOM_TYPE, { ...state });
			setStatus(ctx, state);
			ctx.ui.notify([formatState(state, pi.getSessionName()), changes.length ? "" : undefined, ...changes].filter(Boolean).join("\n"), "info");
		},
	});

	pi.registerCommand("compaction-title-self-test", {
		description: "Run compaction-title parser self-tests",
		handler: async (_args, ctx) => {
			const tests = runTitleParserSelfTests();
			const ok = tests.every((test) => test.ok);
			ctx.ui.notify(
				[`compaction-title self-test: ${ok ? "PASS" : "FAIL"}`, "", ...tests.map((test) => `${test.ok ? "✓" : "✗"} ${test.name}: ${test.details}`)].join("\n"),
				ok ? "info" : "error",
			);
		},
	});
}
