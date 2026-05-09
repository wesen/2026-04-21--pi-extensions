import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { Box, Key, Text, matchesKey, truncateToWidth, visibleWidth, type Component, type Focusable, type TUI } from "@mariozechner/pi-tui";
import { Type } from "typebox";

const STATUS_KEY = "kanban";
const WIDGET_KEY = "kanban-demo";
const COLUMN_IDS = ["backlog", "ready", "doing", "review", "done"] as const;
type ColumnId = (typeof COLUMN_IDS)[number];
type Priority = "low" | "medium" | "high" | "urgent";

interface Card {
	id: number;
	title: string;
	description: string;
	priority: Priority;
	assignee: string;
	tags: string[];
	createdAt: number;
	updatedAt: number;
}

interface Column {
	id: ColumnId;
	title: string;
	wipLimit?: number;
	cards: Card[];
}

interface Board {
	nextId: number;
	columns: Column[];
	archived: Card[];
}

const COLUMN_TITLES: Record<ColumnId, string> = {
	backlog: "Backlog",
	ready: "Ready",
	doing: "Doing",
	review: "Review",
	done: "Done",
};

const WIP_LIMITS: Partial<Record<ColumnId, number>> = {
	doing: 3,
	review: 2,
};

function boardPath(cwd: string): string {
	return join(cwd, ".pi", "kanban-demo.json");
}

function emptyBoard(): Board {
	return {
		nextId: 1,
		columns: COLUMN_IDS.map((id) => ({ id, title: COLUMN_TITLES[id], wipLimit: WIP_LIMITS[id], cards: [] })),
		archived: [],
	};
}

function seedBoard(): Board {
	const board = emptyBoard();
	const add = (column: ColumnId, title: string, priority: Priority, assignee: string, tags: string[], description: string) => {
		const col = board.columns.find((c) => c.id === column)!;
		const now = Date.now();
		col.cards.push({ id: board.nextId++, title, priority, assignee, tags, description, createdAt: now, updatedAt: now });
	};
	add("backlog", "Design command palette", "high", "Mira", ["ux", "overlay"], "Keyboard-first command palette with descriptions and previews.");
	add("backlog", "Write renderer tests", "medium", "Noah", ["qa"], "Assert every rendered line fits the terminal width.");
	add("ready", "Add palette presets", "medium", "Iris", ["theme"], "Ship aurora, sunset, ocean, candy, and matrix palettes.");
	add("ready", "Document widget lifecycle", "low", "Sam", ["docs"], "Explain dispose(), requestRender(), and session_shutdown cleanup.");
	add("doing", "Prototype Kanban overlay", "urgent", "Manuel", ["demo", "tui"], "Build a full-featured board demo for future extension patterns.");
	add("doing", "Status widget summary", "high", "Ava", ["widget"], "Show active cards, WIP warnings, and next bottleneck below the editor.");
	add("review", "Review powerline editor skin", "medium", "Nico", ["editor", "chrome"], "Make sure custom editor delegates app keybindings correctly.");
	add("done", "Create TUI design guide", "high", "Pi", ["docs", "done"], "Long-form guide uploaded to reMarkable.");
	return board;
}

function loadBoard(cwd: string): Board {
	const path = boardPath(cwd);
	if (!existsSync(path)) return seedBoard();
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as Board;
		if (!parsed.columns || !Array.isArray(parsed.columns)) return seedBoard();
		return parsed;
	} catch {
		return seedBoard();
	}
}

function saveBoard(cwd: string, board: Board): void {
	const path = boardPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(board, null, "\t"));
}

function findCard(board: Board, id: number): { column: Column; card: Card; index: number } | undefined {
	for (const column of board.columns) {
		const index = column.cards.findIndex((card) => card.id === id);
		if (index !== -1) return { column, card: column.cards[index]!, index };
	}
	return undefined;
}

function priorityColor(theme: Theme, priority: Priority, text = priority): string {
	switch (priority) {
		case "urgent": return theme.fg("error", text);
		case "high": return theme.fg("warning", text);
		case "medium": return theme.fg("accent", text);
		case "low": return theme.fg("muted", text);
	}
}

function priorityIcon(priority: Priority): string {
	return priority === "urgent" ? "◆" : priority === "high" ? "▲" : priority === "medium" ? "●" : "○";
}

