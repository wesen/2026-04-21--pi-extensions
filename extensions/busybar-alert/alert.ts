import * as fs from "node:fs";
import * as path from "node:path";
import type { BusybarAlertSettings } from "./settings";

/**
 * Core alert logic for busybar-alert. Everything here is a direct TypeScript
 * port of scripts/04-prototype-alert.sh from ticket PI-EXT-BUSYBAR-ALERT:
 *
 *   create (+compile, cached) -> inspect -> show --loop -> hold -> clear
 *
 * The module takes an ExecFn instead of calling pi.exec directly so the
 * argument construction and debounce logic can be self-tested without a
 * device (see the /busybar-alert-self-test command in index.ts).
 */

export interface ExecResultLike {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export type ExecFn = (
	command: string,
	args: string[],
	options?: { timeout?: number },
) => Promise<ExecResultLike>;

export interface AlertStats {
	fired: number;
	skipped: number;
	errors: number;
	lastAlertAt: number;
	lastError?: string;
	lastReason?: string;
}

export interface AlertState {
	inFlight: boolean;
	notifiedError: boolean;
	stats: AlertStats;
}

export function createAlertState(): AlertState {
	return {
		inFlight: false,
		notifiedError: false,
		stats: { fired: 0, skipped: 0, errors: 0, lastAlertAt: 0 },
	};
}

const BUSYBAR_CMD = "busybar";
const SHOW_TIMEOUT_MS = 15_000;
const CLEAR_TIMEOUT_MS = 5_000;
const CREATE_TIMEOUT_MS = 15_000;

function deviceArgs(settings: BusybarAlertSettings): string[] {
	const args = ["--addr", settings.addr];
	if (settings.token) args.push("--token", settings.token);
	return args;
}

export function assetPaths(cacheDir: string, settings: BusybarAlertSettings): { zip: string; anim: string } {
	const base = `alert_${settings.display}_${settings.pattern}`;
	return {
		zip: path.join(cacheDir, `${base}.zip`),
		anim: path.join(cacheDir, `${base}.anim`),
	};
}

export function buildCreateArgs(settings: BusybarAlertSettings, zip: string, anim: string): string[] {
	return [
		"create",
		"--pattern", settings.pattern,
		"--display", settings.display,
		"--frames", "12",
		"--fps", "12",
		"--output", zip,
		"--compile-output", anim,
		"--format", "jsonl",
	];
}

export function buildShowArgs(settings: BusybarAlertSettings, anim: string): string[] {
	return [
		"show",
		"--input", anim,
		...deviceArgs(settings),
		"--application-name", settings.applicationName,
		"--display", settings.display,
		"--priority", String(settings.priority),
		"--loop",
	];
}

export function buildClearArgs(settings: BusybarAlertSettings): string[] {
	return [
		"clear",
		...deviceArgs(settings),
		"--application-name", settings.applicationName,
	];
}

class AlertError extends Error {}

async function run(exec: ExecFn, args: string[], timeout: number): Promise<ExecResultLike> {
	let result: ExecResultLike;
	try {
		result = await exec(BUSYBAR_CMD, args, { timeout });
	} catch (err) {
		throw new AlertError(`failed to spawn ${BUSYBAR_CMD}: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (result.killed) {
		throw new AlertError(`${BUSYBAR_CMD} ${args[0]} timed out after ${timeout}ms (device unreachable?)`);
	}
	if (result.code !== 0) {
		const detail = (result.stderr.trim() || result.stdout.trim()).slice(0, 300);
		throw new AlertError(`${BUSYBAR_CMD} ${args[0]} exited ${result.code}: ${detail}`);
	}
	return result;
}

/** Build the .anim asset once, then reuse the cached file. */
export async function ensureAsset(
	exec: ExecFn,
	settings: BusybarAlertSettings,
	cacheDir: string,
): Promise<string> {
	const { zip, anim } = assetPaths(cacheDir, settings);
	if (fs.existsSync(anim)) return anim;
	fs.mkdirSync(cacheDir, { recursive: true });
	await run(exec, buildCreateArgs(settings, zip, anim), CREATE_TIMEOUT_MS);
	if (!fs.existsSync(anim)) {
		throw new AlertError(`busybar create completed but ${anim} is missing`);
	}
	return anim;
}

export type AlertOutcome = "fired" | "skipped" | "error";

export interface AlertHooks {
	onStatus?(text: string): void;
	onError?(message: string, firstTime: boolean): void;
	onLog?(entry: Record<string, unknown>): void;
}

/**
 * Run one alert cycle: debounce -> ensure asset -> show -> schedule clear.
 * Never throws; reports through hooks and stats instead, because it runs
 * fire-and-forget from pi's turn_end handler.
 */
export async function runAlertCycle(
	exec: ExecFn,
	settings: BusybarAlertSettings,
	state: AlertState,
	cacheDir: string,
	reason: string,
	hooks: AlertHooks = {},
): Promise<AlertOutcome> {
	const now = Date.now();
	if (state.inFlight || now - state.stats.lastAlertAt < settings.minIntervalMs) {
		state.stats.skipped++;
		hooks.onLog?.({ ts: new Date(now).toISOString(), outcome: "skipped", reason });
		return "skipped";
	}
	state.inFlight = true;
	state.stats.lastAlertAt = now;
	state.stats.lastReason = reason;
	hooks.onStatus?.(`busybar:alerting (${reason})`);
	try {
		const anim = await ensureAsset(exec, settings, cacheDir);
		await run(exec, buildShowArgs(settings, anim), SHOW_TIMEOUT_MS);
		state.stats.fired++;
		hooks.onLog?.({ ts: new Date().toISOString(), outcome: "fired", reason, anim });
		// The clear is owned by a timer so the event handler never blocks.
		setTimeout(() => {
			void run(exec, buildClearArgs(settings), CLEAR_TIMEOUT_MS)
				.catch((err) => {
					state.stats.errors++;
					state.stats.lastError = err instanceof Error ? err.message : String(err);
				})
				.finally(() => {
					state.inFlight = false;
					hooks.onStatus?.(idleStatus(settings, state));
				});
		}, settings.holdSeconds * 1000);
		return "fired";
	} catch (err) {
		state.inFlight = false;
		state.stats.errors++;
		const message = err instanceof Error ? err.message : String(err);
		state.stats.lastError = message;
		hooks.onLog?.({ ts: new Date().toISOString(), outcome: "error", reason, error: message });
		hooks.onError?.(message, !state.notifiedError);
		state.notifiedError = true;
		hooks.onStatus?.("busybar:unreachable");
		return "error";
	}
}

/** Best-effort clear used on session shutdown. */
export async function clearDisplay(
	exec: ExecFn,
	settings: BusybarAlertSettings,
): Promise<void> {
	try {
		await run(exec, buildClearArgs(settings), CLEAR_TIMEOUT_MS);
	} catch {
		// best effort only
	}
}

export function idleStatus(settings: BusybarAlertSettings, state: AlertState): string {
	if (!settings.enabled) return "busybar:off";
	if (state.stats.lastError && state.stats.fired === 0) return "busybar:unreachable";
	return "busybar:on";
}

export function formatStats(state: AlertState): string {
	const s = state.stats;
	const parts = [
		`fired=${s.fired}`,
		`skipped=${s.skipped}`,
		`errors=${s.errors}`,
	];
	if (s.lastAlertAt) parts.push(`last=${new Date(s.lastAlertAt).toISOString()}`);
	if (s.lastReason) parts.push(`reason="${s.lastReason}"`);
	if (s.lastError) parts.push(`lastError="${s.lastError}"`);
	return `busybar-alert: ${parts.join(" ")}`;
}

/* ------------------------------- self-tests ------------------------------ */

export interface SelfTestResult {
	name: string;
	ok: boolean;
	detail?: string;
}

function fakeExec(log: string[][]): ExecFn {
	return async (_cmd, args) => {
		log.push(args);
		return { stdout: "{}", stderr: "", code: 0 };
	};
}

export function runSelfTests(cacheDir: string): SelfTestResult[] {
	const results: SelfTestResult[] = [];
	const settings: BusybarAlertSettings = {
		enabled: true,
		alertOn: "turn_end",
		addr: "192.0.2.1",
		token: "secret",
		applicationName: "pi-turn-alert",
		display: "front",
		priority: 60,
		holdSeconds: 0,
		minIntervalMs: 2000,
		pattern: "spinner",
		clearOnShutdown: false,
	};

	const showArgs = buildShowArgs(settings, "/tmp/x.anim");
	results.push({
		name: "show args include device + app + loop",
		ok:
			showArgs.join(" ").includes("--addr 192.0.2.1 --token secret") &&
			showArgs.join(" ").includes("--application-name pi-turn-alert") &&
			showArgs.includes("--loop") &&
			showArgs.join(" ").includes("--priority 60"),
		detail: showArgs.join(" "),
	});

	const clearArgs = buildClearArgs(settings);
	results.push({
		name: "clear args omit token when empty",
		ok: !buildClearArgs({ ...settings, token: "" }).includes("--token") && clearArgs[0] === "clear",
		detail: clearArgs.join(" "),
	});

	return results;
}

export async function runAsyncSelfTests(cacheDir: string): Promise<SelfTestResult[]> {
	const results: SelfTestResult[] = [];
	const settings: BusybarAlertSettings = {
		enabled: true,
		alertOn: "turn_end",
		addr: "192.0.2.1",
		token: "",
		applicationName: "pi-turn-alert",
		display: "front",
		priority: 60,
		holdSeconds: 0,
		minIntervalMs: 60_000,
		pattern: "spinner",
		clearOnShutdown: false,
	};

	// Pre-seed a cached asset so ensureAsset() does not run `create` through
	// the fake exec (which cannot produce a real file).
	const { anim } = assetPaths(cacheDir, settings);
	fs.mkdirSync(cacheDir, { recursive: true });
	fs.writeFileSync(anim, "fake-anim");

	// Debounce: second call inside minIntervalMs must be skipped.
	{
		const calls: string[][] = [];
		const state = createAlertState();
		const first = await runAlertCycle(fakeExec(calls), settings, state, cacheDir, "t1");
		const second = await runAlertCycle(fakeExec(calls), settings, state, cacheDir, "t2");
		// Wait for the hold=0 clear timer to release inFlight.
		await new Promise((r) => setTimeout(r, 20));
		results.push({
			name: "debounce skips rapid second alert",
			ok: first === "fired" && second === "skipped" && state.stats.fired === 1 && state.stats.skipped === 1,
			detail: `first=${first} second=${second} calls=${calls.map((c) => c[0]).join(",")}`,
		});
	}

	// Error path: failing exec must not throw, must record an error.
	{
		const state = createAlertState();
		const failing: ExecFn = async () => ({ stdout: "", stderr: "boom", code: 1 });
		const outcome = await runAlertCycle(failing, settings, state, cacheDir, "t3");
		results.push({
			name: "exec failure is caught and counted",
			ok: outcome === "error" && state.stats.errors === 1 && Boolean(state.stats.lastError),
			detail: state.stats.lastError,
		});
	}

	return results;
}
