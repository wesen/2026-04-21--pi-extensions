import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { PromptoConfig } from "./types";

export const DEFAULT_CONFIG: PromptoConfig = {
	submitDefault: "editor",
	allowProjectPlugins: false,
	prefillMaxTokens: 1024,
};

export function getConfigPath(): string {
	return join(homedir(), ".pi", "agent", "prompto.json");
}

export function getGlobalPromptsDir(): string {
	return join(homedir(), ".pi", "agent", "prompts");
}

export function getProjectPromptsDir(cwd: string): string {
	return join(cwd, ".pi", "prompts");
}

export interface ConfigReadResult {
	config: PromptoConfig;
	warnings: string[];
}

export function readConfig(): ConfigReadResult {
	const warnings: string[] = [];
	const path = getConfigPath();
	const config = { ...DEFAULT_CONFIG };
	if (!existsSync(path)) return { config, warnings };

	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
	} catch (error) {
		warnings.push(`Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
		return { config, warnings };
	}

	if (raw.submitDefault !== undefined) {
		if (raw.submitDefault === "editor" || raw.submitDefault === "auto") config.submitDefault = raw.submitDefault;
		else warnings.push(`Ignoring ${path}: submitDefault must be "editor" or "auto"`);
	}
	if (raw.allowProjectPlugins !== undefined) {
		if (typeof raw.allowProjectPlugins === "boolean") config.allowProjectPlugins = raw.allowProjectPlugins;
		else warnings.push(`Ignoring ${path}: allowProjectPlugins must be boolean`);
	}
	if (raw.prefillMaxTokens !== undefined) {
		if (typeof raw.prefillMaxTokens === "number" && Number.isFinite(raw.prefillMaxTokens) && raw.prefillMaxTokens > 0) {
			config.prefillMaxTokens = Math.floor(raw.prefillMaxTokens);
		} else {
			warnings.push(`Ignoring ${path}: prefillMaxTokens must be a positive number`);
		}
	}
	return { config, warnings };
}
