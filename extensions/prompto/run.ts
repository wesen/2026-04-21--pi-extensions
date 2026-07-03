import { readFileSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import type { PromptStore } from "./store";
import { defaultValues, formatValue, renderTemplate, TemplateError } from "./template";
import type { FieldValue, PromptTemplate, TemplateField } from "./types";

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
		template = await pickTemplate(ctx, store.list());
		if (!template) return;
	}

	let prompt: string;
	try {
		prompt = await expandTemplate(ctx, template);
	} catch (error) {
		if (error instanceof CancelledError) return;
		ctx.ui.notify(`prompto: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}

	if (template.submit === "auto") {
		pi.sendUserMessage(prompt, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
	} else {
		ctx.ui.setEditorText(prompt);
		ctx.ui.notify(`prompto: "${template.name}" expanded into the editor`, "info");
	}
}

class CancelledError extends Error {}

async function expandTemplate(ctx: ExtensionCommandContext, template: PromptTemplate): Promise<string> {
	if (template.kind === "plain") {
		return readFileSync(template.filePath, "utf-8");
	}
	const seed = defaultValues(template.fields);
	const values = template.fields.length > 0 ? await dialogForm(ctx, template, seed) : seed;
	if (values === undefined) throw new CancelledError();
	if (template.kind === "plugin") {
		throw new TemplateError("plugin rendering is not wired up yet");
	}
	return renderTemplate(template.body, values);
}

async function pickTemplate(ctx: ExtensionCommandContext, templates: PromptTemplate[]): Promise<PromptTemplate | undefined> {
	if (templates.length === 0) {
		ctx.ui.notify("prompto: no templates found in .pi/prompts or ~/.pi/agent/prompts", "warning");
		return undefined;
	}
	const labels = templates.map((t) => (t.title ? `${t.name} — ${t.title}` : t.name));
	const choice = await ctx.ui.select("Prompto: choose a template", labels);
	if (choice === undefined) return undefined;
	return templates[labels.indexOf(choice)];
}

/**
 * Phase-1 fallback form: one built-in dialog per field. Replaced by the
 * modal form component in Phase 2 behind this same call site.
 */
async function dialogForm(
	ctx: ExtensionCommandContext,
	template: PromptTemplate,
	seed: Record<string, FieldValue>,
): Promise<Record<string, FieldValue> | undefined> {
	const values = { ...seed };
	for (const field of template.fields) {
		const value = await askField(ctx, field, values[field.name]);
		if (value === undefined) return undefined;
		values[field.name] = value;
	}
	return values;
}

async function askField(ctx: ExtensionCommandContext, field: TemplateField, current: FieldValue): Promise<FieldValue | undefined> {
	const label = field.label ?? field.name;
	const title = field.help ? `${label} — ${field.help}` : label;
	switch (field.type) {
		case "boolean":
			return ctx.ui.confirm(title, "Enable?");
		case "choice": {
			const choice = await ctx.ui.select(title, field.choices ?? []);
			return choice === undefined ? undefined : choice;
		}
		case "multichoice": {
			const entered = await ctx.ui.input(`${title} (comma-separated: ${(field.choices ?? []).join(", ")})`, formatValue(current));
			if (entered === undefined) return undefined;
			const picked = entered
				.split(",")
				.map((part) => part.trim())
				.filter(Boolean);
			const invalid = picked.filter((part) => !(field.choices ?? []).includes(part));
			if (invalid.length > 0) {
				ctx.ui.notify(`prompto: ignoring unknown choice(s): ${invalid.join(", ")}`, "warning");
			}
			return picked.filter((part) => (field.choices ?? []).includes(part));
		}
		case "number": {
			const entered = await ctx.ui.input(title, String(current));
			if (entered === undefined) return undefined;
			const parsed = Number(entered.trim());
			if (!Number.isFinite(parsed)) {
				ctx.ui.notify(`prompto: "${entered}" is not a number, using ${String(current)}`, "warning");
				return current;
			}
			return parsed;
		}
		case "text": {
			const edited = await ctx.ui.editor(title, typeof current === "string" ? current : "");
			if (edited === undefined) return undefined;
			if (field.required && edited.trim() === "") {
				ctx.ui.notify(`prompto: "${label}" is required`, "error");
				return undefined;
			}
			return edited;
		}
		default: {
			const entered = await ctx.ui.input(title, field.placeholder ?? "");
			if (entered === undefined) return undefined;
			if (field.required && entered.trim() === "") {
				ctx.ui.notify(`prompto: "${label}" is required`, "error");
				return undefined;
			}
			return entered === "" && typeof current === "string" ? current : entered;
		}
	}
}

export function reportScan(ctx: ExtensionCommandContext, scan: { count: number; issues: Array<{ filePath: string; message: string }>; shadowed: string[]; pluginsRun: string[] }): void {
	const parts = [`${scan.count} templates loaded`];
	if (scan.pluginsRun.length > 0) parts.push(`${scan.pluginsRun.length} plugins queried`);
	if (scan.shadowed.length > 0) parts.push(`shadowed: ${scan.shadowed.join(", ")}`);
	ctx.ui.notify(`prompto: ${parts.join(" · ")}`, scan.shadowed.length > 0 ? "warning" : "info");
	for (const issue of scan.issues) {
		ctx.ui.notify(`prompto: ${issue.filePath ? `${issue.filePath}: ` : ""}${issue.message}`, "warning");
	}
}
