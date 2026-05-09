import type { ExtensionAPI, ReadonlyFooterDataProvider, Theme } from "@mariozechner/pi-coding-agent";
import { CustomEditor, DynamicBorder, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import {
	Box,
	Container,
	Key,
	Markdown,
	SelectList,
	SettingsList,
	Spacer,
	Text,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type Component,
	type Focusable,
	type SelectItem,
	type SettingItem,
	type TUI,
} from "@mariozechner/pi-tui";
import { Type } from "typebox";

const EXT_KEY = "tui-showcase";
const RESET = "\x1b[0m";

type PaletteName = "aurora" | "sunset" | "ocean" | "candy" | "matrix";
type ShowcaseTab = "Palette" | "Components" | "Form" | "Dashboard" | "Markdown" | "Help";

interface Palette {
	name: PaletteName;
	label: string;
	description: string;
	colors: number[];
}

const PALETTES: Palette[] = [
	{ name: "aurora", label: "Aurora", description: "cool greens, violet, polar cyan", colors: [45, 51, 87, 141, 213] },
	{ name: "sunset", label: "Sunset", description: "warm orange, rose, berry, gold", colors: [214, 208, 203, 199, 220] },
	{ name: "ocean", label: "Ocean", description: "deep blue, teal, foam, ice", colors: [27, 33, 39, 81, 123] },
	{ name: "candy", label: "Candy", description: "pink, grape, mint, lemon", colors: [198, 207, 219, 121, 229] },
	{ name: "matrix", label: "Matrix", description: "terminal greens with phosphor glow", colors: [22, 28, 34, 40, 118] },
];

const TABS: ShowcaseTab[] = ["Palette", "Components", "Form", "Dashboard", "Markdown", "Help"];

function ansiFg(code: number, text: string): string {
	return `\x1b[38;5;${code}m${text}${RESET}`;
}

function ansiBg(code: number, text: string): string {
	return `\x1b[48;5;${code}m${text}${RESET}`;
}

function style256(fg: number, text: string, bg?: number): string {
	const bgPart = bg === undefined ? "" : `\x1b[48;5;${bg}m`;
	return `\x1b[38;5;${fg}m${bgPart}${text}${RESET}`;
}

function padRight(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function centerText(text: string, width: number): string {
	const left = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
	return " ".repeat(left) + text;
}

function paletteByName(name: PaletteName): Palette {
	return PALETTES.find((p) => p.name === name) ?? PALETTES[0]!;
}

function gradient(text: string, palette: Palette): string {
	let out = "";
	const chars = [...text];
	for (let i = 0; i < chars.length; i++) {
		const code = palette.colors[i % palette.colors.length]!;
		out += ansiFg(code, chars[i]!);
	}
	return out;
}

function swatch(palette: Palette, width = 18): string {
	const cells = Math.max(1, Math.floor(width / palette.colors.length));
	return palette.colors.map((c) => ansiBg(c, " ".repeat(cells))).join("");
}

function progressBar(value: number, width: number, palette: Palette): string {
	const clamped = Math.max(0, Math.min(1, value));
	const full = Math.round(width * clamped);
	let out = "";
	for (let i = 0; i < width; i++) {
		if (i < full) out += ansiFg(palette.colors[i % palette.colors.length]!, "█");
		else out += "░";
	}
	return out;
}

function sparkline(values: number[], palette: Palette): string {
	const chars = "▁▂▃▄▅▆▇█";
	return values
		.map((v, i) => {
			const idx = Math.max(0, Math.min(chars.length - 1, Math.round(v * (chars.length - 1))));
			return ansiFg(palette.colors[i % palette.colors.length]!, chars[idx]!);
		})
		.join("");
}

function frame(width: number, title: string, theme: Theme, palette: Palette): { top: string; mid: (s: string) => string; sep: string; bot: string } {
	const safeWidth = Math.max(20, width);
	const borderColor = palette.colors[1]!;
	const topTitle = ` ${title} `;
	const lineLen = Math.max(0, safeWidth - 2 - visibleWidth(topTitle));
	const leftLen = Math.floor(lineLen / 2);
	const rightLen = lineLen - leftLen;
	const top = ansiFg(borderColor, "╭" + "─".repeat(leftLen)) + gradient(topTitle, palette) + ansiFg(borderColor, "─".repeat(rightLen) + "╮");
	const sep = ansiFg(borderColor, "├" + "─".repeat(safeWidth - 2) + "┤");
	const bot = ansiFg(borderColor, "╰" + "─".repeat(safeWidth - 2) + "╯");
	const mid = (content: string) => {
		const inner = safeWidth - 4;
		return ansiFg(borderColor, "│ ") + padRight(truncateToWidth(content, inner, "…"), inner) + ansiFg(borderColor, " │");
	};
	return { top: truncateToWidth(top, safeWidth), mid, sep, bot };
}

class TuiShowcaseOverlay implements Component, Focusable {
	focused = false;
	private tabIndex = 0;
	private paletteIndex = 0;
	private selected = 0;
	private formName = "Pi Intern";
	private toggles = { glow: true, compact: false, motion: true };
	private slider = 0.66;
	private tick = 0;
	private timer: ReturnType<typeof setInterval>;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private done: (result: string | null) => void,
	) {
		this.timer = setInterval(() => {
			this.tick++;
			this.tui.requestRender();
		}, 350);
	}

	dispose(): void {
		clearInterval(this.timer);
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(null);
			return;
		}
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
			if (this.currentTab() === "Form" && matchesKey(data, Key.right)) {
				this.slider = Math.min(1, this.slider + 0.05);
			} else {
				this.tabIndex = (this.tabIndex + 1) % TABS.length;
				this.selected = 0;
			}
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
			if (this.currentTab() === "Form" && matchesKey(data, Key.left)) {
				this.slider = Math.max(0, this.slider - 0.05);
			} else {
				this.tabIndex = (this.tabIndex - 1 + TABS.length) % TABS.length;
				this.selected = 0;
			}
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.selected = Math.max(0, this.selected - 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.selected = Math.min(8, this.selected + 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.handleEnter();
			return;
		}
		if (this.currentTab() === "Form") {
			if (matchesKey(data, Key.backspace)) {
				this.formName = this.formName.slice(0, -1);
				this.tui.requestRender();
				return;
			}
			if (data.length === 1 && data.charCodeAt(0) >= 32) {
				this.formName += data;
				this.tui.requestRender();
			}
		}
	}

	private currentTab(): ShowcaseTab {
		return TABS[this.tabIndex]!;
	}

	private palette(): Palette {
		return PALETTES[this.paletteIndex]!;
	}

	private handleEnter(): void {
		const tab = this.currentTab();
		if (tab === "Palette") {
			this.paletteIndex = this.selected % PALETTES.length;
		} else if (tab === "Form") {
			if (this.selected === 0) this.toggles.glow = !this.toggles.glow;
			if (this.selected === 1) this.toggles.compact = !this.toggles.compact;
			if (this.selected === 2) this.toggles.motion = !this.toggles.motion;
			if (this.selected >= 3) this.done(`Submitted demo form for ${this.formName}`);
		} else if (tab === "Help") {
			this.done("Use /tui-demo chrome, /tui-demo message, and the tui_demo_card tool for more demos.");
		}
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const w = Math.max(44, Math.min(width, 110));
		const palette = this.palette();
		const f = frame(w, "Pi TUI Showcase", this.theme, palette);
		const lines: string[] = [f.top];
		lines.push(f.mid(centerText(gradient("beautiful terminal interfaces for pi extensions", palette), w - 4)));
		lines.push(f.sep);
		lines.push(f.mid(this.renderTabs(w - 4, palette)));
		lines.push(f.sep);
		for (const line of this.renderBody(w - 4, palette)) lines.push(f.mid(line));
		lines.push(f.sep);
		lines.push(f.mid(this.theme.fg("dim", "tab/←→ switch tabs • ↑↓ navigate • enter act • esc close")));
		lines.push(f.bot);
		return lines.map((line) => truncateToWidth(line, w, ""));
	}

	private renderTabs(width: number, palette: Palette): string {
		const parts = TABS.map((tab, i) => {
			const text = ` ${tab} `;
			return i === this.tabIndex ? style256(16, text, palette.colors[i % palette.colors.length]) : this.theme.fg("dim", text);
		});
		return truncateToWidth(parts.join(" "), width, "…");
	}

	private renderBody(width: number, palette: Palette): string[] {
		switch (this.currentTab()) {
			case "Palette":
				return this.renderPalette(width, palette);
			case "Components":
				return this.renderComponents(width, palette);
			case "Form":
				return this.renderForm(width, palette);
			case "Dashboard":
				return this.renderDashboard(width, palette);
			case "Markdown":
				return this.renderMarkdownPreview(width, palette);
			case "Help":
				return this.renderHelp(width, palette);
		}
	}

	private renderPalette(_width: number, active: Palette): string[] {
		const lines = [
			`${this.theme.fg("accent", "Color palette lab")} ${this.theme.fg("dim", "— raw ANSI 256-color swatches can complement pi themes")}`,
			"",
		];
		for (let i = 0; i < PALETTES.length; i++) {
			const p = PALETTES[i]!;
			const marker = i === this.paletteIndex ? gradient("▶", p) : " ";
			const cursor = i === this.selected ? this.theme.fg("accent", "◆") : " ";
			lines.push(`${cursor} ${marker} ${padRight(p.label, 9)} ${swatch(p, 20)}  ${this.theme.fg("dim", p.description)}`);
		}
		lines.push("");
		lines.push(`${this.theme.fg("muted", "Active gradient:")} ${gradient("▰ ▰ ▰ Pi can feel like a product, not just logs ▰ ▰ ▰", active)}`);
		lines.push(`${this.theme.fg("dim", "Move with ↑↓ and press enter to apply a palette inside this overlay.")}`);
		return lines;
	}

	private renderComponents(width: number, palette: Palette): string[] {
		const values = [0.22, 0.48, 0.76, 0.91];
		return [
			`${this.theme.fg("accent", "Composable terminal widgets")}: cards, badges, keycaps, meters, lists, tables`,
			"",
			`${style256(16, " READY ", palette.colors[2])} ${style256(16, " STREAMING ", palette.colors[3])} ${style256(16, " ESC TO CANCEL ", palette.colors[4])}  ${this.theme.fg("dim", "status badges")}`,
			"",
			`${padRight("Context", 14)} ${progressBar(values[0]!, 24, palette)} ${Math.round(values[0]! * 100)}%`,
			`${padRight("Tools", 14)} ${progressBar(values[1]!, 24, palette)} ${Math.round(values[1]! * 100)}%`,
			`${padRight("Confidence", 14)} ${progressBar(values[2]!, 24, palette)} ${Math.round(values[2]! * 100)}%`,
			`${padRight("Delight", 14)} ${progressBar(values[3]!, 24, palette)} ${Math.round(values[3]! * 100)}%`,
			"",
			truncateToWidth(`${this.theme.fg("muted", "Table:")}  ${padRight("API", 22)} ${padRight("Best use", 28)} Risk`, width),
			truncateToWidth(`        ${padRight("ctx.ui.custom", 22)} ${padRight("modal overlays", 28)} medium`, width),
			truncateToWidth(`        ${padRight("setWidget", 22)} ${padRight("ambient state", 28)} low`, width),
			truncateToWidth(`        ${padRight("setEditorComponent", 22)} ${padRight("input redesign", 28)} high`, width),
		];
	}

	private renderForm(_width: number, palette: Palette): string[] {
		const check = (on: boolean) => (on ? this.theme.fg("success", "■") : this.theme.fg("dim", "□"));
		const cursor = (i: number) => (this.selected === i ? gradient("▶", palette) : " ");
		return [
			`${this.theme.fg("accent", "Fake form / settings surface")} ${this.theme.fg("dim", "— type to edit the name, enter toggles rows")}`,
			"",
			`${cursor(0)} ${check(this.toggles.glow)} Glow accents`,
			`${cursor(1)} ${check(this.toggles.compact)} Compact density`,
			`${cursor(2)} ${check(this.toggles.motion)} Animated surfaces`,
			"",
			`${this.theme.fg("muted", "Name:")} ${style256(palette.colors[3]!, this.formName || "(empty)")}`,
			`${this.theme.fg("muted", "Intensity:")} ${progressBar(this.slider, 30, palette)} ${Math.round(this.slider * 100)}%`,
			"",
			`${cursor(3)} ${style256(16, " Submit demo form ", palette.colors[2])}`,
			`${this.theme.fg("dim", "Use ←/→ to adjust slider. Printable keys append to the name.")}`,
		];
	}

	private renderDashboard(width: number, palette: Palette): string[] {
		const vals = Array.from({ length: 36 }, (_, i) => (Math.sin((this.tick + i) / 3) + 1) / 2);
		return [
			`${this.theme.fg("accent", "Live dashboard surface")} ${this.theme.fg("dim", "— timers can animate, but must be disposed")}`,
			"",
			`${padRight("Agent loop", 16)} ${sparkline(vals, palette)}`,
			`${padRight("Tool latency", 16)} ${sparkline(vals.slice().reverse(), palette)}`,
			"",
			`${style256(16, " 4 tools active ", palette.colors[0])}  ${style256(16, " 2 overlays ", palette.colors[1])}  ${style256(16, " 1 widget ", palette.colors[2])}`,
			"",
			truncateToWidth(`${this.theme.fg("muted", "Pattern:")} overlay for focus + widget/status for background discoverability`, width),
			truncateToWidth(`${this.theme.fg("muted", "Rule:")} never do I/O in render(); update state elsewhere and requestRender()`, width),
		];
	}

	private renderMarkdownPreview(width: number, palette: Palette): string[] {
		return [
			`${this.theme.fg("accent", "Markdown, syntax, and rich result cards")}`,
			"",
			truncateToWidth(`${gradient("#", palette)} Heading  ${this.theme.fg("dim", "render with Markdown for real docs/results")}`, width),
			truncateToWidth(`${gradient("-", palette)} ${this.theme.fg("muted", "Use Markdown for long-form readable tool output")}`, width),
			truncateToWidth(`${gradient("-", palette)} ${this.theme.fg("muted", "Use Box/Text for precise cards and status surfaces")}`, width),
			"",
			`${this.theme.fg("dim", "Example code card:")}`,
			style256(palette.colors[3]!, "const handle = await ctx.ui.custom(factory, { overlay: true });"),
			"",
			`${this.theme.fg("dim", "This extension also registers a custom message renderer and custom tool renderer.")}`,
		];
	}

	private renderHelp(width: number, palette: Palette): string[] {
		const rows = [
			["/tui-demo", "open this overlay"],
			["/tui-demo chrome", "toggle header/footer/widgets/editor skin"],
			["/tui-demo palette", "choose palette with SelectList"],
			["/tui-demo settings", "open SettingsList demo"],
			["/tui-demo message", "send a custom rendered message"],
			["tui_demo_card tool", "custom tool call/result renderer"],
		];
		return [
			`${this.theme.fg("accent", "Grab bag map")}`,
			"",
			...rows.map(([cmd, desc], i) => truncateToWidth(`${ansiFg(palette.colors[i % palette.colors.length]!, padRight(cmd!, 24))} ${desc}`, width)),
			"",
			`${this.theme.fg("dim", "Press enter here to close with an implementation hint.")}`,
		];
	}
}

class PulseWidget implements Component {
	private tick = 0;
	private timer: ReturnType<typeof setInterval>;

	constructor(private tui: TUI, private theme: Theme, private palette: Palette) {
		this.timer = setInterval(() => {
			this.tick++;
			this.tui.requestRender();
		}, 500);
	}

	dispose(): void {
		clearInterval(this.timer);
	}

	invalidate(): void {}

	render(width: number): string[] {
		const vals = Array.from({ length: Math.min(30, Math.max(8, width - 42)) }, (_, i) => (Math.sin((this.tick + i) / 2) + 1) / 2);
		const line = ` ${gradient("TUI", this.palette)} ${this.theme.fg("dim", "widget pulse")} ${sparkline(vals, this.palette)} ${this.theme.fg("muted", "ambient extension state")}`;
		return [truncateToWidth(line, width, "…")];
	}
}

class TuiDemoEditor extends CustomEditor {
	render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) return lines;
		const label = style256(16, " TUI DEMO ", 81);
		const last = lines.length - 1;
		lines[last] = truncateToWidth(lines[last]!, Math.max(0, width - visibleWidth(label)), "") + label;
		return lines;
	}
}

