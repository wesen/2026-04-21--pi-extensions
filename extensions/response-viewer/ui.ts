import { Key, matchesKey, truncateToWidth, visibleWidth, type Component, type TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { CapturedResponse } from "./response";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ResponsePickerResult =
	| { action: "open"; response: CapturedResponse }
	| { action: "cancel" };

// ---------------------------------------------------------------------------
// Picker component
// ---------------------------------------------------------------------------

interface ResponsePickerOptions {
	responses: CapturedResponse[];
	theme: Theme;
	tui: TUI;
	done(result: ResponsePickerResult): void;
}

const RESET = "\x1b[0m";

function padRight(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function frameRow(text: string, innerWidth: number): string {
	const clipped = truncateToWidth(text, innerWidth, "…");
	return `│ ${padRight(clipped, innerWidth)} │`;
}

function borderTop(width: number, title: string): string {
	const safeWidth = Math.max(32, width);
	const titleText = ` ${title} `;
	const fill = Math.max(0, safeWidth - 2 - visibleWidth(titleText));
	const left = Math.floor(fill / 2);
	const right = fill - left;
	return `╭${"─".repeat(left)}${titleText}${"─".repeat(right)}╮`;
}

function borderMid(width: number): string {
	return `├${"─".repeat(Math.max(0, width - 2))}┤`;
}

function borderBottom(width: number): string {
	return `╰${"─".repeat(Math.max(0, width - 2))}╯`;
}

function dim(text: string): string {
	return `\x1b[2m${text}${RESET}`;
}

function bold(text: string): string {
	return `\x1b[1m${text}${RESET}`;
}

function formatTime(iso: string): string {
	try {
		const d = new Date(iso);
		const hours = String(d.getHours()).padStart(2, "0");
		const minutes = String(d.getMinutes()).padStart(2, "0");
		return `${hours}:${minutes}`;
	} catch {
		return "--:--";
	}
}

function formatChars(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function firstLine(text: string, maxLen: number): string {
	const line = text.split("\n")[0] ?? "";
	if (visibleWidth(line) <= maxLen) return line;
	return truncateToWidth(line, maxLen, "…");
}

export class ResponsePicker implements Component {
	private query = "";
	private searchActive = false;
	private selected = 0;
	private scroll = 0;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(private options: ResponsePickerOptions) {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.ctrl("c"))) {
			this.options.done({ action: "cancel" });
			return;
		}
		if (matchesKey(data, Key.escape)) {
			if (this.searchActive) {
				this.searchActive = false;
				this.markDirty();
				return;
			}
			this.options.done({ action: "cancel" });
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
				this.selected = 0;
				this.scroll = 0;
				this.markDirty();
				return;
			}
			if (matchesKey(data, Key.ctrl("u")) || data === "\u0015") {
				this.query = "";
				this.selected = 0;
				this.scroll = 0;
				this.markDirty();
				return;
			}
			if (data.length === 1 && data >= " " && data !== "\u007f") {
				this.query += data;
				this.selected = 0;
				this.scroll = 0;
				this.markDirty();
			}
			return;
		}

		if (matchesKey(data, Key.enter)) {
			const item = this.filtered()[this.selected];
			if (item) this.options.done({ action: "open", response: item });
			return;
		}
		if (matchesKey(data, Key.up)) return this.move(-1);
		if (matchesKey(data, Key.down)) return this.move(1);
		if (matchesKey(data, Key.pageUp)) return this.move(-10);
		if (matchesKey(data, Key.pageDown)) return this.move(10);
		if (matchesKey(data, Key.home)) {
			this.selected = 0;
			this.markDirty();
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.selected = Math.max(0, this.filtered().length - 1);
			this.markDirty();
		}
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
		const modalWidth = Math.max(72, Math.min(width, 118));
		const innerWidth = modalWidth - 4;
		const bodyRows = 14;
		const filtered = this.filtered();
		this.selected = Math.min(this.selected, Math.max(0, filtered.length - 1));
		this.ensureScroll(bodyRows, filtered.length);

		const lines: string[] = [];
		lines.push(borderTop(modalWidth, "Response Viewer"));
		lines.push(frameRow(this.renderSearchLine(innerWidth), innerWidth));
		lines.push(frameRow(dim(`${filtered.length} assistant response(s) captured this session`), innerWidth));
		lines.push(borderMid(modalWidth));

		if (filtered.length === 0) {
			lines.push(frameRow("No assistant responses captured yet. Ask Pi for a response first.", innerWidth));
			for (let i = 1; i < bodyRows; i++) lines.push(frameRow("", innerWidth));
		} else {
			const visible = filtered.slice(this.scroll, this.scroll + bodyRows);
			for (let i = 0; i < bodyRows; i++) {
				const item = visible[i];
				if (!item) {
					lines.push(frameRow("", innerWidth));
					continue;
				}
				const index = this.scroll + i;
				lines.push(frameRow(this.renderItem(item, index === this.selected, innerWidth), innerWidth));
			}
		}

		lines.push(borderMid(modalWidth));
		lines.push(frameRow(dim("Enter open  ↑/↓ select  PgUp/PgDn jump  / search  Esc close"), innerWidth));
		lines.push(borderBottom(modalWidth));

		this.cachedWidth = width;
		this.cachedLines = lines.map((line) => truncateToWidth(line, modalWidth, ""));
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	// ---- private helpers ----

	private renderSearchLine(width: number): string {
		const label = this.searchActive ? bold("Search:") : "Search:";
		const suffix = this.searchActive ? "_" : "";
		return truncateToWidth(`${label} ${this.query}${suffix}`, width, "…");
	}

	private renderItem(item: CapturedResponse, selected: boolean, width: number): string {
		const prefix = selected ? bold(">") : " ";
		const turn = `T${String(item.turnIndex + 1).padStart(3)}`;
		const time = formatTime(item.capturedAt);
		const chars = formatChars(item.textLength).padStart(6);
		const model = (item.modelId ?? "?").padEnd(24).slice(0, 24);

		const fixedPrefix = `${prefix} ${turn}  ${time}  ${chars}  ${model}  `;
		const previewWidth = Math.max(0, width - visibleWidth(fixedPrefix));
		const preview = firstLine(item.text, previewWidth);

		const line = `${fixedPrefix}${preview}`;
		return selected ? bold(truncateToWidth(line, width, "…")) : truncateToWidth(line, width, "…");
	}

	private move(delta: number): void {
		const count = this.filtered().length;
		if (count === 0) return;
		this.selected = Math.max(0, Math.min(count - 1, this.selected + delta));
		this.markDirty();
	}

	private ensureScroll(visibleRows: number, count: number): void {
		if (this.selected < this.scroll) this.scroll = this.selected;
		if (this.selected >= this.scroll + visibleRows) this.scroll = this.selected - visibleRows + 1;
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, count - visibleRows)));
	}

	private filtered(): CapturedResponse[] {
		const query = this.query.trim().toLowerCase();
		if (!query) return this.options.responses;
		const parts = query.split(/\s+/).filter(Boolean);
		return this.options.responses.filter((r) => {
			const haystack = `${r.text} ${r.modelId ?? ""} ${r.modelName ?? ""} turn ${r.turnIndex + 1}`.toLowerCase();
			return parts.every((part) => haystack.includes(part));
		});
	}

	private markDirty(): void {
		this.invalidate();
		this.options.tui.requestRender();
	}
}
