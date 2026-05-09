import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi, type Component } from "@mariozechner/pi-tui";
import type { PiExtensionRegistration } from "../registry";

export interface ExtensionLauncherOptions {
	extensions: PiExtensionRegistration[];
	theme: {
		fg(color: string, text: string): string;
		bold(text: string): string;
	};
	done(extension: PiExtensionRegistration | undefined): void;
}

interface ScoredExtension {
	extension: PiExtensionRegistration;
	score: number;
}

export class ExtensionLauncher implements Component {
	private readonly extensions: PiExtensionRegistration[];
	private readonly theme: ExtensionLauncherOptions["theme"];
	private readonly done: (extension: PiExtensionRegistration | undefined) => void;
	private query = "";
	private cursor = 0;
	private scroll = 0;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(options: ExtensionLauncherOptions) {
		this.extensions = options.extensions;
		this.theme = options.theme;
		this.done = options.done;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.done(this.filtered()[this.cursor]?.extension);
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
			this.cursor = Math.max(0, this.filtered().length - 1);
			this.invalidate();
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
		const safeWidth = Math.max(50, width);
		const listWidth = Math.max(24, Math.min(42, Math.floor(safeWidth * 0.42)));
		const detailWidth = Math.max(20, safeWidth - listWidth - 3);
		const rows = 12;
		const filtered = this.filtered();
		this.ensureScroll(rows, filtered.length);
		const selected = filtered[this.cursor]?.extension;

		const lines: string[] = [];
		lines.push(truncateToWidth(this.theme.fg("accent", this.theme.bold("Pi extension launcher")), safeWidth));
		lines.push(truncateToWidth(this.theme.fg("dim", "Type to fuzzy search  ↑/↓ move  Enter select  Backspace edit  Ctrl+U clear  Esc cancel"), safeWidth));
		lines.push(truncateToWidth(`Filter: ${this.query || this.theme.fg("dim", "(none)")}   Extensions: ${filtered.length}/${this.extensions.length}`, safeWidth));
		lines.push(truncateToWidth("─".repeat(safeWidth), safeWidth));

		const leftRows = this.renderList(filtered.map((item) => item.extension), listWidth, rows);
		const rightRows = this.renderDetails(selected, detailWidth, rows);
		for (let i = 0; i < rows; i++) {
			const left = leftRows[i] ?? "";
			const right = rightRows[i] ?? "";
			lines.push(`${truncateToWidth(left.padEnd(listWidth), listWidth)} │ ${truncateToWidth(right, detailWidth)}`);
		}
		lines.push(truncateToWidth("─".repeat(safeWidth), safeWidth));
		lines.push(truncateToWidth(this.theme.fg("dim", "v0: selecting an extension only prints its name; action launching comes later."), safeWidth));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private move(delta: number): void {
		const count = this.filtered().length;
		if (count === 0) return;
		this.cursor = Math.max(0, Math.min(count - 1, this.cursor + delta));
		this.invalidate();
	}

	private ensureScroll(visibleRows: number, itemCount: number): void {
		if (this.cursor >= itemCount) this.cursor = Math.max(0, itemCount - 1);
		if (this.cursor < this.scroll) this.scroll = this.cursor;
		if (this.cursor >= this.scroll + visibleRows) this.scroll = this.cursor - visibleRows + 1;
		this.scroll = Math.max(0, this.scroll);
	}

	private filtered(): ScoredExtension[] {
		const query = this.query.trim().toLowerCase();
		const scored = this.extensions
			.map((extension) => ({ extension, score: scoreExtension(extension, query) }))
			.filter((item) => item.score >= 0)
			.sort((a, b) => b.score - a.score || a.extension.name.localeCompare(b.extension.name));
		return scored;
	}

	private renderList(items: PiExtensionRegistration[], width: number, rows: number): string[] {
		if (items.length === 0) return [this.theme.fg("warning", "No matching extensions")];
		return items.slice(this.scroll, this.scroll + rows).map((extension, index) => {
			const absoluteIndex = this.scroll + index;
			const pointer = absoluteIndex === this.cursor ? this.theme.fg("accent", ">") : " ";
			const name = absoluteIndex === this.cursor ? this.theme.bold(extension.name) : extension.name;
			return truncateToWidth(`${pointer} ${name}`, width);
		});
	}

	private renderDetails(extension: PiExtensionRegistration | undefined, width: number, rows: number): string[] {
		if (!extension) return [this.theme.fg("dim", "Select an extension to see details")];
		const lines: string[] = [];
		lines.push(this.theme.fg("accent", this.theme.bold(extension.name)));
		lines.push(this.theme.fg("dim", extension.id));
		lines.push("");
		lines.push(...wrapTextWithAnsi(extension.description, width));
		if (extension.commands?.length) {
			lines.push("");
			lines.push(this.theme.fg("muted", "Commands:"));
			lines.push(...extension.commands.map((command) => `/${command}`));
		}
		if (extension.tags?.length) {
			lines.push("");
			lines.push(this.theme.fg("muted", `Tags: ${extension.tags.join(", ")}`));
		}
		return lines.slice(0, rows);
	}
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