function makeFooter(ctx: any, paletteName: PaletteName) {
	return (tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider): Component & { dispose?(): void } => {
		const palette = paletteByName(paletteName);
		const unsub = footerData.onBranchChange(() => tui.requestRender());
		return {
			dispose: unsub,
			invalidate() {},
			render(width: number): string[] {
				const branch = footerData.getGitBranch();
				const statuses = [...footerData.getExtensionStatuses().values()].filter(Boolean).length;
				const left = `${gradient("Pi TUI Showcase", palette)} ${theme.fg("dim", "chrome on")}`;
				const right = theme.fg("dim", `${ctx.model?.id ?? "no-model"}${branch ? ` · ${branch}` : ""} · ${statuses} statuses`);
				const gap = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
				return [truncateToWidth(left + gap + right, width, "")];
			},
		};
	};
}

function makeHeader(paletteName: PaletteName) {
	return (_tui: TUI, theme: Theme): Component => {
		const palette = paletteByName(paletteName);
		return {
			invalidate() {},
			render(width: number): string[] {
				const title = gradient("✦ Pi TUI Showcase Header ✦", palette);
				const subtitle = theme.fg("dim", "header + footer + widgets + editor skin + overlays + custom renderers");
				return [truncateToWidth(` ${title}`, width, ""), truncateToWidth(` ${swatch(palette, 24)}  ${subtitle}`, width, "…")];
			},
		};
	};
}

