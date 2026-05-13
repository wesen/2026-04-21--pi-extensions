/**
 * Parse /tag arguments: tag names + optional quoted comment.
 *
 * "/tag refactor struggle \"can't figure it out\""
 *   → { tags: ["refactor", "struggle"], comment: "can't figure it out" }
 *
 * "/tag breakthrough"
 *   → { tags: ["breakthrough"], comment: "" }
 */

export function parseTagArgs(
	args: string,
): { tags: string[]; comment: string } | null {
	const trimmed = args.trim();
	if (!trimmed) return null;

	// Split respecting quoted strings
	const parts: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (ch === '"') {
			inQuotes = !inQuotes;
		} else if (ch === " " && !inQuotes) {
			if (current) {
				parts.push(current);
				current = "";
			}
		} else {
			current += ch;
		}
	}
	if (current) parts.push(current);

	if (parts.length === 0) return null;

	// First non-quoted multi-word segment becomes the comment;
	// everything else is a tag. Simplest rule: all single words = tags,
	// the rest (if any) = comment.
	const tags: string[] = [];
	const commentParts: string[] = [];
	let pastTags = false;

	for (const part of parts) {
		// Once we hit something that looks like a comment, everything after is comment
		if (!pastTags && commentParts.length === 0) {
			tags.push(normalizeTag(part));
		} else {
			commentParts.push(part);
		}
	}

	// If only one part and it was a tag, that's fine
	// Re-evaluate: the first part is always a tag; subsequent single words
	// are also tags UNLESS there was a quoted string (inQuotes toggled)
	// Actually, let's use a simpler rule: quoted strings become the comment,
	// unquoted words are tags.
	// Re-parse more carefully.

	// Actually the above logic has a bug. Let me redo:
	// All unquoted single words are tags. The quoted string(s) form the comment.
	return reparse(trimmed);
}

function reparse(
	input: string,
): { tags: string[]; comment: string } | null {
	const tags: string[] = [];
	const commentParts: string[] = [];
	let current = "";
	let inQuotes = false;
	let inQuotedSegment = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (ch === '"') {
			if (inQuotes) {
				// End of quoted segment
				if (current) commentParts.push(current);
				current = "";
				inQuotes = false;
			} else {
				// Start of quoted segment — any accumulated unquoted word is a tag
				if (current.trim()) tags.push(normalizeTag(current.trim()));
				current = "";
				inQuotes = true;
			}
		} else if (ch === " " && !inQuotes) {
			if (current.trim()) {
				// Unquoted word — it's a tag if we haven't started a comment yet
				// All unquoted words are tags
				tags.push(normalizeTag(current.trim()));
			}
			current = "";
		} else {
			current += ch;
		}
	}
	// Handle remainder
	if (current.trim()) {
		if (inQuotes) {
			commentParts.push(current);
		} else {
			tags.push(normalizeTag(current.trim()));
		}
	}

	if (tags.length === 0) return null;
	return { tags, comment: commentParts.join(" ") };
}

function normalizeTag(tag: string): string {
	return tag.toLowerCase().trim().replace(/\s+/g, "-");
}
