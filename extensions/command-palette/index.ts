import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, type KeyId } from "@mariozechner/pi-tui";
import { registerPiExtension, collectPaletteItems } from "../_shared/registry";
import { CommandPaletteOverlay, buildRootPaletteItems, type PaletteResult } from "../_shared/ui/command-palette";

const DEFAULT_SHORTCUT = "ctrl+shift+alt+n";
const SHORTCUT_ENV = "PI_COMMAND_PALETTE_SHORTCUT";
const EXTRA_SHORTCUTS_ENV = "PI_COMMAND_PALETTE_EXTRA_SHORTCUTS";
const ACTIVE_SHORTCUTS = configuredShortcuts();
const DEBUG_LOG_PATH = path.join(os.tmpdir(), "pi-command-palette-debug.log");
const DEBUG_BUILD = "kitty-safe-shortcut-2026-05-28T13:20";

let terminalShortcutUnsubscribe: (() => void) | undefined;
let paletteOpen = false;
let paletteOpenScheduled = false;
let paletteInputReady = false;
let pendingOpeningInputs: string[] = [];
let debugEnabled = process.env.PI_COMMAND_PALETTE_DEBUG === "1";

export default function commandPaletteExtension(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "command-palette",
		name: "Command Palette",
		description: "Keyboard-driven hierarchical action menu for fast extension invocation.",
		commands: ["palette"],
		tags: ["palette", "launcher", "navigation"],
		run: async (ctx) => openPalette(ctx),
		actions: [
			{
				id: "open",
				title: "Open command palette",
				description: "Open the hierarchical command palette overlay.",
				default: true,
				run: async (ctx) => openPalette(ctx),
			},
		],
		docs: [
			{
				id: "overview",
				title: "Command Palette overview",
				markdown: [
					"# Command Palette",
					"",
					`Press \`${shortcutDisplay(ACTIVE_SHORTCUTS[0] ?? DEFAULT_SHORTCUT)}\` to open the palette.`,
					"",
					"The default avoids Kitty's built-in `Ctrl+Shift+P` key-chord prefix. Override it with `PI_COMMAND_PALETTE_SHORTCUT`, or add comma-separated extras with `PI_COMMAND_PALETTE_EXTRA_SHORTCUTS`.",
					"",
					"Each item shows a key hint. Press the key to drill into submenus or execute actions.",
					"",
					"- `Backspace` or `←` to go back one level.",
					"- `Esc` to close.",
					"- `/` to search within the current level.",
					"",
					"The palette is for fast invocation of known actions. Use `/px` for discovery.",
				].join("\n"),
			},
		],
		widgets: [],
	});

	// Raw terminal listener. This catches configured palette shortcuts before the
	// editor sees them, consumes the key, and avoids the "next key goes to the REPL"
	// race that can happen with editor-scoped extension shortcuts after focus-changing actions.
	pi.on("session_start", async (_event, ctx) => {
		registerTerminalShortcut(ctx);
	});
	pi.on("session_shutdown", async () => {
		terminalShortcutUnsubscribe?.();
		terminalShortcutUnsubscribe = undefined;
	});

	// Keep official extension shortcuts as a fallback for sessions where a raw
	// terminal listener has not been registered yet (for example immediately after
	// /reload before the next session_start lifecycle event).
	for (const shortcut of ACTIVE_SHORTCUTS) {
		pi.registerShortcut(shortcut, {
			description: `Open command palette (${shortcutDisplay(shortcut)})`,
			handler: async (ctx) => {
				debugLog("fallbackShortcut.handler", { paletteOpen, shortcut });
				await openPalette(ctx as ExtensionCommandContext, `registered-shortcut-fallback:${shortcut}`);
			},
		});
	}

	// /palette command as alternative entry point
	pi.registerCommand("palette", {
		description: "Open the command palette",
		handler: async (_args, ctx) => openPalette(ctx, "slash-command"),
	});

	pi.registerCommand("palette-debug", {
		description: "Debug command palette shortcut handling (args: on off status tail clear)",
		handler: async (args, ctx) => handlePaletteDebugCommand(args, ctx),
	});
}