function makeCardComponent(theme: Theme, title: string, body: string, paletteName: PaletteName): Component {
	const palette = paletteByName(paletteName);
	const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
	box.addChild(new Text(`${gradient(title, palette)}\n${theme.fg("muted", body)}\n${swatch(palette, 30)}`, 0, 0));
	return box;
}

async function showPalettePicker(ctx: any, current: PaletteName): Promise<PaletteName | null> {
	const items: SelectItem[] = PALETTES.map((p) => ({
		value: p.name,
		label: p.label + (p.name === current ? " (active)" : ""),
		description: p.description,
	}));
	return ctx.ui.custom<PaletteName | null>((tui: TUI, theme: Theme, _kb: unknown, done: (result: PaletteName | null) => void) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold("Choose demo palette")), 1, 0));
		const list = new SelectList(items, items.length, {
			selectedPrefix: (s) => theme.fg("accent", s),
			selectedText: (s) => theme.fg("accent", s),
			description: (s) => theme.fg("muted", s),
			scrollInfo: (s) => theme.fg("dim", s),
			noMatch: (s) => theme.fg("warning", s),
		});
		list.onSelect = (item) => done(item.value as PaletteName);
		list.onCancel = () => done(null);
		container.addChild(list);
		container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		return {
			render: (width) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				list.handleInput(data);
				tui.requestRender();
			},
		};
	}, { overlay: true, overlayOptions: { width: 68, anchor: "center", margin: 1 } });
}

