import type { ExtensionAPI, ExtensionContext, Skill, SlashCommandInfo } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_CONFIG,
	hashConfig,
	readConfig,
	updateConfigSkills,
	writeProjectConfig,
	type PinnedSkillsConfig,
} from "./config";
import {
	formatRenderDetails,
	formatStatus,
	hashString,
	renderPinnedSkills,
	type RenderPinnedSkillsResult,
} from "./prompt";
import { refreshDashboard } from "../_shared/dashboard/manager";
import { registerPiExtension } from "../_shared/registry";
import { DocViewer } from "../_shared/ui/doc-viewer";
import { PinnedSkillsChecklist, type SkillListItem } from "./ui";

const STATUS_KEY = "pinned-skills";
const CUSTOM_TYPE = "pinned-skills-state";

interface PinnedSkillsState {
	activeConfig?: PinnedSkillsConfig;
	activeConfigHash?: string;
	activePromptHash?: string;
	pendingConfigHash?: string;
	lastAppliedAt?: string;
	lastWarningAt?: string;
	injectedThisSession?: boolean;
	lastInjectedAt?: string;
	lastInjectedSkills?: string[];
	lastNotifiedPromptHash?: string;
}

function createEmptyRender(enabled = true): RenderPinnedSkillsResult {
	return {
		prompt: "",
		included: [],
		missing: [],
		skipped: [],
		warnings: [],
		bytes: 0,
		enabled,
	};
}

function restoreState(ctx: ExtensionContext): PinnedSkillsState {
	let state: PinnedSkillsState = {};
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "custom" || entry.customType !== CUSTOM_TYPE) continue;
		state = { ...state, ...((entry.data ?? {}) as PinnedSkillsState) };
	}
	return state;
}

function branchHasAssistantMessage(ctx: ExtensionContext): boolean {
	return ctx.sessionManager.getBranch().some((entry) => entry.type === "message" && entry.message.role === "assistant");
}

function setStatus(ctx: ExtensionContext, result: RenderPinnedSkillsResult, pending: boolean): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(STATUS_KEY, formatStatus(result, pending));
	void refreshDashboard(ctx);
}

function showWarnings(ctx: ExtensionContext, warnings: string[]): void {
	if (!ctx.hasUI) return;
	for (const warning of warnings.slice(0, 3)) {
		ctx.ui.notify(`pinned-skills: ${warning}`, "warning");
	}
}

function cacheStabilityWarning(): string {
	return "Pinned skills config changed. To preserve prompt-cache stability, this session will keep using the currently loaded pinned-skills prompt until /compact or a new session. The new selection is saved and pending.";
}

function pink(text: string): string {
	return `\x1b[95m${text}\x1b[0m`;
}

function pinnedSkillNames(items: Array<string | { name: string }>): string[] {
	return items.map((item) => typeof item === "string" ? item : item.name).filter(Boolean);
}

function notifyPinnedSkillsLoaded(ctx: ExtensionContext, reason: string, skills: Array<string | { name: string }>): void {
	const skillNames = pinnedSkillNames(skills);
	if (!ctx.hasUI || skillNames.length === 0) return;
	ctx.ui.notify(pink(`💗 pinned-skills ${reason}: ${skillNames.join(", ")}`), "info");
}

function renderForConfig(skills: Skill[], config: PinnedSkillsConfig): RenderPinnedSkillsResult {
	return renderPinnedSkills(skills, config);
}

function summarizeConfig(config: PinnedSkillsConfig, globalPath: string, projectPath: string, lastRender: RenderPinnedSkillsResult, state: PinnedSkillsState): string {
	return [
		`pinned-skills is ${config.enabled ? "enabled" : "disabled"}`,
		`configured skills: ${config.skills.length === 0 ? "(none)" : config.skills.join(", ")}`,
		`active config hash: ${state.activeConfigHash ?? "(none)"}`,
		`pending config hash: ${state.pendingConfigHash ?? "(none)"}`,
		`last applied: ${state.lastAppliedAt ?? "(never)"}`,
		`global config: ${globalPath}`,
		`project config: ${projectPath}`,
		"",
		formatRenderDetails(lastRender),
	].join("\n");
}

