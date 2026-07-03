import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import {
	fuzzyMatch,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
	type TUI,
} from "@mariozechner/pi-tui";

import type { PromptTemplate } from "../types";

/** Filterable template chooser. Resolves undefined on cancel. */
export async function openPicker(ctx: ExtensionCommandContext, templates: PromptTemplate[]): Promise<PromptTemplate | undefined> {
	return ctx.ui.custom<PromptTemplate | undefined>(
		(tui: TUI, theme: Theme, _keybindings: unknown, done: (result: PromptTemplate | undefined) => void) =>
			new PromptoTemplatePicker(tui, theme, templates, done),
		{ overlay: true, overlayOptions: { anchor: "center", width: 84, maxHeight: "90%", margin: 1 } },
	);
}

class PromptoTemplatePicker implements Component {
	private query = "";
	private filtered: PromptTemplate[];
	private selectedIndex = 0;
	private lastVisibleStart = 0;
	private lastVisibleCount = 0;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly templates: PromptTemplate[],
		private readonly done: (result: PromptTemplate | undefined) => void,
	) {
		this.filtered = templates;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.selectCurrent();
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
		if (matchesKey(data, Key.pageUp)) {
			this.move(-Math.max(1, this.lastVisibleCount));
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.move(Math.max(1, this.lastVisibleCount));
			return;
		}
		if (matchesKey(data, Key.home)) {
			this.setSelected(0);
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.setSelected(this.filtered.length - 1);
			return;
		}
		if (matchesKey(data, Key.backspace)) {
			if (this.query.length === 0) return;
			this.query = this.query.slice(0, -1);
			this.applyFilter();
			return;
		}
		if (matchesKey(data, Key.ctrl("u"))) {
			if (this.query.length === 0) return;
			this.query = "";
			this.applyFilter();
			return;
		}

		const quickIndex = this.getAltDigitIndex(data);
		if (quickIndex !== undefined) {
			const picked = this.filtered[this.lastVisibleStart + quickIndex];
			if (picked) this.done(picked);
			return;
		}

		if (isPrintableInput(data)) {
			this.query += data;
			this.applyFilter();
		}
	}

	render(width: number): string[] {
		const modalWidth = Math.max(20, Math.min(width, 96));
		const innerWidth = Math.max(1, modalWidth - 4);
		const listHeight = this.filtered.length === 0 ? 10 : Math.min(16, Math.max(10, this.filtered.length));

		const body = [
			...this.renderHeader(innerWidth),
			this.divider(innerWidth),
			...this.renderList(innerWidth, listHeight),
			this.divider(innerWidth),
			...this.renderFooter(innerWidth),
		];

		return [
			this.topBorder(modalWidth, "Prompto templates"),
			...body.map((line) => this.frameRow(line, innerWidth)),
			this.bottomBorder(modalWidth),
		];
	}

	invalidate(): void {
		// No cached render state.
	}

	private renderHeader(width: number): string[] {
		const queryText = this.query.length > 0 ? this.theme.fg("accent", this.query) : this.theme.fg("dim", "type to fuzzy match by name, title, source, or description");
		return [
			truncateToWidth(`Search  ${queryText}`, width, "…"),
			truncateToWidth(
				this.theme.fg("dim", `${this.filtered.length}/${this.templates.length} templates · Enter open · Esc cancel · Ctrl+U clear`),
				width,
				"…",
			),
		];
	}

	private renderList(width: number, height: number): string[] {
		if (this.filtered.length === 0) {
			this.lastVisibleStart = 0;
			this.lastVisibleCount = 0;
			return fitLines([
				"",
				this.theme.fg("warning", "No prompt templates match that query."),
				this.theme.fg("dim", "Backspace or Ctrl+U to broaden the search."),
			], width, height);
		}

		const needsScrollIndicator = this.filtered.length > height;
		const itemWindow = Math.max(1, height - (needsScrollIndicator ? 1 : 0));
		const start = Math.max(0, Math.min(this.selectedIndex - Math.floor(itemWindow / 2), Math.max(0, this.filtered.length - itemWindow)));
		const end = Math.min(start + itemWindow, this.filtered.length);
		this.lastVisibleStart = start;
		this.lastVisibleCount = end - start;

		const rows: string[] = [];
		for (let i = start; i < end; i++) {
			const template = this.filtered[i];
			if (!template) continue;
			const isSelected = i === this.selectedIndex;
			const quickKey = i - start < 9 ? this.theme.fg("dim", `${i - start + 1}`) : " ";
			const pointer = isSelected ? this.theme.fg("accent", "›") : " ";
			const badge = this.theme.fg(template.source === "project" ? "success" : "muted", template.source);
			const kind = this.theme.fg("dim", template.kind);
			const name = isSelected ? this.theme.fg("accent", this.theme.bold(template.name)) : template.name;
			const title = template.title ?? template.description ?? (template.kind === "plain" ? "(plain prompt)" : "");
			const detail = title ? this.theme.fg("muted", ` — ${title}`) : "";

			rows.push(truncateToWidth(`${quickKey} ${pointer} ${name}  ${badge} ${kind}${detail}`, width, "…"));
		}

		if (end < this.filtered.length || start > 0) {
			rows.push(this.theme.fg("dim", truncateToWidth(`(${this.selectedIndex + 1}/${this.filtered.length})`, width, "")));
		}

		return fitLines(rows, width, height);
	}

	private renderFooter(width: number): string[] {
		const current = this.filtered[this.selectedIndex];
		const lines: string[] = [
			this.theme.fg("dim", "↑↓ move · PgUp/PgDn jump · Alt+1-9 quick open visible row · type searches immediately"),
		];

		if (!current) return lines;

		const description = current.description && current.description !== current.title ? current.description : undefined;
		const detail = [current.title, description].filter(Boolean).join(" — ");
		if (detail) {
			lines.push(...wrapTextWithAnsi(this.theme.fg("muted", detail), width).slice(0, 2));
		}
		lines.push(this.theme.fg("dim", `/${current.name} · ${current.fields.length} fields · submit:${current.submit}`));
		return lines.map((line) => truncateToWidth(line, width, "…"));
	}

	private applyFilter(): void {
		this.filtered = filterTemplates(this.templates, this.query);
		this.selectedIndex = 0;
		this.tui.requestRender();
	}

	private move(delta: number): void {
		if (this.filtered.length === 0) return;
		this.selectedIndex = clamp(this.selectedIndex + delta, 0, this.filtered.length - 1);
		this.tui.requestRender();
	}

	private setSelected(index: number): void {
		if (this.filtered.length === 0) return;
		this.selectedIndex = clamp(index, 0, this.filtered.length - 1);
		this.tui.requestRender();
	}

	private selectCurrent(): void {
		const selected = this.filtered[this.selectedIndex];
		if (selected) this.done(selected);
	}

	private getAltDigitIndex(data: string): number | undefined {
		const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
		for (let i = 0; i < digits.length; i++) {
			if (matchesKey(data, Key.alt(digits[i]))) return i;
		}
		return undefined;
	}

	private topBorder(width: number, title: string): string {
		const label = ` ${title} `;
		const available = Math.max(0, width - 2 - visibleWidth(label));
		const left = Math.floor(available / 2);
		const right = available - left;
		return this.theme.fg("borderAccent", `╭${"─".repeat(left)}${label}${"─".repeat(right)}╮`);
	}

	private bottomBorder(width: number): string {
		return this.theme.fg("borderAccent", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
	}

	private divider(width: number): string {
		return this.theme.fg("borderMuted", "─".repeat(Math.max(0, width)));
	}

	private frameRow(line: string, width: number): string {
		return `${this.theme.fg("borderAccent", "│")} ${padToWidth(line, width)} ${this.theme.fg("borderAccent", "│")}`;
	}
}

