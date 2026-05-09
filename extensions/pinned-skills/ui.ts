import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi, type Component } from "@mariozechner/pi-tui";

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
}

export class PinnedSkillsChecklist implements Component {
	private readonly items: SkillListItem[];
	private selected = new Set<string>();
	private readonly theme: PinnedSkillsChecklistOptions["theme"];
	private readonly done: (result: string[] | undefined) => void;
	private cursor = 0;
	private scroll = 0;
	private query = "";
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(options: PinnedSkillsChecklistOptions) {
		this.items = [...options.items].sort((a, b) => a.name.localeCompare(b.name));
		this.selected = new Set(options.selectedNames);
		this.theme = options.theme;
		this.done = options.done;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(undefined);
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
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.cursor = Math.max(0, this.filteredItems().length - 1);
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.space)) {
			const item = this.filteredItems()[this.cursor];
			if (item) {
				if (this.selected.has(item.name)) this.selected.delete(item.name);
				else this.selected.add(item.name);
				this.invalidate();
			}
			return;
		}
		if (matchesKey(data, Key.backspace)) {
			this.query = this.query.slice(0, -1);
			this.cursor = 0;
			this.scroll = 0;
			this.invalidate();
			return;
		}
		if (data === "\u0015") {
			this.query = "";
			this.cursor = 0;
			this.scroll = 0;
			this.invalidate();
			return;
		}
		if (data.length === 1 && data >= " " && data !== "\u007f") {
			this.query += data;
			this.cursor = 0;
			this.scroll = 0;
			this.invalidate();
		}
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

		const safeWidth = Math.max(40, width);
		const filtered = this.filteredItems();
		const selectedItem = filtered[this.cursor];
		const listWidth = Math.max(30, Math.min(48, Math.floor(safeWidth * 0.45)));
		const detailWidth = Math.max(20, safeWidth - listWidth - 3);
		const visibleRows = 14;
		this.ensureScroll(visibleRows, filtered.length);

		const lines: string[] = [];
		lines.push(truncateToWidth(this.theme.fg("accent", this.theme.bold("Pinned skills")), safeWidth));
		lines.push(truncateToWidth(this.theme.fg("dim", "↑/↓ move  Space toggle  type to filter  Backspace edit filter  Ctrl+U clear filter  Enter save  Esc cancel"), safeWidth));
		lines.push(truncateToWidth(`Filter: ${this.query || this.theme.fg("dim", "(none)")}   Selected: ${this.selected.size}`, safeWidth));
		lines.push(truncateToWidth("─".repeat(safeWidth), safeWidth));

		const listRows = this.renderListRows(filtered, listWidth, visibleRows);
		const detailRows = this.renderDetailRows(selectedItem, detailWidth, visibleRows);
		for (let i = 0; i < visibleRows; i++) {
			const left = listRows[i] ?? "";
			const right = detailRows[i] ?? "";
			lines.push(`${truncateToWidth(left.padEnd(listWidth), listWidth)} │ ${truncateToWidth(right, detailWidth)}`);
		}
		lines.push(truncateToWidth("─".repeat(safeWidth), safeWidth));
		const source = this.items.some((item) => item.source === "skills-snapshot")
			? "using full Skill[] snapshot"
			: "using pi.getCommands() fallback; send one prompt for richer metadata";
		lines.push(truncateToWidth(this.theme.fg("dim", source), safeWidth));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private move(delta: number): void {
		const count = this.filteredItems().length;
		if (count === 0) return;
		this.cursor = Math.max(0, Math.min(count - 1, this.cursor + delta));
		this.invalidate();
	}

	private filteredItems(): SkillListItem[] {
		const query = this.query.trim().toLowerCase();
		if (!query) return this.items;
		return this.items.filter((item) => {
			return item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query) || item.path.toLowerCase().includes(query);
		});
	}

	private ensureScroll(visibleRows: number, itemCount: number): void {
		if (this.cursor >= itemCount) this.cursor = Math.max(0, itemCount - 1);
		if (this.cursor < this.scroll) this.scroll = this.cursor;
		if (this.cursor >= this.scroll + visibleRows) this.scroll = this.cursor - visibleRows + 1;
		this.scroll = Math.max(0, this.scroll);
	}

	private renderListRows(items: SkillListItem[], width: number, visibleRows: number): string[] {
		if (items.length === 0) return [this.theme.fg("warning", "No matching skills")];
		return items.slice(this.scroll, this.scroll + visibleRows).map((item, index) => {
			const absoluteIndex = this.scroll + index;
			const cursor = absoluteIndex === this.cursor ? this.theme.fg("accent", ">") : " ";
			const check = this.selected.has(item.name) ? this.theme.fg("success", "☑") : "☐";
			const disabled = item.disabled ? this.theme.fg("warning", " !") : "";
			const name = absoluteIndex === this.cursor ? this.theme.bold(item.name) : item.name;
			return truncateToWidth(`${cursor} ${check} ${name}${disabled}`, width);
		});
	}

	private renderDetailRows(item: SkillListItem | undefined, width: number, visibleRows: number): string[] {
		if (!item) return [this.theme.fg("dim", "Select a skill to see details")];
		const rows: string[] = [];
		rows.push(this.theme.fg("accent", this.theme.bold(item.name)));
		if (item.disabled) rows.push(this.theme.fg("warning", "disable-model-invocation"));
		rows.push("");
		const description = item.description || "(no description)";
		rows.push(...wrapTextWithAnsi(description, width));
		rows.push("");
		rows.push(this.theme.fg("muted", "Path:"));
		rows.push(...wrapTextWithAnsi(item.path, width));
		return rows.slice(0, visibleRows);
	}
}