function skillCommandName(command: SlashCommandInfo): string {
	return command.name.startsWith("skill:") ? command.name.slice("skill:".length) : command.name;
}

function getAvailableSkillList(pi: ExtensionAPI, skills: Skill[]): SkillListItem[] {
	if (skills.length > 0) {
		return skills.map((skill) => ({
			name: skill.name,
			description: skill.description,
			path: skill.filePath,
			disabled: skill.disableModelInvocation,
			source: "skills-snapshot",
		}));
	}

	return pi
		.getCommands()
		.filter((command) => command.source === "skill")
		.map((command) => ({
			name: skillCommandName(command),
			description: command.description ?? "",
			path: command.sourceInfo.path,
			source: "commands-fallback" as const,
		}));
}

function availableSkillsText(pi: ExtensionAPI, skills: Skill[]): string {
	const items = getAvailableSkillList(pi, skills);
	if (items.length === 0) return "No skills are currently available.";
	const source = items.some((item) => item.source === "skills-snapshot")
		? "Skill metadata source: before_agent_start systemPromptOptions snapshot."
		: "Skill metadata source: pi.getCommands() fallback. Send one prompt before using preview/injection for richer Skill metadata.";
	return [
		source,
		"",
		...items.map((item) => {
			const disabled = item.disabled ? " [disable-model-invocation]" : "";
			const description = item.description ? `: ${item.description}` : "";
			return `- ${item.name}${disabled}${description}\n  ${item.path}`;
		}),
	].join("\n");
}