function registerTerminalShortcut(ctx: ExtensionContext): void {
	terminalShortcutUnsubscribe?.();
	debugLog("terminalShortcut.register", { cwd: ctx.cwd, build: DEBUG_BUILD, shortcuts: ACTIVE_SHORTCUTS });
	terminalShortcutUnsubscribe = ctx.ui.onTerminalInput((data) => {
		const matchedShortcut = matchPaletteShortcut(data);
		debugLog("terminalInput", {
			data: describeInput(data),
			matchedShortcut,
			shortcuts: ACTIVE_SHORTCUTS,
			paletteOpen,
			paletteOpenScheduled,
			paletteInputReady,
		});
		if (matchedShortcut) {
			scheduleOpenPalette(ctx as ExtensionCommandContext, `raw-terminal-shortcut:${matchedShortcut}`);
			return { consume: true };
		}
		if (paletteOpenScheduled || (paletteOpen && !paletteInputReady)) {
			if (shouldReplayOpeningInput(data)) {
				pendingOpeningInputs.push(data);
				debugLog("terminalInput.bufferBeforeReady", { data: describeInput(data), pendingCount: pendingOpeningInputs.length, paletteOpenScheduled, paletteOpen, paletteInputReady });
			} else {
				debugLog("terminalInput.consumeBeforeReady", { data: describeInput(data), reason: "not replayable", paletteOpenScheduled, paletteOpen, paletteInputReady });
			}
			return { consume: true };
		}
		return undefined;
	});
}

function scheduleOpenPalette(ctx: ExtensionCommandContext, source: string): void {
	debugLog("scheduleOpenPalette.request", { source, paletteOpen, paletteOpenScheduled });
	if (paletteOpen || paletteOpenScheduled) {
		debugLog("scheduleOpenPalette.skip", { source, paletteOpen, paletteOpenScheduled });
		return;
	}
	pendingOpeningInputs = [];
	paletteOpenScheduled = true;
	setImmediate(() => {
		paletteOpenScheduled = false;
		debugLog("scheduleOpenPalette.fire", { source, paletteOpen });
		void openPalette(ctx, source);
	});
}

async function openPalette(ctx: ExtensionCommandContext, source = "unknown"): Promise<void> {
	debugLog("openPalette.request", { source, paletteOpen });
	if (paletteOpen) {
		debugLog("openPalette.skipAlreadyOpen", { source });
		return;
	}
	paletteOpen = true;
	paletteInputReady = false;
	try {
		await openPaletteOnce(ctx, source);
	} finally {
		paletteOpen = false;
		paletteInputReady = false;
		pendingOpeningInputs = [];
		debugLog("openPalette.done", { source });
	}
}

async function openPaletteOnce(ctx: ExtensionCommandContext, source: string): Promise<void> {
	debugLog("openPaletteOnce.start", { source, build: DEBUG_BUILD });
	const paletteItems = collectPaletteItems();
	if (paletteItems.length === 0) {
		ctx.ui.notify("No extensions have registered palette items yet.", "warning");
		return;
	}

	const rootItems = buildRootPaletteItems(paletteItems);
	debugLog("openPaletteOnce.items", {
		source,
		paletteItems: paletteItems.length,
		rootItems: rootItems.map((entry) => ({ key: entry.key, title: entry.item.title })),
	});

	let overlay: CommandPaletteOverlay | undefined;
	let requestRender: ((force?: boolean) => void) | undefined;
	const result = await ctx.ui.custom<PaletteResult>(
		(tui, theme, _keybindings, done) => {
			debugLog("custom.factory", { source });
			requestRender = (force = false) => tui.requestRender(force);
			overlay = new CommandPaletteOverlay(rootItems, {
				theme,
				done,
				requestRender,
				debug: (event, details) => debugLog(event, { source, ...details }),
			});
			return overlay;
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "90%",
				maxHeight: "50%",
				minWidth: 60,
				margin: 0,
			},
			onHandle: (handle) => {
				debugLog("custom.onHandle", { source, isFocusedBefore: handle.isFocused(), pendingOpeningInputs: pendingOpeningInputs.map(describeInput) });
				handle.focus();
				paletteInputReady = true;
				const buffered = pendingOpeningInputs.splice(0);
				debugLog("custom.onHandle.afterFocus", { source, isFocusedAfter: handle.isFocused(), replayCount: buffered.length });
				for (const data of buffered) {
					debugLog("custom.replayBufferedInput", { source, data: describeInput(data) });
					overlay?.handleInput?.(data);
				}
				forceRenderBurst(source, requestRender);
			},
		},
	);

	debugLog("custom.result", { source, resultKind: result.kind, itemId: result.kind === "execute" ? result.item.id : undefined });
	if (result.kind === "execute" && result.item.run) {
		debugLog("action.run.start", { source, extensionId: result.extension.id, itemId: result.item.id, path: result.path });
		await result.item.run(ctx, {
			extension: result.extension,
			path: result.path,
			close: () => {}, // palette already closed
		});
		debugLog("action.run.done", { source, extensionId: result.extension.id, itemId: result.item.id });
	}
}

