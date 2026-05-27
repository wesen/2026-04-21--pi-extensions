import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import { registerPiExtension, collectPaletteItems } from "../_shared/registry";
import { CommandPaletteOverlay, buildRootPaletteItems, type PaletteResult } from "../_shared/ui/command-palette";

const DEFAULT_SHORTCUT = "ctrl+shift+p";

let terminalShortcutUnsubscribe: (() => void) | undefined;
let paletteOpen = false;

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
		handler: async (ctx) => openPalette(ctx as ExtensionCommandContext),
	});

	// /palette command as alternative entry point
	pi.registerCommand("palette", {
		description: "Open the command palette",
		handler: async (_args, ctx) => openPalette(ctx),
	});
}

function registerTerminalShortcut(ctx: ExtensionContext): void {
	terminalShortcutUnsubscribe?.();
	terminalShortcutUnsubscribe = ctx.ui.onTerminalInput((data) => {
		if (!matchesKey(data, DEFAULT_SHORTCUT)) return undefined;
		void openPalette(ctx as ExtensionCommandContext);
		return { consume: true };
	});
}

async function openPalette(ctx: ExtensionCommandContext): Promise<void> {
	if (paletteOpen) return;
	paletteOpen = true;
	try {
		await openPaletteOnce(ctx);
	} finally {
		paletteOpen = false;
	}
}

async function openPaletteOnce(ctx: ExtensionCommandContext): Promise<void> {
	const paletteItems = collectPaletteItems();
	if (paletteItems.length === 0) {
		ctx.ui.notify("No extensions have registered palette items yet.", "warning");
		return;
	}

	const rootItems = buildRootPaletteItems(paletteItems);

	const result = await ctx.ui.custom<PaletteResult>(
		(tui, theme, _keybindings, done) =>
			new CommandPaletteOverlay(rootItems, {
				theme,
				done,
				requestRender: () => tui.requestRender(),
			}),
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
				handle.focus();
			},
		},
	);

	if (result.kind === "execute" && result.item.run) {
		await result.item.run(ctx, {
			extension: result.extension,
			path: result.path,
			close: () => {}, // palette already closed
		});
	}
}
