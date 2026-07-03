import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";

import { getGlobalPromptsDir, getProjectPromptsDir, readConfig } from "./config";
import { parseTemplate } from "./template";
import type { PromptoConfig, PromptTemplate, TemplateSource } from "./types";

export interface ScanIssue {
	filePath: string;
	message: string;
}

export interface ScanResult {
	count: number;
	issues: ScanIssue[];
	/** Names that were shadowed by a higher-priority layer. */
	shadowed: string[];
	/** Plugin executables that were run for discovery. */
	pluginsRun: string[];
}

/** Discovers templates from a plugin executable (wired in by index.ts; Phase 4). */
export type PluginDescriber = (filePath: string, group: string, source: TemplateSource, config: PromptoConfig) => Promise<PromptTemplate[]>;

export class PromptStore {
	private templates = new Map<string, PromptTemplate>();
	private loaded = false;
	private lastScan: ScanResult = { count: 0, issues: [], shadowed: [], pluginsRun: [] };

	constructor(private readonly describePlugin?: PluginDescriber) {}

	async ensureLoaded(cwd: string): Promise<ScanResult> {
		if (!this.loaded) return this.rescan(cwd);
		return this.lastScan;
	}

	async rescan(cwd: string): Promise<ScanResult> {
		const { config, warnings } = readConfig();
		const issues: ScanIssue[] = warnings.map((message) => ({ filePath: "", message }));
		const shadowed: string[] = [];
		const pluginsRun: string[] = [];
		const byName = new Map<string, PromptTemplate>();

		// Global first, project second: project entries overwrite (win).
		const layers: Array<{ dir: string; source: TemplateSource }> = [
			{ dir: getGlobalPromptsDir(), source: "global" },
			{ dir: getProjectPromptsDir(cwd), source: "project" },
		];

		for (const layer of layers) {
			for (const filePath of walk(layer.dir)) {
				const name = templateName(layer.dir, filePath);
				const group = name.includes("/") ? name.split("/")[0] : "";
				try {
					if (isExecutable(filePath)) {
						if (!this.describePlugin) {
							issues.push({ filePath, message: "plugin executables are not supported yet" });
							continue;
						}
						if (layer.source === "project" && !config.allowProjectPlugins) {
							issues.push({ filePath, message: "project-layer plugin skipped (set allowProjectPlugins in ~/.pi/agent/prompto.json)" });
							continue;
						}
						pluginsRun.push(filePath);
						for (const template of await this.describePlugin(filePath, group, layer.source, config)) {
							addTemplate(byName, template, shadowed);
						}
					} else {
						const content = readFileSync(filePath, "utf-8");
						const template = parseTemplate({
							content,
							name,
							group,
							filePath,
							source: layer.source,
							submitDefault: config.submitDefault,
						});
						addTemplate(byName, template, shadowed);
					}
				} catch (error) {
					issues.push({ filePath, message: error instanceof Error ? error.message : String(error) });
				}
			}
		}

		this.templates = byName;
		this.loaded = true;
		this.lastScan = { count: byName.size, issues, shadowed, pluginsRun };
		return this.lastScan;
	}

	list(): PromptTemplate[] {
		return [...this.templates.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	resolve(name: string): PromptTemplate | undefined {
		return this.templates.get(name);
	}

	get config(): PromptoConfig {
		return readConfig().config;
	}
}

function addTemplate(byName: Map<string, PromptTemplate>, template: PromptTemplate, shadowed: string[]): void {
	if (byName.has(template.name)) shadowed.push(template.name);
	byName.set(template.name, template);
}

/** All non-dot files under dir, recursively; [] when dir is missing. */
function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const results: string[] = [];
	const stack = [dir];
	while (stack.length > 0) {
		const current = stack.pop() as string;
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = join(current, entry.name);
			if (entry.isDirectory()) stack.push(full);
			else if (entry.isFile() || entry.isSymbolicLink()) results.push(full);
		}
	}
	return results.sort();
}

/** Addressable name: path relative to the layer dir, extension stripped. */
function templateName(layerDir: string, filePath: string): string {
	const rel = relative(layerDir, filePath).split(sep).join("/");
	const ext = extname(rel);
	if (ext === "") return rel;
	const stem = rel.slice(0, -ext.length);
	// Keep the extension when stripping it would leave an empty basename
	// (e.g. a file literally named ".md" is skipped as a dotfile anyway).
	return basename(stem) === "" ? rel : stem;
}

function isExecutable(filePath: string): boolean {
	try {
		const stat = statSync(filePath);
		return stat.isFile() && (stat.mode & 0o111) !== 0;
	} catch {
		return false;
	}
}
