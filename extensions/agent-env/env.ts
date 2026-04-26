import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export const EXTENSION_VERSION = "1";
export const MARKER_BEGIN = "# PI_AGENT_ENV_BEGIN v1";
export const MARKER_END = "# PI_AGENT_ENV_END v1";
export const MAX_ENV_VALUE_CHARS = 4096;

type Trigger = "tool_call" | "user_bash" | "self_test";

export interface AgentEnvBuildDetails {
	trigger: Trigger;
	toolName?: string;
	toolCallId?: string;
	turnIndex: number | undefined;
	sessionStartedAt: string;
	sessionStartedAtMs: number;
}

export interface PreambleBuildOptions {
	quoteTestValue?: string;
}

export function truncateValue(value: string, maxChars = MAX_ENV_VALUE_CHARS): string {
	const chars = Array.from(value);
	if (chars.length <= maxChars) return value;
	if (maxChars <= 3) return chars.slice(0, maxChars).join("");
	return `${chars.slice(0, maxChars - 3).join("")}...`;
}

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function envString(value: unknown): string {
	if (value === undefined || value === null) return "";
	return String(value);
}

function isAllowedAgentEnvName(key: string): boolean {
	return /^PI_AGENT(?:_[A-Z0-9]+)*$/.test(key);
}

export function buildAgentEnv(ctx: ExtensionContext, details: AgentEnvBuildDetails): Record<string, string> {
	const turnIndex = details.turnIndex;
	const turnNumber = typeof turnIndex === "number" ? turnIndex + 1 : undefined;
	const sessionManager = ctx.sessionManager;
	const model = ctx.model;

	return {
		PI_AGENT: "1",
		PI_AGENT_EXTENSION_VERSION: EXTENSION_VERSION,
		PI_AGENT_TRIGGER: details.trigger,
		PI_AGENT_TOOL_NAME: details.toolName ?? "bash",
		PI_AGENT_TOOL_CALL_ID: details.toolCallId ?? "",
		PI_AGENT_SESSION_ID: envString(sessionManager.getSessionId()),
		PI_AGENT_SESSION_FILE: envString(sessionManager.getSessionFile()),
		PI_AGENT_SESSION_DIR: envString(sessionManager.getSessionDir()),
		PI_AGENT_SESSION_NAME: envString(sessionManager.getSessionName()),
		PI_AGENT_LEAF_ID: envString(sessionManager.getLeafId()),
		PI_AGENT_CWD: envString(ctx.cwd),
		PI_AGENT_TURN_INDEX: envString(turnIndex),
		PI_AGENT_TURN_NUMBER: envString(turnNumber),
		PI_AGENT_MODEL_PROVIDER: envString(model?.provider),
		PI_AGENT_MODEL_ID: envString(model?.id),
		PI_AGENT_MODEL_NAME: envString(model?.name),
		PI_AGENT_START_TIME: details.sessionStartedAt,
		PI_AGENT_START_TIME_MS: envString(details.sessionStartedAtMs),
	};
}

export function buildExportPreamble(vars: Record<string, string>, options: PreambleBuildOptions = {}): string {
	const merged = { ...vars };
	if (options.quoteTestValue !== undefined) {
		merged.PI_AGENT_QUOTE_TEST = options.quoteTestValue;
	}

	const lines = [MARKER_BEGIN];
	for (const key of Object.keys(merged).sort()) {
		if (!isAllowedAgentEnvName(key)) continue;
		lines.push(`export ${key}=${shellQuote(truncateValue(merged[key] ?? ""))}`);
	}
	lines.push(MARKER_END);
	return lines.join("\n");
}

export function injectPreamble(command: string, preamble: string): string {
	if (command.includes(MARKER_BEGIN)) return command;
	return `${preamble}\n${command}`;
}

export interface SelfTestResult {
	name: string;
	ok: boolean;
	details: string;
}

export function runInternalSelfTests(): SelfTestResult[] {
	const tests: SelfTestResult[] = [];

	const quotedSubstitution = shellQuote("$(printf injected)");
	tests.push({
		name: "shellQuote command substitution remains single-quoted",
		ok: quotedSubstitution === "'$(printf injected)'",
		details: quotedSubstitution,
	});

	const quotedSingle = shellQuote("a'b");
	tests.push({
		name: "shellQuote embedded single quote",
		ok: quotedSingle === "'a'\\''b'",
		details: quotedSingle,
	});

	const preamble = buildExportPreamble({ PI_AGENT: "1", PI_AGENT_TEST: "$(printf injected)" });
	tests.push({
		name: "preamble has markers",
		ok: preamble.startsWith(MARKER_BEGIN) && preamble.endsWith(MARKER_END),
		details: preamble,
	});

	const command = "printf ok";
	const injectedOnce = injectPreamble(command, preamble);
	const injectedTwice = injectPreamble(injectedOnce, preamble);
	tests.push({
		name: "injectPreamble is idempotent",
		ok: injectedOnce === injectedTwice,
		details: injectedTwice,
	});

	const long = "🙂".repeat(MAX_ENV_VALUE_CHARS + 10);
	const truncated = truncateValue(long);
	tests.push({
		name: "truncateValue respects code points and suffix",
		ok: Array.from(truncated).length === MAX_ENV_VALUE_CHARS && truncated.endsWith("..."),
		details: `${Array.from(truncated).length} chars`,
	});

	return tests;
}
