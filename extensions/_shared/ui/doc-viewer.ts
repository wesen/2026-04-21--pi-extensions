import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@mariozechner/pi-tui";

export interface DocViewerOptions {
	title: string;
	markdown: string;
	theme: { fg(color: string, text: string): string; bold(text: string): string };
	done(): void;
	requestRender?: () => void;
}

export class DocViewer implements Component {
	private scroll = 0;
	constructor(private options: DocViewerOptions) {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.backspace) || matchesKey(data, Key.ctrl("c"))) return this.options.done();
		if (matchesKey(data, Key.up)) this.scroll = Math.max(0, this.scroll - 1);
		else if (matchesKey(data, Key.down)) this.scroll++;
		else if (matchesKey(data, Key.pageUp)) this.scroll = Math.max(0, this.scroll - 8);
		else if (matchesKey(data, Key.pageDown)) this.scroll += 8;
		else return;
		this.options.requestRender?.();
	}

	render(width: number): string[] {
		const w = Math.max(60, Math.min(width, 110));
		const inner = w - 2;
		const bodyW = inner - 2;
		const allBody = this.renderMarkdown(bodyW);
		const bodyRows = 18;
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, allBody.length - bodyRows)));
		const visible = allBody.slice(this.scroll, this.scroll + bodyRows);
		const lines: string[] = [top(w, this.options.title, this.options.theme)];
		for (let i = 0; i < bodyRows; i++) lines.push(row(visible[i] ?? "", inner, this.options.theme));
		const scrollInfo = allBody.length > bodyRows ? ` ${this.scroll + 1}-${Math.min(this.scroll + bodyRows, allBody.length)}/${allBody.length}` : "";
		lines.push(row(this.options.theme.fg("dim", ` Esc back · ↑↓ scroll${scrollInfo}`), inner, this.options.theme));
		lines.push(bottom(w, this.options.theme));
		return lines.map((line) => truncateToWidth(line, w, ""));
	}

	invalidate(): void {}

	private renderMarkdown(width: number): string[] {
		const lines: string[] = [];
		for (const raw of this.options.markdown.split(/\r?\n/)) {
			if (!raw.trim()) {
				lines.push("");
				continue;
			}
			const styled = raw.startsWith("# ")
				? this.options.theme.fg("accent", this.options.theme.bold(raw.slice(2)))
				: raw.startsWith("## ")
					? this.options.theme.fg("accent", raw.slice(3))
					: raw.startsWith("- ")
						? `  ${this.options.theme.fg("accent", "•")} ${raw.slice(2)}`
						: raw;
			lines.push(...wrapTextWithAnsi(styled, width));
		}
		return lines;
	}
}

function top(width: number, title: string, theme: DocViewerOptions["theme"]): string {
	const label = ` ${title} `;
	const remaining = Math.max(0, width - 2 - visibleWidth(label));
	const left = Math.floor(remaining / 2);
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", theme.bold(label)) + theme.fg("border", "─".repeat(remaining - left) + "╮");
}

function bottom(width: number, theme: DocViewerOptions["theme"]): string {
	return theme.fg("border", "╰" + "─".repeat(width - 2) + "╯");
}

function row(content: string, width: number, theme: DocViewerOptions["theme"]): string {
	const padded = pad(` ${content}`, width);
	return `${theme.fg("border", "│")}${padded}${theme.fg("border", "│")}`;
}

function pad(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}
