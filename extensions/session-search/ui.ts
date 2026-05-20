/**
 * Session search overlay — interactive TUI component for searching
 * tool call arguments and results in session history.
 */

import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
	type TUI,
} from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { ReadonlySessionManager } from "@mariozechner/pi-coding-agent";
import type { ScanResult, SessionSearchResult, ToolCallMatch } from "./types";
import { scanBranch } from "./scanner";
import { matchSummaryLine } from "./scanner";

/** Detail level for a selected match. */
type DetailLevel = "compact" | "expanded" | "full";

export interface SessionSearchOverlayOptions {
	tui: TUI;
	theme: Theme;
	done: (result: SessionSearchResult | null) => void;
	sessionManager: ReadonlySessionManager;
	/** Pre-fill the search query. */
	prefill?: string;
}

export class SessionSearchOverlay implements Component {
	// ── State ──────────────────────────────────────────────
	private query: string;
	private matches: ToolCallMatch[] = [];
	private selected = 0;
	private scroll = 0;
	private scanning = false;
	private scanResult: ScanResult | null = null;
	private detailLevel: DetailLevel = "compact";
	private searchMode = true; // typing appends to query
	private showHelp = false;

	// Cached render output
	private cachedWidth?: number;
	private cachedLines?: string[];

	// ── Dependencies ───────────────────────────────────────
	private tui: TUI;
	private theme: Theme;
	private done: (result: SessionSearchResult | null) => void;
	private sessionManager: ReadonlySessionManager;

	constructor(options: SessionSearchOverlayOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.done = options.done;
		this.sessionManager = options.sessionManager;
		this.query = options.prefill ?? "";

		// Run initial scan if query is pre-filled
		if (this.query.length > 0) {
			this.runScan();
		}
	}

	// ── Scanning ───────────────────────────────────────────

	private runScan(): void {
		this.scanning = true;
		this.invalidate();

		// Scan synchronously (fast enough for typical sessions)
		try {
			this.scanResult = scanBranch(this.sessionManager, this.query);
			this.matches = this.scanResult.matches;
		} catch {
			this.matches = [];
			this.scanResult = null;
		}

		this.scanning = false;
		// Clamp selection
		this.selected = Math.min(
			this.selected,
			Math.max(0, this.matches.length - 1),
		);
		this.scroll = 0;
		this.invalidate();
	}

	// ── Input ──────────────────────────────────────────────

	handleInput(data: string): void {
		// Help overlay
		if (this.showHelp) {
			if (
				matchesKey(data, Key.escape) ||
				matchesKey(data, Key.enter) ||
				data === "?"
			) {
				this.showHelp = false;
				this.invalidate();
			}
			return;
		}

		// Escape: close
		if (matchesKey(data, Key.escape)) {
			this.done(null);
			return;
		}

		// Enter: select current match
		if (matchesKey(data, Key.enter)) {
			const match = this.matches[this.selected];
			if (match) {
				this.done({ match, action: "navigate" });
			}
			return;
		}

		// 'f': fork from current match
		if (data === "f" && !this.searchMode) {
			const match = this.matches[this.selected];
			if (match) {
				this.done({ match, action: "fork" });
			}
			return;
		}

		// '?': toggle help
		if (data === "?" && !this.searchMode) {
			this.showHelp = !this.showHelp;
			this.invalidate();
			return;
		}

		// '/': enter search mode
		if (data === "/" && !this.searchMode) {
			this.searchMode = true;
			this.invalidate();
			return;
		}

		// Ctrl+U: clear query
		if (matchesKey(data, Key.ctrl("u"))) {
			this.query = "";
			this.matches = [];
			this.selected = 0;
			this.scroll = 0;
			this.searchMode = true;
			this.invalidate();
			return;
		}

		// Navigation (works when not in search mode or when no matches)
		if (matchesKey(data, Key.up)) {
			this.searchMode = false;
			this.moveSelection(-1);
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.searchMode = false;
			this.moveSelection(1);
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.searchMode = false;
			this.moveSelection(-this.visibleBodyLines());
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.searchMode = false;
			this.moveSelection(this.visibleBodyLines());
			return;
		}
		if (matchesKey(data, Key.home)) {
			this.searchMode = false;
			this.selected = 0;
			this.scroll = 0;
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.searchMode = false;
			this.selected = Math.max(0, this.matches.length - 1);
			this.ensureVisible();
			this.invalidate();
			return;
		}

		// Tab: cycle detail level for selected match
		if (data === "\t" && !this.searchMode) {
			const levels: DetailLevel[] = ["compact", "expanded", "full"];
			const idx = levels.indexOf(this.detailLevel);
			this.detailLevel = levels[(idx + 1) % levels.length]!;
			this.invalidate();
			return;
		}

		// Backspace: delete last query char
		if (matchesKey(data, Key.backspace)) {
			if (this.query.length > 0) {
				this.query = this.query.slice(0, -1);
				this.runScan();
			}
			return;
		}

		// Printable characters: append to query (search mode)
		if (
			data.length === 1 &&
			data.charCodeAt(0) >= 32 &&
			data.charCodeAt(0) < 127
		) {
			if (!this.searchMode && this.matches.length > 0) {
				// In browse mode, printable chars enter search mode
				this.searchMode = true;
			}
			this.query += data;
			this.runScan();
			return;
		}
	}

