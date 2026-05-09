import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

export interface PinnedSkillsConfig {
	version: 1;
	enabled: boolean;
	skills: string[];
	maxSkillBytes: number;
	maxTotalBytes: number;
	includeDisabledModelInvocation: boolean;
	showStatus: boolean;
}

export interface ConfigReadResult {
	config: PinnedSkillsConfig;
	warnings: string[];
	globalPath: string;
	projectPath: string;
}

export const DEFAULT_CONFIG: PinnedSkillsConfig = {
	version: 1,
	enabled: true,
	skills: [],
	maxSkillBytes: 50_000,
	maxTotalBytes: 150_000,
	includeDisabledModelInvocation: false,
	showStatus: true,
};

interface RawConfig {
	version?: unknown;
	enabled?: unknown;
	skills?: unknown;
	maxSkillBytes?: unknown;
	maxTotalBytes?: unknown;
	includeDisabledModelInvocation?: unknown;
	showStatus?: unknown;
}

export function getGlobalConfigPath(): string {
	return join(homedir(), ".pi", "agent", "pinned-skills.json");
}

export function getProjectConfigPath(cwd: string): string {
	return join(cwd, ".pi", "pinned-skills.json");
}

function readJson(path: string, warnings: string[]): RawConfig | undefined {
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as RawConfig;
	} catch (error) {
		warnings.push(`Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

function normalizeSkillNames(value: unknown, path: string, warnings: string[]): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		warnings.push(`Ignoring ${path}: skills must be an array of skill names`);
		return undefined;
	}
	const names = new Set<string>();
	for (const item of value) {
		if (typeof item !== "string") {
			warnings.push(`Ignoring non-string skill name in ${path}`);
			continue;
		}
		const name = item.trim();
		if (name) names.add(name);
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}

function normalizeBoolean(value: unknown, key: string, path: string, warnings: string[]): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "boolean") return value;
	warnings.push(`Ignoring ${path}: ${key} must be boolean`);
	return undefined;
}

function normalizePositiveInteger(value: unknown, key: string, path: string, warnings: string[]): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
	warnings.push(`Ignoring ${path}: ${key} must be a positive number`);
	return undefined;
}

function applyConfig(base: PinnedSkillsConfig, raw: RawConfig | undefined, path: string, warnings: string[]): PinnedSkillsConfig {
	if (!raw) return base;
	const next: PinnedSkillsConfig = { ...base };

	if (raw.version !== undefined && raw.version !== 1) {
		warnings.push(`Ignoring ${path}: only pinned-skills config version 1 is supported`);
	}

	const enabled = normalizeBoolean(raw.enabled, "enabled", path, warnings);
	if (enabled !== undefined) next.enabled = enabled;

	const skills = normalizeSkillNames(raw.skills, path, warnings);
	if (skills !== undefined) next.skills = skills;

	const maxSkillBytes = normalizePositiveInteger(raw.maxSkillBytes, "maxSkillBytes", path, warnings);
	if (maxSkillBytes !== undefined) next.maxSkillBytes = maxSkillBytes;

	const maxTotalBytes = normalizePositiveInteger(raw.maxTotalBytes, "maxTotalBytes", path, warnings);
	if (maxTotalBytes !== undefined) next.maxTotalBytes = maxTotalBytes;

	const includeDisabled = normalizeBoolean(raw.includeDisabledModelInvocation, "includeDisabledModelInvocation", path, warnings);
	if (includeDisabled !== undefined) next.includeDisabledModelInvocation = includeDisabled;

	const showStatus = normalizeBoolean(raw.showStatus, "showStatus", path, warnings);
	if (showStatus !== undefined) next.showStatus = showStatus;

	return next;
}

export function readConfig(cwd: string): ConfigReadResult {
	const warnings: string[] = [];
	const globalPath = getGlobalConfigPath();
	const projectPath = getProjectConfigPath(cwd);
	const globalConfig = readJson(globalPath, warnings);
	const projectConfig = readJson(projectPath, warnings);
	const config = applyConfig(applyConfig({ ...DEFAULT_CONFIG }, globalConfig, globalPath, warnings), projectConfig, projectPath, warnings);
	return { config, warnings, globalPath, projectPath };
}

export function writeProjectConfig(cwd: string, config: PinnedSkillsConfig): string {
	const path = getProjectConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	const normalized = applyConfig({ ...DEFAULT_CONFIG }, config, path, []);
	writeFileSync(path, `${JSON.stringify(normalized, null, "\t")}\n`, "utf-8");
	return path;
}

export function hashConfig(config: PinnedSkillsConfig): string {
	return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function updateConfigSkills(config: PinnedSkillsConfig, operation: "add" | "remove" | "set", names: string[]): PinnedSkillsConfig {
	const current = new Set(config.skills);
	if (operation === "set") {
		return { ...config, skills: [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)) };
	}
	for (const rawName of names) {
		const name = rawName.trim();
		if (!name) continue;
		if (operation === "add") current.add(name);
		if (operation === "remove") current.delete(name);
	}
	return { ...config, skills: [...current].sort((a, b) => a.localeCompare(b)) };
}