function boardStats(board: Board): { total: number; active: number; done: number; wipWarnings: string[] } {
	const total = board.columns.reduce((sum, c) => sum + c.cards.length, 0);
	const done = board.columns.find((c) => c.id === "done")?.cards.length ?? 0;
	const active = total - done;
	const wipWarnings = board.columns
		.filter((c) => c.wipLimit !== undefined && c.cards.length > c.wipLimit)
		.map((c) => `${c.title} ${c.cards.length}/${c.wipLimit}`);
	return { total, active, done, wipWarnings };
}

function formatStatus(theme: Theme, board: Board): string {
	const stats = boardStats(board);
	const warn = stats.wipWarnings.length ? theme.fg("warning", ` ⚠ ${stats.wipWarnings.join(",")}`) : "";
	return `${theme.fg("accent", "Kanban")} ${theme.fg("dim", `${stats.active} active · ${stats.done} done`)}${warn}`;
}

function padAnsi(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function stripForMatch(card: Card): string {
	return `${card.title} ${card.description} ${card.assignee} ${card.priority} ${card.tags.join(" ")}`.toLowerCase();
}

class KanbanWidget implements Component {
	constructor(private theme: Theme, private getBoard: () => Board) {}
	invalidate(): void {}
	render(width: number): string[] {
		const board = this.getBoard();
		const stats = boardStats(board);
		const counts = board.columns.map((c) => `${c.title}:${c.cards.length}`).join("  ");
		const warn = stats.wipWarnings.length ? `  ${this.theme.fg("warning", `WIP ${stats.wipWarnings.join(" · ")}`)}` : "";
		return [truncateToWidth(` ${this.theme.fg("accent", "▦ Kanban")} ${this.theme.fg("muted", counts)}${warn}`, width, "…")];
	}
}

class KanbanOverlay implements Component, Focusable {
	focused = false;
	private selectedCol = 0;
	private selectedCard = 0;
	private details = false;
	private filterMode = false;
	private filter = "";
	private message = "";

	constructor(
		private tui: TUI,
		private theme: Theme,
		private cwd: string,
		private board: Board,
		private done: (result: string | null) => void,
		private onChange: (board: Board) => void,
	) {}

	invalidate(): void {}

	handleInput(data: string): void {
		if (this.filterMode) {
			this.handleFilterInput(data);
			return;
		}
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) return this.done(null);
		if (matchesKey(data, "/")) {
			this.filterMode = true;
			this.message = "Filtering board";
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.left)) return this.moveColumnSelection(-1);
		if (matchesKey(data, Key.right)) return this.moveColumnSelection(1);
		if (matchesKey(data, Key.up)) return this.moveCardSelection(-1);
		if (matchesKey(data, Key.down)) return this.moveCardSelection(1);
		if (matchesKey(data, Key.shift("left"))) return this.moveSelectedCard(-1);
		if (matchesKey(data, Key.shift("right"))) return this.moveSelectedCard(1);
		if (matchesKey(data, Key.enter) || matchesKey(data, "space")) {
			this.details = !this.details;
			this.tui.requestRender();
			return;
		}
		if (data === "n") return this.addDemoCard();
		if (data === "d") return this.deleteSelectedCard();
		if (data === "a") return this.archiveDone();
		if (data === "r") return this.resetBoard();
	}

	private handleFilterInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.filterMode = false;
			this.filter = "";
			this.message = "Filter cleared";
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.filterMode = false;
			this.message = this.filter ? `Filter: ${this.filter}` : "Filter cleared";
			this.clampSelection();
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.backspace)) {
			this.filter = this.filter.slice(0, -1);
			this.clampSelection();
			this.tui.requestRender();
			return;
		}
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.filter += data;
			this.clampSelection();
			this.tui.requestRender();
		}
	}

	private visibleCards(column: Column): Card[] {
		if (!this.filter.trim()) return column.cards;
		const needle = this.filter.trim().toLowerCase();
		return column.cards.filter((card) => stripForMatch(card).includes(needle));
	}

	private currentColumn(): Column {
		return this.board.columns[this.selectedCol] ?? this.board.columns[0]!;
	}

	private currentCard(): Card | undefined {
		return this.visibleCards(this.currentColumn())[this.selectedCard];
	}

	private clampSelection(): void {
		this.selectedCol = Math.max(0, Math.min(this.board.columns.length - 1, this.selectedCol));
		const cards = this.visibleCards(this.currentColumn());
		this.selectedCard = Math.max(0, Math.min(Math.max(0, cards.length - 1), this.selectedCard));
	}

	private persist(message: string): void {
		this.message = message;
		saveBoard(this.cwd, this.board);
		this.onChange(this.board);
		this.clampSelection();
		this.tui.requestRender();
	}

	private moveColumnSelection(delta: number): void {
		this.selectedCol = (this.selectedCol + delta + this.board.columns.length) % this.board.columns.length;
		this.selectedCard = 0;
		this.tui.requestRender();
	}

	private moveCardSelection(delta: number): void {
		const len = this.visibleCards(this.currentColumn()).length;
		if (!len) return;
		this.selectedCard = (this.selectedCard + delta + len) % len;
		this.tui.requestRender();
	}

	private moveSelectedCard(delta: number): void {
		const card = this.currentCard();
		if (!card) return;
		const actual = findCard(this.board, card.id);
		if (!actual) return;
		const targetIndex = Math.max(0, Math.min(this.board.columns.length - 1, this.board.columns.indexOf(actual.column) + delta));
		if (targetIndex === this.board.columns.indexOf(actual.column)) return;
		actual.column.cards.splice(actual.index, 1);
		card.updatedAt = Date.now();
		this.board.columns[targetIndex]!.cards.push(card);
		this.selectedCol = targetIndex;
		this.selectedCard = this.visibleCards(this.board.columns[targetIndex]!).findIndex((c) => c.id === card.id);
		this.persist(`Moved #${card.id} to ${this.board.columns[targetIndex]!.title}`);
	}

	private addDemoCard(): void {
		const col = this.currentColumn();
		const now = Date.now();
		const priorities: Priority[] = ["low", "medium", "high", "urgent"];
		const card: Card = {
			id: this.board.nextId++,
			title: `New TUI idea ${this.board.nextId - 1}`,
			description: "Demo-created card. Use the kanban_task tool or /kanban add <title> for specific cards.",
			priority: priorities[(this.board.nextId + this.selectedCol) % priorities.length]!,
			assignee: "You",
			tags: ["demo", "idea"],
			createdAt: now,
			updatedAt: now,
		};
		col.cards.push(card);
		this.selectedCard = this.visibleCards(col).findIndex((c) => c.id === card.id);
		this.persist(`Created #${card.id}`);
	}

	private deleteSelectedCard(): void {
		const card = this.currentCard();
		if (!card) return;
		const actual = findCard(this.board, card.id);
		if (!actual) return;
		actual.column.cards.splice(actual.index, 1);
		this.persist(`Deleted #${card.id}`);
	}

	private archiveDone(): void {
		const done = this.board.columns.find((c) => c.id === "done")!;
		const count = done.cards.length;
		this.board.archived.push(...done.cards);
		done.cards = [];
		this.persist(`Archived ${count} done card(s)`);
	}

	private resetBoard(): void {
		this.board = seedBoard();
		this.selectedCol = 0;
		this.selectedCard = 0;
		this.filter = "";
		this.persist("Reset to seeded demo board");
	}

	render(width: number): string[] {
		const usableWidth = Math.max(30, width);
		const termRows = Math.max(18, this.tui.terminal.rows - 8);
		const boardHeight = Math.min(18, Math.max(8, termRows - (this.details ? 10 : 5)));
		const colGap = 1;
		const colWidth = Math.max(5, Math.floor((usableWidth - colGap * (this.board.columns.length - 1)) / this.board.columns.length));
		const totalWidth = colWidth * this.board.columns.length + colGap * (this.board.columns.length - 1);
		const lines: string[] = [];
		const accent = (s: string) => this.theme.fg("accent", s);
		const dim = (s: string) => this.theme.fg("dim", s);
		const border = (s: string) => this.theme.fg("border", s);

		lines.push(border("╭" + "─".repeat(totalWidth - 2) + "╮"));
		lines.push(border("│ ") + padAnsi(`${accent("Kanban Task System Demo")} ${dim("full-board overlay · persistent JSON · widget · LLM tool")}`, totalWidth - 4) + border(" │"));
		const filterText = this.filterMode ? accent(`filter: ${this.filter}_`) : this.filter ? dim(`filter: ${this.filter}`) : dim("no filter");
		lines.push(border("│ ") + padAnsi(`${filterText}  ${this.message ? this.theme.fg("muted", `· ${this.message}`) : ""}`, totalWidth - 4) + border(" │"));
		lines.push(border("├" + "─".repeat(totalWidth - 2) + "┤"));

		const renderedColumns = this.board.columns.map((column, index) => this.renderColumn(column, index, colWidth, boardHeight));
		for (let row = 0; row < Math.max(...renderedColumns.map((c) => c.length)); row++) {
			lines.push(renderedColumns.map((col) => col[row] ?? " ".repeat(colWidth)).join(" ".repeat(colGap)));
		}

		lines.push(border("├" + "─".repeat(totalWidth - 2) + "┤"));
		if (this.details) {
			for (const detailLine of this.renderDetails(totalWidth - 4)) {
				lines.push(border("│ ") + padAnsi(detailLine, totalWidth - 4) + border(" │"));
			}
			lines.push(border("├" + "─".repeat(totalWidth - 2) + "┤"));
		}
		lines.push(border("│ ") + padAnsi(dim("←→ columns · ↑↓ cards · Shift+←/→ move · n new · d delete · / filter · enter details · a archive done · r reset · esc close"), totalWidth - 4) + border(" │"));
		lines.push(border("╰" + "─".repeat(totalWidth - 2) + "╯"));
		return lines.map((line) => truncateToWidth(line, totalWidth, ""));
	}

	private renderColumn(column: Column, index: number, width: number, height: number): string[] {
		const selected = index === this.selectedCol;
		const cards = this.visibleCards(column);
		const limit = column.wipLimit ? ` ${cards.length}/${column.wipLimit}` : ` ${cards.length}`;
		const overLimit = column.wipLimit !== undefined && column.cards.length > column.wipLimit;
		const title = `${selected ? "▶ " : "  "}${column.title}${limit}`;
		const head = selected ? this.theme.bg("selectedBg", this.theme.fg("accent", padAnsi(title, width))) : this.theme.fg(overLimit ? "warning" : "muted", padAnsi(title, width));
		const lines = [truncateToWidth(head, width, "")];
		lines.push(this.theme.fg(selected ? "borderAccent" : "borderMuted", "─".repeat(width)));
		for (let i = 0; i < height; i++) {
			const card = cards[i];
			if (!card) {
				lines.push(this.theme.fg("dim", padAnsi(i === 0 && cards.length === 0 ? "  empty" : "", width)));
				continue;
			}
			const cursor = selected && i === this.selectedCard ? this.theme.fg("accent", "▸") : " ";
			const pri = priorityColor(this.theme, card.priority, priorityIcon(card.priority));
			const id = this.theme.fg("dim", `#${card.id}`);
			const text = truncateToWidth(`${cursor}${pri} ${id} ${card.title}`, width, "…");
			lines.push(selected && i === this.selectedCard ? this.theme.bg("selectedBg", padAnsi(text, width)) : padAnsi(text, width));
			const meta = truncateToWidth(`   @${card.assignee} ${card.tags.map((t) => `#${t}`).join(" ")}`, width, "…");
			if (i + 1 < height) {
				lines.push(this.theme.fg("dim", padAnsi(meta, width)));
				i++;
			}
		}
		return lines;
	}

	private renderDetails(width: number): string[] {
		const card = this.currentCard();
		if (!card) return [this.theme.fg("dim", "No card selected")];
		return [
			`${this.theme.fg("accent", `#${card.id} ${card.title}`)} ${priorityColor(this.theme, card.priority, `[${card.priority}]`)}`,
			truncateToWidth(`${this.theme.fg("muted", "Assignee:")} ${card.assignee}    ${this.theme.fg("muted", "Tags:")} ${card.tags.map((t) => `#${t}`).join(" ")}`, width, "…"),
			truncateToWidth(`${this.theme.fg("muted", "Description:")} ${card.description}`, width, "…"),
		];
	}
}

const KanbanParams = Type.Object({
	action: Type.String({ description: "list, add, move, update, archive_done, reset, delete" }),
	id: Type.Optional(Type.Number({ description: "Card id for move/update/delete" })),
	title: Type.Optional(Type.String({ description: "Card title for add/update" })),
	description: Type.Optional(Type.String({ description: "Description for add/update" })),
	column: Type.Optional(Type.String({ description: "Target column: backlog, ready, doing, review, done" })),
	priority: Type.Optional(Type.String({ description: "low, medium, high, urgent" })),
	assignee: Type.Optional(Type.String({ description: "Assignee name" })),
	tags: Type.Optional(Type.Array(Type.String(), { description: "Tags" })),
});

export default function kanbanDemo(pi: ExtensionAPI): void {
	let board: Board | undefined;
	let widgetTui: TUI | undefined;

	const ensureBoard = (cwd: string) => {
		board = loadBoard(cwd);
		return board;
	};
	const updateUi = (ctx: any, nextBoard: Board) => {
		board = nextBoard;
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, formatStatus(ctx.ui.theme, nextBoard));
		widgetTui?.requestRender();
	};
	const installWidget = (ctx: any) => {
		if (!ctx.hasUI) return;
		const current = ensureBoard(ctx.cwd);
		ctx.ui.setStatus(STATUS_KEY, formatStatus(ctx.ui.theme, current));
		ctx.ui.setWidget(WIDGET_KEY, (tui: TUI, theme: Theme) => {
			widgetTui = tui;
			return new KanbanWidget(theme, () => board ?? ensureBoard(ctx.cwd));
		}, { placement: "belowEditor" });
	};

	pi.on("session_start", async (_event, ctx) => installWidget(ctx));
	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		}
		widgetTui = undefined;
	});

	pi.registerCommand("kanban", {
		description: "Open/manage the Kanban task system demo. Args: seed, reset, add <title>, widget off/on",
		handler: async (args, ctx) => {
			const [sub, ...rest] = args.trim().split(/\s+/).filter(Boolean);
			const current = ensureBoard(ctx.cwd);
			if (sub === "seed" || sub === "reset") {
				board = seedBoard();
				saveBoard(ctx.cwd, board);
				updateUi(ctx, board);
				ctx.ui.notify("Kanban demo board reset", "info");
				return;
			}
			if (sub === "add") {
				const title = rest.join(" ").trim() || "Untitled task";
				const now = Date.now();
				current.columns[0]!.cards.push({ id: current.nextId++, title, description: "Added from /kanban add", priority: "medium", assignee: "You", tags: ["manual"], createdAt: now, updatedAt: now });
				saveBoard(ctx.cwd, current);
				updateUi(ctx, current);
				ctx.ui.notify(`Added Kanban card: ${title}`, "info");
				return;
			}
			if (sub === "widget" && rest[0] === "off") {
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				ctx.ui.setStatus(STATUS_KEY, undefined);
				ctx.ui.notify("Kanban widget hidden", "info");
				return;
			}
			if (sub === "widget" && rest[0] === "on") {
				installWidget(ctx);
				ctx.ui.notify("Kanban widget shown", "info");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify("Kanban overlay requires interactive mode", "warning");
				return;
			}
			await ctx.ui.custom<string | null>(
				(tui: TUI, theme: Theme, _kb: unknown, done: (result: string | null) => void) =>
					new KanbanOverlay(tui, theme, ctx.cwd, current, done, (next) => updateUi(ctx, next)),
				{ overlay: true, overlayOptions: { width: "94%", minWidth: 72, maxHeight: "90%", anchor: "center", margin: 1, visible: (w: number, h: number) => w >= 72 && h >= 20 } },
			);
		},
	});

	pi.registerTool({
		name: "kanban_task",
		label: "Kanban Task",
		description: "Manage the demo Kanban board. Actions: list, add, move, update, archive_done, reset, delete.",
		parameters: KanbanParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const current = ensureBoard(ctx.cwd);
			const action = String(params.action ?? "list");
			const now = Date.now();
			const validColumn = (value: unknown): value is ColumnId => typeof value === "string" && (COLUMN_IDS as readonly string[]).includes(value);
			const validPriority = (value: unknown): value is Priority => ["low", "medium", "high", "urgent"].includes(String(value));
			let message = "";

			if (action === "reset") {
				board = seedBoard();
				saveBoard(ctx.cwd, board);
				message = "Board reset";
			} else if (action === "add") {
				const col = validColumn(params.column) ? params.column : "backlog";
				const column = current.columns.find((c) => c.id === col)!;
				const card: Card = {
					id: current.nextId++,
					title: params.title ?? "Untitled task",
					description: params.description ?? "Added by kanban_task tool",
					priority: validPriority(params.priority) ? params.priority : "medium",
					assignee: params.assignee ?? "Agent",
					tags: params.tags ?? ["agent"],
					createdAt: now,
					updatedAt: now,
				};
				column.cards.push(card);
				saveBoard(ctx.cwd, current);
				message = `Added #${card.id} to ${column.title}`;
			} else if (action === "move") {
				const found = params.id === undefined ? undefined : findCard(current, params.id);
				if (!found) throw new Error(`Card not found: ${params.id}`);
				if (!validColumn(params.column)) throw new Error(`Invalid target column: ${params.column}`);
				found.column.cards.splice(found.index, 1);
				found.card.updatedAt = now;
				current.columns.find((c) => c.id === params.column)!.cards.push(found.card);
				saveBoard(ctx.cwd, current);
				message = `Moved #${found.card.id} to ${COLUMN_TITLES[params.column]}`;
			} else if (action === "update") {
				const found = params.id === undefined ? undefined : findCard(current, params.id);
				if (!found) throw new Error(`Card not found: ${params.id}`);
				if (params.title) found.card.title = params.title;
				if (params.description) found.card.description = params.description;
				if (validPriority(params.priority)) found.card.priority = params.priority;
				if (params.assignee) found.card.assignee = params.assignee;
				if (params.tags) found.card.tags = params.tags;
				found.card.updatedAt = now;
				saveBoard(ctx.cwd, current);
				message = `Updated #${found.card.id}`;
			} else if (action === "delete") {
				const found = params.id === undefined ? undefined : findCard(current, params.id);
				if (!found) throw new Error(`Card not found: ${params.id}`);
				found.column.cards.splice(found.index, 1);
				saveBoard(ctx.cwd, current);
				message = `Deleted #${found.card.id}`;
			} else if (action === "archive_done") {
				const done = current.columns.find((c) => c.id === "done")!;
				const count = done.cards.length;
				current.archived.push(...done.cards);
				done.cards = [];
				saveBoard(ctx.cwd, current);
				message = `Archived ${count} done card(s)`;
			} else if (action === "list") {
				message = "Board listed";
			} else {
				throw new Error(`Unknown action: ${action}`);
			}

			const nextBoard = board ?? current;
			if (ctx.hasUI) updateUi(ctx, nextBoard);
			return {
				content: [{ type: "text", text: `${message}\n\n${summarizeBoard(nextBoard)}` }],
				details: { action, message, board: nextBoard },
			};
		},
		renderCall(args, theme) {
			return new Text(`${theme.fg("toolTitle", theme.bold("kanban_task"))} ${theme.fg("accent", String(args.action ?? "list"))}${args.id ? theme.fg("dim", ` #${args.id}`) : ""}`, 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as { message?: string; board?: Board } | undefined;
			const text = details?.board ? renderBoardText(details.board, theme, expanded) : String(result.content[0]?.type === "text" ? result.content[0].text : "");
			const box = new Box(1, 0, (s) => theme.bg("customMessageBg", s));
			box.addChild(new Text(`${theme.fg("accent", details?.message ?? "Kanban result")}\n${text}`, 0, 0));
			return box;
		},
	});
}

function summarizeBoard(board: Board): string {
	return board.columns.map((c) => `${c.title}: ${c.cards.length}`).join(" | ") + ` | Archived: ${board.archived.length}`;
}

function renderBoardText(board: Board, theme: Theme, expanded: boolean): string {
	const lines: string[] = [theme.fg("muted", summarizeBoard(board))];
	for (const column of board.columns) {
		lines.push(`\n${theme.fg("accent", column.title)} ${theme.fg("dim", `(${column.cards.length})`)}`);
		const cards = expanded ? column.cards : column.cards.slice(0, 3);
		for (const card of cards) {
			lines.push(`${priorityColor(theme, card.priority, priorityIcon(card.priority))} ${theme.fg("dim", `#${card.id}`)} ${card.title} ${theme.fg("dim", `@${card.assignee}`)}`);
		}
		if (!expanded && column.cards.length > cards.length) lines.push(theme.fg("dim", `… ${column.cards.length - cards.length} more`));
	}
	return lines.join("\n");
}
