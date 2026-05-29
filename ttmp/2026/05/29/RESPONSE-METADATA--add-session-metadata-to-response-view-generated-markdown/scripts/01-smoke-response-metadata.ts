import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveToTempFile, type CapturedResponse } from "../../../../../../extensions/response-viewer/response";

const cwd = process.cwd();
const temp = mkdtempSync(join(tmpdir(), "rv-metadata-smoke-"));
const readDoc = join(temp, "read-source.md");
const generatedDoc = join(temp, "generated-output.md");
writeFileSync(readDoc, "# Read source\n", "utf-8");
writeFileSync(generatedDoc, "# Generated output\n", "utf-8");

const response: CapturedResponse = {
	turnIndex: 1,
	capturedAt: "2026-05-29T12:00:00.000Z",
	sessionId: "session-smoke",
	entryId: "assistant-final",
	modelProvider: "provider",
	modelId: "model",
	modelName: "Model Name",
	text: "This is the response body.",
	textLength: "This is the response body.".length,
};

const entries = [
	{
		type: "message",
		id: "assistant-prev",
		timestamp: "2026-05-29T11:59:00.000Z",
		message: { role: "assistant", content: [{ type: "text", text: "Previous response" }] },
	},
	{
		type: "message",
		id: "assistant-tools",
		timestamp: "2026-05-29T11:59:10.000Z",
		message: {
			role: "assistant",
			content: [
				{ type: "toolCall", id: "read-call", name: "read", arguments: { path: readDoc } },
				{ type: "toolCall", id: "write-call", name: "write", arguments: { path: generatedDoc } },
			],
		},
	},
	{
		type: "message",
		id: "read-result",
		timestamp: "2026-05-29T11:59:20.000Z",
		message: { role: "toolResult", toolName: "read", toolCallId: "read-call", isError: false },
	},
	{
		type: "message",
		id: "write-result",
		timestamp: "2026-05-29T11:59:30.000Z",
		message: { role: "toolResult", toolName: "write", toolCallId: "write-call", isError: false },
	},
	{
		type: "message",
		id: "assistant-final",
		timestamp: response.capturedAt,
		message: { role: "assistant", content: [{ type: "text", text: response.text }] },
	},
];

const ctx = {
	cwd,
	model: { provider: response.modelProvider, id: response.modelId, name: response.modelName },
	sessionManager: {
		getBranch: () => entries,
		getSessionId: () => response.sessionId,
	},
} as any;

const output = saveToTempFile(ctx, response, temp);
const markdown = readFileSync(output, "utf-8");

const checks = [
	["frontmatter has session", markdown.includes('id: "session-smoke"')],
	["frontmatter has absolute generated path", markdown.includes(`path: ${JSON.stringify(generatedDoc)}`)],
	["frontmatter has absolute read path", markdown.includes(`path: ${JSON.stringify(readDoc)}`)],
	["body has generated section", markdown.includes("Generated documents from previous turn")],
	["body has read section", markdown.includes("Documents read in previous turn")],
	["body has response", markdown.includes("This is the response body.")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
	console.error(markdown);
	throw new Error(`failed checks: ${failed.map(([name]) => name).join(", ")}`);
}

console.log(output);
console.log("response metadata smoke test passed");
