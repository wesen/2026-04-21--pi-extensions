import { readFileSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import type { PromptStore, ScanResult } from "./store";
import { defaultValues, renderTemplate, TemplateError } from "./template";
import type { PromptTemplate } from "./types";
import { openForm } from "./ui/form";
import { openPicker } from "./ui/picker";

export async function runPrompto(pi: ExtensionAPI, store: PromptStore, args: string, ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.hasUI) return;

	if (args === "reload") {
		const scan = await store.rescan(ctx.cwd);
		reportScan(ctx, scan);
		return;
	}

	await store.ensureLoaded(ctx.cwd);

	let template: PromptTemplate | undefined;
	if (args) {
		template = store.resolve(args);
		if (!template) {
			ctx.ui.notify(`prompto: no template named "${args}" (try /prompto reload)`, "error");
			return;
		}
	} else {
		const templates = store.list();
		if (templates.length === 0) {
			ctx.ui.notify("prompto: no templates found in .pi/prompts or ~/.pi/agent/prompts", "warning");
			return;
		}
		template = await openPicker(ctx, templates);
		if (!template) return;
	}

	let prompt: string | undefined;
	try {
		prompt = await expandTemplate(ctx, template);
	} catch (error) {
		ctx.ui.notify(`prompto: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}
	if (prompt === undefined) return; // cancelled

	if (template.submit === "auto") {
		pi.sendUserMessage(prompt, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
	} else {
		ctx.ui.setEditorText(prompt);
		ctx.ui.notify(`prompto: "${template.name}" expanded into the editor`, "info");
	}
}

/** Returns the expanded prompt, or undefined when the user cancelled. */
async function expandTemplate(ctx: ExtensionCommandContext, template: PromptTemplate): Promise<string | undefined> {
	if (template.kind === "plain") {
		return readFileSync(template.filePath, "utf-8");
	}
	const seed = defaultValues(template.fields);
	const values = template.fields.length > 0 ? await openForm(ctx, template, seed) : seed;
	if (values === undefined) return undefined;
	if (template.kind === "plugin") {
		throw new TemplateError("plugin rendering is not wired up yet");
	}
	return renderTemplate(template.body, values);
}

export function reportScan(ctx: ExtensionCommandContext, scan: ScanResult): void {
	const parts = [`${scan.count} templates loaded`];
	if (scan.pluginsRun.length > 0) parts.push(`${scan.pluginsRun.length} plugins queried`);
	if (scan.shadowed.length > 0) parts.push(`shadowed: ${scan.shadowed.join(", ")}`);
	ctx.ui.notify(`prompto: ${parts.join(" · ")}`, scan.shadowed.length > 0 ? "warning" : "info");
	for (const issue of scan.issues) {
		ctx.ui.notify(`prompto: ${issue.filePath ? `${issue.filePath}: ` : ""}${issue.message}`, "warning");
	}
}
