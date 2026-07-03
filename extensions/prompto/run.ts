import { readFileSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { renderViaPlugin } from "./plugin";
import { runPrefill } from "./prefill";
import type { PromptStore, ScanResult } from "./store";
import { defaultValues, renderTemplate } from "./template";
import type { FieldValue, PromptTemplate } from "./types";
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
		prompt = await expandTemplate(ctx, template, store.config.prefillMaxTokens);
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
async function expandTemplate(ctx: ExtensionCommandContext, template: PromptTemplate, prefillMaxTokens: number): Promise<string | undefined> {
	if (template.kind === "plain") {
		return readFileSync(template.filePath, "utf-8");
	}
	const values = await collectValues(ctx, template, prefillMaxTokens);
	if (values === undefined) return undefined;
	if (template.kind === "plugin") {
		return renderViaPlugin({
			template,
			values,
			cwd: ctx.cwd,
			onLog: (message) => ctx.ui.setWorkingMessage?.(`prompto: ${message}`),
		});
	}
	return renderTemplate(template.body, values);
}

async function collectValues(
	ctx: ExtensionCommandContext,
	template: PromptTemplate,
	prefillMaxTokens: number,
): Promise<Record<string, FieldValue> | undefined> {
	const seed = defaultValues(template.fields);
	if (template.fields.length === 0) return seed;
	const warn = (message: string) => ctx.ui.notify(`prompto: ${message}`, "warning");

	if (template.prefill?.when === "after-required") {
		// Pass 1: ask only the required fields, so the prefill prompt can
		// reference their values (e.g. derive a title from the goal).
		const requiredFields = template.fields.filter((f) => f.required);
		if (requiredFields.length > 0) {
			const firstPass = await openForm(ctx, { ...template, fields: requiredFields, description: template.description }, seed);
			if (firstPass === undefined) return undefined;
			Object.assign(seed, firstPass);
		}
		Object.assign(seed, await runPrefill(ctx, template, seed, prefillMaxTokens, warn));
		return openForm(ctx, template, seed);
	}

	if (template.prefill) {
		Object.assign(seed, await runPrefill(ctx, template, seed, prefillMaxTokens, warn));
	}
	return openForm(ctx, template, seed);
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
