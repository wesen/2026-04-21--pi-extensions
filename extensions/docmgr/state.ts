import type { ReadonlySessionManager, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { DocmgrSessionState, DocmgrSnapshot, LastManipulatedTicket, TicketRecord, DocmgrAction } from "./models";

const CUSTOM_TYPE = "docmgr-state";

const CLOSED_STATUSES = new Set(["complete", "closed", "archived", "done"]);

function normalizeStatus(status: string): string {
	return status.trim().toLowerCase();
}

export function isOpenTicket(ticket: TicketRecord): boolean {
	return !CLOSED_STATUSES.has(normalizeStatus(ticket.status));
}

export function createEmptySnapshot(): DocmgrSnapshot {
	return {
		openTicketCount: 0,
		tickets: [],
		warnings: [],
		refreshedAt: new Date().toISOString(),
	};
}

export function restoreDocmgrState(sessionManager: ReadonlySessionManager): DocmgrSessionState {
	const state: DocmgrSessionState = {};
	for (const entry of sessionManager.getBranch()) {
		if (entry.type !== "custom" || entry.customType !== CUSTOM_TYPE) {
			continue;
		}
		const data = entry.data as DocmgrSessionState | undefined;
		if (!data) continue;
		if (data.currentTicket) state.currentTicket = data.currentTicket;
		if (data.lastManipulatedTicket) state.lastManipulatedTicket = data.lastManipulatedTicket;
	}
	return state;
}

export function appendDocmgrState(ctx: ExtensionContext, state: DocmgrSessionState): void {
	ctx.sessionManager.appendCustomEntry(CUSTOM_TYPE, state);
}

export function recordTicketSelection(
	ctx: ExtensionContext,
	state: DocmgrSessionState,
	ticketId: string,
	title: string | undefined,
	action: DocmgrAction,
): DocmgrSessionState {
	const nextState: DocmgrSessionState = {
		currentTicket: ticketId,
		lastManipulatedTicket: {
			ticket: ticketId,
			title,
			action,
			timestamp: new Date().toISOString(),
		},
	};
	appendDocmgrState(ctx, nextState);
	return nextState;
}

export function mergeSnapshotWithSession(snapshot: DocmgrSnapshot, state: DocmgrSessionState): DocmgrSnapshot {
	return {
		...snapshot,
		currentTicket: state.currentTicket,
		lastManipulatedTicket: state.lastManipulatedTicket,
	};
}

export function updateSnapshotStatus(snapshot: DocmgrSnapshot): string {
	const rootLabel = snapshot.root ? snapshot.root.split("/").filter(Boolean).pop() ?? snapshot.root : "ttmp";
	const parts = [`root ${rootLabel}`, `open ${snapshot.openTicketCount}/${snapshot.tickets.length}`];
	if (snapshot.lastManipulatedTicket) {
		parts.push(`last ${snapshot.lastManipulatedTicket.ticket}`);
	}
	if (snapshot.warnings.length > 0) {
		parts.push(`warn ${snapshot.warnings.length}`);
	}
	return `docmgr · ${parts.join(" · ")}`;
}

export function pickActiveTicket(snapshot: DocmgrSnapshot, state: DocmgrSessionState): TicketRecord | undefined {
	const candidates = [state.currentTicket, state.lastManipulatedTicket?.ticket];
	for (const ticketId of candidates) {
		if (!ticketId) continue;
		const found = snapshot.tickets.find((ticket) => ticket.ticket === ticketId);
		if (found) return found;
	}
	return snapshot.tickets[0];
}
