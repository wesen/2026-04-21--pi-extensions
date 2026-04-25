import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { DocRecord, DocmgrStatusInfo, TaskRecord, TicketRecord } from "./models";

const execFileAsync = promisify(execFile);

export class DocmgrCliError extends Error {
	readonly command: string;
	readonly stderr?: string;

	constructor(message: string, command: string, stderr?: string) {
		super(message);
		this.command = command;
		this.stderr = stderr;
		this.name = "DocmgrCliError";
	}
}

export interface DocmgrRunOptions {
	cwd: string;
}

interface ExecResult {
	stdout: string;
	stderr: string;
}

export interface DocmgrCommandProbe {
	command: string;
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface DocmgrWorkspaceProbe {
	runtimeCwd: string;
	requestedCwd: string;
	docmgrPath: string;
	status: DocmgrCommandProbe;
	tickets: DocmgrCommandProbe;
}

function stringifyArgs(args: string[]): string {
	return ["docmgr", ...args].join(" ");
}

async function runDocmgr(args: string[], opts: DocmgrRunOptions): Promise<ExecResult> {
	try {
		const { stdout, stderr } = await execFileAsync("docmgr", args, {
			cwd: opts.cwd,
			maxBuffer: 10 * 1024 * 1024,
			env: process.env,
		});
		return { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
	} catch (error) {
		const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
		throw new DocmgrCliError(
			`docmgr failed: ${stringifyArgs(args)}`,
			stringifyArgs(args),
			String(err.stderr ?? err.stdout ?? err.message ?? error),
		);
	}
}

async function probeDocmgr(args: string[], opts: DocmgrRunOptions): Promise<DocmgrCommandProbe> {
	try {
		const { stdout, stderr } = await execFileAsync("docmgr", args, {
			cwd: opts.cwd,
			maxBuffer: 10 * 1024 * 1024,
			env: process.env,
		});
		return {
			command: stringifyArgs(args),
			exitCode: 0,
			stdout: String(stdout ?? ""),
			stderr: String(stderr ?? ""),
		};
	} catch (error) {
		const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
		return {
			command: stringifyArgs(args),
			exitCode: typeof err.code === "number" ? err.code : 1,
			stdout: String(err.stdout ?? ""),
			stderr: String(err.stderr ?? err.message ?? error),
		};
	}
}

async function resolveDocmgrPath(cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync("bash", ["-lc", "command -v docmgr"], {
			cwd,
			maxBuffer: 1024 * 1024,
			env: process.env,
		});
		return String(stdout ?? "").trim() || "(not found)";
	} catch (error) {
		const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
		return String(err.stdout ?? err.stderr ?? err.message ?? error).trim() || "(not found)";
	}
}

function parseJsonOutput<T>(stdout: string): T {
	const trimmed = stdout.trim();
	if (!trimmed) {
		throw new Error("Empty JSON output");
	}
	return JSON.parse(trimmed) as T;
}

function normalizeListValue(value: unknown): string[] {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}
	return String(value)
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseHumanStatus(stdout: string): DocmgrStatusInfo {
	const info: DocmgrStatusInfo = { warnings: [] };
	for (const rawLine of stdout.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		const warningMatch = line.match(/^warning\s*[,:-]\s*(.*)$/i);
		if (warningMatch) {
			info.warnings.push(warningMatch[1]!.trim());
			continue;
		}
		for (const part of line.split(/\s+/)) {
			const idx = part.indexOf("=");
			if (idx < 0) continue;
			const key = part.slice(0, idx);
			const value = part.slice(idx + 1);
			switch (key) {
				case "root":
					info.root = value;
					break;
				case "config":
					info.configPath = value;
					break;
				case "tickets":
					info.ticketsTotal = Number(value);
					break;
				case "stale":
					info.ticketsStale = Number(value);
					break;
				case "docs":
					info.docsTotal = Number(value);
					break;
			}
		}
	}
	return info;
}

function parseHumanTickets(stdout: string): TicketRecord[] {
	const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const rows: TicketRecord[] = [];
	for (const line of lines) {
		if (!line || line.startsWith("ticket") || line.startsWith("-") || line.startsWith("{")) continue;
		const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
		if (parts.length < 3) continue;
		const [ticket, title, status, topics = "", path = "", lastUpdated = ""] = parts;
		rows.push({
			ticket,
			title,
			status,
			topics: normalizeListValue(topics),
			path,
			lastUpdated: lastUpdated || undefined,
		});
	}
	return rows;
}

function parseHumanDocs(stdout: string): DocRecord[] {
	const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const rows: DocRecord[] = [];
	for (const line of lines) {
		if (!line || line.startsWith("ticket") || line.startsWith("-") || line.startsWith("{")) continue;
		const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
		if (parts.length < 5) continue;
		const [ticket, docType, title, status, topics = "", path = "", lastUpdated = ""] = parts;
		rows.push({
			ticket,
			docType,
			title,
			status,
			topics: normalizeListValue(topics),
			path,
			lastUpdated: lastUpdated || undefined,
		});
	}
	return rows;
}

function parseHumanTasks(stdout: string): TaskRecord[] {
	const rows: TaskRecord[] = [];
	for (const rawLine of stdout.split(/\r?\n/)) {
		const line = rawLine.trim();
		const match = line.match(/^(\d+)\s+\[( |x|X)\]\s+(.*)$/);
		if (!match) continue;
		rows.push({
			index: Number(match[1]),
			checked: match[2]!.toLowerCase() === "x",
			text: match[3]!.trim(),
		});
	}
	return rows;
}

function parseStatusArray(payload: unknown): DocmgrStatusInfo {
	const info: DocmgrStatusInfo = { warnings: [] };
	const items = Array.isArray(payload) ? payload : [payload];
	for (const item of items) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		if (record.level === "warning" && typeof record.message === "string") {
			info.warnings.push(record.message);
			continue;
		}
		if (typeof record.root === "string") info.root = record.root;
		if (typeof record.config_path === "string") info.configPath = record.config_path;
		if (typeof record.tickets_total === "number") info.ticketsTotal = record.tickets_total;
		if (typeof record.tickets_stale === "number") info.ticketsStale = record.tickets_stale;
		if (typeof record.docs_total === "number") info.docsTotal = record.docs_total;
	}
	return info;
}

