import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { FieldValue, PromptTemplate } from "./types";

/**
 * Per-project value memory: the last-submitted values of each template.
 *
 * State is keyed by the project cwd but stored OUTSIDE the worktree, under
 * ~/.pi/agent/prompto-state/<sha256(cwd) prefix>.json — submitted values can
 * contain sensitive prompt text and must never end up as an accidentally
 * committable file inside the user's repository. Remembered values seed the
 * form (and the prefill prompt's context); prefill proposals win over them.
 */

interface StateFile {
	/** The project directory this state belongs to (for debuggability). */
	cwd: string;
	values: Record<string, Record<string, FieldValue>>;
}

export function defaultStateDir(): string {
	return join(homedir(), ".pi", "agent", "prompto-state");
}

export function statePath(cwd: string, stateDir: string = defaultStateDir()): string {
	const key = createHash("sha256").update(cwd).digest("hex").slice(0, 16);
	return join(stateDir, `${key}.json`);
}

export function loadRememberedValues(cwd: string, template: PromptTemplate, stateDir?: string): Record<string, FieldValue> {
	const path = statePath(cwd, stateDir);
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

export function saveRememberedValues(cwd: string, template: PromptTemplate, values: Record<string, FieldValue>, stateDir?: string): void {
	const path = statePath(cwd, stateDir);
	let state: StateFile = { cwd, values: {} };
	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as StateFile;
			if (parsed && typeof parsed.values === "object" && parsed.values !== null) state = { cwd, values: parsed.values };
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
		mkdirSync(stateDir ?? defaultStateDir(), { recursive: true });
		writeFileSync(path, `${JSON.stringify(state, null, "\t")}\n`, "utf-8");
	} catch {
		// value memory is best-effort; never fail the expansion over it
	}
}
