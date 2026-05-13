import { Key, matchesKey, truncateToWidth, visibleWidth, type Component, type TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { formatItemTime, type RecentMarkdownItem } from "./history";

export type RecentMarkdownPickerResult =
	| { action: "open"; item: RecentMarkdownItem }
	| { action: "refresh" }
	| { action: "cancel" };

interface RecentMarkdownPickerOptions {
	items: RecentMarkdownItem[];
	theme: Theme;
	tui: TUI;
	done(result: RecentMarkdownPickerResult): void;
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

const PATH_ELISION_WEIGHTS = {
	suffixChars: 4,
	prefixChars: 1,
	suffixSegments: 8,
	prefixSegments: 2,
	prefixPresence: 12,
};

interface PathElisionCandidate {
	rendered: string;
	width: number;
	score: number;
	prefix: string[];
	suffix: string[];
}

function takeTailToWidth(text: string, width: number): string {
	if (width <= 0) return "";
	let result = "";
	for (const char of Array.from(text).reverse()) {
		const next = char + result;
		if (visibleWidth(next) > width) break;
		result = next;
	}
	return result;
}

function elideFilenameTail(filename: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(filename) <= width) return filename;
	const ellipsis = "…";
	const ellipsisWidth = visibleWidth(ellipsis);
	if (width <= ellipsisWidth) return truncateToWidth(ellipsis, width, "");
	return `${ellipsis}${takeTailToWidth(filename, width - ellipsisWidth)}`;
}

function renderPathCandidate(prefix: string[], suffix: string[]): string {
	if (prefix.length === 0) return `.../${suffix.join("/")}`;
	return `${prefix.join("/")}/.../${suffix.join("/")}`;
}

function segmentChars(segments: string[]): number {
	return segments.reduce((sum, segment) => sum + visibleWidth(segment), 0);
}

function scorePathCandidate(prefix: string[], suffix: string[]): number {
	return PATH_ELISION_WEIGHTS.suffixChars * segmentChars(suffix)
		+ PATH_ELISION_WEIGHTS.prefixChars * segmentChars(prefix)
		+ PATH_ELISION_WEIGHTS.suffixSegments * suffix.length
		+ PATH_ELISION_WEIGHTS.prefixSegments * prefix.length
		+ (prefix.length > 0 ? PATH_ELISION_WEIGHTS.prefixPresence : 0);
}

function isBetterPathCandidate(candidate: PathElisionCandidate, best: PathElisionCandidate | undefined): boolean {
	if (!best) return true;
	if (candidate.score !== best.score) return candidate.score > best.score;
	if (candidate.suffix.length !== best.suffix.length) return candidate.suffix.length > best.suffix.length;
	if (candidate.prefix.length !== best.prefix.length) return candidate.prefix.length > best.prefix.length;
	if (candidate.width !== best.width) return candidate.width < best.width;
	return candidate.rendered < best.rendered;
}

function elidePathForWidth(relativePath: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(relativePath) <= width) return relativePath;

	const normalized = relativePath.replace(/\\/g, "/");
	const segments = normalized.split("/").filter(Boolean);
	const filename = segments.at(-1) ?? relativePath;

	if (visibleWidth(filename) > width) return elideFilenameTail(filename, width);
	if (segments.length <= 1) return filename;

	let best: PathElisionCandidate | undefined;

	for (let prefixCount = 0; prefixCount < segments.length; prefixCount++) {
		const maxSuffixCount = segments.length - prefixCount - 1;
		for (let suffixCount = 1; suffixCount <= maxSuffixCount; suffixCount++) {
			const prefix = segments.slice(0, prefixCount);
			const suffix = segments.slice(segments.length - suffixCount);
			const rendered = renderPathCandidate(prefix, suffix);
			const renderedWidth = visibleWidth(rendered);
			if (renderedWidth > width) continue;

			const candidate: PathElisionCandidate = {
				rendered,
				width: renderedWidth,
				score: scorePathCandidate(prefix, suffix),
				prefix,
				suffix,
			};
			if (isBetterPathCandidate(candidate, best)) best = candidate;
		}
	}

	return best?.rendered ?? filename;
}

export class RecentMarkdownPicker implements Component {
	private query = "";
	private searchActive = false;
	private selected = 0;
	private scroll = 0;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(private options: RecentMarkdownPickerOptions) {}

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
		if (data === "r" && !this.searchActive) {
			this.options.done({ action: "refresh" });
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
			if (item) this.options.done({ action: "open", item });
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
		lines.push(borderTop(modalWidth, "Markdown Recent Viewer"));
		lines.push(frameRow(this.renderSearchLine(innerWidth), innerWidth));
		lines.push(frameRow(dim(`${filtered.length} markdown file(s) from session edit/write tool history`), innerWidth));
		lines.push(borderMid(modalWidth));

		if (filtered.length === 0) {
			lines.push(frameRow("No Markdown files found in successful edit/write tool calls for this session.", innerWidth));
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
		lines.push(frameRow(dim("Enter open  ↑/↓ select  PgUp/PgDn jump  / search  r refresh  Esc close"), innerWidth));
		lines.push(borderBottom(modalWidth));

		this.cachedWidth = width;
		this.cachedLines = lines.map((line) => truncateToWidth(line, modalWidth, ""));
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private renderSearchLine(width: number): string {
		const label = this.searchActive ? bold("Search:") : "Search:";
		const suffix = this.searchActive ? "_" : "";
		return truncateToWidth(`${label} ${this.query}${suffix}`, width, "…");
	}

	private renderItem(item: RecentMarkdownItem, selected: boolean, width: number): string {
		const prefix = selected ? bold(">") : " ";
		const tool = item.toolName.padEnd(5);
		const fixedPrefix = `${prefix} ${formatItemTime(item)}  ${tool}  `;
		const pathWidth = Math.max(0, width - visibleWidth(fixedPrefix));
		const line = `${fixedPrefix}${elidePathForWidth(item.relativePath, pathWidth)}`;
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

	private filtered(): RecentMarkdownItem[] {
		const query = this.query.trim().toLowerCase();
		if (!query) return this.options.items;
		const parts = query.split(/\s+/).filter(Boolean);
		return this.options.items.filter((item) => {
			const haystack = `${item.relativePath} ${item.path} ${item.toolName}`.toLowerCase();
			return parts.every((part) => haystack.includes(part));
		});
	}

	private markDirty(): void {
		this.invalidate();
		this.options.tui.requestRender();
	}
}
