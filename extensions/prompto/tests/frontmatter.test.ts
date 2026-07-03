import { describe, expect, test } from "bun:test";

import { parseFrontmatter, splitFrontmatter } from "../frontmatter";

describe("splitFrontmatter", () => {
	test("no fence returns body untouched", () => {
		const { frontmatter, body } = splitFrontmatter("hello\nworld\n");
		expect(frontmatter).toBeUndefined();
		expect(body).toBe("hello\nworld\n");
	});

	test("fenced document splits into map and body", () => {
		const { frontmatter, body } = splitFrontmatter("---\ntitle: Hi\n---\nBody {{x}}\n");
		expect(frontmatter?.title).toBe("Hi");
		expect(body).toBe("Body {{x}}\n");
	});

	test("unterminated fence is treated as plain body", () => {
		const { frontmatter } = splitFrontmatter("---\ntitle: Hi\nno end");
		expect(frontmatter).toBeUndefined();
	});
});

describe("parseFrontmatter", () => {
	test("scalars: string, number, boolean, quoted, null", () => {
		const map = parseFrontmatter(["a: hello", "b: 42", "c: true", 'd: "x: y"', "e: 'lit'", "f:", "g: null"].join("\n"));
		expect(map).toEqual({ a: "hello", b: 42, c: true, d: "x: y", e: "lit", f: null, g: null });
	});

	test("inline arrays with quotes and spaces", () => {
		const map = parseFrontmatter('tags: [analysis, "two words", 3]');
		expect(map.tags).toEqual(["analysis", "two words", 3]);
	});

	test("comments and blank lines ignored", () => {
		const map = parseFrontmatter("# top\na: 1\n\n# mid\nb: 2 # trailing\n");
		expect(map).toEqual({ a: 1, b: 2 });
	});

	test("nested map", () => {
		const map = parseFrontmatter("outer:\n  inner: yes\n  n: 2\ntop: 1");
		expect(map.outer).toEqual({ inner: "yes", n: 2 });
		expect(map.top).toBe(1);
	});

	test("block list of scalars", () => {
		const map = parseFrontmatter("items:\n  - one\n  - two");
		expect(map.items).toEqual(["one", "two"]);
	});

	test("block list of maps (fields shape)", () => {
		const map = parseFrontmatter(
			["fields:", "  - name: goal", "    type: text", "    required: true", "  - name: depth", "    choices: [full, light]"].join("\n"),
		);
		expect(map.fields).toEqual([
			{ name: "goal", type: "text", required: true },
			{ name: "depth", choices: ["full", "light"] },
		]);
	});

	test("block literal scalar keeps newlines, strips indent", () => {
		const map = parseFrontmatter(["prompt: |", "  line one", "  line two", "after: 1"].join("\n"));
		expect(map.prompt).toBe("line one\nline two\n");
		expect(map.after).toBe(1);
	});

	test("block literal with |- strips trailing newline", () => {
		const map = parseFrontmatter(["prompt: |-", "  only line"].join("\n"));
		expect(map.prompt).toBe("only line");
	});

	test("block literal inside nested map (prefill shape)", () => {
		const map = parseFrontmatter(["prefill:", "  fields: [title]", "  prompt: |", "    Propose a title.", "    Goal: {{goal}}", "  when: after-required"].join("\n"));
		expect(map.prefill).toEqual({ fields: ["title"], prompt: "Propose a title.\nGoal: {{goal}}\n", when: "after-required" });
	});

	test("identical block scalars in sibling list items stay distinct", () => {
		const map = parseFrontmatter(
			["fields:", "  - name: a", "    prompt: |", "      hello a", "  - name: b", "    prompt: |", "      hello b"].join("\n"),
		) as { fields: Array<{ prompt: string }> };
		expect(map.fields[0].prompt).toBe("hello a\n");
		expect(map.fields[1].prompt).toBe("hello b\n");
	});

	test("tabs are rejected", () => {
		expect(() => parseFrontmatter("a:\n\tb: 1")).toThrow(/tabs/);
	});

	test("garbage line throws", () => {
		expect(() => parseFrontmatter("just some text")).toThrow();
	});
});
