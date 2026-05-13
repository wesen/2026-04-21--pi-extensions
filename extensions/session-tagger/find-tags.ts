/**
 * Scan-on-demand helpers for finding tagged moments in session entries.
 *
 * No state, no cache. Sessions rarely exceed a few thousand entries
 * (compaction keeps them bounded), so a linear scan is sub-millisecond.
 */

/** Structured data stored in custom_message.details */
export interface TagDetails {
	tags: string[];
	comment: string;
	targetEntryId: string;
	timestamp: number;
}

/** Scanned tag returned by findTags() */
export interface ScannedTag {
	/** The custom_message entry ID */
	entryId: string;
	/** The entry that was tagged */
	targetEntryId: string;
	/** Tag labels */
	tags: string[];
	/** User comment */
	comment: string;
	/** ISO timestamp from the entry */
	timestamp: string;
}

/** CustomType used for soft-delete markers (stored as type:"custom" entries) */
export const DELETED_MARKER_TYPE = "session-tagger-deleted";

/** Scan entries for deletion markers, return Set of deleted targetEntryIds */
export function findDeletedTargetIds(entries: SessionEntryLike[]): Set<string> {
	const deleted = new Set<string>();
	for (const entry of entries) {
		if (
			entry.type === "custom" &&
			(entry as any).customType === DELETED_MARKER_TYPE &&
			(entry as any).data
		) {
			const marker = (entry as any).data as DeletedMarker;
			deleted.add(marker.targetEntryId);
		}
	}
	return deleted;
}

/** Scan session entries for tag markers. No state, no cache. */
export function findTags(entries: SessionEntryLike[], deletedTargetIds?: Set<string>): ScannedTag[] {
	const results: ScannedTag[] = [];
	for (const entry of entries) {
		if (
			entry.type === "custom_message" &&
			(entry as any).customType === "session-tagger" &&
			(entry as any).details
		) {
			const details = (entry as any).details as TagDetails;
			// Skip soft-deleted tags
			if (deletedTargetIds?.has(details.targetEntryId)) continue;
			results.push({
				entryId: entry.id,
				targetEntryId: details.targetEntryId,
				tags: details.tags,
				comment: details.comment,
				timestamp: entry.timestamp,
			});
		}
	}
	return results;
}

/** Extract all unique tag names from a list of scanned tags */
export function allTagNames(tags: ScannedTag[]): string[] {
	return [...new Set(tags.flatMap((t) => t.tags))];
}

/** Filter scanned tags by a specific tag name */
export function filterByTag(tags: ScannedTag[], tagName: string): ScannedTag[] {
	return tags.filter((t) =>
		t.tags.some((tag) => tag.toLowerCase() === tagName.toLowerCase()),
	);
}

/** Deletion marker data stored in custom entries */
export interface DeletedMarker {
	/** The custom_message entry ID that was deleted */
	entryId: string;
	/** The target entry that was tagged */
	targetEntryId: string;
}

/** Minimal entry shape we need — avoids importing heavy session types */
interface SessionEntryLike {
	type: string;
	id: string;
	timestamp: string;
	[key: string]: unknown;
}
