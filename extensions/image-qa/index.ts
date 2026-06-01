import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { registerPiExtension } from "../_shared/registry";
import type { PiSettingsOption } from "../_shared/registry";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { CURATED_PROFILES, discoverPinocchioProfiles, getSelectedProfile } from "./profiles";

interface ImageQaState {
	profile: string;
	timeout: number;
}

interface StreamingProcessResult {
	code: number;
	stdout: string;
	stderr: string;
	aborted: boolean;
	timedOut: boolean;
}

interface StreamingProcessOptions {
	cwd: string;
	signal?: AbortSignal;
	timeoutMs: number;
	onOutput: (stdout: string, stderr: string) => void;
}

function promptSection(title: string, value: string): string {
	return `${title}:\n${value.trim() || "(none provided)"}`;
}

function composePinocchioPrompt(context: string, question: string): string {
	return [
		"Important: You are a separate vision QA agent. You have no access to the caller's project, files, previous Pi conversation, previous image QA calls, or earlier answers unless they are explicitly included below. Interpret references like 'this', 'that', 'the previous one', or 'is this better?' only if the provided context defines what they refer to; otherwise state what information is missing.",
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

function runStreamingProcess(command: string, args: string[], options: StreamingProcessOptions): Promise<StreamingProcessResult> {
	return new Promise((resolvePromise, reject) => {
		if (options.signal?.aborted) {
			resolvePromise({ code: -1, stdout: "", stderr: "", aborted: true, timedOut: false });
			return;
		}

		let stdout = "";
		let stderr = "";
		let aborted = false;
		let timedOut = false;
		let settled = false;
		let updateTimer: ReturnType<typeof setTimeout> | undefined;
		let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
		let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const emitUpdate = () => {
			updateTimer = undefined;
			options.onOutput(stdout, stderr);
		};

		const scheduleUpdate = () => {
			if (updateTimer) return;
			updateTimer = setTimeout(emitUpdate, 150);
		};

		const cleanup = () => {
			if (updateTimer) clearTimeout(updateTimer);
			if (forceKillTimer) clearTimeout(forceKillTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			options.signal?.removeEventListener("abort", onAbort);
		};

		const terminate = () => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			child.kill("SIGTERM");
			forceKillTimer = setTimeout(() => {
				if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
			}, 5_000);
		};

		const onAbort = () => {
			aborted = true;
			terminate();
		};

		timeoutTimer = setTimeout(() => {
			timedOut = true;
			terminate();
		}, options.timeoutMs);

		options.signal?.addEventListener("abort", onAbort, { once: true });

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
			scheduleUpdate();
		});

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
			scheduleUpdate();
		});

		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		});

		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			cleanup();
			options.onOutput(stdout, stderr);
			resolvePromise({ code: code ?? -1, stdout, stderr, aborted, timedOut });
		});
	});
}

