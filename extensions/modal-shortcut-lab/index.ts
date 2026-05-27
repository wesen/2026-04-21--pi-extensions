import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import { registerPiExtension } from "../_shared/registry";

const LOG_PATH = path.join(os.tmpdir(), "pi-modal-shortcut-lab.log");
const BUILD_ID = "modal-shortcut-lab-2026-05-27T22:10";
const TARGET_SHORTCUT = "ctrl+shift+p";
const ALT_SHORTCUT = "ctrl+shift+m";

type OpenMode = "replace" | "overlay";
type OpenSource =
	| "command-replace"
	| "command-overlay"
	| "command-overlay-scheduled"
	| "registered-shortcut-direct"
	| "registered-shortcut-scheduled"
	| "raw-terminal-direct"
	| "raw-terminal-scheduled";

type LabResult = { kind: "ok"; source: OpenSource; inputCount: number } | { kind: "cancel"; source: OpenSource; inputCount: number };

let debugEnabled = process.env.PI_MODAL_SHORTCUT_LAB_DEBUG === "1";
let terminalUnsubscribe: (() => void) | undefined;
let rawOpenScheduled = false;
let openCounter = 0;

export default function modalShortcutLab(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "modal-shortcut-lab",
		name: "Modal Shortcut Lab",
		description: "Isolated test harness for Pi shortcut, raw terminal input, custom UI, overlay, focus, and render timing behavior.",
		commands: ["modal-lab", "modal-lab-debug"],
		tags: ["debugging", "shortcuts", "tui", "overlay", "lab"],
		run: async (ctx) => openLabModal(ctx, "command-overlay", "overlay"),
		actions: [
			{ id: "open-overlay", title: "Open overlay modal", run: async (ctx) => openLabModal(ctx, "command-overlay", "overlay") },
			{ id: "open-replace", title: "Open replacement custom UI", run: async (ctx) => openLabModal(ctx, "command-replace", "replace") },
		],
		docs: [
			{
				id: "overview",
				title: "Modal Shortcut Lab overview",
				path: "extensions/modal-shortcut-lab/README.md",
			},
		],
	});

	pi.on("session_start", async (_event, ctx) => {
		debugLog("session_start", { build: BUILD_ID, cwd: ctx.cwd });
		registerRawTerminalListener(ctx);
	});

	pi.on("session_shutdown", async (event) => {
		debugLog("session_shutdown", { reason: event.reason });
		terminalUnsubscribe?.();
		terminalUnsubscribe = undefined;
	});

	pi.registerShortcut(ALT_SHORTCUT, {
		description: "Modal Shortcut Lab: open overlay directly through pi.registerShortcut",
		handler: async (ctx) => {
			debugLog("registeredShortcut.direct", { shortcut: ALT_SHORTCUT });
			await openLabModal(ctx, "registered-shortcut-direct", "overlay");
		},
	});

	pi.registerShortcut("ctrl+shift+alt+m", {
		description: "Modal Shortcut Lab: open overlay through scheduled pi.registerShortcut",
		handler: async (ctx) => {
			debugLog("registeredShortcut.scheduled", { shortcut: "ctrl+shift+alt+m" });
			scheduleOpen(ctx, "registered-shortcut-scheduled", "overlay");
		},
	});

	pi.registerCommand("modal-lab", {
		description: "Run modal shortcut lab scenarios: notify | replace | overlay | scheduled | status",
		handler: async (args, ctx) => {
			const mode = args.trim().toLowerCase() || "overlay";
			debugLog("command.modal-lab", { args, mode });
			if (mode === "notify") {
				ctx.ui.notify(`Modal Shortcut Lab loaded (${BUILD_ID})`, "info");
				return;
			}
			if (mode === "replace") {
				await openLabModal(ctx, "command-replace", "replace");
				return;
			}
			if (mode === "scheduled") {
				scheduleOpen(ctx, "command-overlay-scheduled", "overlay");
				return;
			}
			if (mode === "status") {
				ctx.ui.notify(statusText(), "info");
				return;
			}
			await openLabModal(ctx, "command-overlay", "overlay");
		},
	});

	pi.registerCommand("modal-lab-debug", {
		description: "Control modal lab debug logging: on | off | clear | tail | status",
		handler: async (args, ctx) => handleDebugCommand(args, ctx),
	});
}

