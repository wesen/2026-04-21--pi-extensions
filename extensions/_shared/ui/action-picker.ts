import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@mariozechner/pi-tui";
import type { PiExtensionAction, PiExtensionRegistration } from "../registry";

export interface ActionPickerOptions {
	extension: PiExtensionRegistration;
	theme: { fg(color: string, text: string): string; bold(text: string): string };
	done(action: PiExtensionAction | undefined): void;
	requestRender?: () => void;
}

export class ActionPicker implements Component {
	private readonly actions: PiExtensionAction[];
	private cursor = 0;
	private query = "";

	constructor(private options: ActionPickerOptions) {
		this.actions = options.extension.actions ?? [];
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) return this.options.done(undefined);
		if (matchesKey(data, Key.enter)) return this.options.done(this.filtered()[this.cursor]);
		if (matchesKey(data, Key.up)) return this.move(-1);
		if (matchesKey(data, Key.down)) return this.move(1);
		if (matchesKey(data, Key.backspace)) {
			this.query = this.query.slice(0, -1);
			this.cursor = 0;
			this.options.requestRender?.();
			return;
		}
		if (matchesKey(data, Key.ctrl("u"))) {
			this.query = "";
			this.cursor = 0;
			this.options.requestRender?.();
			return;
		}
		if (data.length === 1 && data >= " " && data !== "\u007f") {
			this.query += data;
			this.cursor = 0;
			this.options.requestRender?.();
		}
	}

	render(width: number): string[] {
		const w = Math.max(60, Math.min(width, 100));
		const inner = w - 2;
		const leftW = Math.max(24, Math.min(34, Math.floor((w - 3) * 0.4)));
		const rightW = w - 3 - leftW;
		const actions = this.filtered();
		this.cursor = Math.min(this.cursor, Math.max(0, actions.length - 1));
		const selected = actions[this.cursor];
		const rows = 10;
		const lines: string[] = [];
		lines.push(top(w, `${this.options.extension.name} Actions`, this.options.theme));
		lines.push(row(` Search: ${this.query || this.options.theme.fg("dim", "type to filter")}`, inner, this.options.theme));
		lines.push(row(this.options.theme.fg("dim", " Enter run · Esc back · ↑↓ navigate"), inner, this.options.theme));
		lines.push(split("├", "┬", "┤", leftW, rightW, this.options.theme));
		const left = this.renderActions(actions, leftW, rows);
		const right = this.renderDetails(selected, rightW, rows);
		for (let i = 0; i < rows; i++) lines.push(`${this.options.theme.fg("border", "│")}${pad(left[i] ?? "", leftW)}${this.options.theme.fg("border", "│")}${pad(right[i] ?? "", rightW)}${this.options.theme.fg("border", "│")}`);
		lines.push(split("╰", "┴", "╯", leftW, rightW, this.options.theme));
		return lines.map((line) => truncateToWidth(line, w, ""));
	}

	invalidate(): void {}

	private filtered(): PiExtensionAction[] {
		const q = this.query.trim().toLowerCase();
		if (!q) return this.actions;
		return this.actions.filter((a) => [a.id, a.title, a.description ?? "", ...(a.tags ?? [])].join(" ").toLowerCase().includes(q));
	}

	private move(delta: number): void {
		const count = this.filtered().length;
		if (!count) return;
		this.cursor = Math.max(0, Math.min(count - 1, this.cursor + delta));
		this.options.requestRender?.();
	}

	private renderActions(actions: PiExtensionAction[], width: number, rows: number): string[] {
		if (!actions.length) return [this.options.theme.fg("warning", " No matching actions")];
		return actions.slice(0, rows).map((action, index) => {
			const marker = index === this.cursor ? this.options.theme.fg("accent", "●") : this.options.theme.fg("dim", "○");
			const title = index === this.cursor ? this.options.theme.bold(action.title) : action.title;
			return truncateToWidth(` ${marker} ${title}`, width, "…");
		});
	}

	private renderDetails(action: PiExtensionAction | undefined, width: number, rows: number): string[] {
		if (!action) return [this.options.theme.fg("dim", " DETAILS"), "", " Select an action"];
		const lines = [this.options.theme.fg("dim", " DETAILS"), "", ` ${this.options.theme.fg("accent", this.options.theme.bold(action.title))}`];
		if (action.description) lines.push(...wrapTextWithAnsi(` ${action.description}`, width));
		if (action.tags?.length) lines.push("", ` ${this.options.theme.fg("dim", "Tags")}`, `   ${action.tags.join("  ")}`);
		lines.push("", ` ${this.options.theme.fg("dim", "Registered as")}`, `   ${action.id}`);
		return lines.slice(0, rows).map((line) => truncateToWidth(line, width, "…"));
	}
}

function top(width: number, title: string, theme: ActionPickerOptions["theme"]): string {
	const label = ` ${title} `;
	const remaining = Math.max(0, width - 2 - visibleWidth(label));
	const left = Math.floor(remaining / 2);
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", theme.bold(label)) + theme.fg("border", "─".repeat(remaining - left) + "╮");
}

function row(content: string, width: number, theme: ActionPickerOptions["theme"]): string {
	return `${theme.fg("border", "│")}${pad(content, width)}${theme.fg("border", "│")}`;
}

function split(left: string, middle: string, right: string, leftW: number, rightW: number, theme: ActionPickerOptions["theme"]): string {
	return theme.fg("border", `${left}${"─".repeat(leftW)}${middle}${"─".repeat(rightW)}${right}`);
}

function pad(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}
