import type { PaletteItem } from "../registry";

export interface KeyedPaletteItem {
	item: PaletteItem;
	key: string;
}

/**
 * Assign single-character keys to a list of palette items.
 *
 * Priority: explicit `item.key` → first unique alphanumeric char of title → sequential fallback.
 * Throws if two items specify the same explicit key.
 */
export function assignKeys(items: PaletteItem[]): KeyedPaletteItem[] {
	const taken = new Set<string>();
	const result: KeyedPaletteItem[] = [];

	// Pass 1: explicit overrides
	for (const item of items) {
		if (item.key) {
			const normalized = item.key.toLowerCase();
			if (taken.has(normalized)) {
				throw new Error(
					`Duplicate palette key '${normalized}' on items in same level. ` +
						`Offending item: "${item.title}" (id: ${item.id})`,
				);
			}
			taken.add(normalized);
			result.push({ item, key: normalized });
		}
	}

	// Pass 2: auto-assign from title
	for (const item of items) {
		if (result.some((r) => r.item === item)) continue;

		for (const char of item.title.toLowerCase()) {
			if (/[a-z0-9]/.test(char) && !taken.has(char)) {
				taken.add(char);
				result.push({ item, key: char });
				break;
			}
		}
	}

	// Pass 3: sequential fallback
	const fallbackChars = "abcdefghijklmnopqrstuvwxyz0123456789";
	for (const item of items) {
		if (result.some((r) => r.item === item)) continue;

		for (const char of fallbackChars) {
			if (!taken.has(char)) {
				taken.add(char);
				result.push({ item, key: char });
				break;
			}
		}
	}

	return result;
}

/**
 * Fuzzy-filter keyed items by query (simple substring match on id, title, description, tags).
 */
export function filterKeyedItems(items: KeyedPaletteItem[], query: string): KeyedPaletteItem[] {
	if (!query) return items;
	const q = query.toLowerCase();
	return items.filter(({ item }) => {
		const haystack = [item.id, item.title, item.description ?? "", ...(item.tags ?? [])]
			.join(" ")
			.toLowerCase();
		return haystack.includes(q);
	});
}