function registerRawTerminalListener(ctx: ExtensionContext): void {
	terminalUnsubscribe?.();
	debugLog("raw.register", { build: BUILD_ID, targetShortcut: TARGET_SHORTCUT });
	terminalUnsubscribe = ctx.ui.onTerminalInput((data) => {
		const matchesTarget = matchesKey(data, TARGET_SHORTCUT);
		const matchesAlt = matchesKey(data, "ctrl+shift+o");
		debugLog("raw.input", {
			data: describeInput(data),
			matchesTarget,
			matchesAlt,
			rawOpenScheduled,
		});

		if (matchesTarget) {
			scheduleOpen(ctx, "raw-terminal-scheduled", "overlay");
			return { consume: true };
		}

		if (matchesAlt) {
			void openLabModal(ctx, "raw-terminal-direct", "overlay");
			return { consume: true };
		}

		return undefined;
	});
}

function scheduleOpen(ctx: ExtensionContext, source: OpenSource, mode: OpenMode): void {
	debugLog("schedule.request", { source, mode, rawOpenScheduled });
	if (rawOpenScheduled) {
		debugLog("schedule.skip", { source, reason: "already scheduled" });
		return;
	}
	rawOpenScheduled = true;
	setImmediate(() => {
		rawOpenScheduled = false;
		debugLog("schedule.fire", { source, mode });
		void openLabModal(ctx, source, mode);
	});
}

async function openLabModal(ctx: ExtensionContext, source: OpenSource, mode: OpenMode): Promise<void> {
	const id = ++openCounter;
	debugLog("open.start", { id, source, mode, hasUI: ctx.hasUI });
	if (!ctx.hasUI) {
		debugLog("open.noUI", { id, source });
		return;
	}

	let requestRender: ((force?: boolean) => void) | undefined;
	let overlay: LabModal | undefined;
	const startedAt = Date.now();
	const result = await ctx.ui.custom<LabResult>(
		(tui, theme, _keybindings, done) => {
			debugLog("custom.factory", { id, source, mode });
			requestRender = (force = false) => {
				debugLog("custom.requestRender", { id, source, force });
				tui.requestRender(force);
			};
			overlay = new LabModal({ id, source, mode, theme, done, requestRender });
			return overlay;
		},
		{
			overlay: mode === "overlay",
			overlayOptions:
				mode === "overlay"
					? {
							anchor: "center",
							width: 72,
							maxHeight: 16,
							margin: 1,
						}
					: undefined,
			onHandle: (handle) => {
				debugLog("custom.onHandle", { id, source, mode, isFocusedBefore: handle.isFocused() });
				handle.focus();
				debugLog("custom.onHandle.afterFocus", { id, source, mode, isFocusedAfter: handle.isFocused() });
				forceRenderBurst(id, source, requestRender);
			},
		},
	);

	debugLog("open.done", { id, source, mode, result, durationMs: Date.now() - startedAt, overlayRenderCount: overlay?.renderCount });
	ctx.ui.notify(`Modal lab ${result.kind}: ${source} inputs=${result.inputCount}`, result.kind === "ok" ? "success" : "info");
}

function forceRenderBurst(id: number, source: OpenSource, requestRender: ((force?: boolean) => void) | undefined): void {
	const kick = (phase: string) => {
		debugLog("renderKick", { id, source, phase });
		requestRender?.(true);
	};
	kick("immediate");
	process.nextTick(() => kick("nextTick"));
	setTimeout(() => kick("timeout0"), 0);
	setImmediate(() => kick("setImmediate"));
	setTimeout(() => kick("timeout25"), 25);
}

class LabModal implements Component {
	public renderCount = 0;
	private inputCount = 0;
	private lastInput = "none";
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(
		private readonly options: {
			id: number;
			source: OpenSource;
			mode: OpenMode;
			theme: Theme;
			done: (result: LabResult) => void;
			requestRender?: (force?: boolean) => void;
		},
	) {
		debugLog("modal.construct", { id: options.id, source: options.source, mode: options.mode });
	}

	handleInput(data: string): void {
		this.inputCount++;
		this.lastInput = JSON.stringify(data);
		debugLog("modal.handleInput", {
			id: this.options.id,
			source: this.options.source,
			data: describeInput(data),
			inputCount: this.inputCount,
		});

		if (matchesKey(data, Key.escape)) {
			this.options.done({ kind: "cancel", source: this.options.source, inputCount: this.inputCount });
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.options.done({ kind: "ok", source: this.options.source, inputCount: this.inputCount });
			return;
		}

		this.invalidate();
		this.options.requestRender?.();
	}

