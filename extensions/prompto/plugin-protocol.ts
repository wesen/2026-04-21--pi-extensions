import { parseFields, parsePrefill } from "./template";
import type { FieldValue, PromptTemplate, TemplateSource } from "./types";

/**
 * Pure JSONL plugin-protocol parsing (no subprocess handling, no pi
 * imports — bun-testable). Protocol, per design doc §7.8:
 *
 * describe (plugin invoked with --describe, one JSON object per line):
 *   {"type":"template","name":"create-ticket","title":…,"description":…,
 *    "fields":[…],"submit":"editor"|"auto","prefill":{…}}
 *   {"type":"end"}
 *
 * render (request written to plugin stdin, responses on stdout):
 *   → {"type":"render","template":"create-ticket","values":{…},"cwd":"…"}
 *   ← {"type":"log","message":"…"}         (optional progress)
 *   ← {"type":"prompt","text":"…"}          (success, terminal)
 *   ← {"type":"error","message":"…"}        (failure, terminal)
 *
 * Junk lines and unknown frame types are skipped (forward compatibility).
 */

const TEMPLATE_NAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/;

export interface DescribeParseResult {
	templates: PromptTemplate[];
	issues: string[];
}

export function parseDescribeOutput(options: {
	stdout: string;
	filePath: string;
	group: string;
	source: TemplateSource;
	submitDefault: "editor" | "auto";
}): DescribeParseResult {
	const { stdout, filePath, group, source, submitDefault } = options;
	const templates: PromptTemplate[] = [];
	const issues: string[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		let frame: unknown;
		try {
			frame = JSON.parse(trimmed);
		} catch {
			continue; // junk line — skipped by design
		}
		if (frame === null || typeof frame !== "object" || Array.isArray(frame)) continue;
		const msg = frame as Record<string, unknown>;
		if (msg.type === "end") break;
		if (msg.type !== "template") continue;
		try {
			templates.push(parseAnnouncedTemplate(msg, filePath, group, source, submitDefault));
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}
	}
	return { templates, issues };
}

function parseAnnouncedTemplate(
	msg: Record<string, unknown>,
	filePath: string,
	group: string,
	source: TemplateSource,
	submitDefault: "editor" | "auto",
): PromptTemplate {
	if (typeof msg.name !== "string" || !TEMPLATE_NAME_RE.test(msg.name)) {
		throw new Error(`${filePath}: announced template name must match ${TEMPLATE_NAME_RE} (got ${JSON.stringify(msg.name)})`);
	}
	const context = `${filePath} (template "${msg.name}")`;
	// parseFields/parsePrefill accept the frontmatter value shape, which JSON
	// output satisfies structurally (maps, lists, scalars).
	const fields = parseFields(msg.fields as never, context);
	const prefill = parsePrefill(msg.prefill as never, fields, context);
	let submit = submitDefault;
	if (msg.submit !== undefined) {
		if (msg.submit !== "editor" && msg.submit !== "auto") throw new Error(`${context}: submit must be "editor" or "auto"`);
		submit = msg.submit;
	}
	return {
		name: group ? `${group}/${msg.name}` : msg.name,
		group,
		title: typeof msg.title === "string" ? msg.title : undefined,
		description: typeof msg.description === "string" ? msg.description : undefined,
		submit,
		fields,
		prefill,
		body: "",
		filePath,
		source,
		kind: "plugin",
		pluginTemplateName: msg.name,
	};
}

export type RenderFrame = { type: "log"; message: string } | { type: "prompt"; text: string; submit?: "editor" | "auto" } | { type: "error"; message: string };

/** Parse one stdout line of a render response; undefined = skip. */
export function parseRenderLine(line: string): RenderFrame | undefined {
	const trimmed = line.trim();
	if (trimmed === "") return undefined;
	let frame: unknown;
	try {
		frame = JSON.parse(trimmed);
	} catch {
		return undefined;
	}
	if (frame === null || typeof frame !== "object" || Array.isArray(frame)) return undefined;
	const msg = frame as Record<string, unknown>;
	if (msg.type === "log" && typeof msg.message === "string") return { type: "log", message: msg.message };
	if (msg.type === "prompt" && typeof msg.text === "string") {
		const submit = msg.submit === "editor" || msg.submit === "auto" ? msg.submit : undefined;
		return { type: "prompt", text: msg.text, submit };
	}
	if (msg.type === "error" && typeof msg.message === "string") return { type: "error", message: msg.message };
	return undefined;
}

export function buildRenderRequest(pluginTemplateName: string, values: Record<string, FieldValue>, cwd: string): string {
	return `${JSON.stringify({ type: "render", template: pluginTemplateName, values, cwd })}\n`;
}
