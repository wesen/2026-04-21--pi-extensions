import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { cacheTracePlot, fit, legend, sparkline } from "./plot";
import type { CacheTraceRecord, CacheTraceState } from "./state";

interface CacheTraceOverlayOptions {
	tui: TUI;
	theme: Theme;
	state: CacheTraceState;
	done: () => void;
}

type Tab = "overview" | "records" | "requests" | "help";

const TABS: Tab[] = ["overview", "records", "requests", "help"];

export class CacheTraceOverlay implements Component {
	private tab: Tab = "overview";
	private selected = 0;
	private scroll = 0;
	private query = "";
	private searchMode = false;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(private options: CacheTraceOverlayOptions) {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			if (this.searchMode) this.searchMode = false;
			else this.options.done();
			this.markDirty();
			return;
		}
		if (this.searchMode) {
			if (matchesKey(data, Key.enter)) this.searchMode = false;
			else if (matchesKey(data, Key.backspace)) this.query = this.query.slice(0, -1);
			else if (matchesKey(data, Key.ctrl("u"))) this.query = "";
			else if (data.length === 1 && data.charCodeAt(0) >= 32) this.query += data;
			this.selected = 0;
			this.scroll = 0;
			this.markDirty();
			return;
		}
		if (data === "/") {
			this.searchMode = true;
			this.markDirty();
			return;
		}
		if (data === "h" || matchesKey(data, Key.left)) this.moveTab(-1);
		else if (data === "l" || matchesKey(data, Key.right)) this.moveTab(1);
		else if (matchesKey(data, Key.down) || data === "j") this.moveSelection(1);
		else if (matchesKey(data, Key.up) || data === "k") this.moveSelection(-1);
		else if (data === "g") this.setSelection(0);
		else if (data === "G") this.setSelection(this.filteredRecords().length - 1);
	}

	render(width: number): string[] {
		const modalWidth = Math.max(72, Math.min(width, 118));
		if (this.cachedWidth === modalWidth && this.cachedLines) return this.cachedLines;
		const innerWidth = modalWidth - 4;
		const body = this.renderBody(innerWidth);
		const rows = [
			borderTop(modalWidth, " Cache Trace ", this.options.theme),
			frameRow(this.renderTabLine(innerWidth), innerWidth, this.options.theme),
			frameRow(this.renderSearchLine(innerWidth), innerWidth, this.options.theme),
			borderMid(modalWidth, this.options.theme),
			...body.map((line) => frameRow(line, innerWidth, this.options.theme)),
			borderMid(modalWidth, this.options.theme),
			frameRow(this.options.theme.fg("dim", "h/l tabs · ↑↓ move · / filter · Esc close"), innerWidth, this.options.theme),
			borderBottom(modalWidth, this.options.theme),
		];
		this.cachedWidth = modalWidth;
		this.cachedLines = rows.map((line) => truncateToWidth(line, modalWidth, ""));
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private renderBody(width: number): string[] {
		if (this.tab === "overview") return this.renderOverview(width);
		if (this.tab === "records") return this.renderRecords(width);
		if (this.tab === "requests") return this.renderRequests(width);
		return this.renderHelp(width);
	}

	private renderOverview(width: number): string[] {
		const records = this.filteredRecords();
		const latest = records[records.length - 1];
		const lines: string[] = [];
		lines.push(this.options.theme.fg("accent", this.options.theme.bold(`${records.length} LLM cache snapshot(s)`)));
		if (!latest) {
			lines.push("", "No assistant usage records yet. Send a prompt, then reopen /cache-trace.");
			return padHeight(lines, 18);
		}
		lines.push(`Latest: run ${latest.agentRunId}.${latest.callIndexInAgent} ${latest.provider}/${latest.model}`);
		lines.push(`Cache: ${latest.cacheEvent} · read ${latest.usage.cacheRead} · write ${latest.usage.cacheWrite} · input ${latest.usage.input} · output ${latest.usage.output}`);
		lines.push(`Provider requests before latest message: ${latest.providerRequestCount} · tool results in run: ${latest.toolResultCount}`);
		lines.push(`Cache-read sparkline: ${sparkline(records.map((r) => r.usage.cacheRead), Math.max(10, width - 22))}`);
		lines.push("", legend(width));
		lines.push(...cacheTracePlot(records, width, 10));
		lines.push("");
		lines.push(...wrapTextWithAnsi("Interpretation: a drop from non-zero cache-read tokens to zero after stable prefixes usually indicates a cache miss or cache clear. More than one provider request before one assistant message suggests retries or provider-level replays.", width));
		return padHeight(lines, 18);
	}

	private renderRecords(width: number): string[] {
		const records = this.filteredRecords();
		this.clampSelection(records.length);
		const visible = records.slice(this.scroll, this.scroll + 16);
		const lines = [this.options.theme.fg("dim", "ID  run.call  event            read/write     input→out    req  notes")];
		for (let i = 0; i < visible.length; i++) {
			const record = visible[i];
			const index = this.scroll + i;
			const selected = index === this.selected;
			const row = `${String(record.id).padStart(3)} ${record.agentRunId}.${record.callIndexInAgent.toString().padEnd(5)} ${record.cacheEvent.padEnd(15)} ${String(record.usage.cacheRead).padStart(5)}/${String(record.usage.cacheWrite).padEnd(5)} ${String(record.usage.input).padStart(6)}→${String(record.usage.output).padEnd(5)} ${String(record.providerRequestCount).padStart(3)}  ${record.notes.join("; ")}`;
			lines.push(selected ? this.options.theme.bg("selectedBg", fit(row, width)) : row);
		}
		if (records.length === 0) lines.push("No matching records.");
		return padHeight(lines, 18);
	}

	private renderRequests(width: number): string[] {
		const requests = this.options.state.providerRequests.slice(-18);
		const responses = this.options.state.providerResponses.slice(-18);
		const leftWidth = Math.floor((width - 3) / 2);
		const rightWidth = width - leftWidth - 3;
		const left = [this.options.theme.fg("dim", "Provider requests")];
		for (const request of requests) left.push(`#${request.id} run ${request.agentRunId} req ${request.requestIndexInAgent} msg=${request.messageCount ?? "?"} tools=${request.toolCount ?? "?"}`);
		const right = [this.options.theme.fg("dim", "Provider responses")];
		for (const response of responses) right.push(`#${response.id} run ${response.agentRunId} status=${response.status}`);
		const height = Math.max(left.length, right.length, 18);
		const lines: string[] = [];
		for (let i = 0; i < height; i++) lines.push(`${fit(left[i] ?? "", leftWidth)} │ ${fit(right[i] ?? "", rightWidth)}`);
		return lines;
	}

	private renderHelp(width: number): string[] {
		return padHeight([
			this.options.theme.fg("accent", "What this extension measures"),
			"",
			...wrapTextWithAnsi("Cache Trace records Pi provider-request hooks and assistant usage after each LLM call. It renders cacheRead/cacheWrite/input/output usage, counts provider requests per assistant message, and marks likely hits, misses, write-only calls, and suspected cache clears.", width),
			"",
			"Limitations:",
			"- Provider usage is only as precise as the normalized AssistantMessage.usage object.",
			"- Retry internals are inferred from before_provider_request/after_provider_response counts.",
			"- Visible timeline cards are custom messages and should remain concise.",
		], 18);
	}

	private renderTabLine(width: number): string {
		return TABS.map((tab) => (tab === this.tab ? this.options.theme.fg("accent", `[${tab}]`) : ` ${tab} `)).join("  ").slice(0, width);
	}

	private renderSearchLine(width: number): string {
		const prefix = this.searchMode ? "Filter: " : "Filter (/): ";
		return truncateToWidth(prefix + (this.query || this.options.theme.fg("dim", "all records")), width, "…");
	}

	private filteredRecords(): CacheTraceRecord[] {
		const q = this.query.trim().toLowerCase();
		if (!q) return this.options.state.records;
		return this.options.state.records.filter((record) => `${record.id} ${record.provider} ${record.model} ${record.cacheEvent} ${record.notes.join(" ")}`.toLowerCase().includes(q));
	}

	private moveTab(delta: number): void {
		const index = TABS.indexOf(this.tab);
		this.tab = TABS[(index + delta + TABS.length) % TABS.length];
		this.markDirty();
	}

	private moveSelection(delta: number): void {
		this.setSelection(this.selected + delta);
	}

	private setSelection(value: number): void {
		this.selected = Math.max(0, Math.min(value, this.filteredRecords().length - 1));
		if (this.selected < this.scroll) this.scroll = this.selected;
		if (this.selected >= this.scroll + 16) this.scroll = this.selected - 15;
		this.markDirty();
	}

	private clampSelection(length: number): void {
		this.selected = Math.max(0, Math.min(this.selected, Math.max(0, length - 1)));
		this.scroll = Math.max(0, Math.min(this.scroll, this.selected));
	}

	private markDirty(): void {
		this.invalidate();
		this.options.tui.requestRender();
	}
}

function frameRow(value: string, width: number, theme: Theme): string {
	return `${theme.fg("border", "│")} ${fit(value, width)} ${theme.fg("border", "│")}`;
}

function borderTop(width: number, title: string, theme: Theme): string {
	const left = "╭";
	const right = "╮";
	const remaining = Math.max(0, width - visibleWidth(left + right + title));
	const before = Math.floor(remaining / 2);
	const after = remaining - before;
	return theme.fg("border", `${left}${"─".repeat(before)}${title}${"─".repeat(after)}${right}`);
}

function borderMid(width: number, theme: Theme): string {
	return theme.fg("border", `├${"─".repeat(Math.max(0, width - 2))}┤`);
}

function borderBottom(width: number, theme: Theme): string {
	return theme.fg("border", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
}

function padHeight(lines: string[], min: number): string[] {
	while (lines.length < min) lines.push("");
	return lines;
}