	render(width: number): string[] {
		this.renderCount++;
		if (this.cachedWidth === width && this.cachedLines) {
			debugLog("modal.render", { id: this.options.id, source: this.options.source, width, renderCount: this.renderCount, cached: true });
			return this.cachedLines;
		}

		debugLog("modal.render", { id: this.options.id, source: this.options.source, width, renderCount: this.renderCount, cached: false });
		const theme = this.options.theme;
		const modalWidth = Math.max(40, Math.min(width, 72));
		const inner = modalWidth - 4;
		const rows = [
			borderTop(modalWidth, "Modal Shortcut Lab", theme),
			row(`build: ${BUILD_ID}`, inner, theme),
			row(`id: ${this.options.id}  mode: ${this.options.mode}`, inner, theme),
			row(`source: ${this.options.source}`, inner, theme),
			row(`renders: ${this.renderCount}  inputs: ${this.inputCount}`, inner, theme),
			row(`last input: ${this.lastInput}`, inner, theme),
			row("", inner, theme),
			row("Enter = close OK    Esc = cancel", inner, theme),
			row("Type any key to force a component redraw.", inner, theme),
			borderBottom(modalWidth, theme),
		];
		this.cachedWidth = width;
		this.cachedLines = rows.map((line) => truncateToWidth(line, modalWidth, ""));
		debugLog("modal.render.done", {
			id: this.options.id,
			source: this.options.source,
			width,
			renderCount: this.renderCount,
			lineCount: this.cachedLines.length,
			firstLine: this.cachedLines[0],
		});
		return this.cachedLines;
	}

	invalidate(): void {
		debugLog("modal.invalidate", { id: this.options.id, source: this.options.source });
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

async function handleDebugCommand(args: string, ctx: ExtensionContext): Promise<void> {
	const command = args.trim().toLowerCase() || "status";
	if (command === "on" || command === "enable") {
		debugEnabled = true;
		debugLog("debug.enabled", { via: "command", build: BUILD_ID });
		ctx.ui.notify(`modal lab debug enabled: ${LOG_PATH}`, "info");
		return;
	}
	if (command === "off" || command === "disable") {
		debugLog("debug.disabled", { via: "command" });
		debugEnabled = false;
		ctx.ui.notify(`modal lab debug disabled: ${LOG_PATH}`, "info");
		return;
	}
	if (command === "clear") {
		fs.writeFileSync(LOG_PATH, "", "utf8");
		ctx.ui.notify(`modal lab debug log cleared: ${LOG_PATH}`, "info");
		return;
	}
	if (command === "tail") {
		ctx.ui.notify(readLogTail(), "info");
		return;
	}
	ctx.ui.notify(statusText(), "info");
}

function statusText(): string {
	return [`Modal Shortcut Lab`, `build: ${BUILD_ID}`, `debug: ${debugEnabled ? "on" : "off"}`, `log: ${LOG_PATH}`, `raw target: ${TARGET_SHORTCUT}`, `registered direct: ${ALT_SHORTCUT}`, `registered scheduled: ctrl+shift+alt+m`, `raw direct: ctrl+shift+o`].join("\n");
}

function debugLog(event: string, details: Record<string, unknown> = {}): void {
	if (!debugEnabled) return;
	try {
		fs.appendFileSync(LOG_PATH, `${JSON.stringify({ ts: new Date().toISOString(), event, ...details })}\n`, "utf8");
	} catch {
		// Debug logging must not change behavior under test.
	}
}

function readLogTail(): string {
	try {
		const content = fs.readFileSync(LOG_PATH, "utf8");
		const lines = content.trimEnd().split("\n").slice(-40);
		return lines.join("\n") || "modal lab log is empty";
	} catch (error) {
		return `Could not read ${LOG_PATH}: ${error instanceof Error ? error.message : String(error)}`;
	}
}

function describeInput(data: string): Record<string, unknown> {
	return {
		json: JSON.stringify(data),
		length: data.length,
		chars: [...data].map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`),
	};
}

function borderTop(width: number, title: string, theme: Theme): string {
	const label = ` ${title} `;
	const available = Math.max(0, width - visibleWidth(label) - 2);
	const left = Math.floor(available / 2);
	const right = available - left;
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", theme.bold(label)) + theme.fg("border", "─".repeat(right) + "╮");
}

function borderBottom(width: number, theme: Theme): string {
	return theme.fg("border", "╰" + "─".repeat(Math.max(0, width - 2)) + "╯");
}

function row(content: string, width: number, theme: Theme): string {
	const clipped = truncateToWidth(content, width, "…");
	const padded = clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
	return theme.fg("border", "│ ") + padded + theme.fg("border", " │");
}
