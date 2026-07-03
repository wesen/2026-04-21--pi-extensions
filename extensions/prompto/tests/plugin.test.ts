import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describePlugin, renderViaPlugin } from "../plugin";
import { parseDescribeOutput, parseRenderLine } from "../plugin-protocol";
import type { PromptTemplate } from "../types";

const FIXTURE_DIR = join(tmpdir(), `prompto-plugin-fixtures-${process.pid}`);

function fixture(name: string, script: string): string {
	const path = join(FIXTURE_DIR, name);
	writeFileSync(path, script, "utf-8");
	chmodSync(path, 0o755);
	return path;
}

function pluginTemplate(filePath: string, templateName: string): PromptTemplate {
	return {
		name: `test/${templateName}`,
		group: "test",
		submit: "editor",
		fields: [],
		body: "",
		filePath,
		source: "global",
		kind: "plugin",
		pluginTemplateName: templateName,
	};
}

beforeAll(() => mkdirSync(FIXTURE_DIR, { recursive: true }));
afterAll(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

describe("parseDescribeOutput", () => {
	const base = { filePath: "/p", group: "g", source: "global" as const, submitDefault: "editor" as const };

	test("valid announcement with fields", () => {
		const stdout = [
			JSON.stringify({ type: "template", name: "t1", title: "T1", fields: [{ name: "goal", type: "text" }] }),
			JSON.stringify({ type: "end" }),
		].join("\n");
		const result = parseDescribeOutput({ ...base, stdout });
		expect(result.templates).toHaveLength(1);
		expect(result.templates[0].name).toBe("g/t1");
		expect(result.templates[0].pluginTemplateName).toBe("t1");
		expect(result.templates[0].fields[0].name).toBe("goal");
	});

	test("junk lines are skipped, frames after end ignored", () => {
		const stdout = ["not json", '{"type":"template","name":"ok"}', '{"type":"end"}', '{"type":"template","name":"late"}'].join("\n");
		const result = parseDescribeOutput({ ...base, stdout });
		expect(result.templates.map((t) => t.pluginTemplateName)).toEqual(["ok"]);
		expect(result.issues).toHaveLength(0);
	});

	test("invalid template becomes an issue, not a crash", () => {
		const stdout = ['{"type":"template","name":"bad name!"}', '{"type":"template","name":"good"}'].join("\n");
		const result = parseDescribeOutput({ ...base, stdout });
		expect(result.templates.map((t) => t.pluginTemplateName)).toEqual(["good"]);
		expect(result.issues).toHaveLength(1);
	});

	test("bad field schema in announcement becomes an issue", () => {
		const stdout = JSON.stringify({ type: "template", name: "t", fields: [{ name: "x", type: "banana" }] });
		const result = parseDescribeOutput({ ...base, stdout });
		expect(result.templates).toHaveLength(0);
		expect(result.issues[0]).toMatch(/unknown type/);
	});
});

describe("parseRenderLine", () => {
	test("frames parse; junk and unknown types are undefined", () => {
		expect(parseRenderLine('{"type":"log","message":"m"}')).toEqual({ type: "log", message: "m" });
		expect(parseRenderLine('{"type":"prompt","text":"p"}')).toEqual({ type: "prompt", text: "p", submit: undefined });
		expect(parseRenderLine('{"type":"error","message":"e"}')).toEqual({ type: "error", message: "e" });
		expect(parseRenderLine("junk")).toBeUndefined();
		expect(parseRenderLine('{"type":"future-thing"}')).toBeUndefined();
	});
});

describe("describePlugin (subprocess)", () => {
	test("happy path via a real script", async () => {
		const path = fixture(
			"describe-ok",
			`#!/usr/bin/env bash\necho '{"type":"template","name":"hello","title":"Hi"}'\necho '{"type":"end"}'\n`,
		);
		const result = await describePlugin({ filePath: path, group: "grp", source: "global", submitDefault: "editor", cwd: FIXTURE_DIR });
		expect(result.templates.map((t) => t.name)).toEqual(["grp/hello"]);
	});

	test("nonzero exit becomes an issue", async () => {
		const path = fixture("describe-fail", "#!/usr/bin/env bash\nexit 3\n");
		const result = await describePlugin({ filePath: path, group: "g", source: "global", submitDefault: "editor", cwd: FIXTURE_DIR });
		expect(result.templates).toHaveLength(0);
		expect(result.issues[0]).toMatch(/code 3/);
	});

	test("timeout kills a sleeping plugin", async () => {
		const path = fixture("describe-sleep", "#!/usr/bin/env bash\nsleep 30\n");
		const result = await describePlugin({ filePath: path, group: "g", source: "global", submitDefault: "editor", cwd: FIXTURE_DIR, timeoutMs: 300 });
		expect(result.issues[0]).toMatch(/timed out/);
	});
});

describe("renderViaPlugin (subprocess)", () => {
	test("happy path: log then prompt, request visible to plugin", async () => {
		const path = fixture(
			"render-ok",
			`#!/usr/bin/env bash\nread -r req\necho '{"type":"log","message":"working"}'\nname=$(printf '%s' "$req" | sed -n 's/.*"who":"\\([^"]*\\)".*/\\1/p')\necho "{\\"type\\":\\"prompt\\",\\"text\\":\\"hello $name from $PROMPTO_TEMPLATE\\"}"\n`,
		);
		const logs: string[] = [];
		const text = await renderViaPlugin({
			template: pluginTemplate(path, "greet"),
			values: { who: "world" },
			cwd: FIXTURE_DIR,
			onLog: (m) => logs.push(m),
		});
		expect(text).toBe("hello world from greet");
		expect(logs).toEqual(["working"]);
	});

	test("error frame rejects with its message", async () => {
		const path = fixture("render-error", `#!/usr/bin/env bash\nread -r req\necho '{"type":"error","message":"nope"}'\n`);
		await expect(renderViaPlugin({ template: pluginTemplate(path, "t"), values: {}, cwd: FIXTURE_DIR })).rejects.toThrow("nope");
	});

	test("junk stdout followed by prompt still succeeds", async () => {
		const path = fixture("render-junk", `#!/usr/bin/env bash\nread -r req\necho "debug noise"\necho '{"type":"prompt","text":"ok"}'\n`);
		await expect(renderViaPlugin({ template: pluginTemplate(path, "t"), values: {}, cwd: FIXTURE_DIR })).resolves.toBe("ok");
	});

	test("exit without prompt frame rejects, includes stderr tail", async () => {
		const path = fixture("render-silent", `#!/usr/bin/env bash\nread -r req\necho "oops" >&2\nexit 0\n`);
		await expect(renderViaPlugin({ template: pluginTemplate(path, "t"), values: {}, cwd: FIXTURE_DIR })).rejects.toThrow(/without a prompt frame.*oops/s);
	});

	test("timeout kills a hanging plugin", async () => {
		const path = fixture("render-hang", "#!/usr/bin/env bash\nread -r req\nsleep 30\n");
		await expect(renderViaPlugin({ template: pluginTemplate(path, "t"), values: {}, cwd: FIXTURE_DIR, timeoutMs: 300 })).rejects.toThrow(/timed out/);
	});
});
