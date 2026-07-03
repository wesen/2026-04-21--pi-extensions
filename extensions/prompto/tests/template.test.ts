import { describe, expect, test } from "bun:test";

import { defaultValues, parseTemplate, renderTemplate } from "../template";
import type { PromptTemplate } from "../types";

function parse(content: string): PromptTemplate {
	return parseTemplate({ content, name: "g/t", group: "g", filePath: "/tmp/t.md", source: "project", submitDefault: "editor" });
}

describe("parseTemplate", () => {
	test("no frontmatter → plain", () => {
		const tpl = parse("just a prompt\n");
		expect(tpl.kind).toBe("plain");
		expect(tpl.body).toBe("just a prompt\n");
	});

	test("full template with fields, defaults, prefill", () => {
		const tpl = parse(
			[
				"---",
				"title: T",
				"submit: auto",
				"fields:",
				"  - name: goal",
				"    type: text",
				"    required: true",
				"  - name: depth",
				"    type: choice",
				"    choices: [full, light]",
				"    default: full",
				"  - name: topics",
				"    type: multichoice",
				"    choices: [a, b]",
				"    default: [a]",
				"  - name: upload",
				"    type: boolean",
				"    default: true",
				"prefill:",
				"  fields: [goal]",
				"  prompt: |",
				"    Suggest a goal.",
				"---",
				"Body {{goal}}",
			].join("\n"),
		);
		expect(tpl.kind).toBe("template");
		expect(tpl.submit).toBe("auto");
		expect(tpl.fields).toHaveLength(4);
		expect(tpl.fields[1].default).toBe("full");
		expect(tpl.prefill?.when).toBe("before-form");
		expect(defaultValues(tpl.fields)).toEqual({ goal: "", depth: "full", topics: ["a"], upload: true });
	});

	test("unknown field type throws", () => {
		expect(() => parse("---\nfields:\n  - name: x\n    type: banana\n---\nbody")).toThrow(/unknown type/);
	});

	test("choice without choices throws", () => {
		expect(() => parse("---\nfields:\n  - name: x\n    type: choice\n---\nbody")).toThrow(/choices/);
	});

	test("default not in choices throws", () => {
		expect(() => parse("---\nfields:\n  - name: x\n    type: choice\n    choices: [a]\n    default: b\n---\nbody")).toThrow(/default/);
	});

	test("duplicate field name throws", () => {
		expect(() => parse("---\nfields:\n  - name: x\n  - name: x\n---\nbody")).toThrow(/duplicate/);
	});

	test("prefill referencing unknown field throws", () => {
		expect(() => parse("---\nfields:\n  - name: x\nprefill:\n  fields: [nope]\n  prompt: |\n    p\n---\nbody")).toThrow(/unknown field/);
	});
});

describe("renderTemplate", () => {
	test("placeholders: string, number, boolean, list join", () => {
		expect(renderTemplate("{{a}} {{b}} {{c}} {{d}}", { a: "x", b: 7, c: true, d: ["p", "q"] })).toBe("x 7 true p, q");
	});

	test("unknown placeholder throws", () => {
		expect(() => renderTemplate("{{missing}}", {})).toThrow(/unknown placeholder/);
	});

	test("if truthy keeps block, falsy drops it including newlines", () => {
		const body = "start\n{{#if flag}}\nkept\n{{/if}}\nend";
		expect(renderTemplate(body, { flag: true })).toBe("start\nkept\nend");
		expect(renderTemplate(body, { flag: false })).toBe("start\nend");
	});

	test("truthiness: empty string/list/zero are falsy", () => {
		const body = "{{#if v}}yes{{/if}}";
		expect(renderTemplate(body, { v: "" })).toBe("");
		expect(renderTemplate(body, { v: [] })).toBe("");
		expect(renderTemplate(body, { v: 0 })).toBe("");
		expect(renderTemplate(body, { v: "x" })).toBe("yes");
	});

	test("equality and inequality against string literal", () => {
		const body = '{{#if depth == "full"}}FULL{{/if}}{{#if depth != "full"}}NOT{{/if}}';
		expect(renderTemplate(body, { depth: "full" })).toBe("FULL");
		expect(renderTemplate(body, { depth: "light" })).toBe("NOT");
	});

	test("if with unknown field throws", () => {
		expect(() => renderTemplate("{{#if nope}}x{{/if}}", {})).toThrow(/unknown field/);
	});

	test("multiple sibling if blocks", () => {
		const body = '{{#if a}}A{{/if}}-{{#if b}}B{{/if}}';
		expect(renderTemplate(body, { a: true, b: false })).toBe("A-");
	});

	test("docmgr starter template end-to-end", () => {
		const tpl = parse(
			[
				"---",
				"fields:",
				"  - name: goal",
				"    type: text",
				"  - name: depth",
				"    type: choice",
				"    choices: [full, light]",
				"    default: light",
				"---",
				"Goal: {{goal}}",
				'{{#if depth == "full"}}',
				"Be exhaustive.",
				"{{/if}}",
				"Done.",
			].join("\n"),
		);
		const values = { ...defaultValues(tpl.fields), goal: "map the frobnicator" };
		expect(renderTemplate(tpl.body, values)).toBe("Goal: map the frobnicator\nDone.");
	});
});
