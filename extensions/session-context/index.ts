import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";
import {
	buildSnapshot,
	runSnapshotSelfTests,
	type AgentEnvCapability,
	type SessionContextSettings,
	type SessionContextSnapshot,
} from "./snapshot";
import { formatHumanSnapshot, formatInputBlock, formatStatus, formatSystemBlock } from "./format";
import { appendInputMetadata, appendSystemMetadata, isAlreadyAnnotated, isSlashCommandOrTemplate } from "./prompt";

const STATUS_KEY = "session-context";
const WIDGET_KEY = "session-context";
const AGENT_ENV_EVENT = "agent-env:capability";

interface SessionContextState extends SessionContextSettings {
	enabled: boolean;
	includeSystemPrompt: boolean;
	includeInputPrompt: boolean;
	includeAgentEnvCapability: boolean;
	currentPiTurnIndex?: number;
	lastSnapshot?: SessionContextSnapshot;
	agentEnvCapability?: AgentEnvCapability;
}

function createState(): SessionContextState {
	return {
		enabled: true,
		includeSystemPrompt: true,
		includeInputPrompt: true,
		includeCwd: false,
		includeSessionFile: false,
		includeCost: false,
		includeAgentEnvCapability: true,
		maxSystemChars: 4000,
		maxInputChars: 800,
	};
}

function setStatus(ctx: ExtensionContext, state: SessionContextState): void {
	if (!ctx.hasUI) return;
	if (!state.enabled) {
		ctx.ui.setStatus(STATUS_KEY, "session-context:off");
		return;
	}
	const snapshot = state.lastSnapshot ?? buildCurrentSnapshot(ctx, state);
	ctx.ui.setStatus(STATUS_KEY, formatStatus(snapshot));
}

function buildCurrentSnapshot(ctx: ExtensionContext, state: SessionContextState): SessionContextSnapshot {
	return buildSnapshot(ctx, {
		settings: state,
		currentPiTurnIndex: state.currentPiTurnIndex,
		agentEnvCapability: state.includeAgentEnvCapability ? state.agentEnvCapability : undefined,
	});
}

function refresh(ctx: ExtensionContext, state: SessionContextState): SessionContextSnapshot {
	const snapshot = buildCurrentSnapshot(ctx, state);
	state.lastSnapshot = snapshot;
	setStatus(ctx, state);
	return snapshot;
}

function parseBooleanArgument(args: string): boolean | undefined {
	const value = args.trim().toLowerCase();
	if (["on", "enable", "enabled", "true"].includes(value)) return true;
	if (["off", "disable", "disabled", "false"].includes(value)) return false;
	return undefined;
}

function applyToggle(args: string, state: SessionContextState): string {
	const explicit = parseBooleanArgument(args);
	state.enabled = explicit ?? !state.enabled;
	return state.enabled ? "enabled" : "disabled";
}

function isAgentEnvCapability(value: unknown): value is AgentEnvCapability {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<AgentEnvCapability>;
	return candidate.installed === true
		&& typeof candidate.enabled === "boolean"
		&& candidate.scope === "bash-child-process"
		&& candidate.variablePrefix === "PI_AGENT_";
}

function formatSelfTestResults(results: ReturnType<typeof runSnapshotSelfTests>): string {
	const ok = results.every((result) => result.ok);
	return [
		`session-context self-test: ${ok ? "PASS" : "FAIL"}`,
		"",
		...results.map((result) => `${result.ok ? "✓" : "✗"} ${result.name}: ${result.details}`),
	].join("\n");
}

