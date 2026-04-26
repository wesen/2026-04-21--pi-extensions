import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

export interface TicketRecord {
	ticket: string;
	title: string;
	status: string;
	path: string;
	topics?: string;
	tasks_open?: number;
	tasks_done?: number;
}

function commandError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(String(error));
}

export async function listTickets(cwd: string): Promise<TicketRecord[]> {
	try {
		const { stdout } = await execFileAsync(
			"docmgr",
			["ticket", "list", "--with-glaze-output", "--output", "json"],
			{ cwd, maxBuffer: MAX_BUFFER },
		);
		const parsed = JSON.parse(stdout) as TicketRecord[];
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		const err = commandError(error) as Error & { stdout?: string; stderr?: string; code?: number };
		const detail = [err.message, err.stderr, err.stdout ? `stdout: ${err.stdout.slice(0, 500)}` : undefined]
			.filter(Boolean)
			.join("\n");
		throw new Error(`Failed to list docmgr tickets${err.code !== undefined ? ` (exit ${err.code})` : ""}: ${detail}`);
	}
}

export async function chooseTicket(ctx: ExtensionCommandContext, args: string): Promise<string | undefined> {
	const tickets = await listTickets(ctx.cwd);
	const trimmed = args.trim();
	if (trimmed) {
		const exact = tickets.find((ticket) => ticket.ticket === trimmed);
		if (exact) return exact.ticket;
		const fuzzy = tickets.find((ticket) => ticket.ticket.toLowerCase() === trimmed.toLowerCase());
		if (fuzzy) return fuzzy.ticket;
	}

	if (!ctx.hasUI) {
		throw new Error(trimmed ? `Ticket not found: ${trimmed}` : "No ticket provided and interactive UI is unavailable");
	}

	const active = tickets.filter((ticket) => ticket.status === "active");
	const candidates = active.length > 0 ? active : tickets;
	if (candidates.length === 0) throw new Error("No docmgr tickets found");

	const labels = candidates.map((ticket) => {
		const taskBits: string[] = [];
		if (typeof ticket.tasks_open === "number") taskBits.push(`${ticket.tasks_open} open`);
		if (typeof ticket.tasks_done === "number") taskBits.push(`${ticket.tasks_done} done`);
		const suffix = [ticket.status, taskBits.join(" / ")].filter(Boolean).join(" · ");
		return `${ticket.ticket} — ${ticket.title}${suffix ? ` (${suffix})` : ""}`;
	});

	const choice = await ctx.ui.select("Import response into docmgr ticket", labels);
	if (!choice) return undefined;
	return choice.split(" — ")[0];
}

export async function importFile(cwd: string, file: string, ticket: string, name?: string): Promise<string> {
	const args = ["import", "file", "--file", file, "--ticket", ticket];
	if (name?.trim()) args.push("--name", name.trim());
	try {
		const { stdout, stderr } = await execFileAsync("docmgr", args, { cwd, maxBuffer: MAX_BUFFER });
		return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
	} catch (error) {
		const err = commandError(error) as Error & { stdout?: string; stderr?: string; code?: number };
		const detail = [err.message, err.stderr, err.stdout].filter(Boolean).join("\n");
		throw new Error(`docmgr import failed${err.code !== undefined ? ` (exit ${err.code})` : ""}: ${detail}`);
	}
}