function parseTicketArray(payload: unknown): TicketRecord[] {
	const items = Array.isArray(payload) ? payload : [payload];
	return items.flatMap((item) => {
		if (!item || typeof item !== "object") return [];
		const record = item as Record<string, unknown>;
		if (typeof record.ticket !== "string") return [];
		return [
			{
				ticket: record.ticket,
				title: typeof record.title === "string" ? record.title : "",
				status: typeof record.status === "string" ? record.status : "",
				topics: normalizeListValue(record.topics),
				path: typeof record.path === "string" ? record.path : "",
				lastUpdated: typeof record.last_updated === "string" ? record.last_updated : undefined,
				tasksDone: typeof record.tasks_done === "number" ? record.tasks_done : undefined,
				tasksOpen: typeof record.tasks_open === "number" ? record.tasks_open : undefined,
			},
		];
	});
}

function parseDocArray(payload: unknown): DocRecord[] {
	const items = Array.isArray(payload) ? payload : [payload];
	return items.flatMap((item) => {
		if (!item || typeof item !== "object") return [];
		const record = item as Record<string, unknown>;
		if (typeof record.path !== "string") return [];
		return [
			{
				ticket: typeof record.ticket === "string" ? record.ticket : "",
				docType: typeof record.doc_type === "string" ? record.doc_type : "",
				title: typeof record.title === "string" ? record.title : "",
				status: typeof record.status === "string" ? record.status : "",
				topics: normalizeListValue(record.topics),
				path: record.path,
				lastUpdated: typeof record.last_updated === "string" ? record.last_updated : undefined,
			},
		];
	});
}