async function showSettingsDemo(ctx: any): Promise<void> {
	const items: SettingItem[] = [
		{ id: "overlays", label: "Overlay-first workflows", currentValue: "on", values: ["on", "off"] },
		{ id: "widgets", label: "Ambient widgets", currentValue: "on", values: ["on", "off"] },
		{ id: "editor", label: "Custom editor chrome", currentValue: "careful", values: ["careful", "off", "wild"] },
		{ id: "motion", label: "Subtle animation", currentValue: "on", values: ["on", "reduced", "off"] },
	];
	await ctx.ui.custom<void>((_tui: TUI, theme: Theme, _kb: unknown, done: () => void) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold("SettingsList demo")), 1, 0));
		const list = new SettingsList(
			items,
			8,
			{
				label: (s, selected) => (selected ? theme.fg("accent", s) : theme.fg("text", s)),
				value: (s, selected) => (selected ? theme.fg("accent", s) : theme.fg("muted", s)),
				description: (s) => theme.fg("dim", s),
				cursor: theme.fg("accent", "▶ "),
				hint: (s) => theme.fg("dim", s),
			},
			(id, value) => ctx.ui.notify(`${id} = ${value}`, "info"),
			() => done(),
			{ enableSearch: true },
		);
		container.addChild(list);
		container.addChild(new Text(theme.fg("dim", "↑↓ move • ←→ change • / search • esc close"), 1, 0));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		return {
			render: (width) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data) => list.handleInput?.(data),
		};
	}, { overlay: true, overlayOptions: { width: 76, anchor: "center", margin: 1 } });
}

