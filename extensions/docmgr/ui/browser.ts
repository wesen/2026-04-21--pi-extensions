import { Markdown, type MarkdownTheme } from "@mariozechner/pi-tui";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

export interface BrowserItem {
	id: string;
	label: string;
	description?: string;
	preview?: string;
}

export interface BrowserOptions {
	title: string;
	emptyText: string;
	helpText: string;
	items: BrowserItem[];
	selectedIndex?: number;
	onSelect?: (item: BrowserItem, index: number) => void | Promise<void>;
	onActivate?: (item: BrowserItem, index: number) => void | Promise<void>;
	onSecondary?: (item: BrowserItem, index: number, key: string) => void | Promise<void>;
	onCancel: () => void;
	previewMarkdown?: (item: BrowserItem) => string;
	markdownTheme?: MarkdownTheme;
}

export function createBrowserComponent(options: BrowserOptions) {
	let items = options.items;
	let selectedIndex = Math.max(0, Math.min(options.selectedIndex ?? 0, Math.max(0, items.length - 1)));
	let cachedWidth = -1;
	let cachedLines: string[] = [];

	const markdownTheme = options.markdownTheme ?? getMarkdownTheme();

	function currentItem(): BrowserItem | undefined {
		return items[selectedIndex];
	}

	function updateItems(nextItems: BrowserItem[]) {
		items = nextItems;
		selectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, items.length - 1)));
		cachedWidth = -1;
	}

	function renderPreview(item: BrowserItem | undefined, width: number): string[] {
		if (!item) {
			return [truncateToWidth(options.emptyText, width)];
		}
		const source = options.previewMarkdown?.(item) ?? item.preview ?? "";
		if (!source.trim()) {
			return [truncateToWidth(options.emptyText, width)];
		}
		const markdown = new Markdown(source, 0, 0, markdownTheme);
		return markdown.render(width);
	}

	function render(width: number): string[] {
		if (width === cachedWidth) return cachedLines;
		cachedWidth = width;
		const lines: string[] = [];
		lines.push(truncateToWidth(options.title, width));
		lines.push(truncateToWidth("─".repeat(Math.max(0, width)), width));

		if (items.length === 0) {
			lines.push(truncateToWidth(options.emptyText, width));
			lines.push(truncateToWidth("─".repeat(Math.max(0, width)), width));
			lines.push(...wrapTextWithAnsi(options.helpText, width));
			cachedLines = lines;
			return lines;
		}

		for (let i = 0; i < items.length; i++) {
			const item = items[i]!;
			const prefix = i === selectedIndex ? "> " : "  ";
			const line = item.description
				? `${prefix}${item.label}  ${item.description}`
				: `${prefix}${item.label}`;
			lines.push(truncateToWidth(line, width));
		}

		lines.push(truncateToWidth("", width));
		lines.push(truncateToWidth("Preview", width));
		lines.push(...renderPreview(currentItem(), width));
		lines.push(truncateToWidth("", width));
		lines.push(...wrapTextWithAnsi(options.helpText, width));
		cachedLines = lines;
		return lines;
	}

	function handleInput(data: string): void {
		if (matchesKey(data, Key.up)) {
			selectedIndex = Math.max(0, selectedIndex - 1);
			cachedWidth = -1;
			return;
		}
		if (matchesKey(data, Key.down)) {
			selectedIndex = Math.min(items.length - 1, selectedIndex + 1);
			cachedWidth = -1;
			return;
		}
		if (matchesKey(data, Key.escape)) {
			options.onCancel();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			const item = currentItem();
			if (item) void options.onSelect?.(item, selectedIndex);
			return;
		}
		if (data.length === 1 && options.onSecondary) {
			const item = currentItem();
			if (item) void options.onSecondary(item, selectedIndex, data);
		}
	}

	return {
		render,
		handleInput,
		invalidate: () => {
			cachedWidth = -1;
		},
		updateItems,
		setSelectedIndex: (index: number) => {
			selectedIndex = Math.max(0, Math.min(index, Math.max(0, items.length - 1)));
			cachedWidth = -1;
		},
		getSelectedItem: () => currentItem(),
	};
}
