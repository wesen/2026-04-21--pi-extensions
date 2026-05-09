import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@mariozechner/pi-tui";
import type { PiExtensionRegistration } from "../registry";

export type ExtensionLauncherResult =
	| { kind: "select"; extension: PiExtensionRegistration }
	| { kind: "actions"; extension: PiExtensionRegistration }
	| { kind: "docs"; extension: PiExtensionRegistration }
	| { kind: "settings"; extension: PiExtensionRegistration }
	| { kind: "dashboard" }
	| { kind: "cancel" };

export interface ExtensionLauncherOptions {
	extensions: PiExtensionRegistration[];
	theme: {
		fg(color: string, text: string): string;
		bold(text: string): string;
	};
	done(result: ExtensionLauncherResult): void;
	requestRender?: () => void;
}

interface ScoredExtension {
	extension: PiExtensionRegistration;
	score: number;
}

interface GroupedExtensions {
	name: string;
	extensions: PiExtensionRegistration[];
}

interface ListRenderRow {
	text: string;
	extensionIndex?: number;
}

const GROUP_ORDER = ["Compaction", "Skills", "Docs", "Environment", "Session", "Demos", "Launcher", "Other"];

export class ExtensionLauncher implements Component {
	private readonly extensions: PiExtensionRegistration[];
	private readonly theme: ExtensionLauncherOptions["theme"];
	private readonly done: (result: ExtensionLauncherResult) => void;
	private readonly requestRender: (() => void) | undefined;
	private query = "";
	private cursor = 0;
	private scroll = 0;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(options: ExtensionLauncherOptions) {
		this.extensions = options.extensions;
		this.theme = options.theme;
		this.done = options.done;
		this.requestRender = options.requestRender;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done({ kind: "cancel" });
			return;
		}
		if (matchesKey(data, Key.enter)) {
			const extension = this.currentExtension();
			if (extension) this.done({ kind: "select", extension });
			return;
		}
		if (data === "?" || matchesKey(data, "f1")) {
			const extension = this.currentExtension();
			if (extension) this.done({ kind: "docs", extension });
			return;
		}
		if (data === "a") {
			const extension = this.currentExtension();
			if (extension) this.done({ kind: "actions", extension });
			return;
		}
		if (data === "s") {
			const extension = this.currentExtension();
			if (extension) this.done({ kind: "settings", extension });
			return;
		}
		if (data === "d") {
			this.done({ kind: "dashboard" });
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.move(-1);
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.move(1);
			return;
		}
		if (matchesKey(data, Key.home)) {
			this.cursor = 0;
			this.markDirty();
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.cursor = Math.max(0, this.filtered().length - 1);
			this.markDirty();
			return;
		}
		if (matchesKey(data, Key.backspace)) {
			this.query = this.query.slice(0, -1);
			this.cursor = 0;
			this.scroll = 0;
			this.markDirty();
			return;
		}
		if (matchesKey(data, Key.ctrl("u")) || data === "\u0015") {
			this.query = "";
			this.cursor = 0;
			this.scroll = 0;
			this.markDirty();
			return;
		}
		if (data.length === 1 && data >= " " && data !== "\u007f") {
			this.query += data;
			this.cursor = 0;
			this.scroll = 0;
			this.markDirty();
		}
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

		const modalWidth = Math.max(68, Math.min(width, 112));
		const innerWidth = modalWidth - 2;
		const splitLeftWidth = Math.max(28, Math.min(36, Math.floor((modalWidth - 3) * 0.43)));
		const splitRightWidth = modalWidth - 3 - splitLeftWidth;
		const bodyRows = 16;
		const filtered = this.filtered();
		this.cursor = Math.min(this.cursor, Math.max(0, filtered.length - 1));
		const selected = filtered[this.cursor]?.extension;

		const listRows = this.buildListRows(filtered.map((item) => item.extension), splitLeftWidth);
		this.ensureScroll(bodyRows, listRows);

		const lines: string[] = [];
		lines.push(borderTop(modalWidth, "Pi Extensions", this.theme));
		lines.push(frameRow(this.renderSearchLine(innerWidth), innerWidth, this.theme));
		lines.push(frameRow("", innerWidth, this.theme));
		lines.push(frameRow(this.renderHelpLine(filtered.length), innerWidth, this.theme));
		lines.push(splitBorder("├", "┬", "┤", splitLeftWidth, splitRightWidth, this.theme));
		for (const line of this.renderSplitBody(listRows, selected, splitLeftWidth, splitRightWidth, bodyRows)) {
			lines.push(line);
		}
		lines.push(splitBorder("├", "┴", "┤", splitLeftWidth, splitRightWidth, this.theme));
		for (const line of this.renderFooter(innerWidth, filtered)) {
			lines.push(frameRow(line, innerWidth, this.theme));
		}
		lines.push(borderBottom(modalWidth, this.theme));

		this.cachedWidth = width;
		this.cachedLines = lines.map((line) => truncateToWidth(line, modalWidth, ""));
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private markDirty(): void {
		this.invalidate();
		this.requestRender?.();
	}

