import { truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { PiDashboardRendered } from "../registry";
import type { PiDashboardLayoutItem } from "./config";

export interface RenderedDashboardWidget {
	key: string;
	title: string;
	priority: number;
	config: PiDashboardLayoutItem;
	rendered: PiDashboardRendered;
}

export function renderedToLines(rendered: PiDashboardRendered, width: number): string[] {
	if (typeof rendered === "string") return [truncateToWidth(rendered, width, "…")];
	if (Array.isArray(rendered)) return rendered.map((line) => truncateToWidth(line, width, "…"));
	return rendered.render(width).map((line) => truncateToWidth(line, width, "…"));
}

export function renderInlineDashboard(widgets: RenderedDashboardWidget[], width: number): string {
	const chunks: string[] = [];
	let remaining = width;
	for (const widget of orderedVisible(widgets)) {
		const requested = resolveWidth(widget.config.width, width) ?? 24;
		const chunkWidth = Math.max(8, Math.min(requested, remaining));
		const line = renderedToLines(widget.rendered, chunkWidth)[0] ?? "";
		if (!line) continue;
		chunks.push(truncateToWidth(line, chunkWidth, "…"));
		remaining -= chunkWidth + 3;
		if (remaining <= 8) break;
	}
	return chunks.join(" · ");
}

export function renderStackDashboard(widgets: RenderedDashboardWidget[], width: number): string[] {
	const lines: string[] = [];
	for (const widget of orderedVisible(widgets)) {
		lines.push(...renderedToLines(widget.rendered, width));
		lines.push("");
	}
	return lines;
}

export function renderGridDashboard(widgets: RenderedDashboardWidget[], width: number, theme: Theme): string[] {
	const columns = width >= 100 ? 2 : 1;
	const gap = columns === 2 ? 2 : 0;
	const columnWidth = Math.floor((width - gap) / columns);
	const cards = orderedVisible(widgets).map((widget) => frameCard(widget.title, renderedToLines(widget.rendered, columnWidth - 2), columnWidth, theme));
	if (columns === 1) return cards.flatMap((card) => [...card, ""]);
	const lines: string[] = [];
	for (let i = 0; i < cards.length; i += 2) {
		const left = cards[i] ?? [];
		const right = cards[i + 1] ?? [];
		const height = Math.max(left.length, right.length);
		for (let row = 0; row < height; row++) lines.push(pad(left[row] ?? "", columnWidth) + "  " + pad(right[row] ?? "", columnWidth));
		lines.push("");
	}
	return lines;
}

export function orderedVisible(widgets: RenderedDashboardWidget[]): RenderedDashboardWidget[] {
	return widgets
		.filter((widget) => widget.config.visible)
		.sort((a, b) => (a.config.order ?? a.priority) - (b.config.order ?? b.priority) || a.title.localeCompare(b.title));
}

function resolveWidth(width: PiDashboardLayoutItem["width"], total: number): number | undefined {
	if (typeof width === "number") return width;
	if (typeof width === "string" && width.endsWith("%")) return Math.floor((Number.parseInt(width, 10) / 100) * total);
	return undefined;
}

function frameCard(title: string, body: string[], width: number, theme: Theme): string[] {
	const inner = width - 2;
	const lines = [theme.fg("border", "╭" + "─".repeat(inner) + "╮")];
	lines.push(`${theme.fg("border", "│")}${pad(theme.fg("accent", title), inner)}${theme.fg("border", "│")}`);
	lines.push(theme.fg("border", "├" + "─".repeat(inner) + "┤"));
	for (const line of body.slice(0, 8)) lines.push(`${theme.fg("border", "│")}${pad(line, inner)}${theme.fg("border", "│")}`);
	lines.push(theme.fg("border", "╰" + "─".repeat(inner) + "╯"));
	return lines;
}

function pad(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}
