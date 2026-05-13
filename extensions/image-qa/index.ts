import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { registerPiExtension } from "../_shared/registry";
import { existsSync } from "fs";
import { resolve } from "path";

interface ImageQaState {
	profile: string;
	timeout: number;
}

export default function imageQaExtension(pi: ExtensionAPI): void {
	const state: ImageQaState = { profile: "gpt-5-low", timeout: 120 };

	registerPiExtension({
		id: "image-qa",
		name: "Image QA",
		description: "Ask vision-capable models questions about images via pinocchio.",
		commands: ["image-qa"],
		tags: ["vision", "tools"],

		actions: [
			{
				id: "status",
				title: "Show status",
				description: "Show current image-qa settings.",
				default: true,
				run: async (ctx) => {
					ctx.ui.notify(
						`image-qa: profile=${state.profile} timeout=${state.timeout}s`,
						"info",
					);
				},
			},
		],

		docs: [
			{
				id: "overview",
				title: "Image QA overview",
				path: "extensions/image-qa/README.md",
			},
		],

		settings: {
			kind: "schema",
			schema: {
				version: 1,
				title: "Image QA Settings",
				description: "Configure the pinocchio profile and timeout for image QA calls.",
				sections: [
					{
						id: "main",
						title: "Main",
						fields: [
							{
								id: "profile",
								label: "Profile",
								type: "string",
								description:
									"Pinocchio profile to use (e.g. gpt-5-low, claude-sonnet).",
							},
							{
								id: "timeout",
								label: "Timeout (seconds)",
								type: "number",
								description:
									"Maximum seconds to wait for a pinocchio response.",
							},
						],
					},
				],
			},
			load: () => ({ profile: state.profile, timeout: state.timeout }),
			onApply: (values, ctx) => {
				if (values.profile) state.profile = String(values.profile);
				if (values.timeout) state.timeout = Number(values.timeout);
				ctx.ui.notify(
					`image-qa: profile=${state.profile} timeout=${state.timeout}s`,
					"info",
				);
			},
		},
	});

	// Register the LLM-callable tool
	pi.registerTool({
		name: "ask_questions_about_images",
		label: "Ask questions about images",
		description:
			"Ask a vision-capable model questions about one or more images. " +
			"IMPORTANT: This tool is stateless — each call starts a fresh session with no memory of " +
			"previous calls. You MUST include all relevant context in the question parameter: describe " +
			"what you already know, what you've already asked about these or related images, and what " +
			"you're looking for now. Do not assume the model knows anything from prior turns or the " +
			"current conversation.",
		promptSnippet:
			"ask_questions_about_images(images, question) — ask a vision model about images (stateless: include all context in question)",
		promptGuidelines: [
			"When using ask_questions_about_images, include all relevant context in the question — the tool has no memory of past calls.",
		],
		parameters: Type.Object({
			images: Type.Array(Type.String(), {
				description:
					"One or more image file paths (relative to cwd or absolute) to analyze.",
			}),
			question: Type.String({
				description:
					"The question to ask about the images. MUST include all surrounding context " +
					"because the tool is stateless — it does not remember past images, past questions, " +
					"or any conversation history. Every invocation is a fresh session.",
			}),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { images, question } = params;

			// Resolve and validate image paths
			const resolved = images.map((p) => resolve(ctx.cwd, p));
			const missing = resolved.filter((p) => !existsSync(p));
			if (missing.length > 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: Image file(s) not found: ${missing.join(", ")}`,
						},
					],
					details: { error: true },
				};
			}

			// Build pinocchio args
			const imagesFlag = resolved.join(",");
			const args = [
				"code",
				"professional",
				"--profile",
				state.profile,
				"--images",
				imagesFlag,
				"--non-interactive",
				question,
			];

			try {
				const result = await pi.exec("pinocchio", args, {
					signal,
					timeout: state.timeout * 1000,
				});

				if (result.code !== 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: `pinocchio exited with code ${result.code}:\n${result.stderr}\n${result.stdout}`,
							},
						],
						details: { error: true, exitCode: result.code },
					};
				}

				return {
					content: [{ type: "text" as const, text: result.stdout }],
					details: { profile: state.profile },
				};
			} catch (err: unknown) {
				if (signal?.aborted) {
					return {
						content: [{ type: "text" as const, text: "Image QA call aborted." }],
						details: { error: true, aborted: true },
					};
				}
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error running pinocchio: ${message}`,
						},
					],
					details: { error: true },
				};
			}
		},
	});

	// Compatibility slash command
	pi.registerCommand("image-qa", {
		description: "Show image-qa extension status and settings",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				`image-qa: profile=${state.profile} timeout=${state.timeout}s`,
				"info",
			);
		},
	});
}
