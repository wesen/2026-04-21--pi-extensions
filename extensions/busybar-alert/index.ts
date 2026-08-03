import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";
import {
	clearDisplay,
	createAlertState,
	formatStats,
	idleStatus,
	runAlertCycle,
	runAsyncSelfTests,
	runSelfTests,
	type AlertState,
} from "./alert";
import {
	applyValues,
	defaultSettings,
	settingsSchema,
	settingsToValues,
	type BusybarAlertSettings,
} from "./settings";

const STATUS_KEY = "busybar-alert";

function cacheDir(): string {
	return path.join(os.homedir(), ".cache", "pi-busybar-alert");
}

function logPath(): string {
	return path.join(cacheDir(), "alerts.jsonl");
}

export default function busybarAlert(pi: ExtensionAPI): void {
	const settings: BusybarAlertSettings = defaultSettings();
	const state: AlertState = createAlertState();

	const exec = (command: string, args: string[], options?: { timeout?: number }) =>
		pi.exec(command, args, options);

	const hooks = (ctx: ExtensionContext) => ({
		onStatus: (text: string) => setStatus(ctx, text),
		onError: (message: string, firstTime: boolean) => {
			if (firstTime && ctx.hasUI) {
				ctx.ui.notify(`busybar-alert: ${message}`, "warning");
			}
		},
		onLog: (entry: Record<string, unknown>) => appendLog(entry),
	});

	function appendLog(entry: Record<string, unknown>): void {
		try {
			fs.mkdirSync(cacheDir(), { recursive: true });
			fs.appendFileSync(logPath(), `${JSON.stringify(entry)}\n`);
		} catch {
			// logging must never break the agent loop
		}
	}

	function setStatus(ctx: ExtensionContext, text?: string): void {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(STATUS_KEY, text ?? idleStatus(settings, state));
	}

	async function trigger(ctx: ExtensionContext, reason: string): Promise<void> {
		await runAlertCycle(exec, settings, state, cacheDir(), reason, hooks(ctx));
	}

	async function testAlert(ctx: ExtensionCommandContext): Promise<void> {
		// Bypass debounce for a manual test: reset the rate limiter.
		state.stats.lastAlertAt = 0;
		state.inFlight = false;
		const outcome = await runAlertCycle(exec, settings, state, cacheDir(), "manual test", hooks(ctx));
		if (ctx.hasUI) {
			const msg =
				outcome === "fired"
					? `Alert sent to ${settings.addr} (app "${settings.applicationName}", ${settings.display}, hold ${settings.holdSeconds}s)`
					: outcome === "skipped"
						? "Alert skipped (debounce)"
						: `Alert failed: ${state.stats.lastError}`;
			ctx.ui.notify(msg, outcome === "error" ? "error" : "info");
		}
	}

	function toggle(ctx: ExtensionCommandContext, explicit?: boolean): void {
		settings.enabled = explicit ?? !settings.enabled;
		setStatus(ctx);
		if (ctx.hasUI) ctx.ui.notify(`busybar-alert ${settings.enabled ? "enabled" : "disabled"}`, "info");
	}

	registerPiExtension({
		id: "busybar-alert",
		name: "BusyBar Alert",
		description:
			"Flash a short animation on a BUSY Bar LED dock every time a pi turn finishes (via the busybar CLI).",
		commands: ["busybar-alert-test", "busybar-alert-toggle", "busybar-alert-stats", "busybar-alert-self-test"],
		tags: ["hardware", "busybar", "alert", "status"],
		run: async (ctx) => testAlert(ctx),
		actions: [
			{
				id: "test-alert",
				title: "Test alert",
				description: "Run one alert cycle immediately, bypassing the debounce.",
				icon: "🔔",
				default: true,
				run: async (ctx) => testAlert(ctx),
			},
			{
				id: "toggle",
				title: "Toggle alerts",
				description: "Enable or disable turn-end alerts.",
				icon: "⏻",
				run: async (ctx) => toggle(ctx),
			},
			{
				id: "show-stats",
				title: "Show stats",
				description: "Alerts fired / skipped / errors, and the last error.",
				icon: "📊",
				run: async (ctx) => {
					if (ctx.hasUI) ctx.ui.notify(formatStats(state), "info");
				},
			},
			{
				id: "prepare-assets",
				title: "Prepare assets",
				description: "Delete the cached .anim so the next alert recompiles it (after changing display/pattern).",
				icon: "🎞",
				run: async (ctx) => {
					try {
						fs.rmSync(cacheDir(), { recursive: true, force: true });
						if (ctx.hasUI) ctx.ui.notify("busybar-alert: asset cache cleared; next alert rebuilds it.", "info");
					} catch (err) {
						if (ctx.hasUI) ctx.ui.notify(`busybar-alert: ${err}`, "error");
					}
				},
			},
		],
		settings: {
			kind: "schema",
			schema: settingsSchema(),
			load: () => settingsToValues(settings),
			onApply: (values, ctx) => {
				applyValues(settings, values);
				state.notifiedError = false;
				setStatus(ctx);
				ctx.ui.notify(`busybar-alert settings applied (addr=${settings.addr}, alertOn=${settings.alertOn})`, "info");
			},
		},
		docs: [
			{
				id: "readme",
				title: "BusyBar Alert README",
				description: "What the extension does and how to configure it.",
				path: "extensions/busybar-alert/README.md",
			},
			{
				id: "design",
				title: "Design & implementation guide",
				description: "Intern-ready design document from ticket PI-EXT-BUSYBAR-ALERT.",
				path: "ttmp/2026/08/03/PI-EXT-BUSYBAR-ALERT--pi-extension-turn-end-alert-to-busy-bar-dock/design-doc/01-busybar-turn-alert-extension-design-and-implementation-guide.md",
			},
		],
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!settings.enabled || settings.alertOn !== "turn_end") return;
		await trigger(ctx, `turn ${event.turnIndex}`);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!settings.enabled || settings.alertOn !== "agent_settled") return;
		await trigger(ctx, "agent settled");
	});

	pi.on("session_start", async (_event, ctx) => {
		setStatus(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (settings.enabled && settings.clearOnShutdown) {
			await clearDisplay(exec, settings);
		}
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.registerCommand("busybar-alert-test", {
		description: "Send a test alert to the BUSY Bar now",
		handler: async (_args, ctx) => testAlert(ctx),
	});

	pi.registerCommand("busybar-alert-toggle", {
		description: "Toggle busybar-alert on/off (optional arg: on|off)",
		handler: async (args, ctx) => {
			const v = args.trim().toLowerCase();
			const explicit = ["on", "enable", "true"].includes(v) ? true : ["off", "disable", "false"].includes(v) ? false : undefined;
			toggle(ctx, explicit);
		},
	});

	pi.registerCommand("busybar-alert-stats", {
		description: "Show busybar-alert statistics",
		handler: async (_args, ctx) => {
			if (ctx.hasUI) ctx.ui.notify(formatStats(state), "info");
		},
	});

	pi.registerCommand("busybar-alert-self-test", {
		description: "Run busybar-alert self-tests (no device needed)",
		handler: async (_args, ctx) => {
			const sync = runSelfTests(cacheDir());
			const asyncResults = await runAsyncSelfTests(cacheDir());
			const all = [...sync, ...asyncResults];
			const text = all.map((r) => `${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`).join("\n");
			const ok = all.every((r) => r.ok);
			if (ctx.hasUI) ctx.ui.notify(text, ok ? "info" : "error");
		},
	});
}
