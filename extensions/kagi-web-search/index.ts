import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { registerPiExtension } from "../_shared/registry";

interface KagiWebSearchState {
	maxResults: number;
	timeoutMs: number;
}

function positiveInteger(value: unknown, fallback: number): number {
	const numberValue = Number(value);
	if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
	return Math.floor(numberValue);
}

function formatStatus(state: KagiWebSearchState): string {
	return `kagi-web-search: maxResults=${state.maxResults} timeoutMs=${state.timeoutMs}`;
}

export default function kagiWebSearchExtension(pi: ExtensionAPI): void {
	const state: KagiWebSearchState = { maxResults: 10, timeoutMs: 120_000 };

	registerPiExtension({
		id: "kagi-web-search",
		name: "Kagi Web Search",
		description: "Search the web with Kagi via surf and return Markdown results to the agent.",
		commands: ["kagi-web-search"],
		tags: ["search", "web", "kagi", "surf", "tools"],
		run: async (ctx) => ctx.ui.notify(formatStatus(state), "info"),
		actions: [
			{
				id: "status",
				title: "Show status",
				description: "Show current Kagi Web Search settings.",
				default: true,
				run: async (ctx) => ctx.ui.notify(formatStatus(state), "info"),
			},
		],
		docs: [
			{
				id: "overview",
				title: "Kagi Web Search overview",
				path: "extensions/kagi-web-search/README.md",
			},
		],
		settings: {
			kind: "schema",
			schema: {
				version: 1,
				title: "Kagi Web Search Settings",
				description: "Configure surf-backed Kagi search defaults.",
				sections: [
					{
						id: "main",
						title: "Main",
						fields: [
							{
								id: "maxResults",
								label: "Max results",
								type: "number",
								description: "Default maximum number of Kagi result rows to return.",
							},
							{
								id: "timeoutMs",
								label: "Timeout (ms)",
								type: "number",
								description: "surf socket timeout in milliseconds.",
							},
						],
					},
				],
			},
			load: () => ({ maxResults: state.maxResults, timeoutMs: state.timeoutMs }),
			onApply: (values, ctx) => {
				state.maxResults = positiveInteger(values.maxResults, state.maxResults);
				state.timeoutMs = positiveInteger(values.timeoutMs, state.timeoutMs);
				ctx.ui.notify(formatStatus(state), "info");
			},
		},
	});

	pi.registerTool({
		name: "kagi_web_search",
		label: "Kagi web search",
		description:
			"Run a Kagi web search via the local surf CLI and return Markdown search results. " +
			"Use this when current web information, URLs, documentation pages, articles, or broad web discovery are needed.",
		promptSnippet:
			"kagi_web_search(query, max_results?) — search the web with Kagi via surf and return Markdown results",
		promptGuidelines: [
			"Use kagi_web_search for current web information, source discovery, or finding relevant URLs before deeper reading.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query to run on Kagi." }),
			max_results: Type.Optional(
				Type.Number({
					description:
						"Optional maximum number of result rows to return for this call. Defaults to the extension setting.",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const query = params.query.trim();
			if (!query) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: query must not be empty.",
						},
					],
					details: { error: true },
				};
			}

			const maxResults = positiveInteger(params.max_results, state.maxResults);
			const timeoutMs = positiveInteger(state.timeoutMs, 120_000);
			const args = [
				"kagi",
				"search",
				"--query",
				query,
				"--max-results",
				String(maxResults),
				"--timeout-ms",
				String(timeoutMs),
			];

			try {
				const result = await pi.exec("surf", args, {
					signal,
					timeout: timeoutMs + 5_000,
				});
				const output = result.stdout.trim() || result.stderr.trim();

				if (result.code !== 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: `surf kagi search exited with code ${result.code}:\n${output}`,
							},
						],
						details: { error: true, exitCode: result.code, query, maxResults },
					};
				}

				return {
					content: [{ type: "text" as const, text: output }],
					details: { query, maxResults },
				};
			} catch (error: unknown) {
				if (signal?.aborted) {
					return {
						content: [{ type: "text" as const, text: "Kagi web search aborted." }],
						details: { error: true, aborted: true, query, maxResults },
					};
				}
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error running surf kagi search: ${message}`,
						},
					],
					details: { error: true, query, maxResults },
				};
			}
		},
	});

	pi.registerCommand("kagi-web-search", {
		description: "Show kagi-web-search extension status and settings",
		handler: async (_args, ctx) => {
			ctx.ui.notify(formatStatus(state), "info");
		},
	});
}
