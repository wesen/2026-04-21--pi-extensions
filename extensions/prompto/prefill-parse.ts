import type { FieldValue, TemplateField } from "./types";

/** Pure prefill helpers, kept free of pi imports so `bun test` can load them. */

export function buildSystemPrompt(fields: TemplateField[]): string {
	const specs = fields.map((f) => {
		const constraint =
			f.type === "choice"
				? `one of: ${(f.choices ?? []).join(", ")}`
				: f.type === "multichoice"
					? `array with values from: ${(f.choices ?? []).join(", ")}`
					: f.type === "boolean"
						? "true or false"
						: f.type === "number"
							? "a number"
							: "a string";
		return `- "${f.name}" (${constraint})${f.help ? ` — ${f.help}` : ""}`;
	});
	return [
		"You fill in form fields. Reply with exactly one JSON object and nothing else:",
		"no prose, no markdown fences, no explanations.",
		"Allowed keys (any other key is discarded):",
		...specs,
		"Omit a key rather than guessing when you have no good value for it.",
	].join("\n");
}

/**
 * Extract a JSON object from model output: tolerates code fences and
 * surrounding prose; returns undefined when nothing parses.
 */
export function parseJsonObject(raw: string): Record<string, unknown> | undefined {
	const stripped = raw.replace(/```[a-zA-Z]*\n?/g, "").trim();
	const candidates = [stripped];
	const start = stripped.indexOf("{");
	const end = stripped.lastIndexOf("}");
	if (start >= 0 && end > start) candidates.push(stripped.slice(start, end + 1));
	for (const candidate of candidates) {
		try {
			const parsed: unknown = JSON.parse(candidate);
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			// try next candidate
		}
	}
	return undefined;
}

/** Coerce a proposed value to the field's type; undefined = reject. */
export function coerceValue(value: unknown, field: TemplateField): FieldValue | undefined {
	switch (field.type) {
		case "string":
		case "text":
			if (typeof value === "string") return value;
			if (typeof value === "number") return String(value);
			return undefined;
		case "boolean":
			return typeof value === "boolean" ? value : undefined;
		case "number": {
			if (typeof value === "number" && Number.isFinite(value)) return value;
			if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
			return undefined;
		}
		case "choice":
			return typeof value === "string" && field.choices?.includes(value) ? value : undefined;
		case "multichoice": {
			if (!Array.isArray(value)) return undefined;
			const picked = value.filter((v): v is string => typeof v === "string" && (field.choices?.includes(v) ?? false));
			return picked.length > 0 ? picked : undefined;
		}
	}
}
