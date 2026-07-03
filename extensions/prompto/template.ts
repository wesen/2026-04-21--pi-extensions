import { splitFrontmatter, type FmMap, type FmValue } from "./frontmatter";
import type { FieldType, FieldValue, PrefillSpec, PromptTemplate, TemplateField, TemplateSource } from "./types";

const FIELD_TYPES: FieldType[] = ["string", "text", "boolean", "choice", "multichoice", "number"];
const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class TemplateError extends Error {}

/**
 * Parse a .md template file's content. Returns kind "plain" when there is
 * no frontmatter or the frontmatter has neither fields nor prefill.
 */
export function parseTemplate(options: {
	content: string;
	name: string;
	group: string;
	filePath: string;
	source: TemplateSource;
	submitDefault: "editor" | "auto";
}): PromptTemplate {
	const { content, name, group, filePath, source, submitDefault } = options;
	const base: PromptTemplate = {
		name,
		group,
		submit: submitDefault,
		fields: [],
		body: content,
		filePath,
		source,
		kind: "plain",
	};

	let frontmatter: FmMap | undefined;
	let body: string;
	try {
		({ frontmatter, body } = splitFrontmatter(content));
	} catch (error) {
		throw new TemplateError(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!frontmatter) return base;

	const template: PromptTemplate = { ...base, body, kind: "template" };
	if (typeof frontmatter.title === "string") template.title = frontmatter.title;
	if (typeof frontmatter.description === "string") template.description = frontmatter.description;
	if (frontmatter.submit !== undefined) {
		if (frontmatter.submit !== "editor" && frontmatter.submit !== "auto") {
			throw new TemplateError(`${filePath}: submit must be "editor" or "auto"`);
		}
		template.submit = frontmatter.submit;
	}
	template.fields = parseFields(frontmatter.fields, filePath);
	template.prefill = parsePrefill(frontmatter.prefill, template.fields, filePath);
	return template;
}

function parseFields(value: FmValue | undefined, filePath: string): TemplateField[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new TemplateError(`${filePath}: fields must be a list`);
	const fields: TemplateField[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (item === null || typeof item !== "object" || Array.isArray(item)) {
			throw new TemplateError(`${filePath}: each field must be a map with at least a name`);
		}
		const raw = item as FmMap;
		if (typeof raw.name !== "string" || !NAME_RE.test(raw.name)) {
			throw new TemplateError(`${filePath}: field name must match ${NAME_RE} (got ${JSON.stringify(raw.name)})`);
		}
		if (seen.has(raw.name)) throw new TemplateError(`${filePath}: duplicate field "${raw.name}"`);
		seen.add(raw.name);

		const type = raw.type === undefined ? "string" : (raw.type as FieldType);
		if (!FIELD_TYPES.includes(type)) {
			throw new TemplateError(`${filePath}: field "${raw.name}" has unknown type "${String(raw.type)}"`);
		}
		const field: TemplateField = { name: raw.name, type };
		if (typeof raw.label === "string") field.label = raw.label;
		if (typeof raw.help === "string") field.help = raw.help;
		if (typeof raw.placeholder === "string") field.placeholder = raw.placeholder;
		if (raw.required !== undefined) {
			if (typeof raw.required !== "boolean") throw new TemplateError(`${filePath}: field "${raw.name}" required must be boolean`);
			field.required = raw.required;
		}
		if (type === "choice" || type === "multichoice") {
			if (!Array.isArray(raw.choices) || raw.choices.length === 0 || !raw.choices.every((c) => typeof c === "string")) {
				throw new TemplateError(`${filePath}: field "${raw.name}" (${type}) needs a non-empty string list "choices"`);
			}
			field.choices = raw.choices as string[];
		}
		if (raw.default !== undefined && raw.default !== null) {
			field.default = normalizeDefault(raw.default, field, filePath);
		}
		fields.push(field);
	}
	return fields;
}

function normalizeDefault(value: FmValue, field: TemplateField, filePath: string): FieldValue {
	const fail = (): never => {
		throw new TemplateError(`${filePath}: field "${field.name}" default does not match type ${field.type}`);
	};
	switch (field.type) {
		case "string":
		case "text":
			return typeof value === "string" ? value : typeof value === "number" ? String(value) : fail();
		case "boolean":
			return typeof value === "boolean" ? value : fail();
		case "number":
			return typeof value === "number" ? value : fail();
		case "choice":
			if (typeof value !== "string" || !field.choices?.includes(value)) fail();
			return value as string;
		case "multichoice": {
			if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && field.choices?.includes(v))) fail();
			return value as string[];
		}
	}
}

