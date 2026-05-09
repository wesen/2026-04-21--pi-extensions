import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Skill } from "@mariozechner/pi-coding-agent";
import type { PinnedSkillsConfig } from "./config";

export interface PinnedSkillRender {
	name: string;
	filePath: string;
	baseDir: string;
	bytes: number;
	truncated: boolean;
	originalBytes: number;
}

export interface RenderPinnedSkillsResult {
	prompt: string;
	included: PinnedSkillRender[];
	missing: string[];
	skipped: string[];
	warnings: string[];
	bytes: number;
	enabled: boolean;
}

export function hashString(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function truncateUtf8(text: string, maxBytes: number): string {
	const buffer = Buffer.from(text, "utf-8");
	if (buffer.length <= maxBytes) return text;
	return buffer.subarray(0, maxBytes).toString("utf-8").replace(/[\uFFFD]+$/g, "");
}

function xmlEscapeAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function emptyResult(enabled: boolean): RenderPinnedSkillsResult {
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

function renderSkillBlock(skill: Skill, content: string, truncated: boolean, originalBytes: number): string {
	const marker = truncated
		? `\n\n[TRUNCATED by pinned-skills extension: original size ${originalBytes} bytes. Load the full file with read if exact omitted details matter.]`
		: "";
	return [
		`<pinned-skill name="${xmlEscapeAttribute(skill.name)}" file="${xmlEscapeAttribute(skill.filePath)}" baseDir="${xmlEscapeAttribute(skill.baseDir)}">`,
		content.trimEnd() + marker,
		`</pinned-skill>`,
	].join("\n");
}

function renderSection(blocks: string[]): string {
	if (blocks.length === 0) return "";
	return [
		"# Pinned skills loaded by pinned-skills extension",
		"",
		"These skills were selected by the user to remain fully loaded in context for this prompt epoch. Follow each skill's instructions when the task matches. Relative paths mentioned by a skill are relative to that skill's base directory.",
		"",
		...blocks,
	].join("\n");
}

export function renderPinnedSkills(skills: Skill[], config: PinnedSkillsConfig): RenderPinnedSkillsResult {
	if (!config.enabled || config.skills.length === 0) return emptyResult(config.enabled);

	const byName = new Map<string, Skill>();
	for (const skill of skills) {
		if (!byName.has(skill.name)) byName.set(skill.name, skill);
	}

	const blocks: string[] = [];
	const included: PinnedSkillRender[] = [];
	const missing: string[] = [];
	const skipped: string[] = [];
	const warnings: string[] = [];
	let totalBytes = 0;

	for (const name of config.skills) {
		const skill = byName.get(name);
		if (!skill) {
			missing.push(name);
			continue;
		}
		if (skill.disableModelInvocation && !config.includeDisabledModelInvocation) {
			skipped.push(`${name}: disable-model-invocation`);
			continue;
		}

		let content: string;
		try {
			content = readFileSync(skill.filePath, "utf-8");
		} catch (error) {
			warnings.push(`${name}: could not read ${skill.filePath}: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}

		const originalBytes = Buffer.byteLength(content, "utf-8");
		let truncated = false;
		if (originalBytes > config.maxSkillBytes) {
			content = truncateUtf8(content, config.maxSkillBytes);
			truncated = true;
			warnings.push(`${name}: truncated from ${originalBytes} bytes to ${config.maxSkillBytes} bytes`);
		}

		const block = renderSkillBlock(skill, content, truncated, originalBytes);
		const blockBytes = Buffer.byteLength(block, "utf-8");
		if (totalBytes + blockBytes > config.maxTotalBytes) {
			warnings.push(`${name}: not included because maxTotalBytes=${config.maxTotalBytes} would be exceeded`);
			break;
		}

		blocks.push(block);
		totalBytes += blockBytes;
		included.push({
			name,
			filePath: skill.filePath,
			baseDir: skill.baseDir,
			bytes: blockBytes,
			truncated,
			originalBytes,
		});
	}

	return {
		prompt: renderSection(blocks),
		included,
		missing,
		skipped,
		warnings,
		bytes: totalBytes,
		enabled: config.enabled,
	};
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
	if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)}KB`;
	return `${bytes}B`;
}

export function formatStatus(result: RenderPinnedSkillsResult, pending = false): string {
	const prefix = pending ? "pins:pending" : "pins";
	if (!result.enabled) return `${prefix}:off`;
	return `${prefix}:${result.included.length}/${formatBytes(result.bytes)}`;
}

export function formatRenderDetails(result: RenderPinnedSkillsResult): string {
	const lines = [
		`Enabled: ${result.enabled ? "yes" : "no"}`,
		`Included: ${result.included.length}`,
		`Injected bytes: ${formatBytes(result.bytes)}`,
	];
	if (result.included.length > 0) {
		lines.push("", "Pinned skills:");
		for (const item of result.included) {
			lines.push(`- ${item.name} (${formatBytes(item.bytes)}${item.truncated ? ", truncated" : ""})`);
		}
	}
	if (result.missing.length > 0) lines.push("", "Missing:", ...result.missing.map((name) => `- ${name}`));
	if (result.skipped.length > 0) lines.push("", "Skipped:", ...result.skipped.map((name) => `- ${name}`));
	if (result.warnings.length > 0) lines.push("", "Warnings:", ...result.warnings.map((warning) => `- ${warning}`));
	return lines.join("\n");
}
