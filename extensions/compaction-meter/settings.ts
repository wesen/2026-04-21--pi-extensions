import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CompactionMeterSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
}

export interface SettingsReadResult {
	settings: CompactionMeterSettings;
	warnings: string[];
	globalPath: string;
	projectPath: string;
}

interface RawSettings {
	compaction?: {
		enabled?: unknown;
		reserveTokens?: unknown;
		keepRecentTokens?: unknown;
	};
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionMeterSettings = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
};

function readJson(path: string, warnings: string[]): RawSettings | undefined {
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as RawSettings;
	} catch (error) {
		warnings.push(`Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

function applyCompactionSettings(
	settings: CompactionMeterSettings,
	raw: RawSettings | undefined,
	path: string,
	warnings: string[],
): void {
	const compaction = raw?.compaction;
	if (!compaction || typeof compaction !== "object") return;

	if (typeof compaction.enabled === "boolean") {
		settings.enabled = compaction.enabled;
	} else if (compaction.enabled !== undefined) {
		warnings.push(`Ignoring ${path}: compaction.enabled must be boolean`);
	}

	if (typeof compaction.reserveTokens === "number" && Number.isFinite(compaction.reserveTokens) && compaction.reserveTokens >= 0) {
		settings.reserveTokens = Math.floor(compaction.reserveTokens);
	} else if (compaction.reserveTokens !== undefined) {
		warnings.push(`Ignoring ${path}: compaction.reserveTokens must be a non-negative number`);
	}

	if (typeof compaction.keepRecentTokens === "number" && Number.isFinite(compaction.keepRecentTokens) && compaction.keepRecentTokens >= 0) {
		settings.keepRecentTokens = Math.floor(compaction.keepRecentTokens);
	} else if (compaction.keepRecentTokens !== undefined) {
		warnings.push(`Ignoring ${path}: compaction.keepRecentTokens must be a non-negative number`);
	}
}

export function readCompactionSettings(cwd: string): SettingsReadResult {
	const warnings: string[] = [];
	const globalPath = join(homedir(), ".pi", "agent", "settings.json");
	const projectPath = join(cwd, ".pi", "settings.json");
	const settings: CompactionMeterSettings = { ...DEFAULT_COMPACTION_SETTINGS };

	applyCompactionSettings(settings, readJson(globalPath, warnings), globalPath, warnings);
	applyCompactionSettings(settings, readJson(projectPath, warnings), projectPath, warnings);

	return { settings, warnings, globalPath, projectPath };
}
