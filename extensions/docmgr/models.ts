export type DocmgrAction = "selected" | "closed" | "docs-opened" | "tasks-opened" | "tasks-toggled" | "refreshed";

export interface TicketRecord {
	ticket: string;
	title: string;
	status: string;
	topics: string[];
	path: string;
	lastUpdated?: string;
	tasksDone?: number;
	tasksOpen?: number;
}

export interface DocRecord {
	ticket: string;
	docType: string;
	title: string;
	status: string;
	topics: string[];
	path: string;
	lastUpdated?: string;
}

export interface TaskRecord {
	index: number;
	checked: boolean;
	text: string;
}

export interface LastManipulatedTicket {
	ticket: string;
	title?: string;
	action: DocmgrAction;
	timestamp: string;
}

export interface DocmgrSessionState {
	currentTicket?: string;
	lastManipulatedTicket?: LastManipulatedTicket;
}

export interface DocmgrStatusInfo {
	root?: string;
	configPath?: string;
	ticketsTotal?: number;
	ticketsStale?: number;
	docsTotal?: number;
	status?: string;
	warnings: string[];
}

export interface DocmgrSnapshot {
	root?: string;
	openTicketCount: number;
	tickets: TicketRecord[];
	warnings: string[];
	refreshedAt: string;
	lastManipulatedTicket?: LastManipulatedTicket;
	currentTicket?: string;
}
