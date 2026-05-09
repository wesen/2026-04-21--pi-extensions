import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@mariozechner/pi-tui";

export interface SkillListItem {
	name: string;
	description: string;
	path: string;
	disabled?: boolean;
	source: "skills-snapshot" | "commands-fallback";
}

export interface PinnedSkillsChecklistOptions {
	items: SkillListItem[];
	selectedNames: string[];
	theme: {
		fg(color: string, text: string): string;
		bold(text: string): string;
	};
	done(result: string[] | undefined): void;
	requestRender?: () => void;
}

export class PinnedSkillsChecklist implements Component {
	private readonly items: SkillListItem[];
	private selected = new Set<string>();
	private readonly theme: PinnedSkillsChecklistOptions["theme"];
	private readonly done: (result: string[] | undefined) => void;
	private readonly requestRender: (() => void) | undefined;
	private cursor = 0;
	private scroll = 0;
	private query = "";
	private searchActive = false;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(options: PinnedSkillsChecklistOptions) {
		this.items = [...options.items].sort((a, b) => a.name.localeCompare(b.name));
		this.selected = new Set(options.selectedNames);
		this.theme = options.theme;
		this.done = options.done;
		this.requestRender = options.requestRender;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.ctrl("c"))) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, Key.escape)) {
			if (this.searchActive) {
				this.searchActive = false;
				this.markDirty();
				return;
			}
			this.done(undefined);
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
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.done([...this.selected].sort((a, b) => a.localeCompare(b)));
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
			this.cursor = Math.max(0, this.filteredItems().length - 1);
			this.markDirty();
			return;
		}
		if (matchesKey(data, Key.space)) {
			const item = this.filteredItems()[this.cursor];
			if (item) {
				if (this.selected.has(item.name)) this.selected.delete(item.name);
				else this.selected.add(item.name);
				this.markDirty();
			}
		}
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

		const modalWidth = Math.max(68, Math.min(width, 112));
		const innerWidth = modalWidth - 2;
		const leftWidth = Math.max(30, Math.min(40, Math.floor((modalWidth - 3) * 0.43)));
		const rightWidth = modalWidth - 3 - leftWidth;
		const bodyRows = 16;
		const filtered = this.filteredItems();
		this.cursor = Math.min(this.cursor, Math.max(0, filtered.length - 1));
		this.ensureScroll(bodyRows, filtered.length);
		const selectedItem = filtered[this.cursor];

		const lines: string[] = [];
		lines.push(borderTop(modalWidth, "Pinned Skills", this.theme));
		lines.push(frameRow(this.renderSearchLine(innerWidth), innerWidth, this.theme));
		lines.push(frameRow("", innerWidth, this.theme));
		lines.push(frameRow(this.renderHelpLine(filtered.length), innerWidth, this.theme));
		lines.push(splitBorder("├", "┬", "┤", leftWidth, rightWidth, this.theme));
		const leftRows = this.renderListRows(filtered, leftWidth, bodyRows);
		const rightRows = this.renderDetailRows(selectedItem, rightWidth, bodyRows);
		for (let i = 0; i < bodyRows; i++) {
			lines.push(`${this.theme.fg("border", "│")}${padToWidth(leftRows[i] ?? "", leftWidth)}${this.theme.fg("border", "│")}${padToWidth(rightRows[i] ?? "", rightWidth)}${this.theme.fg("border", "│")}`);
		}
		lines.push(splitBorder("├", "┴", "┤", leftWidth, rightWidth, this.theme));
		for (const line of this.renderFooter(innerWidth, filtered.length)) lines.push(frameRow(line, innerWidth, this.theme));
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
		const count = this.filteredItems().length;
		if (count === 0) return;
		this.cursor = Math.max(0, Math.min(count - 1, this.cursor + delta));
		this.markDirty();
	}

	private filteredItems(): SkillListItem[] {
		const query = this.query.trim().toLowerCase();
		if (!query) return this.items;
		return this.items.filter((item) => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query) || item.path.toLowerCase().includes(query));
	}

	private ensureScroll(visibleRows: number, itemCount: number): void {
		if (this.cursor >= itemCount) this.cursor = Math.max(0, itemCount - 1);
		if (this.cursor < this.scroll) this.scroll = this.cursor;
		if (this.cursor >= this.scroll + visibleRows) this.scroll = this.cursor - visibleRows + 1;
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, itemCount - visibleRows)));
	}

	private renderSearchLine(width: number): string {
		const prompt = this.theme.fg("dim", " Search: ");
		const cursor = this.theme.fg("accent", "█");
		const placeholder = this.theme.fg("dim", this.searchActive ? " type to filter" : " / to filter");
		const value = this.searchActive ? (this.query ? `${this.query}${cursor}` : `${cursor}${placeholder}`) : (this.query ? `${this.query} ${this.theme.fg("dim", "(/ edit)")}` : placeholder);
		return truncateToWidth(`${prompt}${value}`, width, "…");
	}

	private renderHelpLine(matchCount: number): string {
		const count = this.theme.fg("accent", this.theme.bold(` ${matchCount} skills`));
		const help = this.searchActive
			? this.theme.fg("dim", "  ·  search active  ·  Enter accept  ·  Esc leave search  ·  Ctrl+U clear")
			: this.theme.fg("dim", "  ·  / search  ·  Space toggle  ·  Enter save  ·  Esc cancel");
		return `${count}${help}`;
	}

	private renderListRows(items: SkillListItem[], width: number, visibleRows: number): string[] {
		if (items.length === 0) return [this.theme.fg("warning", " No matching skills")];
		return items.slice(this.scroll, this.scroll + visibleRows).map((item, index) => {
			const absoluteIndex = this.scroll + index;
			const isCursor = absoluteIndex === this.cursor;
			const marker = isCursor ? this.theme.fg("accent", "●") : this.theme.fg("dim", "○");
			const check = this.selected.has(item.name) ? this.theme.fg("success", "☑") : this.theme.fg("dim", "☐");
			const disabled = item.disabled ? this.theme.fg("warning", " !") : "";
			const name = isCursor ? this.theme.bold(item.name) : item.name;
			const row = `   ${marker} ${check} ${name}${disabled}`;
			return truncateToWidth(isCursor ? this.theme.fg("accent", row) : row, width, "…");
		});
	}

	private renderDetailRows(item: SkillListItem | undefined, width: number, visibleRows: number): string[] {
		if (!item) return [this.theme.fg("dim", " DETAILS"), "", this.theme.fg("dim", " Select a skill to see details")];
		const rows: string[] = [];
		rows.push(this.theme.fg("dim", " DETAILS"));
		rows.push("");
		rows.push(` ${this.theme.fg("accent", this.theme.bold(item.name))}`);
		if (item.disabled) rows.push(` ${this.theme.fg("warning", "disable-model-invocation")}`);
		rows.push(...wrapTextWithAnsi(` ${item.description || "(no description)"}`, Math.max(10, width)).map((line) => ` ${line.trimStart()}`));
		rows.push("");
		rows.push(` ${this.theme.fg("dim", "Path")}`);
		rows.push(...wrapTextWithAnsi(` ${item.path}`, Math.max(10, width)).map((line) => ` ${line.trimStart()}`));
		return rows.slice(0, visibleRows).map((line) => truncateToWidth(line, width, "…"));
	}

	private renderFooter(width: number, matchCount: number): string[] {
		const source = this.items.some((item) => item.source === "skills-snapshot") ? "using full Skill[] snapshot" : "using command fallback; send one prompt for richer metadata";
		return [
			truncateToWidth(` selected: ${this.selected.size} · matched: ${matchCount}`, width, "…"),
			truncateToWidth(this.theme.fg("dim", ` ${source}`), width, "…"),
		];
	}
}

function borderTop(width: number, title: string, theme: PinnedSkillsChecklistOptions["theme"]): string {
	const label = ` ${title} `;
	const remaining = Math.max(0, width - 2 - visibleWidth(label));
	const left = Math.floor(remaining / 2);
	const right = remaining - left;
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", theme.bold(label)) + theme.fg("border", "─".repeat(right) + "╮");
}

function borderBottom(width: number, theme: PinnedSkillsChecklistOptions["theme"]): string {
	return theme.fg("border", "╰" + "─".repeat(width - 2) + "╯");
}

function splitBorder(left: string, middle: string, right: string, leftWidth: number, rightWidth: number, theme: PinnedSkillsChecklistOptions["theme"]): string {
	return theme.fg("border", `${left}${"─".repeat(leftWidth)}${middle}${"─".repeat(rightWidth)}${right}`);
}

function frameRow(content: string, width: number, theme: PinnedSkillsChecklistOptions["theme"]): string {
	return `${theme.fg("border", "│")}${padToWidth(content, width)}${theme.fg("border", "│")}`;
}

function padToWidth(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}
