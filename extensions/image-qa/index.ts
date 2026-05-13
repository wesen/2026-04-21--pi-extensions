import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { registerPiExtension } from "../_shared/registry";
import { existsSync } from "fs";
import { resolve } from "path";

interface ImageQaState {
	profile: string;
	timeout: number;
}

function promptSection(title: string, value: string): string {
	return `${title}:\n${value.trim() || "(none provided)"}`;
}

function composePinocchioPrompt(context: string, question: string): string {
	return [
		promptSection("Context", context),
		promptSection("Question", question),
	].join("\n\n");
}

function argString(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	return typeof value === "string" ? value : "";
}

function argImages(args: Record<string, unknown>): string[] {
	return Array.isArray(args.images) ? args.images.filter((value): value is string => typeof value === "string") : [];
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
			"You can provide multiple images in one call, for example to compare before/after screenshots, " +
			"two versions of a diagram, or several related photos. " +
			"The images are analyzed by a vision-language model (VLM), so results are interpretations, " +
			"not guaranteed ground truth: visual details may be missed, hallucinated, or imperfect. " +
			"IMPORTANT: This tool is stateless — each call starts a fresh session with no memory of " +
			"previous calls. Put surrounding context in the separate context parameter, and put the " +
			"specific thing you want answered in the question parameter. Describe what you already know, " +
			"what you've already asked about these or related images, and what you're looking for now in " +
			"context. Do not assume the model knows anything from prior turns or the current conversation.",
		promptSnippet:
			"ask_questions_about_images(images, context, question) — ask a vision model about one or multiple images, including before/after comparisons (stateless: provide explicit context)",
		promptGuidelines: [
			"When using ask_questions_about_images, put all relevant surrounding information in the context argument — the tool has no memory of past calls.",
			"Keep question focused on the specific visual answer you want; do not bury the question inside the context field.",
			"Provide multiple images in one ask_questions_about_images call when comparing before/after states, alternatives, screenshots, or related visual evidence.",
			"Treat ask_questions_about_images results as VLM interpretations rather than perfect visual ground truth; verify important details when possible.",
		],
		parameters: Type.Object({
			images: Type.Array(Type.String(), {
				description:
					"One or more image file paths (relative to cwd or absolute) to analyze. " +
					"Pass multiple images in the same call for comparisons such as before/after screenshots, " +
					"two versions of a diagram, or related photos.",
			}),
			context: Type.String({
				description:
					"Surrounding context for this stateless image-analysis call. Include what is already known, " +
					"why these images matter, relevant prior questions/answers, ordering such as before/after, " +
					"and any uncertainty or constraints the VLM should be aware of. Every invocation is a fresh session.",
			}),
			question: Type.String({
				description:
					"The specific question to ask about the images. Keep this focused on the answer you want; " +
					"put background and surrounding details in context. Remember that answers come from a VLM " +
					"interpretation and may miss or misread visual details.",
			}),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { images, context, question } = params;
			if (!question.trim()) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: question must not be empty.",
						},
					],
					details: { error: true },
				};
			}
			const pinocchioPrompt = composePinocchioPrompt(context, question);

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
				pinocchioPrompt,
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
					details: { profile: state.profile, context, question },
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
		renderCall(args, theme) {
			const images = argImages(args);
			const context = argString(args, "context").trim();
			const question = argString(args, "question").trim();
			const text = [
				`${theme.fg("toolTitle", theme.bold("ask_questions_about_images"))} ${theme.fg("dim", `${images.length} image(s)`)}`,
				`${theme.fg("accent", "Context:")} ${context || theme.fg("warning", "(empty)")}`,
				`${theme.fg("accent", "Question:")} ${question || theme.fg("warning", "(empty)")}`,
			].join("\n");
			return new Text(text, 0, 0);
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
