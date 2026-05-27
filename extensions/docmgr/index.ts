import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { writeFileSync } from "node:fs";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import { createBrowserComponent, type BrowserItem } from "./ui/browser";
import {
	closeTicket,
	inspectWorkspace,
	listDocs,
	listTasks,
	listTickets,
	loadWorkspaceStatus,
	readDocPreview,
	resolveDocPath,
	toggleTask,
} from "./docmgr-cli";
import type { DocRecord, DocmgrAction, DocmgrSessionState, DocmgrSnapshot, TaskRecord, TicketRecord } from "./models";
import { createEmptySnapshot, isOpenTicket, mergeSnapshotWithSession, pickActiveTicket, recordTicketSelection, restoreDocmgrState, updateSnapshotStatus } from "./state";
import { registerPiExtension } from "../_shared/registry";

const SHORTCUTS = {
	tickets: Key.ctrlAlt("t"),
	docs: Key.ctrlAlt("d"),
	tasks: Key.ctrlAlt("g"),
	refresh: Key.ctrlAlt("r"),
	close: Key.ctrlAlt("c"),
} as const;

let snapshot: DocmgrSnapshot = createEmptySnapshot();
let sessionState: DocmgrSessionState = {};

function ticketToItem(ticket: TicketRecord): BrowserItem {
	const bits: string[] = [ticket.status];
	if (ticket.topics.length > 0) bits.push(ticket.topics.join(", "));
	if (typeof ticket.tasksOpen === "number") bits.push(`${ticket.tasksOpen} open tasks`);
	return {
		id: ticket.ticket,
		label: `${ticket.ticket} — ${ticket.title}`,
		description: bits.join(" · "),
		preview: [
			`**${ticket.ticket}**`,
			"",
			`Title: ${ticket.title}`,
			`Status: ${ticket.status}`,
			`Topics: ${ticket.topics.join(", ") || "(none)"}`,
			`Path: ${ticket.path}`,
			typeof ticket.lastUpdated === "string" ? `Last updated: ${ticket.lastUpdated}` : undefined,
			typeof ticket.tasksDone === "number" ? `Tasks done: ${ticket.tasksDone}` : undefined,
			typeof ticket.tasksOpen === "number" ? `Tasks open: ${ticket.tasksOpen}` : undefined,
		]
			.filter(Boolean)
			.join("\n"),
	};
}

function docToItem(doc: DocRecord, root: string | undefined): BrowserItem {
	const previewPath = resolveDocPath(root, doc.path);
	let preview = "";
	try {
		preview = readDocPreview(previewPath);
	} catch (error) {
		preview = `**Failed to read preview**\n\n${error instanceof Error ? error.message : String(error)}`;
	}
	return {
		id: doc.path,
		label: `${doc.docType} — ${doc.title}`,
		description: [doc.ticket, doc.status, doc.topics.join(", ")].filter(Boolean).join(" · "),
		preview,
	};
}

function taskToItem(task: TaskRecord): BrowserItem {
	return {
		id: String(task.index),
		label: `${task.checked ? "☑" : "☐"} ${task.text}`,
		description: `Task ${task.index}`,
	};
}

function setFooter(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus("docmgr", updateSnapshotStatus(snapshot));
}

function buildDebugLines(ctx: ExtensionCommandContext, probe: Awaited<ReturnType<typeof inspectWorkspace>>): string[] {
	const ticketSummaries = snapshot.tickets.slice(0, 3).map((ticket) => `• ${ticket.ticket} · ${ticket.status} · ${ticket.title}`);
	return [
		`docmgr debug`,
		`ctx.cwd: ${ctx.cwd}`,
		`docmgr path: ${probe.docmgrPath}`,
		`root: ${snapshot.root ?? "(unknown)"}`,
		`tickets: ${snapshot.tickets.length}`,
		`open: ${snapshot.openTicketCount}`,
		`warnings: ${snapshot.warnings.length}`,
		snapshot.lastManipulatedTicket
			? `last action: ${snapshot.lastManipulatedTicket.ticket} (${snapshot.lastManipulatedTicket.action})`
			: "last action: (none)",
		"",
		"Ticket sample:",
		...(ticketSummaries.length > 0 ? ticketSummaries : ["• (no tickets loaded)"]),
		snapshot.tickets.length > ticketSummaries.length ? `• ...and ${snapshot.tickets.length - ticketSummaries.length} more` : undefined,
		"",
		"Raw probe files:",
		"• /tmp/docmgr-debug-status.txt",
		"• /tmp/docmgr-debug-tickets.txt",
		"• /tmp/docmgr-debug-parsed.txt",
		"• /tmp/docmgr-debug-direct.txt",
	].filter((line): line is string => typeof line === "string" && line.length > 0);
}