function parsePrefill(value: FmValue | undefined, fields: TemplateField[], filePath: string): PrefillSpec | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object" || Array.isArray(value)) throw new TemplateError(`${filePath}: prefill must be a map`);
	const raw = value as FmMap;
	if (typeof raw.prompt !== "string" || raw.prompt.trim() === "") {
		throw new TemplateError(`${filePath}: prefill.prompt must be a non-empty string`);
	}
	if (!Array.isArray(raw.fields) || raw.fields.length === 0 || !raw.fields.every((f) => typeof f === "string")) {
		throw new TemplateError(`${filePath}: prefill.fields must be a non-empty string list`);
	}
	const known = new Set(fields.map((f) => f.name));
	for (const name of raw.fields as string[]) {
		if (!known.has(name)) throw new TemplateError(`${filePath}: prefill.fields references unknown field "${name}"`);
	}
	let when: PrefillSpec["when"] = "before-form";
	if (raw.when !== undefined) {
		if (raw.when !== "before-form" && raw.when !== "after-required") {
			throw new TemplateError(`${filePath}: prefill.when must be "before-form" or "after-required"`);
		}
		when = raw.when;
	}
	return { fields: raw.fields as string[], prompt: raw.prompt, when };
}

/** Seed a value map from field defaults. */
export function defaultValues(fields: TemplateField[]): Record<string, FieldValue> {
	const values: Record<string, FieldValue> = {};
	for (const field of fields) {
		if (field.default !== undefined) {
			values[field.name] = field.default;
			continue;
		}
		switch (field.type) {
			case "string":
			case "text":
				values[field.name] = "";
				break;
			case "boolean":
				values[field.name] = false;
				break;
			case "number":
				values[field.name] = 0;
				break;
			case "choice":
				values[field.name] = field.choices?.[0] ?? "";
				break;
			case "multichoice":
				values[field.name] = [];
				break;
		}
	}
	return values;
}

const IF_BLOCK_RE = /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:(==|!=)\s*"((?:[^"\\]|\\.)*)"\s*)?\}\}\r?\n?([\s\S]*?)\{\{\/if\}\}\r?\n?/g;
const PLACEHOLDER_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/**
 * Render the template body. Strict: an unknown {{placeholder}} throws.
 * Dialect: {{name}}, {{#if name}}...{{/if}}, {{#if name == "lit"}}...{{/if}},
 * {{#if name != "lit"}}...{{/if}}. No nesting, no loops, no filters.
 */
export function renderTemplate(body: string, values: Record<string, FieldValue>): string {
	const withConditionals = body.replace(IF_BLOCK_RE, (_all, name: string, op: string | undefined, literal: string | undefined, inner: string) => {
		if (!(name in values)) throw new TemplateError(`unknown field in {{#if ${name}}}`);
		const value = values[name];
		let keep: boolean;
		if (op) {
			const unescaped = (literal ?? "").replace(/\\(.)/g, "$1");
			keep = op === "==" ? formatValue(value) === unescaped : formatValue(value) !== unescaped;
		} else {
			keep = truthy(value);
		}
		return keep ? inner : "";
	});
	return withConditionals.replace(PLACEHOLDER_RE, (_all, name: string) => {
		if (!(name in values)) throw new TemplateError(`unknown placeholder {{${name}}}`);
		return formatValue(values[name]);
	});
}

export function formatValue(value: FieldValue): string {
	if (Array.isArray(value)) return value.join(", ");
	if (typeof value === "boolean") return value ? "true" : "false";
	return String(value);
}

function truthy(value: FieldValue): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === "string") return value.trim() !== "";
	if (typeof value === "number") return value !== 0;
	return value;
}
