import type { PiSettingsSchema, PiSettingsValues } from "../_shared/registry";

/**
 * Settings for the busybar-alert extension.
 *
 * Precedence: values applied through the settings UI win; otherwise we fall
 * back to BUSYBAR_ADDR / BUSYBAR_TOKEN environment variables; otherwise the
 * documented busybar CLI defaults.
 */
export interface BusybarAlertSettings {
	enabled: boolean;
	alertOn: "turn_end" | "agent_settled";
	addr: string;
	token: string;
	applicationName: string;
	display: "front" | "back";
	priority: number;
	holdSeconds: number;
	minIntervalMs: number;
	pattern: string;
	clearOnShutdown: boolean;
}

export const BUSYBAR_DEFAULT_ADDR = "10.0.4.20";

export function defaultSettings(): BusybarAlertSettings {
	return {
		enabled: true,
		alertOn: "turn_end",
		addr: process.env.BUSYBAR_ADDR || BUSYBAR_DEFAULT_ADDR,
		token: process.env.BUSYBAR_TOKEN || "",
		applicationName: "pi-turn-alert",
		display: "front",
		priority: 60,
		holdSeconds: 3,
		minIntervalMs: 2000,
		pattern: "spinner",
		clearOnShutdown: false,
	};
}

export function settingsSchema(): PiSettingsSchema {
	return {
		version: 1,
		title: "BusyBar Alert Settings",
		description: "Flash a BUSY Bar alert when a pi turn finishes.",
		sections: [
			{
				id: "trigger",
				title: "Trigger",
				fields: [
					{
						id: "enabled",
						label: "Enabled",
						type: "boolean",
						description: "Master switch for turn-end alerts.",
					},
					{
						id: "alertOn",
						label: "Alert on",
						type: "select",
						description: "turn_end = every turn (spec default); agent_settled = only when pi is fully idle.",
						options: [
							{ value: "turn_end", label: "Every turn end" },
							{ value: "agent_settled", label: "Agent settled (idle)" },
						],
					},
					{
						id: "minIntervalMs",
						label: "Min interval (ms)",
						type: "number",
						min: 0,
						max: 60000,
						step: 500,
						description: "Debounce: minimum milliseconds between alerts.",
					},
					{
						id: "holdSeconds",
						label: "Hold seconds",
						type: "number",
						min: 0,
						max: 60,
						step: 1,
						description: "How long the animation stays on screen before clear.",
					},
				],
			},
			{
				id: "device",
				title: "Device",
				fields: [
					{
						id: "addr",
						label: "Device address",
						type: "string",
						placeholder: BUSYBAR_DEFAULT_ADDR,
						description: "BUSY Bar IP/hostname. Falls back to BUSYBAR_ADDR env.",
					},
					{
						id: "token",
						label: "API token",
						type: "string",
						secret: true,
						description: "Device access key (X-API-Token). Falls back to BUSYBAR_TOKEN env. Leave empty if the device has none.",
					},
					{
						id: "applicationName",
						label: "Application name",
						type: "string",
						description: "Device-side ownership name; clear removes only this app's elements.",
					},
					{
						id: "display",
						label: "Display",
						type: "select",
						description: "Front is 72x16 RGB, back is 160x80 gray4. Must match the compiled asset.",
						options: [
							{ value: "front", label: "Front (72x16 RGB)" },
							{ value: "back", label: "Back (160x80 gray4)" },
						],
					},
					{
						id: "priority",
						label: "Priority (1-100)",
						type: "number",
						min: 1,
						max: 100,
						step: 1,
						description: "Display arbitration. 60 is above ambient apps, below takeover apps.",
					},
				],
			},
			{
				id: "asset",
				title: "Alert asset",
				fields: [
					{
						id: "pattern",
						label: "Pattern",
						type: "string",
						description: "Built-in busybar create pattern (e.g. spinner). Asset is compiled once and cached.",
					},
					{
						id: "clearOnShutdown",
						label: "Clear on shutdown",
						type: "boolean",
						description: "Best-effort clear of the bar when the pi session exits.",
					},
				],
			},
		],
	};
}

export function settingsToValues(s: BusybarAlertSettings): PiSettingsValues {
	return {
		enabled: s.enabled,
		alertOn: s.alertOn,
		addr: s.addr,
		token: s.token,
		applicationName: s.applicationName,
		display: s.display,
		priority: s.priority,
		holdSeconds: s.holdSeconds,
		minIntervalMs: s.minIntervalMs,
		pattern: s.pattern,
		clearOnShutdown: s.clearOnShutdown,
	};
}

export function applyValues(s: BusybarAlertSettings, values: PiSettingsValues): void {
	if (typeof values.enabled === "boolean") s.enabled = values.enabled;
	if (values.alertOn === "turn_end" || values.alertOn === "agent_settled") s.alertOn = values.alertOn;
	if (typeof values.addr === "string" && values.addr.trim()) s.addr = values.addr.trim();
	if (typeof values.token === "string") s.token = values.token;
	if (typeof values.applicationName === "string" && values.applicationName.trim()) s.applicationName = values.applicationName.trim();
	if (values.display === "front" || values.display === "back") s.display = values.display;
	if (typeof values.priority === "number") s.priority = Math.min(100, Math.max(1, Math.round(values.priority)));
	if (typeof values.holdSeconds === "number") s.holdSeconds = Math.min(60, Math.max(0, values.holdSeconds));
	if (typeof values.minIntervalMs === "number") s.minIntervalMs = Math.max(0, values.minIntervalMs);
	if (typeof values.pattern === "string" && values.pattern.trim()) s.pattern = values.pattern.trim();
	if (typeof values.clearOnShutdown === "boolean") s.clearOnShutdown = values.clearOnShutdown;
}