function splitArgs(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

function persistState(pi: ExtensionAPI, state: PinnedSkillsState): void {
	pi.appendEntry(CUSTOM_TYPE, { ...state });
}

function stateMatchesActivePrompt(state: PinnedSkillsState, configHash: string, promptHash: string): boolean {
	return state.activeConfigHash === configHash && state.activePromptHash === promptHash && !state.pendingConfigHash;
}

function renderPinnedSkillsDashboard(state: PinnedSkillsState, lastRender: RenderPinnedSkillsResult, variant: string): string | string[] {
	const injected = state.injectedThisSession ? "yes" : "no";
	const activeSkills = state.lastInjectedSkills?.length ? state.lastInjectedSkills : pinnedSkillNames(lastRender.included);
	if (variant === "short") {
		return `pins:${lastRender.included.length} injected:${injected}`;
	}
	return [
		"Pinned Skills",
		`Injected this session: ${injected}`,
		`Last injected: ${state.lastInjectedAt ?? "never"}`,
		`Active skills: ${activeSkills.length ? activeSkills.join(", ") : "(none)"}`,
		`Pending config: ${state.pendingConfigHash ? "yes" : "no"}`,
	];
}

export default function pinnedSkillsExtension(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "pinned-skills",
		name: "Pinned Skills",
		description: "Pins selected full skill instructions into the system prompt with cache-safe deferred config changes.",
		commands: ["pinned-skills"],
		tags: ["skills", "prompt", "context"],
		run: async (ctx) => openPinnedSkillsMenu(ctx),
		actions: [
			{ id: "menu", title: "Open checklist", description: "Select pinned skills in a TUI checklist.", default: true, run: async (ctx) => openPinnedSkillsMenu(ctx) },
			{ id: "preview", title: "Preview prompt block", description: "Show the prompt block that will be injected.", run: async (ctx) => previewPinnedSkills(ctx) },
			{ id: "list", title: "List available skills", description: "List all currently available skills.", run: async (ctx) => openAvailableSkillsList(ctx) },
		],
		docs: [
			{
				id: "overview",
				title: "Pinned Skills overview",
				markdown: "# Pinned Skills\n\nPinned Skills keeps selected full skill instructions loaded in prompt context.\n\n- Use the checklist to choose skills.\n- Config changes are saved to `.pi/pinned-skills.json`.\n- If the active prompt epoch already has assistant messages, changes may be deferred until `/compact` or a new session to preserve prompt-cache stability.",
			},
		],
		settings: {
			kind: "custom",
			title: "Pinned Skills settings",
			description: "Open the pinned skills checklist.",
			open: ({ ctx, theme, done, requestRender }) => {
				const read = readConfig(ctx.cwd);
				const items = getAvailableSkillList(pi, lastSkills);
				return new PinnedSkillsChecklist({
					items,
					selectedNames: read.config.skills,
					theme,
					requestRender,
					done: async (selected) => {
						if (selected !== undefined) {
							const config = updateConfigSkills(read.config, "set", selected);
							const path = writeProjectConfig(ctx.cwd, config);
							lastRender = renderForConfig(lastSkills, config);
							setStatus(ctx, lastRender, Boolean(state.pendingConfigHash));
							ctx.ui.notify(`Updated pinned-skills project config: ${path}`, "info");
						}
						done();
					},
				});
			},
		},
		widgets: [
			{
				id: "status",
				title: "Pinned Skills Status",
				description: "Shows active pinned skills and whether they have been injected in this session.",
				defaultZone: "statusBar",
				defaultVariant: "short",
				priority: 40,
				render: ({ variant }) => renderPinnedSkillsDashboard(state, lastRender, variant),
			},
			{
				id: "summary",
				title: "Pinned Skills",
				description: "Shows configured/injected pinned skills and prompt injection state.",
				defaultZone: "dashboardOverlay",
				defaultVariant: "card",
				priority: 35,
				render: ({ variant }) => renderPinnedSkillsDashboard(state, lastRender, variant),
			},
		],
	});
	let state: PinnedSkillsState = {};
	let lastSkills: Skill[] = [];
	let lastRender: RenderPinnedSkillsResult = createEmptyRender();

	async function previewPinnedSkills(ctx: any): Promise<void> {
		const config = readConfig(ctx.cwd).config;
		const rendered = renderForConfig(lastSkills, config);
		lastRender = rendered;
		setStatus(ctx, rendered, Boolean(state.pendingConfigHash));
		ctx.ui.notify(formatRenderDetails(rendered), rendered.warnings.length > 0 ? "warning" : "info");
	}

	async function openAvailableSkillsList(ctx: any): Promise<void> {
		const body = availableSkillsText(pi, lastSkills);
		await ctx.ui.custom<void>(
			(tui: any, theme: any, _keybindings: unknown, done: () => void) => new DocViewer({
				title: "Available Skills",
				markdown: `# Available Skills\n\n${body}`,
				theme,
				done,
				requestRender: () => tui.requestRender(),
			}),
			{ overlay: true, overlayOptions: { width: "90%", maxHeight: "85%", minWidth: 70, margin: 1 } },
		);
	}

	async function openPinnedSkillsMenu(ctx: any): Promise<void> {
		const read = readConfig(ctx.cwd);
		let config = read.config;
		const items = getAvailableSkillList(pi, lastSkills);
		if (items.length === 0) {
			ctx.ui.notify("No skills are currently available.", "warning");
			return;
		}
		const selected = await ctx.ui.custom<string[] | undefined>(
			(tui: any, theme: any, _keybindings: unknown, done: (result: string[] | undefined) => void) => new PinnedSkillsChecklist({ items, selectedNames: config.skills, theme, done, requestRender: () => tui.requestRender() }),
			{ overlay: true, overlayOptions: { width: "90%", maxHeight: "80%", minWidth: 70, margin: 1 } },
		);
		if (selected === undefined) return;
		config = updateConfigSkills(config, "set", selected);
		const path = writeProjectConfig(ctx.cwd, config);
		const configHash = hashConfig(config);
		if (branchHasAssistantMessage(ctx) && state.activeConfigHash && state.activeConfigHash !== configHash) {
			state.pendingConfigHash = configHash;
			persistState(pi, state);
			setStatus(ctx, lastRender, true);
			ctx.ui.notify(`${cacheStabilityWarning()}\n\nUpdated project config: ${path}`, "warning");
			return;
		}
		state.pendingConfigHash = undefined;
		const rendered = renderForConfig(lastSkills, config);
		lastRender = rendered;
		setStatus(ctx, rendered, false);
		ctx.ui.notify(`Updated pinned-skills project config: ${path}`, "info");
	}

	pi.on("session_start", async (_event, ctx) => {
		state = restoreState(ctx);
		state.injectedThisSession = false;
		lastSkills = [];
		lastRender = createEmptyRender(state.activeConfig?.enabled ?? true);
		setStatus(ctx, lastRender, Boolean(state.pendingConfigHash));
		const startupConfig = readConfig(ctx.cwd).config;
		if (startupConfig.enabled) notifyPinnedSkillsLoaded(ctx, "loaded config on startup", startupConfig.skills);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		lastSkills = event.systemPromptOptions.skills ?? [];
		const read = readConfig(ctx.cwd);
		const currentConfig = read.config;
		const currentConfigHash = hashConfig(currentConfig);
		const hasAssistant = branchHasAssistantMessage(ctx);

		let configForPrompt = currentConfig;
		let deferred = false;

		if (hasAssistant && state.activeConfig && state.activeConfigHash && state.activeConfigHash !== currentConfigHash) {
			configForPrompt = state.activeConfig;
			state.pendingConfigHash = currentConfigHash;
			deferred = true;
		} else {
			state.pendingConfigHash = undefined;
		}

		const rendered = renderForConfig(lastSkills, configForPrompt);
		const promptHash = hashString(rendered.prompt);
		lastRender = rendered;

		if (!deferred) {
			const configHash = hashConfig(configForPrompt);
			const alreadyPersisted = stateMatchesActivePrompt(state, configHash, promptHash);
			state.activeConfig = configForPrompt;
			state.activeConfigHash = configHash;
			state.activePromptHash = promptHash;
			if (!alreadyPersisted) {
				state.lastAppliedAt = new Date().toISOString();
				persistState(pi, state);
			}
		}

		setStatus(ctx, rendered, deferred || Boolean(state.pendingConfigHash));
		showWarnings(ctx, [...read.warnings, ...rendered.warnings]);
		if (deferred && ctx.hasUI && state.lastWarningAt !== state.pendingConfigHash) {
			ctx.ui.notify(cacheStabilityWarning(), "warning");
			state.lastWarningAt = state.pendingConfigHash;
			persistState(pi, state);
		}

		if (!rendered.prompt) return;
		state.injectedThisSession = true;
		state.lastInjectedAt = new Date().toISOString();
		state.lastInjectedSkills = pinnedSkillNames(rendered.included);
		if (state.lastNotifiedPromptHash !== promptHash) {
			notifyPinnedSkillsLoaded(ctx, "injected into system prompt", rendered.included);
			state.lastNotifiedPromptHash = promptHash;
		}
		persistState(pi, state);
		return { systemPrompt: `${event.systemPrompt}\n\n${rendered.prompt}` };
	});

	pi.on("session_compact", async (_event, ctx) => {
		state.activeConfig = undefined;
		state.activeConfigHash = undefined;
		state.activePromptHash = undefined;
		state.pendingConfigHash = undefined;
		state.injectedThisSession = false;
		state.lastInjectedAt = undefined;
		state.lastInjectedSkills = undefined;
		state.lastNotifiedPromptHash = undefined;
		persistState(pi, state);
		setStatus(ctx, lastRender, false);
		const compactConfig = readConfig(ctx.cwd).config;
		if (compactConfig.enabled) notifyPinnedSkillsLoaded(ctx, "reset after compaction; will inject next prompt", compactConfig.skills);
		if (ctx.hasUI) ctx.ui.notify("pinned-skills: compaction completed; pending config may apply on the next prompt", "info");
	});

	pi.registerCommand("pinned-skills", {
		description: "List or configure skills pinned into the system prompt (args: list add remove clear on off edit menu preview)",
		handler: async (args, ctx) => {
			const read = readConfig(ctx.cwd);
			let config = read.config;
			const tokens = splitArgs(args);
			const verb = tokens[0]?.toLowerCase() ?? "status";
			const rest = tokens.slice(1);

			if (verb === "list") {
				await openAvailableSkillsList(ctx);
				return;
			}

			if (verb === "preview") {
				const rendered = renderForConfig(lastSkills, config);
				lastRender = rendered;
				setStatus(ctx, rendered, Boolean(state.pendingConfigHash));
				ctx.ui.notify(formatRenderDetails(rendered), rendered.warnings.length > 0 ? "warning" : "info");
				return;
			}

			let changed = false;
			if (verb === "add") {
				config = updateConfigSkills(config, "add", rest);
				changed = true;
			} else if (verb === "remove" || verb === "rm") {
				config = updateConfigSkills(config, "remove", rest);
				changed = true;
			} else if (verb === "clear") {
				config = { ...config, skills: [] };
				changed = true;
			} else if (verb === "on" || verb === "enable") {
				config = { ...config, enabled: true };
				changed = true;
			} else if (verb === "off" || verb === "disable") {
				config = { ...config, enabled: false };
				changed = true;
			} else if (verb === "edit") {
				const edited = await ctx.ui.editor("Pinned skills (one skill name per line)", config.skills.join("\n"));
				if (edited === undefined) return;
				config = updateConfigSkills(config, "set", edited.split(/\r?\n/));
				changed = true;
			} else if (verb === "menu" || verb === "ui") {
				const items = getAvailableSkillList(pi, lastSkills);
				if (items.length === 0) {
					ctx.ui.notify("No skills are currently available.", "warning");
					return;
				}
				const selected = await ctx.ui.custom<string[] | undefined>(
					(tui, theme, _keybindings, done) => new PinnedSkillsChecklist({ items, selectedNames: config.skills, theme, done, requestRender: () => tui.requestRender() }),
					{
						overlay: true,
						overlayOptions: { width: "90%", maxHeight: "80%", minWidth: 70, margin: 1 },
					},
				);
				if (selected === undefined) return;
				config = updateConfigSkills(config, "set", selected);
				changed = true;
			} else if (verb !== "status") {
				ctx.ui.notify(`Unknown pinned-skills command: ${verb}\nUse: list, add, remove, clear, on, off, edit, menu, preview`, "warning");
				return;
			}

			if (changed) {
				const path = writeProjectConfig(ctx.cwd, config);
				const configHash = hashConfig(config);
				const hasAssistant = branchHasAssistantMessage(ctx);
				if (hasAssistant && state.activeConfigHash && state.activeConfigHash !== configHash) {
					state.pendingConfigHash = configHash;
					persistState(pi, state);
					setStatus(ctx, lastRender, true);
					ctx.ui.notify(`${cacheStabilityWarning()}\n\nUpdated project config: ${path}`, "warning");
					return;
				}
				state.pendingConfigHash = undefined;
				ctx.ui.notify(`Updated pinned-skills project config: ${path}`, "info");
			}

			const rendered = renderForConfig(lastSkills, config);
			lastRender = rendered;
			setStatus(ctx, rendered, Boolean(state.pendingConfigHash));
			ctx.ui.notify(summarizeConfig(config, read.globalPath, read.projectPath, rendered, state), read.warnings.length > 0 ? "warning" : "info");
		},
	});

}
