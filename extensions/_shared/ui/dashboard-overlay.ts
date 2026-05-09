import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { renderDashboardOverlayLines } from "../dashboard/manager";

export class DashboardOverlay implements Component {
	private scroll = 0;
	private cachedWidth: number | undefined;
	private cachedBody: string[] | undefined;
	private loading = false;

	constructor(
		private ctx: ExtensionContext,
		private theme: Theme,
		private done: () => void,
		private requestRender?: () => void,
	) {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) return this.done();
		if (matchesKey(data, Key.up)) this.scroll = Math.max(0, this.scroll - 1);
		else if (matchesKey(data, Key.down)) this.scroll++;
		else if (matchesKey(data, Key.pageUp)) this.scroll = Math.max(0, this.scroll - 8);
		else if (matchesKey(data, Key.pageDown)) this.scroll += 8;
		else return;
		this.requestRender?.();
	}

	render(width: number): string[] {
		const w = Math.max(70, Math.min(width, 120));
		const inner = w - 2;
		const bodyRows = 20;
		if (this.cachedWidth !== w && !this.loading) {
			this.loading = true;
			void renderDashboardOverlayLines(this.ctx, this.theme, inner - 2).then((lines) => {
				this.cachedWidth = w;
				this.cachedBody = lines;
				this.loading = false;
				this.requestRender?.();
			});
		}
		const body = this.cachedBody ?? [this.theme.fg("dim", "Loading dashboard...")];
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, body.length - bodyRows)));
		const visible = body.slice(this.scroll, this.scroll + bodyRows);
		const lines = [top(w, "Pi Dashboard", this.theme)];
		for (let i = 0; i < bodyRows; i++) lines.push(row(visible[i] ?? "", inner, this.theme));
		lines.push(row(this.theme.fg("dim", " Esc close · ↑↓ scroll"), inner, this.theme));
		lines.push(bottom(w, this.theme));
		return lines.map((line) => truncateToWidth(line, w, ""));
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedBody = undefined;
	}
}

function top(width: number, title: string, theme: Theme): string {
	const label = ` ${title} `;
	const remaining = Math.max(0, width - 2 - visibleWidth(label));
	const left = Math.floor(remaining / 2);
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", theme.bold(label)) + theme.fg("border", "─".repeat(remaining - left) + "╮");
}
function bottom(width: number, theme: Theme): string {
	return theme.fg("border", "╰" + "─".repeat(width - 2) + "╯");
}
function row(content: string, width: number, theme: Theme): string {
	return `${theme.fg("border", "│")}${pad(` ${content}`, width)}${theme.fg("border", "│")}`;
}
function pad(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}
