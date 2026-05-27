import {
	createLocalBashOperations,
	isToolCallEventType,
	type ExtensionAPI,
	type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
	buildAgentEnv,
	buildExportPreamble,
	injectPreamble,
	runInternalSelfTests,
	type AgentEnvBuildDetails,
} from "./env";
import { registerPiExtension } from "../_shared/registry";

const STATUS_KEY = "agent-env";
const QUOTE_TEST_VALUE = "$(printf injected)";

interface AgentEnvState {
	enabled: boolean;
	turnIndex: number | undefined;
	sessionStartedAt: string;
	sessionStartedAtMs: number;
	lastInjectionAt: string | undefined;
	lastToolCallId: string | undefined;
	injectionCount: number;
}

function createState(): AgentEnvState {
	const now = new Date();
	return {
		enabled: true,
		turnIndex: undefined,
		sessionStartedAt: now.toISOString(),
		sessionStartedAtMs: now.getTime(),
		lastInjectionAt: undefined,
		lastToolCallId: undefined,
		injectionCount: 0,
	};
}

function refreshSessionState(state: AgentEnvState): void {
	const now = new Date();
	state.turnIndex = undefined;
	state.sessionStartedAt = now.toISOString();
	state.sessionStartedAtMs = now.getTime();
	state.lastInjectionAt = undefined;
	state.lastToolCallId = undefined;
	state.injectionCount = 0;
}

function setStatus(ctx: ExtensionContext, state: AgentEnvState): void {
	if (!ctx.hasUI) return;
	const turn = state.turnIndex === undefined ? "-" : String(state.turnIndex + 1);
	ctx.ui.setStatus(STATUS_KEY, `agent-env:${state.enabled ? "on" : "off"} t=${turn} n=${state.injectionCount}`);
}

function buildDetails(state: AgentEnvState, overrides: Pick<AgentEnvBuildDetails, "trigger"> & Partial<AgentEnvBuildDetails>): AgentEnvBuildDetails {
	return {
		trigger: overrides.trigger,
		toolName: overrides.toolName ?? "bash",
		toolCallId: overrides.toolCallId ?? "",
		turnIndex: overrides.turnIndex ?? state.turnIndex,
		sessionStartedAt: state.sessionStartedAt,
		sessionStartedAtMs: state.sessionStartedAtMs,
	};
}

function buildPreamble(ctx: ExtensionContext, state: AgentEnvState, details: AgentEnvBuildDetails): string {
	return buildExportPreamble(buildAgentEnv(ctx, details));
}

function recordInjection(state: AgentEnvState, toolCallId: string | undefined): void {
	state.lastInjectionAt = new Date().toISOString();
	state.lastToolCallId = toolCallId;
	state.injectionCount++;
}

function formatEnvPreview(ctx: ExtensionContext, state: AgentEnvState): string {
	const vars = buildAgentEnv(ctx, buildDetails(state, { trigger: "self_test", toolCallId: "preview" }));
	return Object.entries(vars)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
}

async function runShellSelfTest(ctx: ExtensionContext, state: AgentEnvState): Promise<{ ok: boolean; output: string }> {
	const vars = buildAgentEnv(ctx, buildDetails(state, { trigger: "self_test", toolCallId: "self-test" }));
	const preamble = buildExportPreamble(vars, { quoteTestValue: QUOTE_TEST_VALUE });
	const command = injectPreamble(
		"printf 'quote=%s\\nagent=%s\\n' \"$PI_AGENT_QUOTE_TEST\" \"$PI_AGENT\"",
		preamble,
	);
	const ops = createLocalBashOperations();
	const chunks: Buffer[] = [];
	try {
		const result = await ops.exec(command, ctx.cwd, {
			onData: (data) => chunks.push(data),
			timeout: 5,
		});
		const output = Buffer.concat(chunks).toString("utf-8");
		return {
			ok: result.exitCode === 0 && output.includes("quote=$(printf injected)") && output.includes("agent=1"),
			output: output.trim(),
		};
	} catch (error) {
		const output = Buffer.concat(chunks).toString("utf-8");
		return {
			ok: false,
			output: `${output}\n${error instanceof Error ? error.message : String(error)}`.trim(),
		};
	}
}

