import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import type { PiExtensionRegistration, PaletteItem } from "../registry";
import { assignKeys, filterKeyedItems, type KeyedPaletteItem } from "./palette-keys";

// ── Public types ──

export type PaletteResult =
	| { kind: "execute"; extension: PiExtensionRegistration; item: PaletteItem; path: string[] }
	| { kind: "cancel" };

export interface CommandPaletteOptions {
	theme: { fg(color: string, text: string): string; bold(text: string): string };
	done(result: PaletteResult): void;
	requestRender?: () => void;
	debug?: (event: string, details?: Record<string, unknown>) => void;
}

// ── Internal types ──

interface RootKeyedItem extends KeyedPaletteItem {
	extension: PiExtensionRegistration;
}

interface PaletteLevel {
	title: string;
	items: RootKeyedItem[];
}

// ── Component ──

export class CommandPaletteOverlay implements Component {
	private stack: PaletteLevel[];
	private cursor = 0;
	private query = "";
	private searchActive = false;
	private pathIds: string[] = [];
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(
		private rootItems: RootKeyedItem[],
		private options: CommandPaletteOptions,
	) {
		this.stack = [{ title: "Command Palette", items: rootItems }];
	}

	handleInput(data: string): void {
		this.options.debug?.("overlay.handleInput", {
			data: describeInput(data),
			level: this.currentLevel().title,
			stack: this.stack.map((l) => l.title),
			searchActive: this.searchActive,
			query: this.query,
		});

		// Escape: close or exit search
		if (matchesKey(data, Key.escape)) {
			if (this.searchActive) {
				this.searchActive = false;
				this.query = "";
				this.cursor = 0;
				this.markDirty();
				return;
			}
			this.options.done({ kind: "cancel" });
			return;
		}

		// Toggle search
		if (data === "/" && !this.searchActive) {
			this.searchActive = true;
			this.markDirty();
			return;
		}

		// Backspace: delete query char or go up
		if (matchesKey(data, Key.backspace)) {
			if (this.searchActive && this.query) {
				this.query = this.query.slice(0, -1);
				this.cursor = 0;
				this.markDirty();
				return;
			}
			this.goUp();
			return;
		}

		// Ctrl+U: clear query
		if (matchesKey(data, Key.ctrl("u"))) {
			this.query = "";
			this.cursor = 0;
			this.markDirty();
			return;
		}

		// Left arrow: go up one level
		if (matchesKey(data, Key.left)) {
			this.goUp();
			return;
		}

		// Up/Down arrows: move cursor
		if (matchesKey(data, Key.up)) {
			const visible = this.visibleItems();
			this.cursor = Math.max(0, this.cursor - 1);
			this.markDirty();
			return;
		}
		if (matchesKey(data, Key.down)) {
			const visible = this.visibleItems();
			this.cursor = Math.min(Math.max(0, visible.length - 1), this.cursor + 1);
			this.markDirty();
			return;
		}

		// Enter: activate item at cursor
		if (matchesKey(data, Key.enter)) {
			const visible = this.visibleItems();
			const entry = visible[this.cursor];
			if (entry) this.activate(entry);
			return;
		}

		// Single printable character: check key match first, then search
		if (data.length === 1 && data >= " " && data !== "\x7f") {
			const char = data.toLowerCase();
			const level = this.currentLevel();
			const match = level.items.find((entry) => entry.key === char);
			if (match) {
				this.activate(match);
				return;
			}
			// No key match — append to search if active or auto-enter search
			if (this.searchActive) {
				this.query += data;
				this.cursor = 0;
				this.markDirty();
			}
		}
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

		const theme = this.options.theme;
		const modalWidth = Math.max(60, Math.min(width, 120));
		const innerWidth = modalWidth - 4; // "│ " + " │"
		const level = this.currentLevel();
		const visible = this.visibleItems();
		this.cursor = Math.min(this.cursor, Math.max(0, visible.length - 1));

		const lines: string[] = [];

		// Border top with breadcrumb
		const breadcrumb = this.stack.map((l) => l.title).join(" ─ ");
		lines.push(borderTop(modalWidth, breadcrumb, theme));

		// Items
		const maxVisibleRows = Math.min(visible.length, 15);
		const scrollStart = this.clampScroll(maxVisibleRows);

		for (let i = scrollStart; i < Math.min(scrollStart + maxVisibleRows, visible.length); i++) {
			const entry = visible[i]!;
			const isSelected = i === this.cursor;
			const marker = isSelected ? theme.fg("accent", "▸") : " ";
			const keyHint = theme.fg("accent", theme.bold(entry.key));
			const title = isSelected ? theme.bold(entry.item.title) : entry.item.title;
			const childMarker = entry.item.children ? theme.fg("dim", " →") : "";
			const row = `${marker} ${keyHint}  ${title}${childMarker}`;
			lines.push(frameRow(truncateToWidth(row, innerWidth, "…"), innerWidth, theme));
		}

		if (visible.length === 0) {
			lines.push(frameRow(theme.fg("dim", "  No matching items"), innerWidth, theme));
		}

		// Footer
		let footer: string;
		if (this.searchActive) {
			const cursor = theme.fg("accent", "█");
			footer = `  Search: ${this.query}${cursor}    Esc close search`;
		} else {
			footer = "  ← Back    Esc Close    / Search    ↑↓ Navigate";
		}
		lines.push(frameRow(theme.fg("dim", truncateToWidth(footer, innerWidth, "…")), innerWidth, theme));

		// Border bottom
		lines.push(borderBottom(modalWidth, theme));

		this.cachedWidth = width;
		this.cachedLines = lines.map((line) => truncateToWidth(line, modalWidth, ""));
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	// ── Private helpers ──

	private currentLevel(): PaletteLevel {
		return this.stack[this.stack.length - 1]!;
	}

	private visibleItems(): RootKeyedItem[] {
		const level = this.currentLevel();
		if (!this.searchActive || !this.query) return level.items;
		return filterKeyedItems(level.items, this.query) as RootKeyedItem[];
	}

	private activate(entry: RootKeyedItem): void {
		this.options.debug?.("overlay.activate", {
			key: entry.key,
			itemId: entry.item.id,
			title: entry.item.title,
			hasChildren: Boolean(entry.item.children),
			hasRun: Boolean(entry.item.run),
			path: [...this.pathIds, entry.item.id],
		});
		if (entry.item.children) {
			// Submenu: push new level
			const childKeyed = assignKeys(entry.item.children);
			const childItems: RootKeyedItem[] = childKeyed.map((ck) => ({
				...ck,
				extension: entry.extension,
			}));
			this.stack.push({ title: entry.item.title, items: childItems });
			this.pathIds.push(entry.item.id);
			this.cursor = 0;
			this.query = "";
			this.searchActive = false;
			this.markDirty();
			return;
		}
		if (entry.item.run) {
			this.options.done({
				kind: "execute",
				extension: entry.extension,
				item: entry.item,
				path: [...this.pathIds, entry.item.id],
			});
			return;
		}
		// No-op item — ignore
	}

	private goUp(): void {
		if (this.stack.length > 1) {
			this.stack.pop();
			this.pathIds.pop();
			this.cursor = 0;
			this.query = "";
			this.searchActive = false;
			this.markDirty();
		} else {
			this.options.done({ kind: "cancel" });
		}
	}

	private clampScroll(maxRows: number): number {
		if (this.cursor < 0) return 0;
		if (this.cursor >= maxRows) return this.cursor - maxRows + 1;
		return 0;
	}

	private markDirty(): void {
		this.invalidate();
		this.options.requestRender?.();
	}
}

// ── Build root items from registry ──

export function buildRootPaletteItems(
	paletteItems: Array<{ extension: PiExtensionRegistration; item: PaletteItem }>,
): RootKeyedItem[] {
	// Group all palette items by extension, then create one root-level submenu per extension.
	// Root-level keys are auto-assigned from extension names.
	const byExtension = new Map<string, { extension: PiExtensionRegistration; items: PaletteItem[] }>();
	for (const { extension, item } of paletteItems) {
		const group = byExtension.get(extension.id) ?? { extension, items: [] };
		group.items.push(item);
		byExtension.set(extension.id, group);
	}

	const taken = new Set<string>();
	const fallbackChars = "abcdefghijklmnopqrstuvwxyz0123456789";

	const result: RootKeyedItem[] = [];
	for (const [, { extension, items }] of byExtension) {
		// Each extension becomes a submenu at the root level
		const rootItem: PaletteItem = {
			id: extension.id,
			title: extension.name,
			description: extension.description,
			children: items,
		};

		// Auto-assign key from extension name
		let key = "";
		for (const char of extension.name.toLowerCase()) {
			if (/[a-z0-9]/.test(char) && !taken.has(char)) {
				taken.add(char);
				key = char;
				break;
			}
		}
		if (!key) {
			for (const char of fallbackChars) {
				if (!taken.has(char)) {
					taken.add(char);
					key = char;
					break;
				}
			}
		}
		if (key) result.push({ item: rootItem, key, extension });
	}

	return result;
}

// ── Border helpers (same style as extension-launcher.ts) ──

function borderTop(width: number, title: string, theme: CommandPaletteOptions["theme"]): string {
	const label = ` ${title} `;
	const remaining = Math.max(0, width - 2 - visibleWidth(label));
	const left = Math.floor(remaining / 2);
	const right = remaining - left;
	return (
		theme.fg("border", "╭" + "─".repeat(left)) +
		theme.fg("accent", theme.bold(label)) +
		theme.fg("border", "─".repeat(right) + "╮")
	);
}

function borderBottom(width: number, theme: CommandPaletteOptions["theme"]): string {
	return theme.fg("border", "╰" + "─".repeat(width - 2) + "╯");
}

function frameRow(content: string, width: number, theme: CommandPaletteOptions["theme"]): string {
	const padding = Math.max(0, width - visibleWidth(content));
	return `${theme.fg("border", "│")} ${content}${" ".repeat(padding)} ${theme.fg("border", "│")}`;
}

function describeInput(data: string): Record<string, unknown> {
	return {
		json: JSON.stringify(data),
		length: data.length,
		chars: [...data].map((char) => {
			const code = char.codePointAt(0) ?? 0;
			return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
		}),
	};
}
