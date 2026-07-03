import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type TUI } from "@mariozechner/pi-tui";

import { formatValue } from "../template";
import type { FieldValue, PromptTemplate, TemplateField } from "../types";

/**
 * Schema-generated modal form. Resolves with the value map on submit,
 * or undefined on cancel.
 */
export async function openForm(
	ctx: ExtensionCommandContext,
	template: PromptTemplate,
	seed: Record<string, FieldValue>,
): Promise<Record<string, FieldValue> | undefined> {
	return ctx.ui.custom<Record<string, FieldValue> | undefined>(
		(tui, theme, _keybindings, done) => new PromptFormComponent(template, seed, tui, theme, ctx, done),
		{ overlay: true, overlayOptions: { anchor: "center", width: "85%", maxHeight: "85%", margin: 1 } },
	);
}

type ButtonId = "submit" | "cancel";

export class PromptFormComponent implements Component {
	private readonly values: Record<string, FieldValue>;
	private focus = 0; // 0..fields.length-1 = fields, fields.length = button row
	private button: ButtonId = "submit";
	private choiceCursor = 0; // inner cursor for multichoice rows
	private error: string | undefined;
	private editingText = false; // nested ui.editor open
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(
		private readonly template: PromptTemplate,
		seed: Record<string, FieldValue>,
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly ctx: ExtensionCommandContext,
		private readonly done: (result: Record<string, FieldValue> | undefined) => void,
	) {
		this.values = { ...seed };
	}

	handleInput(data: string): void {
		if (this.editingText) return;
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) {
			this.moveFocus(1);
		} else if (matchesKey(data, Key.up) || matchesKey(data, Key.shift("tab"))) {
			this.moveFocus(-1);
		} else if (this.focus >= this.template.fields.length) {
			this.handleButtonRow(data);
		} else {
			this.handleFieldInput(this.template.fields[this.focus], data);
		}
		this.markDirty();
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
		const theme = this.theme;
		const modalWidth = Math.max(50, Math.min(width, 110));
		const inner = modalWidth - 2;
		const labelWidth = Math.min(
			28,
			Math.max(10, ...this.template.fields.map((f) => visibleWidth(this.labelFor(f)) + 2)),
		);

		const lines: string[] = [];
		lines.push(borderTop(modalWidth, this.template.title ?? this.template.name, theme));
		if (this.template.description) {
			for (const wrapped of wrapTextWithAnsi(` ${this.template.description}`, inner)) {
				lines.push(frameRow(theme.fg("muted", wrapped), inner, theme));
			}
		}
		lines.push(frameRow("", inner, theme));
		this.template.fields.forEach((field, index) => {
			for (const row of this.renderFieldRows(field, index, labelWidth, inner)) {
				lines.push(frameRow(row, inner, theme));
			}
		});
		lines.push(frameRow("", inner, theme));
		if (this.error) lines.push(frameRow(theme.fg("error", ` ${this.error}`), inner, theme));
		lines.push(frameRow(this.renderButtonRow(), inner, theme));
		lines.push(frameRow(theme.fg("dim", ` ${this.hintText()}`), inner, theme));
		lines.push(borderBottom(modalWidth, theme));

		this.cachedWidth = width;
		this.cachedLines = lines.map((line) => truncateToWidth(line, modalWidth, ""));
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	// ── input handling ──

	private moveFocus(delta: number): void {
		const max = this.template.fields.length; // button row index
		this.focus = Math.max(0, Math.min(max, this.focus + delta));
		this.choiceCursor = 0;
		this.error = undefined;
	}

