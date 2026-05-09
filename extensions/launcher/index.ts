import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { listPiExtensions, registerPiExtension } from "../_shared/registry";
import { ExtensionLauncher } from "../_shared/ui/extension-launcher";

const EXTENSION_ID = "launcher";

export default function launcherExtension(pi: ExtensionAPI): void {
	registerPiExtension({
		id: EXTENSION_ID,
		name: "Extension Launcher",
		description: "Common launcher for local Pi extensions. The first version fuzzy-searches registered extensions and prints the selected name.",
		commands: ["px"],
		tags: ["launcher", "shared", "ui"],
	});

	pi.registerCommand("px", {
		description: "Open the shared Pi extension launcher",
		handler: async (_args, ctx) => {
			const extensions = listPiExtensions();
			if (extensions.length === 0) {
				ctx.ui.notify("No extensions registered with the launcher yet.", "warning");
				return;
			}
			const selected = await ctx.ui.custom(
				(tui, theme, _keybindings, done) => new ExtensionLauncher({
					extensions,
					theme,
					done,
					requestRender: () => tui.requestRender(),
				}),
				{
					overlay: true,
					overlayOptions: { width: "85%", maxHeight: "80%", minWidth: 70, margin: 1 },
				},
			);
			if (!selected) return;
			ctx.ui.notify(`Selected extension: ${selected.name} (${selected.id})`, "info");
		},
	});
}
