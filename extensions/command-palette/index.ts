import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import { registerPiExtension, collectPaletteItems } from "../_shared/registry";
import { CommandPaletteOverlay, buildRootPaletteItems, type PaletteResult } from "../_shared/ui/command-palette";

const DEFAULT_SHORTCUT = "ctrl+shift+p";
const DEBUG_LOG_PATH = path.join(os.tmpdir(), "pi-command-palette-debug.log");

let terminalShortcutUnsubscribe: (() => void) | undefined;
let paletteOpen = false;
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
					"Press `Ctrl+Shift+P` to open the palette.",
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

	// Raw terminal listener. This catches Ctrl+Shift+P before the editor sees it,
	// consumes the key, and avoids the "next key goes to the REPL" race that can
	// happen with editor-scoped extension shortcuts after focus-changing actions.
	pi.on("session_start", async (_event, ctx) => {
		registerTerminalShortcut(ctx);
	});
	pi.on("session_shutdown", async () => {
		terminalShortcutUnsubscribe?.();
		terminalShortcutUnsubscribe = undefined;
	});

	// Keep the official extension shortcut as a fallback for sessions where a raw
	// terminal listener has not been registered yet (for example immediately after
	// /reload before the next session_start lifecycle event).
	pi.registerShortcut(DEFAULT_SHORTCUT, {
		description: "Open command palette",
		handler: async (ctx) => {
			debugLog("fallbackShortcut.handler", { paletteOpen });
			await openPalette(ctx as ExtensionCommandContext, "registered-shortcut-fallback");
		},
	});

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
	debugLog("terminalShortcut.register", { cwd: ctx.cwd });
	terminalShortcutUnsubscribe = ctx.ui.onTerminalInput((data) => {
		const matched = matchesKey(data, DEFAULT_SHORTCUT);
		debugLog("terminalInput", {
			data: describeInput(data),
			matchesDefaultShortcut: matched,
			paletteOpen,
			paletteInputReady,
		});
		if (matched) {
			void openPalette(ctx as ExtensionCommandContext, "raw-terminal-shortcut");
			return { consume: true };
		}
		if (paletteOpen && !paletteInputReady) {
			if (shouldReplayOpeningInput(data)) {
				pendingOpeningInputs.push(data);
				debugLog("terminalInput.bufferWhileOpening", { data: describeInput(data), pendingCount: pendingOpeningInputs.length });
			} else {
				debugLog("terminalInput.consumeWhileOpening", { data: describeInput(data), reason: "not replayable" });
			}
			return { consume: true };
		}
		return undefined;
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
	pendingOpeningInputs = [];
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
	debugLog("openPaletteOnce.start", { source });
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
	let requestRender: (() => void) | undefined;
	const result = await ctx.ui.custom<PaletteResult>(
		(tui, theme, _keybindings, done) => {
			debugLog("custom.factory", { source });
			requestRender = () => tui.requestRender();
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
				requestRender?.();
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
	ctx.ui.notify(`command-palette debug: ${debugEnabled ? "on" : "off"}\nlog: ${DEBUG_LOG_PATH}\ncommands: /palette-debug on|off|status|tail|clear`, "info");
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

function shouldReplayOpeningInput(data: string): boolean {
	if (data.length === 1 && data >= " " && data !== "\x7f") return true;
	if (matchesKey(data, Key.escape)) return true;
	if (matchesKey(data, Key.enter)) return true;
	if (matchesKey(data, Key.backspace)) return true;
	if (matchesKey(data, Key.left)) return true;
	if (matchesKey(data, Key.right)) return true;
	if (matchesKey(data, Key.up)) return true;
	if (matchesKey(data, Key.down)) return true;
	return false;
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
