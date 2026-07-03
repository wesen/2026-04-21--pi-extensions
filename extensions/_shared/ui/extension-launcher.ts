import { fuzzyMatch, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@mariozechner/pi-tui";
import type { PiExtensionRegistration } from "../registry";

export interface ExtensionLauncherState {
	query: string;
	searchActive: boolean;
	cursor: number;
	listScroll: number;
	detailsScroll: number;
}

export type ExtensionLauncherResult =
	| { kind: "select"; extension: PiExtensionRegistration; state: ExtensionLauncherState }
	| { kind: "actions"; extension: PiExtensionRegistration; state: ExtensionLauncherState }
	| { kind: "docs"; extension: PiExtensionRegistration; state: ExtensionLauncherState }
	| { kind: "settings"; extension: PiExtensionRegistration; state: ExtensionLauncherState }
	| { kind: "dashboard"; state: ExtensionLauncherState }
	| { kind: "palette"; state: ExtensionLauncherState }
	| { kind: "cancel" };

export interface ExtensionLauncherOptions {
	extensions: PiExtensionRegistration[];
	theme: {
		fg(color: string, text: string): string;
		bold(text: string): string;
	};
	done(result: ExtensionLauncherResult): void;
	requestRender?: () => void;
	initialState?: Partial<ExtensionLauncherState>;
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
	private searchActive = false;
	private cursor = 0;
	private scroll = 0;
	private detailsScroll = 0;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(options: ExtensionLauncherOptions) {
		this.extensions = options.extensions;
		this.theme = options.theme;
		this.done = options.done;
		this.requestRender = options.requestRender;
		this.query = options.initialState?.query ?? "";
		this.searchActive = options.initialState?.searchActive ?? false;
		this.cursor = options.initialState?.cursor ?? 0;
		this.scroll = options.initialState?.listScroll ?? 0;
		this.detailsScroll = options.initialState?.detailsScroll ?? 0;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.ctrl("c"))) {
			this.done({ kind: "cancel" });
			return;
		}
		if (matchesKey(data, Key.escape)) {
			if (this.searchActive) {
				this.searchActive = false;
				this.markDirty();
				return;
			}
			this.done({ kind: "cancel" });
			return;
		}
		if (data === "/" && !this.searchActive) {
			this.searchActive = true;
			this.markDirty();
			return;
		}

		if (this.searchActive) {
			if (matchesKey(data, Key.enter)) {
				this.searchActive = false;
				this.markDirty();
				return;
			}
			if (matchesKey(data, Key.backspace)) {
				this.query = this.query.slice(0, -1);
				this.cursor = 0;
				this.scroll = 0;
				this.detailsScroll = 0;
				this.markDirty();
				return;
			}
			if (matchesKey(data, Key.ctrl("u")) || data === "\u0015") {
				this.query = "";
				this.cursor = 0;
				this.scroll = 0;
				this.detailsScroll = 0;
				this.markDirty();
				return;
			}
			if (data.length === 1 && data >= " " && data !== "\u007f") {
				this.query += data;
				this.cursor = 0;
				this.scroll = 0;
				this.detailsScroll = 0;
				this.markDirty();
			}
			return;
		}

		if (matchesKey(data, Key.enter)) {
			const extension = this.currentExtension();
			if (extension) this.done({ kind: "select", extension, state: this.snapshot() });
			return;
		}
		if (data === "?" || matchesKey(data, "f1")) {
			const extension = this.currentExtension();
			if (extension) this.done({ kind: "docs", extension, state: this.snapshot() });
			return;
		}
		if (data === "a") {
			const extension = this.currentExtension();
			if (extension) this.done({ kind: "actions", extension, state: this.snapshot() });
			return;
		}
		if (data === "s") {
			const extension = this.currentExtension();
			if (extension) this.done({ kind: "settings", extension, state: this.snapshot() });
			return;
		}
		if (data === "d") {
			this.done({ kind: "dashboard", state: this.snapshot() });
			return;
		}
		if (data === "p") {
			this.done({ kind: "palette", state: this.snapshot() });
			return;
		}
		if (matchesKey(data, Key.shift("up")) || matchesKey(data, Key.alt("up")) || data === "[") {
			this.scrollDetails(-1);
			return;
		}
		if (matchesKey(data, Key.shift("down")) || matchesKey(data, Key.alt("down")) || data === "]") {
			this.scrollDetails(1);
			return;
		}
		if (matchesKey(data, Key.shift("pageUp")) || matchesKey(data, Key.alt("pageUp"))) {
			this.scrollDetails(-8);
			return;
		}
		if (matchesKey(data, Key.shift("pageDown")) || matchesKey(data, Key.alt("pageDown"))) {
			this.scrollDetails(8);
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
			this.detailsScroll = 0;
			this.markDirty();
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.cursor = Math.max(0, this.visibleExtensions().length - 1);
			this.detailsScroll = 0;
			this.markDirty();
		}
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

		const modalWidth = Math.max(68, Math.min(width, 112));
		const innerWidth = modalWidth - 2;
		const splitLeftWidth = Math.max(28, Math.min(36, Math.floor((modalWidth - 3) * 0.43)));
		const splitRightWidth = modalWidth - 3 - splitLeftWidth;
		const bodyRows = launcherBodyRows();
		const filtered = this.filtered();
		const visibleExtensions = this.visibleExtensions(filtered);
		this.cursor = Math.min(this.cursor, Math.max(0, visibleExtensions.length - 1));
		const selected = visibleExtensions[this.cursor];

		const listRows = this.buildListRows(visibleExtensions, splitLeftWidth);
		this.ensureScroll(bodyRows, listRows);

		const lines: string[] = [];
		lines.push(borderTop(modalWidth, "Pi Extensions", this.theme));
		lines.push(frameRow(this.renderSearchLine(innerWidth), innerWidth, this.theme));
		lines.push(frameRow("", innerWidth, this.theme));
		for (const helpLine of this.renderHelpLines(filtered.length, innerWidth)) {
			lines.push(frameRow(helpLine, innerWidth, this.theme));
		}
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
		const count = this.visibleExtensions().length;
		if (count === 0) return;
		this.cursor = (this.cursor + delta + count) % count;
		this.detailsScroll = 0;
		this.markDirty();
	}

	private scrollDetails(delta: number): void {
		this.detailsScroll = Math.max(0, this.detailsScroll + delta);
		this.markDirty();
	}

	private snapshot(): ExtensionLauncherState {
		return {
			query: this.query,
			searchActive: this.searchActive,
			cursor: this.cursor,
			listScroll: this.scroll,
			detailsScroll: this.detailsScroll,
		};
	}

	private currentExtension(): PiExtensionRegistration | undefined {
		return this.visibleExtensions()[this.cursor];
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
		return this.extensions
			.map((extension) => ({ extension, score: scoreExtension(extension, query) }))
			.filter((item) => item.score >= 0);
	}

	private visibleExtensions(scored = this.filtered()): PiExtensionRegistration[] {
		const byId = new Map(scored.map((item) => [item.extension.id, item.score]));
		return groupExtensions(scored.map((item) => item.extension))
			.flatMap((group) => group.extensions
				.sort((a, b) => (byId.get(a.id) ?? 0) - (byId.get(b.id) ?? 0) || a.name.localeCompare(b.name)));
	}

	private renderSearchLine(width: number): string {
		const prompt = this.theme.fg("dim", " Search: ");
		const cursor = this.theme.fg("accent", "█");
		const placeholder = this.theme.fg("dim", this.searchActive ? " type to filter" : " / to filter");
		const value = this.searchActive
			? (this.query ? `${this.query}${cursor}` : `${cursor}${placeholder}`)
			: (this.query ? `${this.query} ${this.theme.fg("dim", "(/ edit)")}` : placeholder);
		return truncateToWidth(`${prompt}${value}`, width, "…");
	}

	private renderHelpLines(matchCount: number, width: number): string[] {
		const prefix = `${matchCount} extensions`;
		const shortcuts = this.searchActive
			? ["search active", "Enter accept", "Esc leave search", "Ctrl+U clear"]
			: ["/ search", "Enter run", "a actions", "? docs", "s settings", "p palette", "d dashboard"];
		return wrapHelpLine(prefix, shortcuts, width).map((line, index) => {
			if (index === 0) return ` ${this.theme.fg("accent", this.theme.bold(prefix))}${this.theme.fg("dim", line.slice(prefix.length))}`;
			return this.theme.fg("dim", ` ${line}`);
		});
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
		];
		const grouped = groupExtensions(items);
		for (const [groupIndex, group] of grouped.entries()) {
			if (groupIndex > 0) rows.push({ text: "" });
			rows.push({ text: this.theme.fg("accent", ` ▸ ${group.name}`) });
			for (const extension of group.extensions) {
				const extensionIndex = items.indexOf(extension);
				const isSelected = extensionIndex === this.cursor;
				const marker = isSelected ? this.theme.fg("accent", "●") : this.theme.fg("dim", "○");
				const name = isSelected ? this.theme.bold(extension.name) : extension.name;
				const selectedBg = (text: string) => (isSelected ? this.theme.fg("accent", text) : text);
				rows.push({
					text: selectedBg(truncateToWidth(`   ${marker} ${name}`, width, "…")),
					extensionIndex,
				});
			}
		}
		return rows.map((row) => ({ ...row, text: truncateToWidth(row.text, width, "…") }));
	}

	private renderDetails(extension: PiExtensionRegistration | undefined, width: number, rows: number): string[] {
		const allLines = this.buildDetailsLines(extension, width).map((line) => truncateToWidth(line, width, "…"));
		const hasOverflow = allLines.length > rows;
		const contentRows = hasOverflow ? Math.max(1, rows - 1) : rows;
		this.detailsScroll = Math.max(0, Math.min(this.detailsScroll, Math.max(0, allLines.length - contentRows)));
		const visible = allLines.slice(this.detailsScroll, this.detailsScroll + contentRows);
		if (hasOverflow) {
			const end = Math.min(this.detailsScroll + contentRows, allLines.length);
			visible.push(this.theme.fg("dim", truncateToWidth(` details ${this.detailsScroll + 1}-${end}/${allLines.length} · Shift/Alt+↑↓ or [ ]`, width, "…")));
		}
		while (visible.length < rows) visible.push("");
		return visible;
	}

	private buildDetailsLines(extension: PiExtensionRegistration | undefined, width: number): string[] {
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
			lines.push(...(extension.actions ?? []).map((action) => `   ${action.default ? "Enter" : "a"}  ${action.title}`));
		}
		if (extension.docs?.length) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Docs")}`);
			lines.push(...extension.docs.map((doc) => `   ?  ${doc.title}`));
		}
		if (extension.settings) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Settings")}`);
			lines.push("   s  Configure extension");
		}
		if (extension.widgets?.length) {
			lines.push("");
			lines.push(` ${this.theme.fg("dim", "Widgets")}`);
			lines.push(...extension.widgets.map((widget) => `   ${widget.defaultZone ?? "dashboard"}: ${widget.title}`));
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
		return lines;
	}

	private renderFooter(width: number, filtered: ScoredExtension[]): string[] {
		const visible = this.visibleExtensions(filtered);
		const queryEcho = this.query ? ` filter: ${this.query}` : " Tip: / search · ↑↓ list · Shift/Alt+↑↓ details · [ ] details fallback.";
		const names = visible
			.slice(0, 4)
			.map((extension) => extension.name)
			.join(", ");
		const suffix = visible.length > 4 ? `, +${visible.length - 4} more` : "";
		const summary = visible.length === 0 ? " matched: none" : ` matched: ${names}${suffix}`;
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
	const tokens = query.trim().split(/[\s/]+/).filter(Boolean);
	if (tokens.length === 0) return 0;

	const chunks = extensionSearchChunks(extension);
	let totalScore = 0;
	for (const token of tokens) {
		const best = chunks
			.map((chunk) => fuzzyMatch(token, chunk))
			.filter((match) => match.matches)
			.sort((a, b) => a.score - b.score)[0];
		if (!best) return -1;
		totalScore += best.score;
	}
	return totalScore;
}