let debugWidgetVisible = false;

async function showDebugWidget(ctx: ExtensionCommandContext): Promise<void> {
	await refreshSnapshot(ctx);
	const probe = await inspectWorkspace(ctx.cwd);
	const parsedStatus = await loadWorkspaceStatus(ctx.cwd);
	const parsedTickets = await listTickets(ctx.cwd);

	try {
		writeFileSync("/tmp/docmgr-debug-status.txt", [
			`# docmgr status probe`,
			`ctx.cwd: ${ctx.cwd}`,
			`docmgr path: ${probe.docmgrPath}`,
			`status exit: ${probe.status.exitCode}`,
			"",
			probe.status.stdout,
			"",
			"--- stderr ---",
			probe.status.stderr,
		].join("\n"));
		writeFileSync("/tmp/docmgr-debug-tickets.txt", [
			`# docmgr tickets probe`,
			`ctx.cwd: ${ctx.cwd}`,
			`docmgr path: ${probe.docmgrPath}`,
			`ticket exit: ${probe.tickets.exitCode}`,
			"",
			probe.tickets.stdout,
			"",
			"--- stderr ---",
			probe.tickets.stderr,
		].join("\n"));
		writeFileSync("/tmp/docmgr-debug-parsed.txt", JSON.stringify({
			parsedStatus,
			parsedTicketsCount: parsedTickets.length,
			parsedTicketsSample: parsedTickets.slice(0, 3),
			activeSnapshot: {
				root: snapshot.root,
				tickets: snapshot.tickets.length,
				open: snapshot.openTicketCount,
				warnings: snapshot.warnings,
			},
		}, null, 2));
		writeFileSync("/tmp/docmgr-debug-direct.txt", JSON.stringify({
			status: JSON.parse(probe.status.stdout.trim()),
			tickets: JSON.parse(probe.tickets.stdout.trim()),
		}, null, 2));
	} catch (error) {
		ctx.ui.notify(`Failed to write debug probe files: ${error instanceof Error ? error.message : String(error)}`, "warning");
	}

	if (!ctx.hasUI) {
		ctx.ui.notify(`docmgr debug: cwd=${ctx.cwd} tickets=${snapshot.tickets.length} open=${snapshot.openTicketCount}`, "info");
		return;
	}

	ctx.ui.setWidget("docmgr-debug", buildDebugLines(ctx, probe), { placement: "belowEditor" });
	debugWidgetVisible = true;
	ctx.ui.notify("docmgr debug widget shown below the editor. Raw probes saved to /tmp/docmgr-debug-*.txt", "info");
}

function recordTicketState(
	ctx: ExtensionContext,
	ticket: Pick<TicketRecord, "ticket" | "title">,
	action: DocmgrAction,
): void {
	sessionState = recordTicketSelection(ctx, sessionState, ticket.ticket, ticket.title, action);
}

