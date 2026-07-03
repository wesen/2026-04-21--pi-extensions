import { spawn } from "node:child_process";

import { buildRenderRequest, parseDescribeOutput, parseRenderLine } from "./plugin-protocol";
import type { FieldValue, PromptTemplate, TemplateSource } from "./types";

const DESCRIBE_TIMEOUT_MS = 5_000;
const RENDER_TIMEOUT_MS = 60_000;

export class PluginError extends Error {}

export interface DescribeResult {
	templates: PromptTemplate[];
	issues: string[];
}

/** Run `plugin --describe` and parse the announced templates. */
export async function describePlugin(options: {
	filePath: string;
	group: string;
	source: TemplateSource;
	submitDefault: "editor" | "auto";
	cwd: string;
	timeoutMs?: number;
}): Promise<DescribeResult> {
	const { filePath, group, source, submitDefault, cwd } = options;
	let stdout: string;
	try {
		stdout = await runCapture(filePath, ["--describe"], { cwd, timeoutMs: options.timeoutMs ?? DESCRIBE_TIMEOUT_MS });
	} catch (error) {
		return { templates: [], issues: [`${filePath}: ${error instanceof Error ? error.message : String(error)}`] };
	}
	return parseDescribeOutput({ stdout, filePath, group, source, submitDefault });
}

/** Send a render request and wait for a prompt/error frame. */
export async function renderViaPlugin(options: {
	template: PromptTemplate;
	values: Record<string, FieldValue>;
	cwd: string;
	onLog?: (message: string) => void;
	timeoutMs?: number;
}): Promise<string> {
	const { template, values, cwd, onLog } = options;
	const timeoutMs = options.timeoutMs ?? RENDER_TIMEOUT_MS;
	const request = buildRenderRequest(template.pluginTemplateName ?? template.name, values, cwd);

	return new Promise<string>((resolve, reject) => {
		const child = spawn(template.filePath, [], {
			cwd,
			env: { ...process.env, PROMPTO_TEMPLATE: template.pluginTemplateName ?? template.name, PROMPTO_PLUGIN_PATH: template.filePath },
			stdio: ["pipe", "pipe", "pipe"],
		});
		let settled = false;
		let buffered = "";
		let stderrTail = "";
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.kill("SIGKILL");
			fn();
		};
		const timer = setTimeout(() => {
			finish(() => reject(new PluginError(`plugin timed out after ${timeoutMs / 1000}s: ${template.filePath}`)));
		}, timeoutMs);

		child.on("error", (error) => finish(() => reject(new PluginError(`could not run ${template.filePath}: ${error.message}`))));
		child.stderr.on("data", (chunk: Buffer) => {
			stderrTail = (stderrTail + chunk.toString("utf-8")).slice(-2000);
		});
		child.stdout.on("data", (chunk: Buffer) => {
			buffered += chunk.toString("utf-8");
			let newline = buffered.indexOf("\n");
			while (newline >= 0 && !settled) {
				const line = buffered.slice(0, newline);
				buffered = buffered.slice(newline + 1);
				const frame = parseRenderLine(line);
				if (frame?.type === "log") onLog?.(frame.message);
				else if (frame?.type === "prompt") finish(() => resolve(frame.text));
				else if (frame?.type === "error") finish(() => reject(new PluginError(frame.message)));
				newline = buffered.indexOf("\n");
			}
		});
		child.on("close", (code) => {
			// Flush a final unterminated line, then fail if no terminal frame came.
			const frame = parseRenderLine(buffered);
			if (frame?.type === "prompt") return finish(() => resolve(frame.text));
			if (frame?.type === "error") return finish(() => reject(new PluginError(frame.message)));
			finish(() =>
				reject(
					new PluginError(
						`plugin exited (code ${String(code)}) without a prompt frame: ${template.filePath}${stderrTail ? ` — stderr: ${stderrTail.trim().slice(-300)}` : ""}`,
					),
				),
			);
		});

		child.stdin.write(request);
		child.stdin.end();
	});
}

function runCapture(command: string, args: string[], options: { cwd: string; timeoutMs: number }): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(command, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.kill("SIGKILL");
			fn();
		};
		const timer = setTimeout(() => finish(() => reject(new PluginError(`describe timed out after ${options.timeoutMs / 1000}s`))), options.timeoutMs);
		child.on("error", (error) => finish(() => reject(new PluginError(error.message))));
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf-8");
		});
		child.on("close", (code) => {
			if (code === 0) finish(() => resolve(stdout));
			else finish(() => reject(new PluginError(`describe exited with code ${String(code)}`)));
		});
	});
}