export default function tuiShowcase(pi: ExtensionAPI): void {
	let chromeEnabled = false;
	let paletteName: PaletteName = "aurora";

	function clearChrome(ctx: any): void {
		ctx.ui.setStatus(EXT_KEY, undefined);
		ctx.ui.setWidget(`${EXT_KEY}:above`, undefined);
		ctx.ui.setWidget(`${EXT_KEY}:below`, undefined);
		ctx.ui.setFooter(undefined);
		ctx.ui.setHeader(undefined);
		ctx.ui.setEditorComponent(undefined);
		ctx.ui.setWorkingMessage();
	}

	function installChrome(ctx: any): void {
		const palette = paletteByName(paletteName);
		ctx.ui.setStatus(EXT_KEY, `${gradient("TUI", palette)} ${ctx.ui.theme.fg("dim", palette.label)}`);
		ctx.ui.setHeader(makeHeader(paletteName));
		ctx.ui.setFooter(makeFooter(ctx, paletteName));
		ctx.ui.setWidget(`${EXT_KEY}:above`, (tui: TUI, theme: Theme) => new PulseWidget(tui, theme, palette), { placement: "aboveEditor" });
		ctx.ui.setWidget(
			`${EXT_KEY}:below`,
			[
				`${ansiFg(palette.colors[0]!, "◆")} ${ctx.ui.theme.fg("dim", "below-editor widget:")} overlays for focus, widgets for persistent state, renderers for history`,
			],
			{ placement: "belowEditor" },
		);
		ctx.ui.setEditorComponent((tui: TUI, theme: any, kb: any) => new TuiDemoEditor(tui, theme, kb));
	}

	pi.on("session_start", async (_event, ctx) => {
		if (chromeEnabled && ctx.hasUI) installChrome(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) clearChrome(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		if (chromeEnabled && ctx.hasUI) ctx.ui.setWorkingMessage(`${paletteByName(paletteName).label} UI demo is watching the agent work…`);
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (chromeEnabled && ctx.hasUI) ctx.ui.setWorkingMessage();
	});

	pi.registerMessageRenderer("tui-showcase-card", (message, { expanded }, theme) => {
		const details = message.details as { palette?: PaletteName; title?: string } | undefined;
		const title = details?.title ?? "TUI Showcase Message";
		let body = String(message.content ?? "Custom rendered messages can become durable session cards.");
		if (expanded) body += "\nExpanded mode can show timestamps, metadata, diffs, or detailed diagnostics.";
		return makeCardComponent(theme, title, body, details?.palette ?? paletteName);
	});

	pi.registerTool({
		name: "tui_demo_card",
		label: "TUI Demo Card",
		description: "Demonstrate rich custom tool call and result rendering for pi TUI extensions.",
		parameters: Type.Object({
			title: Type.Optional(Type.String({ description: "Card title" })),
			body: Type.Optional(Type.String({ description: "Card body" })),
			palette: Type.Optional(Type.String({ description: "Palette name: aurora, sunset, ocean, candy, matrix" })),
		}),
		async execute(_toolCallId, params) {
			const selected = PALETTES.some((p) => p.name === params.palette) ? (params.palette as PaletteName) : paletteName;
			return {
				content: [{ type: "text", text: `${params.title ?? "TUI card"}: ${params.body ?? "Rendered as a beautiful card."}` }],
				details: {
					title: params.title ?? "TUI Tool Result",
					body: params.body ?? "Custom tool renderers can make agent actions much easier to scan.",
					palette: selected,
				},
			};
		},
		renderCall(args, theme) {
			const selected = PALETTES.some((p) => p.name === args.palette) ? (args.palette as PaletteName) : paletteName;
			return new Text(`${gradient("tui_demo_card", paletteByName(selected))} ${theme.fg("dim", args.title ?? "demo")}`, 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as { title?: string; body?: string; palette?: PaletteName } | undefined;
			const palette = details?.palette ?? paletteName;
			const body = expanded
				? `${details?.body ?? "Rendered result"}\n\nExpanded: add logs, metrics, traces, or follow-up actions here.`
				: (details?.body ?? "Rendered result");
			return makeCardComponent(theme, details?.title ?? "TUI Tool Result", body, palette);
		},
	});

	pi.registerCommand("tui-demo", {
		description: "Open the TUI showcase. Args: chrome, reset, palette, settings, message, markdown",
		handler: async (args, ctx) => {
			const arg = args.trim();
			if (!ctx.hasUI) {
				ctx.ui.notify("tui-demo needs interactive UI mode", "warning");
				return;
			}

			if (arg === "reset" || arg === "off") {
				chromeEnabled = false;
				clearChrome(ctx);
				ctx.ui.notify("TUI showcase chrome cleared", "info");
				return;
			}

			if (arg === "chrome" || arg === "on") {
				chromeEnabled = !chromeEnabled;
				if (chromeEnabled) {
					installChrome(ctx);
					ctx.ui.notify("TUI showcase chrome enabled. Run /tui-demo reset to restore defaults.", "info");
				} else {
					clearChrome(ctx);
					ctx.ui.notify("TUI showcase chrome disabled", "info");
				}
				return;
			}

			if (arg === "palette") {
				const next = await showPalettePicker(ctx, paletteName);
				if (next) {
					paletteName = next;
					if (chromeEnabled) installChrome(ctx);
					ctx.ui.notify(`Palette: ${paletteByName(paletteName).label}`, "info");
				}
				return;
			}

			if (arg === "settings") {
				await showSettingsDemo(ctx);
				return;
			}

			if (arg === "message") {
				pi.sendMessage({
					customType: "tui-showcase-card",
					content: "This is a durable custom-rendered session message. Toggle tool/message expansion to see more.",
					display: true,
					details: { palette: paletteName, title: "Beautiful Custom Message" },
				});
				return;
			}

			if (arg === "markdown") {
				await ctx.ui.custom<void>((_tui: TUI, theme: Theme, _kb: unknown, done: () => void) => {
					const md = new Markdown(
						"# Markdown component demo\n\nUse `Markdown` when the output is document-shaped.\n\n- Headings\n- Lists\n- **Emphasis**\n- `code`\n\n```ts\nctx.ui.custom((tui, theme, kb, done) => new MyOverlay(tui, theme, done), { overlay: true });\n```",
						1,
						1,
						getMarkdownTheme(),
					);
					return {
						render: (width) => md.render(width),
						invalidate: () => md.invalidate(),
						handleInput: (data) => {
							if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) done();
						},
					};
				}, { overlay: true, overlayOptions: { width: "70%", maxHeight: "80%", anchor: "center", margin: 1 } });
				return;
			}

			const result = await ctx.ui.custom<string | null>(
				(tui, theme, _kb, done) => new TuiShowcaseOverlay(tui, theme, done),
				{ overlay: true, overlayOptions: { width: "86%", maxHeight: "88%", anchor: "center", margin: 1 } },
			);
			if (result) ctx.ui.notify(result, "info");
		},
	});
}