	private move(delta: number): void {
		const count = this.filtered().length;
		if (count === 0) return;
		this.cursor = Math.max(0, Math.min(count - 1, this.cursor + delta));
		this.markDirty();
	}

	private currentExtension(): PiExtensionRegistration | undefined {
		return this.filtered()[this.cursor]?.extension;
	}

	private ensureScroll(visibleRows: number, rows: ListRenderRow[]): void {
		const selectedLine = rows.findIndex((row) => row.extensionIndex === this.cursor);
		if (selectedLine === -1) {
			this.scroll = 0;
			return;
		}
		if (selectedLine < this.scroll) this.scroll = selectedLine;
		if (selectedLine >= this.scroll + visibleRows) this.scroll = selectedLine - visibleRows + 1;
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, rows.length - visibleRows)));
	}

	private filtered(): ScoredExtension[] {
		const query = this.query.trim().toLowerCase();
		const scored = this.extensions
			.map((extension) => ({ extension, score: scoreExtension(extension, query) }))
			.filter((item) => item.score >= 0)
			.sort((a, b) => b.score - a.score || a.extension.name.localeCompare(b.extension.name));
		return scored;
	}

	private renderSearchLine(width: number): string {
		const prompt = this.theme.fg("dim", " Search: ");
		const cursor = this.theme.fg("accent", "█");
		const placeholder = this.theme.fg("dim", " type to filter");
		const value = this.query ? `${this.query}${cursor}` : `${cursor}${placeholder}`;
		return truncateToWidth(`${prompt}${value}`, width, "…");
	}

	private renderHelpLine(matchCount: number): string {
		const count = this.theme.fg("accent", this.theme.bold(` ${matchCount} extensions`));
		const help = this.theme.fg("dim", "  ·  Enter run  ·  a actions  ·  ? docs  ·  s settings  ·  d dashboard  ·  Esc close");
		return `${count}${help}`;
	}

	private renderSplitBody(
		listRows: ListRenderRow[],
		selected: PiExtensionRegistration | undefined,
		leftWidth: number,
		rightWidth: number,
		rows: number,
	): string[] {
		const leftRows = listRows.slice(this.scroll, this.scroll + rows).map((row) => row.text);
		const rightRows = this.renderDetails(selected, rightWidth, rows);
		const rendered: string[] = [];
		for (let i = 0; i < rows; i++) {
			const left = padToWidth(leftRows[i] ?? "", leftWidth);
			const right = padToWidth(rightRows[i] ?? "", rightWidth);
			rendered.push(`${this.theme.fg("border", "│")}${left}${this.theme.fg("border", "│")}${right}${this.theme.fg("border", "│")}`);
		}
		return rendered;
	}

	private buildListRows(items: PiExtensionRegistration[], width: number): ListRenderRow[] {
		if (items.length === 0) return [{ text: this.theme.fg("warning", " No matching extensions") }];
		const rows: ListRenderRow[] = [
			{ text: this.theme.fg("dim", " GROUP") },
			{ text: "" },
		];
		const grouped = groupExtensions(items);
		for (const group of grouped) {
			rows.push({ text: this.theme.fg("accent", ` ▸ ${group.name}`) });
			for (const extension of group.extensions) {
				const extensionIndex = items.indexOf(extension);
				const isSelected = extensionIndex === this.cursor;
				const marker = isSelected ? this.theme.fg("accent", "●") : this.theme.fg("dim", "○");
				const name = isSelected ? this.theme.bold(extension.name) : extension.name;
				const subtitle = extension.tags?.length ? extension.tags.join(" · ") : extension.id;
				const selectedBg = (text: string) => (isSelected ? this.theme.fg("accent", text) : text);
				rows.push({
					text: selectedBg(truncateToWidth(`   ${marker} ${name}`, width, "…")),
					extensionIndex,
				});
				rows.push({ text: truncateToWidth(this.theme.fg("dim", `     ${subtitle}`), width, "…") });
				rows.push({ text: "" });
			}
		}
		return rows.map((row) => ({ ...row, text: truncateToWidth(row.text, width, "…") }));
	}

	private renderDetails(extension: PiExtensionRegistration | undefined, width: number, rows: number): string[] {
		if (!extension) {
			return [this.theme.fg("dim", " DETAILS"), "", this.theme.fg("dim", " Select an extension to see details")];
		}
		const lines: string[] = [];
		lines.push(this.theme.fg("dim", " DETAILS"));
		lines.push("");
		lines.push(` ${this.theme.fg("accent", this.theme.bold(extension.name))}`);
		lines.push(...wrapTextWithAnsi(` ${extension.description}`, Math.max(10, width)).map((line) => ` ${line.trimStart()}`));
		if (extension.actions?.length || extension.run) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Actions")}`);
			if (extension.run) lines.push("   Enter  Default action");
			lines.push(...(extension.actions ?? []).slice(0, 4).map((action) => `   ${action.default ? "Enter" : "a"}  ${action.title}`));
		}
		if (extension.docs?.length) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Docs")}`);
			lines.push(...extension.docs.slice(0, 3).map((doc) => `   ?  ${doc.title}`));
		}
		if (extension.settings) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Settings")}`);
			lines.push("   s  Configure extension");
		}
		if (extension.widgets?.length) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Widgets")}`);
			lines.push(...extension.widgets.slice(0, 3).map((widget) => `   ${widget.defaultZone ?? "dashboard"}: ${widget.title}`));
		}
		if (extension.commands?.length) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Commands")}`);
			lines.push(...extension.commands.map((command) => `   /${command}`));
		}
		if (extension.tags?.length) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Tags")}`);
			lines.push(`   ${extension.tags.join("  ")}`);
		}
		lines.push("");
		lines.push(` ${this.theme.fg("dim", "Registered as")}`);
		lines.push(`   ${extension.id}`);
		return lines.slice(0, rows).map((line) => truncateToWidth(line, width, "…"));
	}

	private renderFooter(width: number, filtered: ScoredExtension[]): string[] {
		const queryEcho = this.query ? ` ${this.query}` : " Tip: v0 selects an extension name; action launching comes later.";
		const names = filtered
			.slice(0, 4)
			.map((item) => item.extension.name)
			.join(", ");
		const suffix = filtered.length > 4 ? `, +${filtered.length - 4} more` : "";
		const summary = filtered.length === 0 ? " matched: none" : ` matched: ${names}${suffix}`;
		return [truncateToWidth(queryEcho, width, "…"), truncateToWidth(this.theme.fg("dim", summary), width, "…")];
	}
}