function extensionSearchChunks(extension: PiExtensionRegistration): string[] {
	return [
		extension.id,
		extension.name,
		extension.description,
		...(extension.commands ?? []),
		...(extension.tags ?? []),
		...(extension.actions ?? []).flatMap((action) => [action.id, action.title, action.description, ...(action.tags ?? [])]),
		...(extension.docs ?? []).flatMap((doc) => [doc.id, doc.title, doc.description, ...(doc.tags ?? [])]),
		...(extension.palette ?? []).flatMap(paletteSearchChunks),
	].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function paletteSearchChunks(item: NonNullable<PiExtensionRegistration["palette"]>[number]): string[] {
	return [
		item.id,
		item.title,
		item.description,
		...(item.tags ?? []),
		...(item.children ?? []).flatMap(paletteSearchChunks),
	].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function terminalRows(fallback = 30): number {
	return typeof process.stdout.rows === "number" && process.stdout.rows > 0 ? process.stdout.rows : fallback;
}

function launcherBodyRows(): number {
	const chromeRows = 9;
	return Math.max(16, Math.min(30, Math.floor(terminalRows() * 0.9) - chromeRows));
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

function wrapHelpLine(prefix: string, shortcuts: string[], width: number): string[] {
	const firstPrefix = `${prefix}`;
	const continuationIndent = "  ";
	const lines: string[] = [firstPrefix];
	for (const shortcut of shortcuts) {
		const token = ` · ${shortcut}`;
		const current = lines[lines.length - 1] ?? "";
		if (visibleWidth(current + token) <= Math.max(20, width - 1)) {
			lines[lines.length - 1] = current + token;
		} else {
			lines.push(`${continuationIndent}${shortcut}`);
		}
	}
	return lines;
}