	private moveSelection(delta: number): void {
		if (this.matches.length === 0) return;
		this.selected = Math.max(
			0,
			Math.min(this.matches.length - 1, this.selected + delta),
		);
		this.ensureVisible();
		this.invalidate();
	}

	private ensureVisible(): void {
		const bodyHeight = this.visibleBodyLines();
		if (this.selected < this.scroll) {
			this.scroll = this.selected;
		} else if (this.selected >= this.scroll + bodyHeight) {
			this.scroll = this.selected - bodyHeight + 1;
		}
	}

	// ── Render ─────────────────────────────────────────────

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const w = Math.max(64, Math.min(width, 120));
		const inner = w - 4; // content inside │ │

		const lines: string[] = [];

		// Top border
		lines.push(this.borderTop(w, "Session Search"));

		if (this.showHelp) {
			lines.push(...this.renderHelp(inner));
		} else {
			// Search header
			lines.push(...this.renderSearchHeader(inner));
			lines.push(this.borderMid(w));
			// Match list body
			lines.push(...this.renderBody(inner));
		}

		// Divider + footer
		lines.push(this.borderMid(w));
		lines.push(...this.renderFooter(inner));
		lines.push(this.borderBottom(w));

		this.cachedLines = lines;
		this.cachedWidth = width;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.tui.requestRender();
	}

	// ── Render helpers ─────────────────────────────────────

	private renderSearchHeader(inner: number): string[] {
		const cursor = this.searchMode ? "█" : " ";
		const queryDisplay =
			this.query.length > 0
				? this.query
				: this.theme.fg("dim", "type to search tool calls…");

		const searchLine = ` Search: ${queryDisplay}${this.searchMode ? cursor : ""}`;
		const infoLine =
			this.scanning
				? " Scanning…"
				: this.matches.length > 0
					? ` ${this.matches.length} match${this.matches.length === 1 ? "" : "es"}${this.scanResult ? ` in ${this.scanResult.totalToolCallsScanned} tool calls` : ""} · ${this.scanResult ? `${this.scanResult.scanDurationMs.toFixed(1)}ms` : ""}`
					: this.query.length > 0
						? " No matches"
						: " Enter a search query";

		return [
			this.padLine(searchLine, inner),
			this.padLine(this.theme.fg("dim", infoLine), inner),
		];
	}

	private renderBody(inner: number): string[] {
		if (this.matches.length === 0) {
			return [
				this.padLine(
					this.theme.fg(
						"dim",
						this.scanning
							? "Scanning session…"
							: this.query.length > 0
								? "No matches found"
								: "Type a search query to find tool call arguments and results",
					),
					inner,
				),
			];
		}

		const bodyHeight = this.visibleBodyLines();
		const lines: string[] = [];

		for (
			let vi = 0;
			vi < bodyHeight;
			vi++
		) {
			const mi = this.scroll + vi;
			if (mi >= this.matches.length) {
				lines.push(this.padLine("", inner));
				continue;
			}

			const match = this.matches[mi]!;
			const isSelected = mi === this.selected;
			const marker = isSelected ? "▸" : " ";
			const summary = matchSummaryLine(match, inner - 2);

			let line = `${marker} ${summary}`;
			if (isSelected) {
				line = this.theme.bg("selectedBg", line);
			}
			line = truncateToWidth(line, inner);

			lines.push(this.padLine(line, inner));

			// Expanded/full detail for selected item
			if (isSelected && this.detailLevel !== "compact") {
				const detailLines = this.renderMatchDetail(
					match,
					inner,
					this.detailLevel,
				);
				for (const dl of detailLines) {
					lines.push(this.padLine(dl, inner));
				}
			}
		}

		return lines;
	}

	private renderMatchDetail(
		match: ToolCallMatch,
		inner: number,
		level: DetailLevel,
	): string[] {
		const lines: string[] = [];
		const indent = "   ";

		if (level === "expanded" || level === "full") {
			// Show snippet
			if (match.snippet) {
				const snippetLines = match.snippet.split("\n").slice(0, 5);
				for (const sl of snippetLines) {
					const truncated = truncateToWidth(indent + sl, inner);
					lines.push(
						this.theme.fg("dim", this.padLine(truncated, inner)),
					);
				}
			}
		}

		if (level === "full") {
			// Show arguments
			lines.push(
				this.theme.fg(
					"dim",
					this.padLine(`${indent}── arguments ──`, inner),
				),
			);
			const argText = JSON.stringify(match.arguments, null, 2);
			const argLines = argText.split("\n").slice(0, 15);
			for (const al of argLines) {
				lines.push(
					this.theme.fg(
						"dim",
						this.padLine(
							truncateToWidth(indent + al, inner),
							inner,
						),
					),
				);
			}

			// Show result (truncated)
			if (match.resultText) {
				lines.push(
					this.theme.fg(
						"dim",
						this.padLine(`${indent}── result ──`, inner),
					),
				);
				const resLines = match.resultText.split("\n").slice(0, 20);
				for (const rl of resLines) {
					lines.push(
						this.theme.fg(
							"dim",
							this.padLine(
								truncateToWidth(indent + rl, inner),
								inner,
							),
						),
					);
				}
				if (match.resultTruncated) {
					lines.push(
						this.theme.fg(
							"dim",
							this.padLine(
								`${indent}… (truncated)`,
								inner,
							),
						),
					);
				}
			}
		}

		return lines;
	}

	private renderHelp(inner: number): string[] {
		const lines = [
			" Session Search — Keyboard Shortcuts",
			"",
			"  ↑/↓           Move selection",
			"  Enter         Navigate to match (rewind session)",
			"  f             Fork from match (new session)",
			"  Tab           Cycle detail: compact → expanded → full",
			"  /             Enter search mode",
			"  Ctrl+U        Clear search query",
			"  Backspace     Delete last search character",
			"  PageUp/Down   Scroll by page",
			"  Home/End      Jump to first/last match",
			"  ?             Toggle this help",
			"  Esc           Close overlay",
			"",
			"  Typing any printable char enters search mode automatically.",
		];
		return lines.map((l) =>
			this.theme.fg("dim", this.padLine(l, inner)),
		);
	}

	private renderFooter(inner: number): string[] {
		const parts: string[] = [];

		if (this.matches.length > 0 && !this.searchMode) {
			parts.push("Enter:navigate");
			parts.push("f:fork");
			parts.push("Tab:detail");
		}
		parts.push("?:help");
		parts.push("Esc:close");

		if (this.searchMode) {
			parts.push("Ctrl+U:clear");
		}

		const footer = " " + parts.join(" · ");
		return [this.theme.fg("dim", this.padLine(footer, inner))];
	}

	// ── Layout helpers ─────────────────────────────────────

	/**
	 * How many lines the body area can show (total overlay height
	 * minus header + footer + borders). We target a responsive height
	 * based on the terminal, but for simplicity we use a fixed body
	 * height of 15 lines.
	 */
	private visibleBodyLines(): number {
		// Header: 2 lines, Footer: 1 line, Borders: 4 lines, Detail: up to 0-20 extra
		// We reserve a base body of 15 lines. When detail is expanded,
		// the selected item takes more rows, reducing visible items.
		if (this.detailLevel !== "compact" && this.matches.length > 0) {
			const detailLines =
				this.detailLevel === "full" ? 20 : 6;
			return Math.max(3, 15 - detailLines);
		}
		return 15;
	}

	// ── Border helpers ─────────────────────────────────────

	private borderTop(width: number, title: string): string {
		const inner = width - 2;
		const titleDisplay = ` ${title} `;
		const titleLen = visibleWidth(titleDisplay);
		const leftLen = Math.floor((inner - titleLen) / 2);
		const rightLen = inner - titleLen - leftLen;
		return (
			"╭" +
			"─".repeat(Math.max(0, leftLen)) +
			titleDisplay +
			"─".repeat(Math.max(0, rightLen)) +
			"╮"
		);
	}

	private borderBottom(width: number): string {
		return "╰" + "─".repeat(width - 2) + "╯";
	}

	private borderMid(width: number): string {
		return "├" + "─".repeat(width - 2) + "┤";
	}

	private padLine(content: string, innerWidth: number): string {
		const contentWidth = visibleWidth(content);
		if (contentWidth >= innerWidth) {
			return truncateToWidth(content, innerWidth, "…");
		}
		return content + " ".repeat(innerWidth - contentWidth);
	}

	dispose?(): void {
		// No timers or resources to clean up
	}
}
