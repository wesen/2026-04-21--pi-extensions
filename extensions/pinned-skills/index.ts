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
import { registerPiExtension } from "../_shared/registry";
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

export default function pinnedSkillsExtension(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "pinned-skills",
		name: "Pinned Skills",
		description: "Pins selected full skill instructions into the system prompt with cache-safe deferred config changes.",
		commands: ["pinned-skills"],
		tags: ["skills", "prompt", "context"],
	});
	let state: PinnedSkillsState = {};
	let lastSkills: Skill[] = [];
	let lastRender: RenderPinnedSkillsResult = createEmptyRender();

	pi.on("session_start", async (_event, ctx) => {
		state = restoreState(ctx);
		lastSkills = [];
		lastRender = createEmptyRender(state.activeConfig?.enabled ?? true);
		setStatus(ctx, lastRender, Boolean(state.pendingConfigHash));
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
		return { systemPrompt: `${event.systemPrompt}\n\n${rendered.prompt}` };
	});

	pi.on("session_compact", async (_event, ctx) => {
		state.activeConfig = undefined;
		state.activeConfigHash = undefined;
		state.activePromptHash = undefined;
		state.pendingConfigHash = undefined;
		persistState(pi, state);
		setStatus(ctx, lastRender, false);
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
				ctx.ui.notify(availableSkillsText(pi, lastSkills), "info");
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
					(_tui, theme, _keybindings, done) => new PinnedSkillsChecklist({ items, selectedNames: config.skills, theme, done }),
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
