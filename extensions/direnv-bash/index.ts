import {
	createLocalBashOperations,
	isToolCallEventType,
	type ExtensionAPI,
	type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
	buildDirenvBashPreamble,
	injectDirenvBashPreamble,
	runInternalSelfTests,
	type DirenvBashOptions,
} from "./direnv";

const STATUS_KEY = "direnv-bash";

interface DirenvBashState {
	enabled: boolean;
	quiet: boolean;
	strict: boolean;
	injectionCount: number;
	lastInjectionAt: string | undefined;
	lastToolCallId: string | undefined;
}

function createState(): DirenvBashState {
	return {
		enabled: true,
		quiet: false,
		strict: false,
		injectionCount: 0,
		lastInjectionAt: undefined,
		lastToolCallId: undefined,
	};
}

function toOptions(state: DirenvBashState): DirenvBashOptions {
	return { quiet: state.quiet, strict: state.strict };
}

function setStatus(ctx: ExtensionContext, state: DirenvBashState): void {
	if (!ctx.hasUI) return;
	const mode = state.enabled ? "on" : "off";
	const flags = [state.quiet ? "quiet" : undefined, state.strict ? "strict" : undefined]
		.filter(Boolean)
		.join(",");
	ctx.ui.setStatus(STATUS_KEY, `direnv:${mode}${flags ? `(${flags})` : ""} n=${state.injectionCount}`);
}

function recordInjection(ctx: ExtensionContext, state: DirenvBashState, toolCallId: string | undefined): void {
	state.injectionCount++;
	state.lastInjectionAt = new Date().toISOString();
	state.lastToolCallId = toolCallId;
	setStatus(ctx, state);
}

function formatStatusText(state: DirenvBashState): string {
	return [
		`direnv-bash is ${state.enabled ? "enabled" : "disabled"}`,
		`quiet: ${state.quiet ? "on" : "off"}`,
		`strict: ${state.strict ? "on" : "off"}`,
		`injections: ${state.injectionCount}`,
		`last injection: ${state.lastInjectionAt ?? "(none)"}`,
		`last tool call: ${state.lastToolCallId ?? "(none)"}`,
	].join("\n");
}

function applyModeArgs(args: string, state: DirenvBashState): string[] {
	const messages: string[] = [];
	for (const token of args.trim().split(/\s+/).filter(Boolean)) {
		const normalized = token.toLowerCase();
		if (normalized === "on" || normalized === "enable" || normalized === "enabled") {
			state.enabled = true;
			messages.push("enabled");
		} else if (normalized === "off" || normalized === "disable" || normalized === "disabled") {
			state.enabled = false;
			messages.push("disabled");
		} else if (normalized === "toggle") {
			state.enabled = !state.enabled;
			messages.push(state.enabled ? "enabled" : "disabled");
		} else if (normalized === "quiet") {
			state.quiet = true;
			messages.push("quiet on");
		} else if (normalized === "no-quiet" || normalized === "verbose") {
			state.quiet = false;
			messages.push("quiet off");
		} else if (normalized === "strict") {
			state.strict = true;
			messages.push("strict on");
		} else if (normalized === "no-strict" || normalized === "best-effort") {
			state.strict = false;
			messages.push("strict off");
		} else {
			messages.push(`ignored unknown option: ${token}`);
		}
	}
	return messages;
}

async function runShellSelfTest(ctx: ExtensionContext, state: DirenvBashState): Promise<{ ok: boolean; output: string }> {
	const ops = createLocalBashOperations();
	const chunks: Buffer[] = [];
	const command = injectDirenvBashPreamble(
		"printf 'direnv_bash_self_test=%s\\n' \"${DIRENV_BASH_SELF_TEST:-missing}\"",
		buildDirenvBashPreamble(toOptions(state)),
	);
	try {
		const result = await ops.exec(command, ctx.cwd, {
			onData: (data) => chunks.push(data),
			timeout: 10,
		});
		const output = Buffer.concat(chunks).toString("utf-8").trim();
		return {
			ok: result.exitCode === 0,
			output: output || `(no stdout; exit=${result.exitCode})`,
		};
	} catch (error) {
		const output = Buffer.concat(chunks).toString("utf-8").trim();
		return {
			ok: false,
			output: [output, error instanceof Error ? error.message : String(error)].filter(Boolean).join("\n"),
		};
	}
}

export default function direnvBashExtension(pi: ExtensionAPI): void {
	const state = createState();

	pi.on("session_start", async (_event, ctx) => {
		setStatus(ctx, state);
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!state.enabled) return;
		if (!isToolCallEventType("bash", event)) return;
		const preamble = buildDirenvBashPreamble(toOptions(state));
		const nextCommand = injectDirenvBashPreamble(event.input.command, preamble);
		if (nextCommand !== event.input.command) {
			event.input.command = nextCommand;
			recordInjection(ctx, state, event.toolCallId);
		}
	});

	pi.on("user_bash", async (_event, ctx) => {
		if (!state.enabled) return;
		const ops = createLocalBashOperations();
		return {
			operations: {
				exec: (command, cwd, options) => {
					const nextCommand = injectDirenvBashPreamble(command, buildDirenvBashPreamble(toOptions(state)));
					if (nextCommand !== command) recordInjection(ctx, state, undefined);
					return ops.exec(nextCommand, cwd, options);
				},
			},
		};
	});

	pi.registerCommand("direnv-bash", {
		description: "Show or configure direnv loading for bash commands (args: on off toggle quiet no-quiet strict no-strict)",
		handler: async (args, ctx) => {
			const changes = applyModeArgs(args, state);
			setStatus(ctx, state);
			ctx.ui.notify([formatStatusText(state), changes.length ? "" : undefined, ...changes].filter(Boolean).join("\n"), "info");
		},
	});

	pi.registerCommand("dbash", {
		description: "Alias for /direnv-bash",
		handler: async (args, ctx) => {
			const changes = applyModeArgs(args, state);
			setStatus(ctx, state);
			ctx.ui.notify([formatStatusText(state), changes.length ? "" : undefined, ...changes].filter(Boolean).join("\n"), "info");
		},
	});

	pi.registerCommand("direnv-bash-self-test", {
		description: "Run direnv-bash internal and shell smoke tests",
		handler: async (_args, ctx) => {
			const internal = runInternalSelfTests();
			const shell = await runShellSelfTest(ctx, state);
			const ok = internal.every((test) => test.ok) && shell.ok;
			const lines = [
				`direnv-bash self-test: ${ok ? "PASS" : "FAIL"}`,
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