export default function imageQaExtension(pi: ExtensionAPI): void {
	const pinocchioDefault = getSelectedProfile();
	const state: ImageQaState = { profile: pinocchioDefault ?? "gpt-5-low", timeout: 120 };

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
			schema: () => {
				const options: PiSettingsOption[] = [
					...CURATED_PROFILES.map((c) => ({
						value: c.value,
						label: c.label,
						description: c.desc,
					})),
					// Append non-curated discovered profiles that have a chat engine
					...discoverPinocchioProfiles()
						.filter((p) => p.effective_chat_engine && !CURATED_PROFILES.find((c) => c.value === p.profile))
						.map((p) => ({
							value: p.profile,
							label: p.display_name || p.profile,
							description: p.effective_chat_engine,
						})),
				];

				return {
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
									type: "select" as const,
									options,
									description: "Pinocchio profile for vision calls.",
								},
								{
									id: "timeout",
									label: "Timeout (seconds)",
									type: "number" as const,
									description: "Maximum seconds to wait for a pinocchio response.",
									min: 10,
									max: 600,
									step: 10,
								},
							],
						},
					],
				};
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
			"IMPORTANT: This tool is stateless and the vision QA agent is separate from Pi — each call starts " +
			"a fresh session with no memory of previous calls and no knowledge of the current project, files, " +
			"goals, UI state, or conversation unless you explicitly include that information in context. " +
			"Put detailed establishing context in the context parameter: what the images show, why they matter, " +
			"what changed, what problem you are investigating, image ordering, prior observations, and what " +
			"ambiguous references mean. Put the specific thing you want answered in the question parameter. " +
			"Do not ask context-dependent questions like 'is this better?' unless context explains what 'this' " +
			"refers to and what it should be better than.",
		promptSnippet:
			"ask_questions_about_images(images, context, question) — ask a separate stateless vision QA agent about one or multiple images; provide detailed establishing context because it has no project/conversation knowledge",
		promptGuidelines: [
			"When using ask_questions_about_images, put all relevant establishing information in the context argument — the vision QA agent has no memory of past calls and no access to this project or conversation.",
			"Explain the intent behind the question: what the images show, why they matter, what changed, what you are trying to verify, and any relevant acceptance criteria.",
			"Do not rely on references like 'this', 'that', 'previous', 'same issue', or 'is it better?' unless the context explicitly defines the referent and comparison baseline.",
			"Keep question focused on the specific visual answer you want; do not bury the question inside the context field.",
			"Provide multiple images in one ask_questions_about_images call when comparing before/after states, alternatives, screenshots, or related visual evidence, and state the image order in context.",
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
					"Detailed establishing context for this stateless image-analysis call. The vision QA agent has " +
					"no project knowledge and cannot see prior conversation, previous tool calls, files, goals, or " +
					"earlier answers unless you include them here. Explain what the images show, why they matter, " +
					"what changed, relevant prior observations/questions, image ordering such as before/after, " +
					"comparison baselines, acceptance criteria, and any uncertainty or constraints. Avoid bare references " +
					"like 'this' or 'better' unless you define them in this context.",
			}),
			question: Type.String({
				description:
					"The specific question to ask about the images. Keep this focused on the answer you want; " +
					"put background and surrounding details in context. Remember that answers come from a VLM " +
					"interpretation and may miss or misread visual details.",
			}),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
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
			const resolvedPaths = images.map((p) => resolve(ctx.cwd, p));
			const missing = resolvedPaths.filter((p) => !existsSync(p));
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
			const imagesFlag = resolvedPaths.join(",");
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

			const baseDetails = { profile: state.profile, context, question };
			onUpdate?.({
				content: [{ type: "text" as const, text: "Starting image QA via pinocchio..." }],
				details: { ...baseDetails, streaming: true },
			});

			try {
				const result = await runStreamingProcess("pinocchio", args, {
					cwd: ctx.cwd,
					signal,
					timeoutMs: state.timeout * 1000,
					onOutput: (out, err) => {
						const text = out || (err ? `pinocchio stderr:\n${err}` : "Waiting for pinocchio output...");
						onUpdate?.({
							content: [{ type: "text" as const, text }],
							details: { ...baseDetails, streaming: true, stderr: err || undefined },
						});
					},
				});

				if (result.aborted) {
					const partial = result.stdout.trim() ? `\n\nPartial output:\n${result.stdout}` : "";
					return {
						content: [{ type: "text" as const, text: `Image QA call aborted.${partial}` }],
						details: { ...baseDetails, error: true, aborted: true, stderr: result.stderr || undefined },
					};
				}

				if (result.timedOut) {
					const partial = result.stdout.trim() ? `\n\nPartial output:\n${result.stdout}` : "";
					return {
						content: [{ type: "text" as const, text: `Image QA call timed out after ${state.timeout}s.${partial}` }],
						details: { ...baseDetails, error: true, timedOut: true, stderr: result.stderr || undefined },
					};
				}

				if (result.code !== 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: `pinocchio exited with code ${result.code}:\n${result.stderr}\n${result.stdout}`,
							},
						],
						details: { ...baseDetails, error: true, exitCode: result.code, stderr: result.stderr || undefined },
					};
				}

				return {
					content: [{ type: "text" as const, text: result.stdout }],
					details: { ...baseDetails, streaming: false, stderr: result.stderr || undefined },
				};
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error running pinocchio: ${message}`,
						},
					],
					details: { ...baseDetails, error: true },
				};
			}
		},
		renderCall(args, theme) {
			const images = argImages(args);
			const context = argString(args, "context").trim();
			const question = argString(args, "question").trim();
			const text = [
				`${theme.fg("toolTitle", theme.bold("ask_questions_about_images"))} ${theme.fg("dim", `${images.length} image(s) · profile: ${state.profile}`)}`,
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
