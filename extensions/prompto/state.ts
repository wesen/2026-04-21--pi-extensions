import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { FieldValue, PromptTemplate } from "./types";

/**
 * Per-project value memory: the last-submitted values of each template,
 * stored in <cwd>/.pi/prompto-state.json. Remembered values seed the form
 * (and the prefill prompt's context); prefill proposals win over them.
 */

interface StateFile {
	values: Record<string, Record<string, FieldValue>>;
}

function statePath(cwd: string): string {
	return join(cwd, ".pi", "prompto-state.json");
}

export function loadRememberedValues(cwd: string, template: PromptTemplate): Record<string, FieldValue> {
	const path = statePath(cwd);
	if (!existsSync(path)) return {};
	let state: StateFile;
	try {
		state = JSON.parse(readFileSync(path, "utf-8")) as StateFile;
	} catch {
		return {};
	}
	const remembered = state.values?.[template.name];
	if (remembered === null || typeof remembered !== "object" || Array.isArray(remembered)) return {};
	// Only keep values for fields the template still declares; the form's
	// own validation handles type drift beyond this shallow filter.
	const fieldNames = new Set(template.fields.map((f) => f.name));
	const result: Record<string, FieldValue> = {};
	for (const [key, value] of Object.entries(remembered)) {
		if (fieldNames.has(key)) result[key] = value;
	}
	return result;
}

export function saveRememberedValues(cwd: string, template: PromptTemplate, values: Record<string, FieldValue>): void {
	const path = statePath(cwd);
	let state: StateFile = { values: {} };
	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as StateFile;
			if (parsed && typeof parsed.values === "object" && parsed.values !== null) state = parsed;
		} catch {
			// corrupt state file: start over
		}
	}
	const fieldNames = new Set(template.fields.map((f) => f.name));
	const toStore: Record<string, FieldValue> = {};
	for (const [key, value] of Object.entries(values)) {
		if (fieldNames.has(key)) toStore[key] = value;
	}
	state.values[template.name] = toStore;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(state, null, "\t")}\n`, "utf-8");
	} catch {
		// value memory is best-effort; never fail the expansion over it
	}
}
