import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_REPEAT_EVERY_PROMPTS = 5;
export const cadenceConfigPath = () => path.join(os.homedir(), ".pi", "agent", "session-context.json");

export function validInterval(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

export function readInterval(file = cadenceConfigPath()): number {
	try {
		const config = JSON.parse(fs.readFileSync(file, "utf8"));
		return validInterval(config.repeatEveryPrompts) ? config.repeatEveryPrompts : DEFAULT_REPEAT_EVERY_PROMPTS;
	} catch {
		return DEFAULT_REPEAT_EVERY_PROMPTS;
	}
}

export function writeInterval(interval: number, file = cadenceConfigPath()): void {
	if (!validInterval(interval)) throw new Error("Prompt interval must be an integer from 1 to 100.");
	let existing: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid session-context config object");
		existing = parsed;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify({ ...existing, repeatEveryPrompts: interval }, null, 2) + "\n", "utf8");
}