export default function sessionContextExtension(pi: ExtensionAPI): void {
	const state = createState();

	registerPiExtension({
		id: "session-context",
		name: "Session Context",
		description: "Adds bounded session statistics, prompt numbers, and runtime metadata to model prompts.",
		commands: ["session-context", "sc", "session-context-toggle", "session-context-self-test"],
		tags: ["session", "metadata", "prompt", "compaction", "tokens"],
		run: async (ctx) => {
			const snapshot = refresh(ctx, state);
			ctx.ui.notify(formatHumanSnapshot(snapshot), "info");
		},
		actions: [
			{
				id: "show",
				title: "Show session context",
				description: "Display the current session statistics and prompt numbers.",
				default: true,
				run: async (ctx) => {
					const snapshot = refresh(ctx, state);
					ctx.ui.notify(formatHumanSnapshot(snapshot), "info");
				},
			},
			{
				id: "toggle",
				title: "Toggle prompt injection",
				description: "Enable or disable system and input prompt metadata blocks.",
				run: async (ctx) => {
					const status = applyToggle("toggle", state);
					state.lastSnapshot = undefined;
					setStatus(ctx, state);
					ctx.ui.notify(`session-context ${status}`, "info");
				},
			},
		],
		docs: [
			{ id: "overview", title: "Session Context overview", path: "extensions/session-context/README.md" },
		],
		settings: {
			kind: "schema",
			schema: {
				version: 1,
				title: "Session Context Settings",
				description: "Control runtime metadata injected into model prompts.",
				sections: [
					{
						id: "injection",
						title: "Prompt injection",
						fields: [
							{ id: "enabled", label: "Enabled", type: "boolean", description: "Enable session-context metadata." },
							{ id: "includeSystemPrompt", label: "System prompt block", type: "boolean", description: "Add the full snapshot to the system prompt." },
							{ id: "includeInputPrompt", label: "Input prompt block", type: "boolean", description: "Add compact prompt numbers at submission." },
							{ id: "includeAgentEnvCapability", label: "Agent-env capability", type: "boolean", description: "Describe PI_AGENT_* Bash-child capability when known." },
						],
					},
					{
						id: "privacy",
						title: "Privacy and size",
						fields: [
							{ id: "includeCwd", label: "Include cwd", type: "boolean", description: "Include the working directory in model metadata." },
							{ id: "includeSessionFile", label: "Include session file", type: "boolean", description: "Include the session JSONL path in model metadata." },
							{ id: "includeCost", label: "Include cost", type: "boolean", description: "Include Pi-reported usage cost." },
							{ id: "maxSystemChars", label: "System metadata character limit", type: "number", min: 1000, max: 12000, step: 100 },
							{ id: "maxInputChars", label: "Input metadata character limit", type: "number", min: 300, max: 3000, step: 50 },
						],
					},
				],
			},
			load: () => ({ ...state }),
			onApply: (values, ctx) => {
				for (const key of ["enabled", "includeSystemPrompt", "includeInputPrompt", "includeAgentEnvCapability", "includeCwd", "includeSessionFile", "includeCost"] as const) {
					if (typeof values[key] === "boolean") state[key] = values[key];
				}
				for (const key of ["maxSystemChars", "maxInputChars"] as const) {
					if (typeof values[key] === "number" && Number.isFinite(values[key])) state[key] = Math.floor(values[key]);
				}
				state.lastSnapshot = undefined;
				setStatus(ctx, state);
				ctx.ui.notify("session-context settings applied", "info");
			},
		},
		widgets: [
			{
				id: "status",
				title: "Session Context",
				description: "Current prompt numbers and session statistics.",
				defaultZone: "statusBar",
				defaultVariant: "short",
				priority: 50,
				render: ({ ctx }) => formatStatus(state.lastSnapshot ?? buildCurrentSnapshot(ctx, state)),
			},
		],
	});

	pi.events.on(AGENT_ENV_EVENT, (data) => {
		if (!isAgentEnvCapability(data)) return;
		state.agentEnvCapability = data;
		state.lastSnapshot = undefined;
	});

	pi.on("session_start", async (_event, ctx) => {
		state.currentPiTurnIndex = undefined;
		state.lastSnapshot = undefined;
		refresh(ctx, state);
	});

	pi.on("model_select", async (_event, ctx) => {
		state.lastSnapshot = undefined;
		setStatus(ctx, state);
	});

	pi.on("turn_start", async (event, ctx) => {
		state.currentPiTurnIndex = event.turnIndex;
		state.lastSnapshot = undefined;
		setStatus(ctx, state);
	});

	pi.on("input", async (event, ctx) => {
		if (!state.enabled || !state.includeInputPrompt) return { action: "continue" };
		if (event.source === "extension") return { action: "continue" };
		if (isSlashCommandOrTemplate(event.text) || isAlreadyAnnotated(event.text)) return { action: "continue" };

		const snapshot = refresh(ctx, state);
		return {
			action: "transform",
			text: appendInputMetadata(event.text, formatInputBlock(snapshot, state.maxInputChars)),
			images: event.images,
		};
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!state.enabled || !state.includeSystemPrompt) return;
		const snapshot = refresh(ctx, state);
		return {
			systemPrompt: appendSystemMetadata(event.systemPrompt, formatSystemBlock(snapshot, state.maxSystemChars)),
		};
	});

	pi.on("turn_end", async (_event, ctx) => {
		state.lastSnapshot = undefined;
		setStatus(ctx, state);
	});

	pi.on("session_compact", async (_event, ctx) => {
		state.lastSnapshot = undefined;
		setStatus(ctx, state);
	});

	pi.on("session_tree", async (_event, ctx) => {
		state.lastSnapshot = undefined;
		setStatus(ctx, state);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		}
	});

	async function show(ctx: ExtensionCommandContext): Promise<void> {
		const snapshot = refresh(ctx, state);
		ctx.ui.notify(formatHumanSnapshot(snapshot), "info");
	}

	pi.registerCommand("session-context", {
		description: "Show current session statistics and prompt numbers",
		handler: async (_args, ctx) => show(ctx),
	});

	pi.registerCommand("sc", {
		description: "Alias for /session-context",
		handler: async (_args, ctx) => show(ctx),
	});

	pi.registerCommand("session-context-toggle", {
		description: "Toggle session-context prompt injection on/off",
		handler: async (args, ctx) => {
			const status = applyToggle(args, state);
			state.lastSnapshot = undefined;
			setStatus(ctx, state);
			ctx.ui.notify(`session-context ${status}`, "info");
		},
	});

	pi.registerCommand("session-context-self-test", {
		description: "Run session-context snapshot self-tests",
		handler: async (_args, ctx) => {
			const results = runSnapshotSelfTests();
			ctx.ui.notify(formatSelfTestResults(results), results.every((result) => result.ok) ? "info" : "error");
		},
	});
}
