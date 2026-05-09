import type { ExtensionCommandContext, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";

export type PiExtensionActionHandler = (
	ctx: ExtensionCommandContext,
	actionContext?: PiExtensionActionContext,
) => Promise<void> | void;

export interface PiExtensionActionContext {
	extension: PiExtensionRegistration;
	action: PiExtensionAction;
	openDocs(docId?: string): Promise<void>;
	openSettings(): Promise<void>;
	refreshDashboard(): void;
}

export interface PiExtensionAction {
	id: string;
	title: string;
	description?: string;
	icon?: string;
	tags?: string[];
	shortcutHint?: string;
	dangerous?: boolean;
	default?: boolean;
	run: PiExtensionActionHandler;
}

export interface PiExtensionDoc {
	id: string;
	title: string;
	description?: string;
	tags?: string[];
	markdown?: string;
	path?: string;
	load?: (ctx: ExtensionCommandContext) => Promise<string> | string;
}

export type PiSettingValue = string | number | boolean | string[] | null;
export type PiSettingsValues = Record<string, PiSettingValue>;

export interface PiSettingsOption {
	value: string;
	label: string;
	description?: string;
}

interface PiSettingsFieldBase {
	id: string;
	label: string;
	description?: string;
	required?: boolean;
	defaultValue?: PiSettingValue;
	advanced?: boolean;
	secret?: boolean;
}

export type PiSettingsField =
	| (PiSettingsFieldBase & { type: "boolean" })
	| (PiSettingsFieldBase & { type: "string"; placeholder?: string; multiline?: boolean })
	| (PiSettingsFieldBase & { type: "number"; min?: number; max?: number; step?: number })
	| (PiSettingsFieldBase & { type: "select"; options: PiSettingsOption[] })
	| (PiSettingsFieldBase & { type: "multiselect"; options: PiSettingsOption[] })
	| (PiSettingsFieldBase & { type: "path"; mode?: "file" | "directory" | "either" });

export interface PiSettingsSection {
	id: string;
	title: string;
	description?: string;
	fields: PiSettingsField[];
}

export interface PiSettingsSchema {
	version: number;
	title?: string;
	description?: string;
	sections: PiSettingsSection[];
}

export interface PiSettingsChange {
	fieldId: string;
	oldValue: PiSettingValue;
	newValue: PiSettingValue;
}

export interface PiSettingsValidationResult {
	ok: boolean;
	errors?: Array<{ fieldId?: string; message: string }>;
	warnings?: Array<{ fieldId?: string; message: string }>;
}

export interface PiSchemaSettingsContribution {
	kind: "schema";
	schema: PiSettingsSchema | ((ctx: ExtensionCommandContext) => Promise<PiSettingsSchema> | PiSettingsSchema);
	load(ctx: ExtensionCommandContext): Promise<PiSettingsValues> | PiSettingsValues;
	validate?(values: PiSettingsValues, ctx: ExtensionCommandContext): Promise<PiSettingsValidationResult> | PiSettingsValidationResult;
	onChange?(change: PiSettingsChange, values: PiSettingsValues, ctx: ExtensionCommandContext): Promise<void> | void;
	onApply(values: PiSettingsValues, ctx: ExtensionCommandContext): Promise<void> | void;
	onCancel?(ctx: ExtensionCommandContext): Promise<void> | void;
}

export interface PiCustomSettingsOpenOptions {
	ctx: ExtensionCommandContext;
	tui: TUI;
	theme: Theme;
	done: () => void;
	requestRender: () => void;
}

export interface PiCustomSettingsContribution {
	kind: "custom";
	title?: string;
	description?: string;
	open(options: PiCustomSettingsOpenOptions): Promise<(Component & { dispose?(): void }) | void> | (Component & { dispose?(): void }) | void;
}

export type PiExtensionSettingsContribution = PiSchemaSettingsContribution | PiCustomSettingsContribution;

export type PiDashboardZone = "statusBar" | "aboveEditor" | "belowEditor" | "dashboardOverlay" | "extensionDetails";
export type PiDashboardVariant = "short" | "compact" | "card" | "detail";

export interface PiDashboardRenderContext {
	ctx: ExtensionContext;
	tui?: TUI;
	theme: Theme;
	zone: PiDashboardZone;
	variant: PiDashboardVariant;
	width: number;
	height?: number;
	requestRender?: () => void;
}

export type PiDashboardRendered = string | string[] | (Component & { dispose?(): void });

export type PiDashboardRefreshPolicy =
	| { kind: "manual" }
	| { kind: "interval"; ms: number }
	| { kind: "event"; events: string[] }
	| { kind: "onRender" };

export interface PiDashboardWidget {
	id: string;
	title: string;
	description?: string;
	tags?: string[];
	defaultZone?: PiDashboardZone;
	defaultVariant?: PiDashboardVariant;
	defaultVisible?: boolean;
	priority?: number;
	minWidth?: number;
	maxWidth?: number;
	refresh?: PiDashboardRefreshPolicy;
	render(renderContext: PiDashboardRenderContext): PiDashboardRendered | Promise<PiDashboardRendered>;
}

export interface PiExtensionRegistration {
	id: string;
	name: string;
	description: string;
	commands?: string[];
	tags?: string[];
	run?: PiExtensionActionHandler;
	actions?: PiExtensionAction[];
	docs?: PiExtensionDoc[];
	settings?: PiExtensionSettingsContribution;
	widgets?: PiDashboardWidget[];
}

interface RegistryState {
	extensions: Map<string, PiExtensionRegistration>;
}

const REGISTRY_KEY = Symbol.for("wesen.pi.extensions.registry.v1");

function registryState(): RegistryState {
	const globalWithRegistry = globalThis as typeof globalThis & { [REGISTRY_KEY]?: RegistryState };
	if (!globalWithRegistry[REGISTRY_KEY]) {
		globalWithRegistry[REGISTRY_KEY] = { extensions: new Map() };
	}
	return globalWithRegistry[REGISTRY_KEY];
}

export function registerPiExtension(registration: PiExtensionRegistration): void {
	registryState().extensions.set(registration.id, registration);
}

export function unregisterPiExtension(id: string): void {
	registryState().extensions.delete(id);
}

export function listPiExtensions(): PiExtensionRegistration[] {
	return [...registryState().extensions.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getPiExtension(id: string): PiExtensionRegistration | undefined {
	return registryState().extensions.get(id);
}

export function listPiDashboardWidgets(): Array<{ extension: PiExtensionRegistration; widget: PiDashboardWidget; key: string }> {
	return listPiExtensions().flatMap((extension) =>
		(extension.widgets ?? []).map((widget) => ({ extension, widget, key: dashboardWidgetKey(extension.id, widget.id) })),
	);
}

export function dashboardWidgetKey(extensionId: string, widgetId: string): string {
	return `${extensionId}.${widgetId}`;
}

export function clearPiExtensionRegistry(): void {
	registryState().extensions.clear();
}
