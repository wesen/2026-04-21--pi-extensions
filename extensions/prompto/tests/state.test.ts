import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadRememberedValues, saveRememberedValues, statePath } from "../state";
import type { PromptTemplate } from "../types";

const STATE_DIR = join(tmpdir(), `prompto-state-test-${process.pid}`);
const CWD = "/home/someone/project";

const template: PromptTemplate = {
	name: "demo/greeting",
	group: "demo",
	submit: "editor",
	fields: [
		{ name: "who", type: "string" },
		{ name: "lang", type: "choice", choices: ["en", "de"] },
	],
	body: "",
	filePath: "/x",
	source: "project",
	kind: "template",
};

beforeAll(() => mkdirSync(STATE_DIR, { recursive: true }));
afterAll(() => rmSync(STATE_DIR, { recursive: true, force: true }));

describe("state", () => {
	test("state lives outside the project worktree, keyed by cwd hash", () => {
		const path = statePath(CWD, STATE_DIR);
		expect(path.startsWith(STATE_DIR)).toBe(true);
		expect(path.includes(CWD)).toBe(false);
		expect(statePath("/other/project", STATE_DIR)).not.toBe(path);
		expect(statePath(CWD, STATE_DIR)).toBe(path); // deterministic
	});

	test("save/load roundtrip filters to declared fields", () => {
		saveRememberedValues(CWD, template, { who: "Alice", lang: "de", stray: "dropped" }, STATE_DIR);
		expect(loadRememberedValues(CWD, template, STATE_DIR)).toEqual({ who: "Alice", lang: "de" });
	});

	test("values for fields the template no longer declares are dropped on load", () => {
		const narrowed: PromptTemplate = { ...template, fields: [{ name: "who", type: "string" }] };
		expect(loadRememberedValues(CWD, narrowed, STATE_DIR)).toEqual({ who: "Alice" });
	});

	test("missing state file loads as empty", () => {
		expect(loadRememberedValues("/never/saved", template, STATE_DIR)).toEqual({});
	});

	test("different projects do not share state", () => {
		saveRememberedValues("/other/project", template, { who: "Bob", lang: "en" }, STATE_DIR);
		expect(loadRememberedValues(CWD, template, STATE_DIR)).toEqual({ who: "Alice", lang: "de" });
		expect(readdirSync(STATE_DIR)).toHaveLength(2);
	});
});