async function handlePaletteDebugCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const command = args.trim().toLowerCase() || "status";
	if (command === "on" || command === "enable") {
		debugEnabled = true;
		debugLog("debug.enabled", { via: "command" });
		ctx.ui.notify(`command-palette debug logging enabled: ${DEBUG_LOG_PATH}`, "info");
		return;
	}
	if (command === "off" || command === "disable") {
		debugLog("debug.disabled", { via: "command" });
		debugEnabled = false;
		ctx.ui.notify(`command-palette debug logging disabled: ${DEBUG_LOG_PATH}`, "info");
		return;
	}
	if (command === "clear") {
		fs.writeFileSync(DEBUG_LOG_PATH, "", "utf8");
		ctx.ui.notify(`command-palette debug log cleared: ${DEBUG_LOG_PATH}`, "info");
		return;
	}
	if (command === "tail") {
		ctx.ui.notify(readDebugTail(), "info");
		return;
	}
	ctx.ui.notify(
		[
			`command-palette debug: ${debugEnabled ? "on" : "off"}`,
			`log: ${DEBUG_LOG_PATH}`,
			`shortcuts: ${ACTIVE_SHORTCUTS.map(shortcutDisplay).join(", ")}`,
			`override: ${SHORTCUT_ENV}=ctrl+space`,
			`extras: ${EXTRA_SHORTCUTS_ENV}=ctrl+space,ctrl+shift+alt+n`,
			"commands: /palette-debug on|off|status|tail|clear",
		].join("\n"),
		"info",
	);
}

function debugLog(event: string, details: Record<string, unknown> = {}): void {
	if (!debugEnabled) return;
	try {
		const line = JSON.stringify({ ts: new Date().toISOString(), event, ...details });
		fs.appendFileSync(DEBUG_LOG_PATH, `${line}\n`, "utf8");
	} catch {
		// Logging must never break palette behavior.
	}
}

function forceRenderBurst(source: string, requestRender: ((force?: boolean) => void) | undefined): void {
	const kick = (phase: string) => {
		debugLog("renderKick", { source, phase });
		requestRender?.(true);
	};
	kick("immediate");
	process.nextTick(() => kick("nextTick"));
	setImmediate(() => kick("setImmediate"));
	setTimeout(() => kick("timeout0"), 0);
	setTimeout(() => kick("timeout25"), 25);
}

function shouldReplayOpeningInput(data: string): boolean {
	// Replay literal printable keys typed immediately after the opening shortcut,
	// e.g. "r" in "<palette-shortcut> r". Do not replay kitty CSI-u release/alternate
	// events such as ESC[27u: matchesKey() may classify those as Escape and instantly
	// cancel the freshly mounted palette.
	if (data.length === 1 && data >= " " && data !== "\x7f") return true;
	if (data === "\x1b") return true;
	if (data === "\r" || data === "\n") return true;
	if (data === "\x7f" || data === "\b") return true;
	if (data === "\x1b[A" || data === "\x1b[B" || data === "\x1b[C" || data === "\x1b[D") return true;
	return false;
}

function configuredShortcuts(): KeyId[] {
	const primary = normalizeShortcut(process.env[SHORTCUT_ENV]) ?? DEFAULT_SHORTCUT;
	return uniqueShortcuts([primary, ...parseShortcutList(process.env[EXTRA_SHORTCUTS_ENV])]);
}

function parseShortcutList(value: string | undefined): KeyId[] {
	return (value ?? "")
		.split(/[\s,]+/)
		.map(normalizeShortcut)
		.filter((shortcut): shortcut is KeyId => Boolean(shortcut));
}

function normalizeShortcut(value: string | undefined): KeyId | undefined {
	const shortcut = value?.trim().toLowerCase();
	return shortcut ? (shortcut as KeyId) : undefined;
}

function uniqueShortcuts(shortcuts: KeyId[]): KeyId[] {
	const seen = new Set<string>();
	const result: KeyId[] = [];
	for (const shortcut of shortcuts) {
		if (seen.has(shortcut)) continue;
		seen.add(shortcut);
		result.push(shortcut);
	}
	return result;
}

function matchPaletteShortcut(data: string): KeyId | undefined {
	return ACTIVE_SHORTCUTS.find((shortcut) => matchesKey(data, shortcut));
}

function shortcutDisplay(shortcut: string): string {
	return shortcut
		.split("+")
		.map((part) => (part.length === 1 ? part.toUpperCase() : part[0]!.toUpperCase() + part.slice(1)))
		.join("+");
}

function readDebugTail(maxLines = 40): string {
	try {
		const content = fs.readFileSync(DEBUG_LOG_PATH, "utf8");
		const lines = content.trimEnd().split(/\r?\n/).slice(-maxLines);
		return [`command-palette debug log: ${DEBUG_LOG_PATH}`, "", ...lines].join("\n");
	} catch (error) {
		return `command-palette debug log unavailable: ${error instanceof Error ? error.message : String(error)}\npath: ${DEBUG_LOG_PATH}`;
	}
}

function describeInput(data: string): Record<string, unknown> {
	return {
		json: JSON.stringify(data),
		length: data.length,
		chars: [...data].map((char) => {
			const code = char.codePointAt(0) ?? 0;
			return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
		}),
	};
}