function groupExtensions(items: PiExtensionRegistration[]): GroupedExtensions[] {
	const byGroup = new Map<string, PiExtensionRegistration[]>();
	for (const item of items) {
		const group = primaryGroup(item);
		const groupItems = byGroup.get(group) ?? [];
		groupItems.push(item);
		byGroup.set(group, groupItems);
	}
	return [...byGroup.entries()]
		.sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
		.map(([name, extensions]) => ({ name, extensions }));
}

function primaryGroup(extension: PiExtensionRegistration): string {
	const tokens = [extension.id, ...(extension.tags ?? []), ...(extension.commands ?? [])].join(" ").toLowerCase();
	if (tokens.includes("compact")) return "Compaction";
	if (tokens.includes("skill")) return "Skills";
	if (tokens.includes("doc") || tokens.includes("ticket")) return "Docs";
	if (tokens.includes("direnv") || tokens.includes("env") || tokens.includes("bash")) return "Environment";
	if (tokens.includes("session") || tokens.includes("capture") || tokens.includes("summary")) return "Session";
	if (tokens.includes("demo") || tokens.includes("showcase") || tokens.includes("kanban")) return "Demos";
	if (tokens.includes("launcher") || tokens === "px") return "Launcher";
	return "Other";
}

function groupRank(group: string): number {
	const index = GROUP_ORDER.indexOf(group);
	return index === -1 ? GROUP_ORDER.length : index;
}

function scoreExtension(extension: PiExtensionRegistration, query: string): number {
	if (!query) return 0;
	const haystack = [extension.id, extension.name, extension.description, ...(extension.commands ?? []), ...(extension.tags ?? [])]
		.join(" ")
		.toLowerCase();
	if (haystack.includes(query)) return 1000 - haystack.indexOf(query);
	let score = 0;
	let lastIndex = -1;
	for (const char of query) {
		const index = haystack.indexOf(char, lastIndex + 1);
		if (index === -1) return -1;
		score += Math.max(1, 50 - (index - lastIndex));
		lastIndex = index;
	}
	return score;
}

function borderTop(width: number, title: string, theme: ExtensionLauncherOptions["theme"]): string {
	const label = ` ${title} `;
	const remaining = Math.max(0, width - 2 - visibleWidth(label));
	const left = Math.floor(remaining / 2);
	const right = remaining - left;
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", theme.bold(label)) + theme.fg("border", "─".repeat(right) + "╮");
}

function borderBottom(width: number, theme: ExtensionLauncherOptions["theme"]): string {
	return theme.fg("border", "╰" + "─".repeat(width - 2) + "╯");
}

function splitBorder(
	left: string,
	middle: string,
	right: string,
	leftWidth: number,
	rightWidth: number,
	theme: ExtensionLauncherOptions["theme"],
): string {
	return theme.fg("border", `${left}${"─".repeat(leftWidth)}${middle}${"─".repeat(rightWidth)}${right}`);
}

function frameRow(content: string, width: number, theme: ExtensionLauncherOptions["theme"]): string {
	return `${theme.fg("border", "│")}${padToWidth(content, width)}${theme.fg("border", "│")}`;
}

function padToWidth(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	const padding = Math.max(0, width - visibleWidth(truncated));
	return truncated + " ".repeat(padding);
}
