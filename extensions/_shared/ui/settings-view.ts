import { Container, Key, matchesKey, SettingsList, Spacer, Text, type Component } from "@mariozechner/pi-tui";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { PiSchemaSettingsContribution, PiSettingValue, PiSettingsField, PiSettingsSchema, PiSettingsValues } from "../registry";

export interface GenericSettingsViewOptions {
	ctx: ExtensionCommandContext;
	theme: {
		fg(color: string, text: string): string;
		bold(text: string): string;
	};
	title: string;
	schema: PiSettingsSchema;
	values: PiSettingsValues;
	contribution: PiSchemaSettingsContribution;
	done(): void;
	requestRender?: () => void;
}

export class GenericSettingsView implements Component {
	private draft: PiSettingsValues;
	private container: Container;
	private list: SettingsList;
	private message = "Ctrl+S apply · Esc cancel · ↑↓ move · ←→ change · / search";

	constructor(private options: GenericSettingsViewOptions) {
		this.draft = { ...options.values };
		this.container = new Container();
		this.list = this.createList();
		this.rebuild();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			void this.options.contribution.onCancel?.(this.options.ctx);
			this.options.done();
			return;
		}
		if (matchesKey(data, Key.ctrl("s"))) {
			void this.apply();
			return;
		}
		this.list.handleInput?.(data);
	}

	render(width: number): string[] {
		return this.container.render(width);
	}

	invalidate(): void {
		this.container.invalidate();
	}

	private rebuild(): void {
		this.container = new Container();
		this.container.addChild(new Text(this.options.theme.fg("accent", this.options.theme.bold(this.options.title)), 1, 0));
		if (this.options.schema.description) this.container.addChild(new Text(this.options.theme.fg("dim", this.options.schema.description), 1, 0));
		this.container.addChild(new Spacer(1));
		this.container.addChild(this.list);
		this.container.addChild(new Spacer(1));
		this.container.addChild(new Text(this.options.theme.fg("dim", this.message), 1, 0));
	}

	private createList(): SettingsList {
		const fields = flattenFields(this.options.schema);
		const items = fields.map((field) => ({
			id: field.id,
			label: field.label,
			description: field.description,
			currentValue: valueToString(this.draft[field.id] ?? field.defaultValue ?? defaultForField(field)),
			values: valuesForField(field),
		}));
		return new SettingsList(
			items,
			Math.min(12, Math.max(4, items.length)),
			{
				label: (s: string, selected: boolean) => (selected ? this.options.theme.fg("accent", s) : this.options.theme.fg("text", s)),
				value: (s: string, selected: boolean) => (selected ? this.options.theme.fg("accent", s) : this.options.theme.fg("muted", s)),
				description: (s: string) => this.options.theme.fg("dim", s),
				cursor: this.options.theme.fg("accent", "▶ "),
				hint: (s: string) => this.options.theme.fg("dim", s),
			},
			(id: string, newValue: string) => {
				const field = fields.find((f) => f.id === id);
				if (!field) return;
				const oldValue = this.draft[id] ?? null;
				const parsed = parseValue(field, newValue);
				this.draft[id] = parsed;
				void this.options.contribution.onChange?.({ fieldId: id, oldValue, newValue: parsed }, this.draft, this.options.ctx);
				this.options.requestRender?.();
			},
			() => {
				void this.options.contribution.onCancel?.(this.options.ctx);
				this.options.done();
			},
			{ enableSearch: true },
		);
	}

	private async apply(): Promise<void> {
		const validation = await this.options.contribution.validate?.(this.draft, this.options.ctx);
		if (validation && !validation.ok) {
			this.message = `Validation failed: ${(validation.errors ?? []).map((e) => e.message).join("; ")}`;
			this.rebuild();
			this.options.requestRender?.();
			return;
		}
		await this.options.contribution.onApply(this.draft, this.options.ctx);
		this.options.done();
	}
}

export async function resolveSettingsSchema(contribution: PiSchemaSettingsContribution, ctx: ExtensionCommandContext): Promise<PiSettingsSchema> {
	return typeof contribution.schema === "function" ? contribution.schema(ctx) : contribution.schema;
}

function flattenFields(schema: PiSettingsSchema): PiSettingsField[] {
	return schema.sections.flatMap((section) => section.fields);
}

function valuesForField(field: PiSettingsField): string[] {
	switch (field.type) {
		case "boolean":
			return ["true", "false"];
		case "select":
		case "multiselect":
			return field.options.map((option) => option.value);
		case "number": {
			const min = field.min ?? 0;
			const max = field.max ?? Math.min(min + 10, 10);
			const step = field.step ?? 1;
			const values: string[] = [];
			for (let value = min; value <= max && values.length < 30; value += step) values.push(String(value));
			return values;
		}
		case "string":
		case "path":
			return [valueToString(field.defaultValue ?? "")];
	}
}

function parseValue(field: PiSettingsField, value: string): PiSettingValue {
	if (field.type === "boolean") return value === "true";
	if (field.type === "number") return Number(value);
	if (field.type === "multiselect") return value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
	return value;
}

function valueToString(value: PiSettingValue): string {
	if (Array.isArray(value)) return value.join(", ");
	if (value === null || value === undefined) return "";
	return String(value);
}

function defaultForField(field: PiSettingsField): PiSettingValue {
	if (field.type === "boolean") return false;
	if (field.type === "number") return field.min ?? 0;
	if (field.type === "multiselect") return [];
	return "";
}
