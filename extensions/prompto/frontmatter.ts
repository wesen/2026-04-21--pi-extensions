import { parse } from "yaml";

/**
 * Frontmatter handling: fence splitting plus YAML parsing (the `yaml`
 * package from the repo-level package.json — full YAML support).
 * Template frontmatter must be a YAML *map* at the top level; anything
 * else (scalar, list, parse error) raises FrontmatterError.
 */

export type FmScalar = string | number | boolean | null;
export type FmValue = FmScalar | FmValue[] | FmMap;
export interface FmMap {
	[key: string]: FmValue;
}

export class FrontmatterError extends Error {}

/**
 * Split a document into frontmatter map and body. Returns undefined
 * frontmatter when the document does not start with a `---` fence (or the
 * fence is unterminated).
 */
export function splitFrontmatter(source: string): { frontmatter: FmMap | undefined; body: string } {
	const normalized = source.replace(/^﻿/, "");
	const openFence = /^---\r?\n/.exec(normalized);
	if (!openFence) {
		return { frontmatter: undefined, body: normalized };
	}
	const rest = normalized.slice(openFence[0].length);
	const endMatch = /^---[ \t]*\r?$/m.exec(rest);
	if (!endMatch) return { frontmatter: undefined, body: normalized };
	const fmText = rest.slice(0, endMatch.index);
	const body = rest.slice(endMatch.index + endMatch[0].length).replace(/^\r?\n/, "");
	return { frontmatter: parseFrontmatter(fmText), body };
}

export function parseFrontmatter(text: string): FmMap {
	let parsed: unknown;
	try {
		parsed = parse(text);
	} catch (error) {
		throw new FrontmatterError(error instanceof Error ? error.message : String(error));
	}
	if (parsed === null || parsed === undefined) return {};
	if (typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new FrontmatterError("frontmatter must be a YAML map (key: value pairs)");
	}
	return parsed as FmMap;
}