function parseTaskArray(payload: unknown): TaskRecord[] {
	const items = Array.isArray(payload) ? payload : [payload];
	return items.flatMap((item) => {
		if (!item || typeof item !== "object") return [];
		const record = item as Record<string, unknown>;
		if (typeof record.index !== "number") return [];
		return [
			{
				index: record.index,
				checked: Boolean(record.checked),
				text: typeof record.text === "string" ? record.text : "",
			},
		];
	});
}

export async function loadWorkspaceStatus(cwd: string): Promise<DocmgrStatusInfo> {
	const probe = await probeDocmgr(["status", "--summary-only", "--with-glaze-output", "--output", "json"], { cwd });
	try {
		return parseStatusArray(parseJsonOutput(probe.stdout));
	} catch {
		const { stdout } = await runDocmgr(["status", "--summary-only"], { cwd });
		return parseHumanStatus(stdout);
	}
}

export async function listTickets(cwd: string): Promise<TicketRecord[]> {
	const probe = await probeDocmgr(["list", "tickets", "--with-glaze-output", "--output", "json"], { cwd });
	try {
		return parseTicketArray(parseJsonOutput(probe.stdout));
	} catch {
		const { stdout } = await runDocmgr(["list", "tickets"], { cwd });
		return parseHumanTickets(stdout);
	}
}

export async function listDocs(cwd: string, ticket?: string): Promise<DocRecord[]> {
	const args = ["doc", "list"];
	if (ticket) args.push("--ticket", ticket);
	const probe = await probeDocmgr([...args, "--with-glaze-output", "--output", "json"], { cwd });
	try {
		return parseDocArray(parseJsonOutput(probe.stdout));
	} catch {
		const { stdout } = await runDocmgr(args, { cwd });
		return parseHumanDocs(stdout);
	}
}

export async function listTasks(cwd: string, ticket?: string): Promise<TaskRecord[]> {
	const args = ["task", "list"];
	if (ticket) args.push("--ticket", ticket);
	const probe = await probeDocmgr([...args, "--with-glaze-output", "--output", "json"], { cwd });
	try {
		return parseTaskArray(parseJsonOutput(probe.stdout));
	} catch {
		const { stdout } = await runDocmgr(args, { cwd });
		return parseHumanTasks(stdout);
	}
}

export async function closeTicket(
	cwd: string,
	options: { ticket: string; status?: string; intent?: string; changelogEntry?: string },
): Promise<void> {
	const args = ["ticket", "close", "--ticket", options.ticket];
	if (options.status) args.push("--status", options.status);
	if (options.intent) args.push("--intent", options.intent);
	if (options.changelogEntry) args.push("--changelog-entry", options.changelogEntry);
	await runDocmgr(args, { cwd });
}

export async function toggleTask(
	cwd: string,
	options: { ticket: string; index: number; checked: boolean },
): Promise<void> {
	const args = ["task", options.checked ? "uncheck" : "check", "--ticket", options.ticket, "--id", String(options.index)];
	await runDocmgr(args, { cwd });
}

export function readDocPreview(pathname: string): string {
	return readFileSync(pathname, "utf8");
}

export function resolveDocPath(root: string | undefined, docPath: string): string {
	if (!root) {
		return docPath;
	}
	return join(root, docPath);
}

export async function inspectWorkspace(cwd: string): Promise<DocmgrWorkspaceProbe> {
	const [status, tickets, docmgrPath] = await Promise.all([
		probeDocmgr(["status", "--summary-only", "--with-glaze-output", "--output", "json"], { cwd }),
		probeDocmgr(["list", "tickets", "--with-glaze-output", "--output", "json"], { cwd }),
		resolveDocmgrPath(cwd),
	]);
	return {
		runtimeCwd: process.cwd(),
		requestedCwd: cwd,
		docmgrPath,
		status,
		tickets,
	};
}
