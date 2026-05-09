import fs from "node:fs";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
	listPiExtensions,
	registerPiExtension,
	type PiExtensionAction,
	type PiExtensionDoc,
	type PiExtensionRegistration,
	type PiSchemaSettingsContribution,
} from "../_shared/registry";
import { readDashboardConfig, writeProjectDashboardConfig } from "../_shared/dashboard/config";
import { clearDashboard, refreshDashboard } from "../_shared/dashboard/manager";
import { ActionPicker } from "../_shared/ui/action-picker";
import { DashboardOverlay } from "../_shared/ui/dashboard-overlay";
import { DocViewer } from "../_shared/ui/doc-viewer";
import { ExtensionLauncher, type ExtensionLauncherResult } from "../_shared/ui/extension-launcher";
import { GenericSettingsView, resolveSettingsSchema } from "../_shared/ui/settings-view";

const EXTENSION_ID = "launcher";

export default function launcherExtension(pi: ExtensionAPI): void {
	registerPiExtension({
		id: EXTENSION_ID,
		name: "Extension Launcher",
		description: "Common launcher for local Pi extensions with actions, docs, settings, and dashboard entrypoints.",
		commands: ["px"],
		tags: ["launcher", "shared", "ui"],
		actions: [
			{
				id: "open",
				title: "Open launcher",
				description: "Open the shared Pi extension launcher.",
				default: true,
				run: async (ctx) => openLauncher(ctx),
			},
			{
				id: "dashboard",
				title: "Open dashboard",
				description: "Open the shared dashboard overlay.",
				run: async (ctx) => openDashboard(ctx),
			},
		],
		docs: [
			{
				id: "overview",
				title: "Launcher overview",
				markdown: "# Extension Launcher\n\nUse `/px` to search registered local extensions.\n\n- `Enter` runs the default action.\n- `a` opens all actions.\n- `?` opens registered docs.\n- `s` opens registered settings.\n- `d` opens the dashboard overlay.",
			},
		],
		settings: {
			kind: "schema",
			schema: { version: 1, title: "Dashboard Layout", description: "Configure shared dashboard zones for this project.", sections: [{ id: "zones", title: "Zones", fields: [
				{ id: "statusBar", label: "Status bar dashboard", type: "boolean", description: "Render registered short widgets into a shared status entry." },
				{ id: "aboveEditor", label: "Above-editor dashboard", type: "boolean", description: "Render dashboard widgets above the editor." },
				{ id: "belowEditor", label: "Below-editor dashboard", type: "boolean", description: "Render dashboard widgets below the editor." },
				{ id: "dashboardOverlay", label: "Dashboard overlay", type: "boolean", description: "Enable the /px dashboard overlay." },
			] }] },
			load: (ctx) => {
				const config = readDashboardConfig(ctx.cwd);
				return {
					statusBar: config.zones.statusBar?.enabled ?? true,
					aboveEditor: config.zones.aboveEditor?.enabled ?? true,
					belowEditor: config.zones.belowEditor?.enabled ?? true,
					dashboardOverlay: config.zones.dashboardOverlay?.enabled ?? true,
				};
			},
			onApply: async (values, ctx) => {
				const config = readDashboardConfig(ctx.cwd);
				for (const zone of ["statusBar", "aboveEditor", "belowEditor", "dashboardOverlay"] as const) {
					config.zones[zone] = { enabled: values[zone] === true, layout: config.zones[zone]?.layout ?? (zone === "statusBar" ? "inline" : "stack"), items: config.zones[zone]?.items ?? [] };
				}
				const path = writeProjectDashboardConfig(ctx.cwd, config);
				await refreshDashboard(ctx);
				ctx.ui.notify(`Dashboard config saved: ${path}`, "info");
			},
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		await refreshDashboard(ctx);
	});
	pi.on("session_shutdown", async (_event, ctx) => {
		clearDashboard(ctx);
	});

	pi.registerCommand("px", {
		description: "Open the shared Pi extension launcher",
		handler: async (args, ctx) => {
			if (args.trim() === "dashboard") {
				await openDashboard(ctx);
				return;
			}
			await openLauncher(ctx);
		},
	});
}

async function openLauncher(ctx: ExtensionCommandContext): Promise<void> {
	const extensions = listPiExtensions();
	if (extensions.length === 0) {
		ctx.ui.notify("No extensions registered with the launcher yet.", "warning");
		return;
	}
	const result = await ctx.ui.custom<ExtensionLauncherResult>(
		(tui, theme, _keybindings, done) => new ExtensionLauncher({
			extensions,
			theme,
			done,
			requestRender: () => tui.requestRender(),
		}),
		{
			overlay: true,
			overlayOptions: { width: "85%", maxHeight: "80%", minWidth: 70, margin: 1 },
		},
	);
	await handleLauncherResult(result, ctx);
}

async function handleLauncherResult(result: ExtensionLauncherResult, ctx: ExtensionCommandContext): Promise<void> {
	if (result.kind === "cancel") return;
	if (result.kind === "dashboard") return openDashboard(ctx);
	if (result.kind === "docs") {
		await openDocs(ctx, result.extension);
		return openLauncher(ctx);
	}
	if (result.kind === "settings") {
		await openSettings(ctx, result.extension);
		return openLauncher(ctx);
	}
	if (result.kind === "actions") {
		await openActions(ctx, result.extension);
		return openLauncher(ctx);
	}
	return runExtensionDefault(ctx, result.extension);
}

async function runExtensionDefault(ctx: ExtensionCommandContext, extension: PiExtensionRegistration): Promise<void> {
	if (extension.run) {
		await extension.run(ctx, makeActionContext(ctx, extension, { id: "default", title: "Default", run: extension.run }));
		await refreshDashboard(ctx);
		return;
	}
	const defaultAction = extension.actions?.find((action) => action.default) ?? (extension.actions?.length === 1 ? extension.actions[0] : undefined);
	if (defaultAction) {
		await defaultAction.run(ctx, makeActionContext(ctx, extension, defaultAction));
		await refreshDashboard(ctx);
		return;
	}
	if (extension.actions?.length) return openActions(ctx, extension);
	ctx.ui.notify(`Selected extension: ${extension.name} (${extension.id})`, "info");
}

async function openActions(ctx: ExtensionCommandContext, extension: PiExtensionRegistration): Promise<void> {
	const actions = extension.actions ?? [];
	if (actions.length === 0) {
		ctx.ui.notify(`${extension.name} has no registered actions.`, "warning");
		return;
	}
	const action = await ctx.ui.custom<PiExtensionAction | undefined>(
		(tui, theme, _keybindings, done) => new ActionPicker({ extension, theme, done, requestRender: () => tui.requestRender() }),
		{ overlay: true, overlayOptions: { width: "75%", maxHeight: "75%", minWidth: 64, margin: 1 } },
	);
	if (!action) return;
	await action.run(ctx, makeActionContext(ctx, extension, action));
	await refreshDashboard(ctx);
}

async function openDocs(ctx: ExtensionCommandContext, extension: PiExtensionRegistration, docId?: string): Promise<void> {
	const docs = extension.docs ?? [];
	if (docs.length === 0) {
		ctx.ui.notify(`${extension.name} has no registered docs.`, "warning");
		return;
	}
	const doc = docs.find((d) => d.id === docId) ?? docs[0]!;
	const markdown = await loadDoc(ctx, doc);
	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => new DocViewer({ title: `${extension.name}: ${doc.title}`, markdown, theme, done, requestRender: () => tui.requestRender() }),
		{ overlay: true, overlayOptions: { width: "85%", maxHeight: "85%", minWidth: 70, margin: 1 } },
	);
}