async function refreshSnapshot(ctx: ExtensionContext): Promise<void> {
	try {
		const [status, tickets] = await Promise.all([loadWorkspaceStatus(ctx.cwd), listTickets(ctx.cwd)]);
		snapshot = mergeSnapshotWithSession(
			{
				root: status.root,
				openTicketCount: tickets.filter(isOpenTicket).length,
				tickets,
				warnings: status.warnings,
				refreshedAt: new Date().toISOString(),
			},
			sessionState,
		);
	} catch (error) {
		snapshot = mergeSnapshotWithSession(
			{
				...createEmptySnapshot(),
				warnings: [error instanceof Error ? error.message : String(error)],
				refreshedAt: new Date().toISOString(),
			},
			sessionState,
		);
		if (ctx.hasUI) {
			ctx.ui.notify(`docmgr refresh failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
		}
	}
	setFooter(ctx);
}

async function ensureSnapshot(ctx: ExtensionContext): Promise<void> {
	if (snapshot.tickets.length > 0 && snapshot.root) return;
	await refreshSnapshot(ctx);
}

function getTicketById(ticketId: string): TicketRecord | undefined {
	return snapshot.tickets.find((ticket) => ticket.ticket === ticketId);
}

async function chooseActiveTicket(ctx: ExtensionCommandContext): Promise<TicketRecord | undefined> {
	await ensureSnapshot(ctx);
	return pickActiveTicket(snapshot, sessionState);
}

async function refreshAndNotify(ctx: ExtensionContext, message = "docmgr snapshot refreshed"): Promise<void> {
	await refreshSnapshot(ctx);
	if (ctx.hasUI) ctx.ui.notify(message, "info");
}

async function showTicketBrowser(ctx: ExtensionCommandContext): Promise<void> {
	await refreshSnapshot(ctx);
	if (!ctx.hasUI) {
		ctx.ui.notify("UI not available", "warning");
		return;
	}

	const component = createBrowserComponent({
		title: "docmgr tickets",
		emptyText: "No tickets found.",
		helpText: "↑↓ navigate · Enter select ticket · d docs · t tasks · c close · Esc exit",
		items: snapshot.tickets.map(ticketToItem),
		selectedIndex: Math.max(0, snapshot.tickets.findIndex((ticket) => ticket.ticket === sessionState.currentTicket)),
		onSelect: async (_item, index) => {
			const ticket = snapshot.tickets[index];
			if (!ticket) return;
			recordTicketState(ctx, ticket, "selected");
			setFooter(ctx);
			ctx.ui.notify(`Selected ${ticket.ticket}`, "info");
		},
		onSecondary: async (_item, index, key) => {
			const ticket = snapshot.tickets[index];
			if (!ticket) return;
			if (key === "d") {
				recordTicketState(ctx, ticket, "docs-opened");
				setFooter(ctx);
				await showDocsBrowser(ctx, ticket.ticket);
				return;
			}
			if (key === "t") {
				recordTicketState(ctx, ticket, "tasks-opened");
				setFooter(ctx);
				await showTasksBrowser(ctx, ticket.ticket);
				return;
			}
			if (key === "c") {
				await closeTicketFlow(ctx, ticket);
			}
		},
		onCancel: () => {
			ctx.ui.notify("Closed ticket browser", "info");
		},
	});

	await ctx.ui.custom(
		(_tui, _theme, _kb, done) => ({
			render: (width) => component.render(width),
			handleInput: (data) => {
				if (matchesKey(data, Key.escape)) {
					done(undefined);
					return;
				}
				component.handleInput(data);
				if (data === "d" || data === "t" || data === "c") {
					done(undefined);
				}
			},
			invalidate: () => component.invalidate(),
		}),
		{ overlay: true },
	);
}

async function showDocsBrowser(ctx: ExtensionCommandContext, ticketId?: string): Promise<void> {
	const activeTicket = ticketId ?? (await chooseActiveTicket(ctx))?.ticket;
	if (!activeTicket) {
		ctx.ui.notify("Pick a ticket first", "warning");
		return;
	}

	const ticket = getTicketById(activeTicket) ?? { ticket: activeTicket, title: activeTicket };
	recordTicketState(ctx, ticket, "docs-opened");
	setFooter(ctx);

	let docs: DocRecord[];
	try {
		docs = await listDocs(ctx.cwd, activeTicket);
	} catch (error) {
		ctx.ui.notify(`Failed to list docs: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}
	const root = snapshot.root ?? ctx.cwd;
	const component = createBrowserComponent({
		title: `docmgr docs — ${activeTicket}`,
		emptyText: "No docs found for this ticket.",
		helpText: "↑↓ navigate · Esc exit",
		items: docs.map((doc) => docToItem(doc, root)),
		onCancel: () => {
			ctx.ui.notify("Closed docs browser", "info");
		},
	});

	await ctx.ui.custom(
		(_tui, _theme, _kb, done) => ({
			render: (width) => component.render(width),
			handleInput: (data) => {
				if (matchesKey(data, Key.escape)) {
					done(undefined);
					return;
				}
				component.handleInput(data);
			},
			invalidate: () => component.invalidate(),
		}),
		{ overlay: true },
	);
}

async function toggleSelectedTask(ctx: ExtensionCommandContext, activeTicket: string, tasks: TaskRecord[], selectedIndex: number): Promise<TaskRecord[] | undefined> {
	const task = tasks[selectedIndex];
	if (!task) return;
	try {
		await toggleTask(ctx.cwd, { ticket: activeTicket, index: task.index, checked: task.checked });
		const refreshed = await listTasks(ctx.cwd, activeTicket);
		const ticket = getTicketById(activeTicket) ?? { ticket: activeTicket, title: activeTicket };
		recordTicketState(ctx, ticket, "tasks-toggled");
		await refreshSnapshot(ctx);
		return refreshed;
	} catch (error) {
		ctx.ui.notify(`Failed to toggle task: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}
}

async function showTasksBrowser(ctx: ExtensionCommandContext, ticketId?: string): Promise<void> {
	const activeTicket = ticketId ?? (await chooseActiveTicket(ctx))?.ticket;
	if (!activeTicket) {
		ctx.ui.notify("Pick a ticket first", "warning");
		return;
	}

	const ticket = getTicketById(activeTicket) ?? { ticket: activeTicket, title: activeTicket };
	recordTicketState(ctx, ticket, "tasks-opened");
	setFooter(ctx);

	let tasks: TaskRecord[];
	try {
		tasks = await listTasks(ctx.cwd, activeTicket);
	} catch (error) {
		ctx.ui.notify(`Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}
	const component = createBrowserComponent({
		title: `docmgr tasks — ${activeTicket}`,
		emptyText: "No tasks found for this ticket.",
		helpText: "↑↓ navigate · Space/Enter toggle · Esc exit",
		items: tasks.map(taskToItem),
		onSelect: async (_item, index) => {
			const refreshed = await toggleSelectedTask(ctx, activeTicket, tasks, index);
			if (refreshed) {
				tasks = refreshed;
				component.updateItems(tasks.map(taskToItem));
				component.setSelectedIndex(index);
			}
		},
		onSecondary: async (_item, index, key) => {
			if (key !== " ") return;
			const refreshed = await toggleSelectedTask(ctx, activeTicket, tasks, index);
			if (refreshed) {
				tasks = refreshed;
				component.updateItems(tasks.map(taskToItem));
				component.setSelectedIndex(index);
			}
		},
		onCancel: () => {
			ctx.ui.notify("Closed tasks browser", "info");
		},
	});

	await ctx.ui.custom(
		(_tui, _theme, _kb, done) => ({
			render: (width) => component.render(width),
			handleInput: (data) => {
				if (matchesKey(data, Key.escape)) {
					done(undefined);
					return;
				}
				component.handleInput(data);
			},
			invalidate: () => component.invalidate(),
		}),
		{ overlay: true },
	);
}

async function closeTicketFlow(ctx: ExtensionCommandContext, ticket: TicketRecord): Promise<void> {
	const confirmed = await ctx.ui.confirm("Close ticket", `Close ${ticket.ticket}?`);
	if (!confirmed) return;

	const intent = await ctx.ui.input("Intent", "Optional intent (leave blank for default)");
	const note = await ctx.ui.input("Changelog note", "Optional changelog text");

	try {
		await closeTicket(ctx.cwd, {
			ticket: ticket.ticket,
			status: "complete",
			intent: intent?.trim() || undefined,
			changelogEntry: note?.trim() || "Ticket closed from Pi",
		});
	} catch (error) {
		ctx.ui.notify(`Failed to close ticket: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}

	recordTicketState(ctx, ticket, "closed");
	await refreshSnapshot(ctx);
	ctx.ui.notify(`Closed ${ticket.ticket}`, "info");
}

export default function docmgrExtension(pi: ExtensionAPI): void {
	registerPiExtension({
		id: "docmgr",
		name: "Docmgr",
		description: "Interactive ticket, document, and task browser for docmgr workspaces.",
		commands: ["docmgr", "docmgr-refresh", "docmgr-debug", "docmgr-tickets", "docmgr-docs", "docmgr-tasks", "docmgr-close"],
		tags: ["docmgr", "tickets", "docs", "tasks"],

		palette: [
			{
				id: "tickets",
				title: "Browse tickets",
				key: "t",
				description: "Open the docmgr ticket browser.",
				run: async (ctx) => showTicketBrowser(ctx),
			},
			{
				id: "docs",
				title: "Browse docs",
				key: "d",
				description: "Open docs for the active docmgr ticket.",
				run: async (ctx) => showDocsBrowser(ctx),
			},
			{
				id: "tasks",
				title: "Browse tasks",
				key: "k",
				description: "Open tasks for the active docmgr ticket.",
				run: async (ctx) => showTasksBrowser(ctx),
			},
			{
				id: "refresh",
				title: "Refresh snapshot",
				key: "r",
				description: "Refresh the docmgr workspace snapshot and status.",
				run: async (ctx) => refreshAndNotify(ctx),
			},
		],
	});
	pi.on("session_start", async (_event, ctx) => {
		sessionState = restoreDocmgrState(ctx.sessionManager);
		await refreshSnapshot(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		if (!ctx.hasUI || !debugWidgetVisible) return;
		ctx.ui.setWidget("docmgr-debug", undefined);
		debugWidgetVisible = false;
	});

	pi.registerCommand("docmgr", {
		description: "Open the docmgr ticket browser",
		handler: async (_args, ctx) => {
			await showTicketBrowser(ctx);
		},
	});

	pi.registerCommand("docmgr-refresh", {
		description: "Refresh docmgr snapshot/status",
		handler: async (_args, ctx) => {
			await refreshAndNotify(ctx);
		},
	});

	pi.registerCommand("docmgr-debug", {
		description: "Show docmgr workspace diagnostics",
		handler: async (_args, ctx) => {
			await showDebugWidget(ctx);
		},
	});

	pi.registerCommand("docmgr-tickets", {
		description: "Open the docmgr ticket browser",
		handler: async (_args, ctx) => {
			await showTicketBrowser(ctx);
		},
	});

	pi.registerCommand("docmgr-docs", {
		description: "Open docs for the active docmgr ticket",
		handler: async (_args, ctx) => {
			await showDocsBrowser(ctx);
		},
	});

	pi.registerCommand("docmgr-tasks", {
		description: "Open tasks for the active docmgr ticket",
		handler: async (_args, ctx) => {
			await showTasksBrowser(ctx);
		},
	});

	pi.registerCommand("docmgr-close", {
		description: "Close the current docmgr ticket",
		handler: async (_args, ctx) => {
			const ticket = await chooseActiveTicket(ctx);
			if (!ticket) {
				ctx.ui.notify("No active ticket selected", "warning");
				return;
			}
			await closeTicketFlow(ctx, ticket);
		},
	});

	pi.registerShortcut(SHORTCUTS.tickets, {
		description: "Open docmgr tickets",
		handler: async (ctx) => showTicketBrowser(ctx),
	});
	pi.registerShortcut(SHORTCUTS.docs, {
		description: "Open docmgr docs",
		handler: async (ctx) => showDocsBrowser(ctx),
	});
	pi.registerShortcut(SHORTCUTS.tasks, {
		description: "Open docmgr tasks",
		handler: async (ctx) => showTasksBrowser(ctx),
	});
	pi.registerShortcut(SHORTCUTS.refresh, {
		description: "Refresh docmgr snapshot",
		handler: async (ctx) => refreshAndNotify(ctx),
	});
	pi.registerShortcut(SHORTCUTS.close, {
		description: "Close active docmgr ticket",
		handler: async (ctx) => {
			const ticket = await chooseActiveTicket(ctx);
			if (ticket) await closeTicketFlow(ctx, ticket);
		},
	});

	pi.on("turn_end", async (_event, ctx) => {
		setFooter(ctx);
	});
}
