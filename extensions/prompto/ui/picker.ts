import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem, type TUI } from "@mariozechner/pi-tui";

import type { PromptTemplate } from "../types";

/** Filterable template chooser. Resolves undefined on cancel. */
export async function openPicker(ctx: ExtensionCommandContext, templates: PromptTemplate[]): Promise<PromptTemplate | undefined> {
	const byName = new Map(templates.map((t) => [t.name, t]));
	const items: SelectItem[] = templates.map((t) => ({
		value: t.name,
		label: t.name,
		description: t.title ?? t.description ?? (t.kind === "plain" ? "(plain prompt)" : ""),
	}));
	const picked = await ctx.ui.custom<string | undefined>(
		(tui: TUI, theme: Theme, _keybindings: unknown, done: (result: string | undefined) => void) => {
			const container = new Container();
			container.addChild(new Text(theme.fg("accent", theme.bold(" Prompto: choose a template")), 1, 0));
			const list = new SelectList(items, Math.min(items.length, 12), {
				selectedPrefix: (s: string) => theme.fg("accent", s),
				selectedText: (s: string) => theme.fg("accent", s),
				description: (s: string) => theme.fg("muted", s),
				scrollInfo: (s: string) => theme.fg("dim", s),
				noMatch: (s: string) => theme.fg("warning", s),
			});
			list.onSelect = (item: SelectItem) => done(item.value);
			list.onCancel = () => done(undefined);
			container.addChild(list);
			container.addChild(new Text(theme.fg("dim", " type to filter · ↑↓ navigate · enter select · esc cancel"), 1, 0));
			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					list.handleInput(data);
					tui.requestRender();
				},
			};
		},
		{ overlay: true, overlayOptions: { anchor: "center", width: 72, maxHeight: "70%", margin: 1 } },
	);
	return picked === undefined ? undefined : byName.get(picked);
}
