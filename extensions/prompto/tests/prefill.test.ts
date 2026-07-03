import { describe, expect, test } from "bun:test";

import { coerceValue, parseJsonObject } from "../prefill-parse";
import type { TemplateField } from "../types";

describe("parseJsonObject", () => {
	test("clean JSON object", () => {
		expect(parseJsonObject('{"a": 1, "b": "x"}')).toEqual({ a: 1, b: "x" });
	});

	test("fenced JSON", () => {
		expect(parseJsonObject('```json\n{"title": "FROB"}\n```')).toEqual({ title: "FROB" });
	});

	test("JSON embedded in prose", () => {
		expect(parseJsonObject('Here is my proposal:\n{"title": "FROB"}\nHope that helps!')).toEqual({ title: "FROB" });
	});

	test("array is rejected", () => {
		expect(parseJsonObject('["a", "b"]')).toBeUndefined();
	});

	test("scalar is rejected", () => {
		expect(parseJsonObject('"just a string"')).toBeUndefined();
	});

	test("garbage is rejected", () => {
		expect(parseJsonObject("no json here")).toBeUndefined();
	});

	test("empty output is rejected", () => {
		expect(parseJsonObject("")).toBeUndefined();
	});

	test("nested braces in prose still extract the outer object", () => {
		expect(parseJsonObject('note {"a": {"b": 2}} end')).toEqual({ a: { b: 2 } });
	});
});

describe("coerceValue", () => {
	const stringField: TemplateField = { name: "s", type: "string" };
	const numberField: TemplateField = { name: "n", type: "number" };
	const boolField: TemplateField = { name: "b", type: "boolean" };
	const choiceField: TemplateField = { name: "c", type: "choice", choices: ["full", "light"] };
	const multiField: TemplateField = { name: "m", type: "multichoice", choices: ["a", "b"] };

	test("string accepts string and stringifies number", () => {
		expect(coerceValue("x", stringField)).toBe("x");
		expect(coerceValue(7, stringField)).toBe("7");
		expect(coerceValue(true, stringField)).toBeUndefined();
	});

	test("number accepts number and numeric string", () => {
		expect(coerceValue(3, numberField)).toBe(3);
		expect(coerceValue("4.5", numberField)).toBe(4.5);
		expect(coerceValue("maybe", numberField)).toBeUndefined();
	});

	test("boolean rejects non-boolean", () => {
		expect(coerceValue(true, boolField)).toBe(true);
		expect(coerceValue("maybe", boolField)).toBeUndefined();
	});

	test("choice must be a listed choice", () => {
		expect(coerceValue("full", choiceField)).toBe("full");
		expect(coerceValue("banana", choiceField)).toBeUndefined();
	});

	test("multichoice filters to listed choices, rejects empty result", () => {
		expect(coerceValue(["a", "zzz"], multiField)).toEqual(["a"]);
		expect(coerceValue(["zzz"], multiField)).toBeUndefined();
		expect(coerceValue("a", multiField)).toBeUndefined();
	});
});