async function openSettings(ctx: ExtensionCommandContext, extension: PiExtensionRegistration): Promise<void> {
	const settings = extension.settings;
	if (!settings) {
		ctx.ui.notify(`${extension.name} has no registered settings.`, "warning");
		return;
	}
	if (settings.kind === "custom") {
		await ctx.ui.custom<void>(
			async (tui, theme, _keybindings, done) => {
				const maybeComponent = await settings.open({ ctx, tui, theme, done, requestRender: () => tui.requestRender() });
				return maybeComponent ?? new DocViewer({ title: settings.title ?? `${extension.name} settings`, markdown: "Settings view completed.", theme, done, requestRender: () => tui.requestRender() });
			},
			{ overlay: true, overlayOptions: { width: "85%", maxHeight: "85%", minWidth: 70, margin: 1 } },
		);
		await refreshDashboard(ctx);
		return;
	}
	await openSchemaSettings(ctx, extension, settings);
}

async function openSchemaSettings(ctx: ExtensionCommandContext, extension: PiExtensionRegistration, contribution: PiSchemaSettingsContribution): Promise<void> {
	const schema = await resolveSettingsSchema(contribution, ctx);
	const values = await contribution.load(ctx);
	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => new GenericSettingsView({
			ctx,
			theme,
			title: schema.title ?? `${extension.name} Settings`,
			schema,
			values,
			contribution,
			done,
			requestRender: () => tui.requestRender(),
		}),
		{ overlay: true, overlayOptions: { width: "85%", maxHeight: "85%", minWidth: 70, margin: 1 } },
	);
	await refreshDashboard(ctx);
}

async function openDashboard(ctx: ExtensionCommandContext): Promise<void> {
	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => new DashboardOverlay(ctx, theme, done, () => tui.requestRender()),
		{ overlay: true, overlayOptions: { width: "90%", maxHeight: "90%", minWidth: 72, margin: 1 } },
	);
}

function makeActionContext(ctx: ExtensionCommandContext, extension: PiExtensionRegistration, action: PiExtensionAction) {
	return {
		extension,
		action,
		openDocs: (docId?: string) => openDocs(ctx, extension, docId),
		openSettings: () => openSettings(ctx, extension),
		refreshDashboard: () => void refreshDashboard(ctx),
	};
}

async function loadDoc(ctx: ExtensionCommandContext, doc: PiExtensionDoc): Promise<string> {
	if (doc.load) return doc.load(ctx);
	if (doc.markdown !== undefined) return doc.markdown;
	if (doc.path) return fs.readFileSync(doc.path, "utf8");
	return `# ${doc.title}\n\nNo documentation content registered.`;
}
