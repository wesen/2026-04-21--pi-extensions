import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { PiDashboardVariant, PiDashboardZone } from "../registry";

export interface PiDashboardConfig {
	version: 1;
	zones: Partial<Record<PiDashboardZone, PiDashboardZoneConfig>>;
}

export interface PiDashboardZoneConfig {
	enabled: boolean;
	layout: "inline" | "stack" | "grid" | "columns";
	items: PiDashboardLayoutItem[];
}

export interface PiDashboardLayoutItem {
	widget: string;
	visible: boolean;
	variant?: PiDashboardVariant;
	order?: number;
	width?: number | "auto" | `${number}%`;
	height?: number | "auto";
	column?: number;
	row?: number;
}

const DEFAULT_CONFIG: PiDashboardConfig = {
	version: 1,
	zones: {
		statusBar: { enabled: true, layout: "inline", items: [] },
		aboveEditor: { enabled: true, layout: "stack", items: [] },
		belowEditor: { enabled: true, layout: "stack", items: [] },
		dashboardOverlay: { enabled: true, layout: "grid", items: [] },
	},
};

export function dashboardConfigPaths(cwd: string): { globalPath: string; projectPath: string } {
	return {
		globalPath: path.join(os.homedir(), ".pi", "agent", "dashboard.json"),
		projectPath: path.join(cwd, ".pi", "dashboard.json"),
	};
}

export function readDashboardConfig(cwd: string): PiDashboardConfig {
	const { globalPath, projectPath } = dashboardConfigPaths(cwd);
	return mergeDashboardConfigs(DEFAULT_CONFIG, readConfigFile(globalPath), readConfigFile(projectPath));
}

export function writeProjectDashboardConfig(cwd: string, config: PiDashboardConfig): string {
	const { projectPath } = dashboardConfigPaths(cwd);
	fs.mkdirSync(path.dirname(projectPath), { recursive: true });
	fs.writeFileSync(projectPath, JSON.stringify(config, null, "\t") + "\n", "utf8");
	return projectPath;
}

export function mergeDashboardConfigs(...configs: Array<PiDashboardConfig | undefined>): PiDashboardConfig {
	const merged: PiDashboardConfig = { version: 1, zones: {} };
	for (const config of configs) {
		if (!config) continue;
		for (const [zone, zoneConfig] of Object.entries(config.zones) as Array<[PiDashboardZone, PiDashboardZoneConfig]>) {
			const previous = merged.zones[zone];
			const byWidget = new Map<string, PiDashboardLayoutItem>();
			for (const item of previous?.items ?? []) byWidget.set(item.widget, item);
			for (const item of zoneConfig.items ?? []) byWidget.set(item.widget, { ...byWidget.get(item.widget), ...item });
			merged.zones[zone] = {
				enabled: zoneConfig.enabled ?? previous?.enabled ?? true,
				layout: zoneConfig.layout ?? previous?.layout ?? "stack",
				items: [...byWidget.values()],
			};
		}
	}
	return merged;
}

export function defaultLayoutItem(widget: string, order: number, variant: PiDashboardVariant): PiDashboardLayoutItem {
	return { widget, visible: true, order, variant, width: "auto" };
}

function readConfigFile(file: string): PiDashboardConfig | undefined {
	try {
		if (!fs.existsSync(file)) return undefined;
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		if (parsed?.version !== 1 || typeof parsed?.zones !== "object") return undefined;
		return parsed as PiDashboardConfig;
	} catch {
		return undefined;
	}
}