export default function agentEnvExtension(pi: ExtensionAPI): void {
	const state = createState();
	registerPiExtension({
		id: "agent-env",
		name: "Agent Env",
		description: "Injects Pi session metadata environment variables into bash tool calls for scripts and debugging.",
		commands: ["agent-env", "ae", "agent-env-toggle", "ae-toggle", "agent-env-self-test"],
		tags: ["bash", "environment", "metadata"],

		palette: [
			{
				id: "toggle",
				title: "Toggle env injection",
				key: "e",
				description: "Enable or disable PI_AGENT_* environment injection.",
				run: async (ctx) => {
					state.enabled = !state.enabled;
					setStatus(ctx, state);
					ctx.ui.notify(`agent-env ${state.enabled ? "enabled" : "disabled"}`, "info");
				},
			},
			{
				id: "preview",
				title: "Preview environment",
				key: "p",
				description: "Show PI_AGENT_* variables that will be injected.",
				run: async (ctx) => ctx.ui.notify(formatEnvPreview(ctx, state), "info"),
			},
		],
		run: async (ctx) => ctx.ui.notify(formatEnvPreview(ctx, state), "info"),
		actions: [
			{ id: "preview", title: "Preview environment", description: "Show PI_AGENT_* variables that will be injected.", default: true, run: async (ctx) => ctx.ui.notify(formatEnvPreview(ctx, state), "info") },
			{ id: "toggle", title: "Toggle injection", description: "Enable or disable agent-env injection.", run: async (ctx) => { state.enabled = !state.enabled; setStatus(ctx, state); ctx.ui.notify(`agent-env ${state.enabled ? "enabled" : "disabled"}`, "info"); } },
			{ id: "self-test", title: "Run self-test", description: "Run shell quoting and preamble self-tests.", run: async (ctx) => {
				const internal = runInternalSelfTests();
				const shell = await runShellSelfTest(ctx, state);
				const ok = internal.every((test) => test.ok) && shell.ok;
				ctx.ui.notify([`agent-env self-test: ${ok ? "PASS" : "FAIL"}`, "", ...internal.map((test) => `${test.ok ? "✓" : "✗"} ${test.name}: ${test.details}`), `${shell.ok ? "✓" : "✗"} shell execution: ${shell.output}`].join("\n"), ok ? "info" : "error");
			} },
		],
		docs: [
			{ id: "overview", title: "Agent Env overview", markdown: "# Agent Env\n\nInjects PI_AGENT_* environment variables into bash tool calls and user bash commands. Use settings to enable or disable injection." },
		],
		settings: {
			kind: "schema",
			schema: { version: 1, title: "Agent Env Settings", description: "Configure PI_AGENT_* environment injection.", sections: [{ id: "main", title: "Main", fields: [{ id: "enabled", label: "Enabled", type: "boolean", description: "Inject PI_AGENT_* variables into bash commands." }] }] },
			load: () => ({ enabled: state.enabled }),
			onApply: (values, ctx) => { state.enabled = values.enabled === true; setStatus(ctx, state); ctx.ui.notify(`agent-env ${state.enabled ? "enabled" : "disabled"}`, "info"); },
		},
		widgets: [
			{ id: "status", title: "Agent Env Status", description: "Shows whether environment injection is enabled.", defaultZone: "statusBar", defaultVariant: "short", priority: 60, render: () => `agent-env:${state.enabled ? "on" : "off"} n=${state.injectionCount}` },
		],
	});

	pi.on("session_start", async (_event, ctx) => {
		refreshSessionState(state);
		setStatus(ctx, state);
	});

	pi.on("turn_start", async (event, ctx) => {
		state.turnIndex = event.turnIndex;
		setStatus(ctx, state);
	});

	pi.on("model_select", async (_event, ctx) => {
		setStatus(ctx, state);
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!state.enabled) return;
		if (!isToolCallEventType("bash", event)) return;

		const details = buildDetails(state, {
			trigger: "tool_call",
			toolName: "bash",
			toolCallId: event.toolCallId,
		});
		const preamble = buildPreamble(ctx, state, details);
		const nextCommand = injectPreamble(event.input.command, preamble);
		if (nextCommand !== event.input.command) {
			event.input.command = nextCommand;
			recordInjection(state, event.toolCallId);
			setStatus(ctx, state);
		}
	});

	pi.on("user_bash", async (_event, ctx) => {
		if (!state.enabled) return;

		const ops = createLocalBashOperations();
		const details = buildDetails(state, {
			trigger: "user_bash",
			toolName: "bash",
			toolCallId: "",
		});
		const preamble = buildPreamble(ctx, state, details);
		return {
			operations: {
				exec: (command, cwd, options) => {
					const nextCommand = injectPreamble(command, preamble);
					if (nextCommand !== command) {
						recordInjection(state, undefined);
						setStatus(ctx, state);
					}
					return ops.exec(nextCommand, cwd, options);
				},
			},
		};
	});

	pi.registerCommand("agent-env", {
		description: "Show PI_AGENT_* environment variable preview",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				[
					`agent-env is ${state.enabled ? "enabled" : "disabled"}`,
					`injections: ${state.injectionCount}`,
					state.lastInjectionAt ? `last injection: ${state.lastInjectionAt}` : "last injection: (none)",
					"",
					formatEnvPreview(ctx, state),
				].join("\n"),
				"info",
			);
		},
	});

	pi.registerCommand("ae", {
		description: "Alias for /agent-env",
		handler: async (_args, ctx) => {
			ctx.ui.notify(formatEnvPreview(ctx, state), "info");
		},
	});

	pi.registerCommand("agent-env-toggle", {
		description: "Toggle PI_AGENT_* injection on/off (args: on, off, toggle)",
		handler: async (args, ctx) => {
			const mode = args.trim().toLowerCase();
			if (mode === "on") state.enabled = true;
			else if (mode === "off") state.enabled = false;
			else state.enabled = !state.enabled;
			setStatus(ctx, state);
			ctx.ui.notify(`agent-env ${state.enabled ? "enabled" : "disabled"}`, "info");
		},
	});

	pi.registerCommand("ae-toggle", {
		description: "Alias for /agent-env-toggle",
		handler: async (args, ctx) => {
			const mode = args.trim().toLowerCase();
			if (mode === "on") state.enabled = true;
			else if (mode === "off") state.enabled = false;
			else state.enabled = !state.enabled;
			setStatus(ctx, state);
			ctx.ui.notify(`agent-env ${state.enabled ? "enabled" : "disabled"}`, "info");
		},
	});

	pi.registerCommand("agent-env-self-test", {
		description: "Run agent-env shell quoting and preamble self-tests",
		handler: async (_args, ctx) => {
			const internal = runInternalSelfTests();
			const shell = await runShellSelfTest(ctx, state);
			const ok = internal.every((test) => test.ok) && shell.ok;
			const lines = [
				`agent-env self-test: ${ok ? "PASS" : "FAIL"}`,
				"",
				...internal.map((test) => `${test.ok ? "✓" : "✗"} ${test.name}: ${test.details}`),
				`${shell.ok ? "✓" : "✗"} shell execution: ${shell.output}`,
			];
			ctx.ui.notify(lines.join("\n"), ok ? "info" : "error");
		},
	});

	pi.on("turn_end", async (_event, ctx) => {
		setStatus(ctx, state);
	});
}