function filterTemplates(templates: PromptTemplate[], query: string): PromptTemplate[] {
	const tokens = query.trim().split(/[\s/]+/).filter(Boolean);
	if (tokens.length === 0) return templates;

	const matches = templates
		.map((template) => {
			const chunks = searchableTemplateChunks(template);
			let score = 0;
			for (const token of tokens) {
				const best = chunks
					.map((chunk) => fuzzyMatch(token, chunk))
					.filter((match) => match.matches)
					.sort((a, b) => a.score - b.score)[0];
				if (!best) return undefined;
				score += best.score;
			}
			return { template, score };
		})
		.filter((match): match is { template: PromptTemplate; score: number } => match !== undefined);

	matches.sort((a, b) => a.score - b.score || a.template.name.localeCompare(b.template.name));
	return matches.map((match) => match.template);
}

function searchableTemplateChunks(template: PromptTemplate): string[] {
	return [
		template.name,
		template.group,
		template.title,
		template.description,
		template.source,
		template.kind,
		template.submit,
		...template.fields.flatMap((field) => [field.name, field.label, field.help, field.placeholder]),
	].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function fitLines(lines: string[], width: number, height: number): string[] {
	const clipped = lines.slice(0, height).map((line) => truncateToWidth(line, width, "…"));
	while (clipped.length < height) clipped.push("");
	return clipped;
}

function padToWidth(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function isPrintableInput(data: string): boolean {
	return data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) !== 127;
}