	private handleButtonRow(data: string): void {
		if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
			this.button = this.button === "submit" ? "cancel" : "submit";
		} else if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
			if (this.button === "cancel") this.done(undefined);
			else this.trySubmit();
		}
	}

	private handleFieldInput(field: TemplateField, data: string): void {
		switch (field.type) {
			case "boolean":
				if (matchesKey(data, Key.space) || matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
					this.values[field.name] = !this.values[field.name];
				} else if (matchesKey(data, Key.enter)) {
					this.moveFocus(1);
				}
				break;
			case "choice": {
				const choices = field.choices ?? [];
				if (matchesKey(data, Key.left) || matchesKey(data, Key.right) || matchesKey(data, Key.space)) {
					const delta = matchesKey(data, Key.left) ? -1 : 1;
					const current = choices.indexOf(String(this.values[field.name]));
					const next = (current + delta + choices.length) % choices.length;
					this.values[field.name] = choices[next];
				} else if (matchesKey(data, Key.enter)) {
					this.moveFocus(1);
				}
				break;
			}
			case "multichoice": {
				const choices = field.choices ?? [];
				if (matchesKey(data, Key.left)) this.choiceCursor = Math.max(0, this.choiceCursor - 1);
				else if (matchesKey(data, Key.right)) this.choiceCursor = Math.min(choices.length - 1, this.choiceCursor + 1);
				else if (matchesKey(data, Key.space)) {
					const choice = choices[this.choiceCursor];
					const selected = new Set(this.values[field.name] as string[]);
					if (selected.has(choice)) selected.delete(choice);
					else selected.add(choice);
					this.values[field.name] = choices.filter((c) => selected.has(c));
				} else if (matchesKey(data, Key.enter)) {
					this.moveFocus(1);
				}
				break;
			}
			case "text":
				if (matchesKey(data, Key.enter)) void this.openTextEditor(field);
				break;
			default: {
				// string / number: inline editing at the end of the value
				if (matchesKey(data, Key.enter)) {
					this.moveFocus(1);
				} else if (matchesKey(data, Key.backspace)) {
					this.values[field.name] = String(this.values[field.name] ?? "").slice(0, -1);
				} else if (matchesKey(data, Key.ctrl("u"))) {
					this.values[field.name] = "";
				} else if (data.length === 1 && data >= " " && data !== "") {
					this.values[field.name] = String(this.values[field.name] ?? "") + data;
				}
			}
		}
	}

	private async openTextEditor(field: TemplateField): Promise<void> {
		this.editingText = true;
		try {
			const current = typeof this.values[field.name] === "string" ? (this.values[field.name] as string) : "";
			const edited = await this.ctx.ui.editor(this.labelFor(field), current);
			if (edited !== undefined) this.values[field.name] = edited;
		} finally {
			this.editingText = false;
			this.markDirty();
		}
	}

	private trySubmit(): void {
		const missing: string[] = [];
		for (const field of this.template.fields) {
			const value = this.values[field.name];
			if (field.required && (value === undefined || String(value).trim() === "" || (Array.isArray(value) && value.length === 0))) {
				missing.push(field.label ?? field.name);
			}
			if (field.type === "number") {
				const parsed = Number(String(value).trim());
				if (!Number.isFinite(parsed)) {
					this.error = `"${field.label ?? field.name}" must be a number`;
					return;
				}
				this.values[field.name] = parsed;
			}
		}
		if (missing.length > 0) {
			this.error = `required: ${missing.join(", ")}`;
			return;
		}
		this.done(this.values);
	}

	// ── rendering ──

	private labelFor(field: TemplateField): string {
		return `${field.label ?? field.name}${field.required ? " *" : ""}`;
	}

	private renderFieldRows(field: TemplateField, index: number, labelWidth: number, inner: number): string[] {
		const theme = this.theme;
		const focused = index === this.focus;
		const marker = focused ? theme.fg("accent", "▸ ") : "  ";
		const label = padToWidth(focused ? theme.fg("accent", theme.bold(this.labelFor(field))) : theme.fg("text", this.labelFor(field)), labelWidth);
		const valueWidth = Math.max(10, inner - labelWidth - 4);
		const value = this.renderValue(field, focused, valueWidth);
		const rows = [` ${marker}${label} ${value}`];
		if (focused && field.help) rows.push(theme.fg("dim", `    ${truncateToWidth(field.help, inner - 6, "…")}`));
		return rows;
	}

	private renderValue(field: TemplateField, focused: boolean, width: number): string {
		const theme = this.theme;
		const value = this.values[field.name];
		const cursor = focused ? theme.fg("accent", "█") : "";
		switch (field.type) {
			case "boolean":
				return value ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
			case "choice": {
				const text = `◂ ${formatValue(value)} ▸`;
				return focused ? theme.fg("accent", text) : theme.fg("muted", text);
			}
			case "multichoice": {
				const choices = field.choices ?? [];
				const selected = new Set(value as string[]);
				return truncateToWidth(
					choices
						.map((choice, i) => {
							const box = selected.has(choice) ? "[x]" : "[ ]";
							const cell = `${box} ${choice}`;
							if (focused && i === this.choiceCursor) return theme.fg("accent", theme.bold(cell));
							return selected.has(choice) ? theme.fg("success", cell) : theme.fg("dim", cell);
						})
						.join("  "),
					width,
					"…",
				);
			}
			case "text": {
				const text = String(value ?? "");
				const preview = text.trim() === "" ? theme.fg("dim", focused ? "(enter to edit)" : "(empty)") : theme.fg("muted", truncateToWidth(text.replace(/\n/g, " ⏎ "), width - 2, "…"));
				return `${preview}${focused ? ` ${theme.fg("dim", "⏎ edit")}` : ""}`;
			}
			default: {
				const text = String(value ?? "");
				if (text === "" && field.placeholder && !focused) return theme.fg("dim", field.placeholder);
				const shown = truncateToWidth(text, width - 2, "…");
				return `${theme.fg(focused ? "text" : "muted", shown)}${cursor}`;
			}
		}
	}

	private renderButtonRow(): string {
		const theme = this.theme;
		const onButtons = this.focus >= this.template.fields.length;
		const submit = onButtons && this.button === "submit" ? theme.fg("accent", theme.bold("[ Submit ]")) : theme.fg("muted", "[ Submit ]");
		const cancel = onButtons && this.button === "cancel" ? theme.fg("accent", theme.bold("[ Cancel ]")) : theme.fg("muted", "[ Cancel ]");
		return ` ${submit}   ${cancel}`;
	}

	private hintText(): string {
		const field = this.template.fields[this.focus];
		if (!field) return "←→ pick · enter confirm · esc cancel";
		switch (field.type) {
			case "boolean":
				return "space toggle · ↑↓/tab move · esc cancel";
			case "choice":
				return "←→ cycle · ↑↓/tab move · esc cancel";
			case "multichoice":
				return "←→ move · space toggle · ↑↓/tab next · esc cancel";
			case "text":
				return "enter edit in overlay · ↑↓/tab move · esc cancel";
			default:
				return "type to edit · ctrl+u clear · ↑↓/tab move · esc cancel";
		}
	}

	private markDirty(): void {
		this.invalidate();
		this.tui.requestRender();
	}
}

function borderTop(width: number, title: string, theme: Theme): string {
	const label = ` ${truncateToWidth(title, width - 6, "…")} `;
	const remaining = Math.max(0, width - 2 - visibleWidth(label));
	const left = Math.floor(remaining / 2);
	const right = remaining - left;
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", theme.bold(label)) + theme.fg("border", "─".repeat(right) + "╮");
}

function borderBottom(width: number, theme: Theme): string {
	return theme.fg("border", "╰" + "─".repeat(Math.max(0, width - 2)) + "╯");
}

function frameRow(content: string, width: number, theme: Theme): string {
	return `${theme.fg("border", "│")}${padToWidth(content, width)}${theme.fg("border", "│")}`;
}

function padToWidth(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}
