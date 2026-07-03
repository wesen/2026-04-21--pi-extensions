import { complete } from "@mariozechner/pi-ai";
import { BorderedLoader, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { buildSystemPrompt, coerceValue, parseJsonObject } from "./prefill-parse";
import { renderTemplate } from "./template";
import type { FieldValue, PromptTemplate, TemplateField } from "./types";

/**
 * Ask the model to propose values for the template's prefill fields.
 * Soft-fail contract: every failure path (no model, no key, abort, bad
 * output) returns {} so the form opens unprefilled; `warn` receives one
 * human-readable reason when that happens.
 */
export async function runPrefill(
	ctx: ExtensionCommandContext,
	template: PromptTemplate,
	known: Record<string, FieldValue>,
	maxTokens: number,
	warn: (message: string) => void,
): Promise<Record<string, FieldValue>> {
	const prefill = template.prefill;
	if (!prefill) return {};
	if (!ctx.model) {
		warn("prefill skipped: no model selected");
		return {};
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) {
		warn("prefill skipped: no API key for the current model");
		return {};
	}

	let userPrompt: string;
	try {
		userPrompt = renderTemplate(prefill.prompt, known);
	} catch (error) {
		warn(`prefill skipped: ${error instanceof Error ? error.message : String(error)}`);
		return {};
	}

	const fieldByName = new Map(template.fields.map((f) => [f.name, f]));
	const allowed = prefill.fields.filter((name) => fieldByName.has(name));
	const systemPrompt = buildSystemPrompt(allowed.map((name) => fieldByName.get(name) as TemplateField));

	const raw = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(tui, theme, `Prefilling ${template.name}…`);
		loader.onAbort = () => done(null);
		complete(
			ctx.model!,
			{ systemPrompt, messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }] },
			{ apiKey: auth.apiKey, headers: auth.headers, maxTokens, signal: loader.signal },
		)
			.then((response) => {
				const text = response.content
					.filter((part): part is { type: "text"; text: string } => part.type === "text")
					.map((part) => part.text)
					.join("\n")
					.trim();
				done(text || null);
			})
			.catch(() => done(null));
		return loader;
	});
	if (raw === null) {
		warn("prefill skipped: generation aborted or failed");
		return {};
	}

	const proposed = parseJsonObject(raw);
	if (!proposed) {
		warn("prefill skipped: model did not return a JSON object");
		return {};
	}
	const accepted: Record<string, FieldValue> = {};
	for (const name of allowed) {
		if (!(name in proposed)) continue;
		const coerced = coerceValue(proposed[name], fieldByName.get(name) as TemplateField);
		if (coerced !== undefined) accepted[name] = coerced;
	}
	return accepted;
}

