/**
 * Map tag names to TUI theme color names for visual scanning.
 * red = struggling, green = breakthrough, yellow = refactoring, etc.
 */
export function tagColor(tag: string): string {
	const map: Record<string, string> = {
		struggle: "error",
		breakthrough: "success",
		refactor: "warning",
		checkpoint: "accent",
		debugging: "muted",
		insight: "success",
		question: "warning",
		todo: "muted",
	};
	return map[tag.toLowerCase()] ?? "accent";
}
