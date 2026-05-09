import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { listPiDashboardWidgets, type PiDashboardZone, type PiDashboardVariant } from "../registry";
import { defaultLayoutItem, readDashboardConfig, type PiDashboardZoneConfig } from "./config";
import { renderGridDashboard, renderInlineDashboard, renderStackDashboard, type RenderedDashboardWidget } from "./layout";

const STATUS_KEY = "dashboard";
const ABOVE_KEY = "dashboard:aboveEditor";
const BELOW_KEY = "dashboard:belowEditor";

export async function installDashboard(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) return;
	await installStatusDashboard(ctx);
	installZoneWidget(ctx, "aboveEditor", ABOVE_KEY);
	installZoneWidget(ctx, "belowEditor", BELOW_KEY);
}

export function clearDashboard(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(STATUS_KEY, undefined);
	ctx.ui.setWidget(ABOVE_KEY, undefined);
	ctx.ui.setWidget(BELOW_KEY, undefined);
}

export async function refreshDashboard(ctx: ExtensionContext): Promise<void> {
	await installDashboard(ctx);
}

async function installStatusDashboard(ctx: ExtensionContext): Promise<void> {
	const rendered = await renderDashboardZone(ctx, ctx.ui.theme, "statusBar", "short", 100);
	const line = renderInlineDashboard(rendered, 100);
	ctx.ui.setStatus(STATUS_KEY, line || undefined);
}

function installZoneWidget(ctx: ExtensionContext, zone: "aboveEditor" | "belowEditor", key: string): void {
	ctx.ui.setWidget(key, (tui: TUI, theme: Theme) => new DashboardZoneComponent(ctx, tui, theme, zone), { placement: zone });
}

export class DashboardZoneComponent implements Component {
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;
	private loading = false;

	constructor(
		private ctx: ExtensionContext,
		private tui: TUI,
		private theme: Theme,
		private zone: PiDashboardZone,
	) {}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
		if (!this.loading) {
			this.loading = true;
			void renderDashboardZone(this.ctx, this.theme, this.zone, this.zone === "dashboardOverlay" ? "card" : "compact", width, () => this.tui.requestRender()).then((rendered) => {
				this.cachedWidth = width;
				this.cachedLines = renderStackDashboard(rendered, width);
				this.loading = false;
				this.tui.requestRender();
			});
		}
		return this.cachedLines ?? [];
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export async function renderDashboardZone(
	ctx: ExtensionContext,
	theme: Theme,
	zone: PiDashboardZone,
	fallbackVariant: PiDashboardVariant,
	width: number,
	requestRender?: () => void,
): Promise<RenderedDashboardWidget[]> {
	const config = readDashboardConfig(ctx.cwd);
	const zoneConfig = config.zones[zone] ?? defaultZoneConfig(zone);
	if (!zoneConfig.enabled) return [];
	const configured = new Map(zoneConfig.items.map((item) => [item.widget, item]));
	const widgets = listPiDashboardWidgets().filter(({ key, widget }) => zone === "dashboardOverlay" || (widget.defaultZone ?? "dashboardOverlay") === zone || configured.has(key));
	const rendered: RenderedDashboardWidget[] = [];
	let order = 0;
	for (const contribution of widgets) {
		const item = configured.get(contribution.key) ?? defaultLayoutItem(contribution.key, contribution.widget.priority ?? order++, contribution.widget.defaultVariant ?? fallbackVariant);
		if (item.visible === false) continue;
		const variant = item.variant ?? contribution.widget.defaultVariant ?? fallbackVariant;
		const output = await contribution.widget.render({ ctx, theme, zone, variant, width, requestRender });
		rendered.push({ key: contribution.key, title: contribution.widget.title, priority: contribution.widget.priority ?? 100, config: item, rendered: output });
	}
	return rendered;
}

export async function renderDashboardOverlayLines(ctx: ExtensionContext, theme: Theme, width: number): Promise<string[]> {
	const rendered = await renderDashboardZone(ctx, theme, "dashboardOverlay", "card", width);
	if (rendered.length === 0) {
		return [theme.fg("warning", "No dashboard widgets are registered or visible."), theme.fg("dim", "Add widgets via registerPiExtension({ widgets: [...] }) or enable them in dashboard settings.")];
	}
	return renderGridDashboard(rendered, width, theme);
}

function defaultZoneConfig(zone: PiDashboardZone): PiDashboardZoneConfig {
	return { enabled: true, layout: zone === "statusBar" ? "inline" : "stack", items: [] };
}
