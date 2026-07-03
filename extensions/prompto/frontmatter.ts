/**
 * Minimal YAML-subset parser for template frontmatter.
 *
 * The repo's extensions avoid third-party dependencies (pi resolves bare
 * imports against its own node_modules, but standalone tooling like `bun
 * test` cannot), so instead of the full YAML spec we parse exactly the
 * subset the template format needs:
 *
 *   - maps (`key: value`), nested by indentation
 *   - block lists (`- ` items: scalars or maps)
 *   - inline arrays (`[a, b, "c d"]`)
 *   - scalars: plain / "double-quoted" / 'single-quoted' / number / boolean
 *   - block literal strings (`key: |` and `key: |-`)
 *   - full-line `#` comments and blank lines
 *
 * NOT supported (throws or misparses — keep frontmatter simple): anchors,
 * aliases, flow maps, multi-line quoted scalars, folded scalars (`>`),
 * nested block lists inside block lists, tabs for indentation.
 */

export type FmScalar = string | number | boolean | null;
export type FmValue = FmScalar | FmValue[] | FmMap;
export interface FmMap {
	[key: string]: FmValue;
}

interface Line {
	indent: number;
	text: string;
	raw: string;
	rawIndex: number;
}

export class FrontmatterError extends Error {}

/**
 * Split a document into frontmatter map and body. Returns undefined
 * frontmatter when the document does not start with a `---` fence.
 */
export function splitFrontmatter(source: string): { frontmatter: FmMap | undefined; body: string } {
	const normalized = source.replace(/^﻿/, "");
	if (!normalized.startsWith("---\n") && normalized !== "---") {
		return { frontmatter: undefined, body: normalized };
	}
	const rest = normalized.slice(4);
	const endMatch = /^---[ \t]*$/m.exec(rest);
	if (!endMatch) return { frontmatter: undefined, body: normalized };
	const fmText = rest.slice(0, endMatch.index);
	const body = rest.slice(endMatch.index + endMatch[0].length).replace(/^\r?\n/, "");
	return { frontmatter: parseFrontmatter(fmText), body };
}

export function parseFrontmatter(text: string): FmMap {
	const lines: Line[] = [];
	const rawLines = text.split("\n");
	for (let rawIndex = 0; rawIndex < rawLines.length; rawIndex++) {
		const raw = rawLines[rawIndex];
		if (/^\s*$/.test(raw)) continue;
		const indentMatch = /^( *)/.exec(raw);
		const indent = indentMatch ? indentMatch[1].length : 0;
		const trimmed = raw.slice(indent);
		if (/^\t/.test(raw)) throw new FrontmatterError("tabs are not allowed for indentation in frontmatter");
		lines.push({ indent, text: trimmed, raw, rawIndex });
	}
	const parser = new Parser(lines, rawLines);
	const result = parser.parseMap(0);
	if (parser.pos < parser.lines.length) {
		throw new FrontmatterError(`unexpected line: "${parser.lines[parser.pos].raw.trim()}"`);
	}
	return result;
}

class Parser {
	pos = 0;

	constructor(
		readonly lines: Line[],
		private readonly rawLines: string[],
	) {}

	parseMap(indent: number): FmMap {
		const map: FmMap = {};
		while (this.pos < this.lines.length) {
			const line = this.lines[this.pos];
			if (line.indent < indent) break;
			if (line.indent > indent) throw new FrontmatterError(`unexpected indentation: "${line.raw.trim()}"`);
			if (line.text.startsWith("#")) {
				this.pos++;
				continue;
			}
			if (line.text.startsWith("- ") || line.text === "-") break;
			const { key, rest } = splitKey(line.text);
			this.pos++;
			map[key] = this.parseValueAfterKey(rest, indent, line);
		}
		return map;
	}

	private parseValueAfterKey(rest: string, indent: number, keyLine: Line): FmValue {
		if (rest === "|" || rest === "|-") return this.parseBlockScalar(indent, rest === "|-", keyLine);
		if (rest !== "") return parseScalarOrInlineArray(rest);
		// Empty value: nested map, block list, or null.
		const next = this.lines[this.pos];
		if (!next || next.indent <= indent) return null;
		if (next.text.startsWith("- ") || next.text === "-") return this.parseList(next.indent);
		return this.parseMap(next.indent);
	}

	private parseList(indent: number): FmValue[] {
		const list: FmValue[] = [];
		while (this.pos < this.lines.length) {
			const line = this.lines[this.pos];
			if (line.indent !== indent || (!line.text.startsWith("- ") && line.text !== "-")) break;
			const inline = line.text === "-" ? "" : line.text.slice(2).trim();
			this.pos++;
			if (inline === "") {
				const next = this.lines[this.pos];
				if (!next || next.indent <= indent) {
					list.push(null);
					continue;
				}
				list.push(this.parseMap(next.indent));
			} else if (inline.includes(": ") || inline.endsWith(":")) {
				// Map item with the first key inline: "- name: goal".
				// Continuation keys sit at the column of the inline key.
				const itemIndent = indent + 2;
				const { key, rest } = splitKey(inline);
				const first = this.parseValueAfterKey(rest, itemIndent, line);
				const restMap = this.parseMap(itemIndent);
				list.push({ [key]: first, ...restMap });
			} else {
				list.push(parseScalarOrInlineArray(inline));
			}
		}
		return list;
	}

	private parseBlockScalar(indent: number, strip: boolean, keyLine: Line): string {
		// Consume from the raw line following the key line, preserving blank lines.
		const startRaw = keyLine.rawIndex + 1;
		let endRaw = startRaw;
		let blockIndent: number | undefined;
		const collected: string[] = [];
		for (let i = startRaw; i < this.rawLines.length; i++) {
			const raw = this.rawLines[i];
			if (/^\s*$/.test(raw)) {
				collected.push("");
				endRaw = i + 1;
				continue;
			}
			const lineIndent = (/^( *)/.exec(raw) as RegExpExecArray)[1].length;
			if (lineIndent <= indent) break;
			if (blockIndent === undefined) blockIndent = lineIndent;
			collected.push(raw.slice(Math.min(blockIndent, lineIndent)));
			endRaw = i + 1;
		}
		// Advance the structured-line cursor past everything we consumed.
		while (this.pos < this.lines.length && this.lines[this.pos].rawIndex < endRaw) this.pos++;
		while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();
		const text = collected.join("\n");
		return strip ? text : text === "" ? "" : `${text}\n`;
	}
}

function splitKey(text: string): { key: string; rest: string } {
	const match = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^:#]+?)\s*:(?:\s+(.*))?$/.exec(text);
	if (!match) throw new FrontmatterError(`expected "key: value", got "${text}"`);
	let key = match[1].trim();
	if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
		key = key.slice(1, -1);
	}
	return { key, rest: (match[2] ?? "").trim() };
}

function parseScalarOrInlineArray(text: string): FmValue {
	const stripped = stripComment(text);
	if (stripped.startsWith("[") && stripped.endsWith("]")) {
		const inner = stripped.slice(1, -1).trim();
		if (inner === "") return [];
		return splitInlineArray(inner).map((item) => parseScalar(item.trim()));
	}
	return parseScalar(stripped);
}

function splitInlineArray(inner: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: string | undefined;
	for (const ch of inner) {
		if (quote) {
			current += ch;
			if (ch === quote) quote = undefined;
		} else if (ch === '"' || ch === "'") {
			current += ch;
			quote = ch;
		} else if (ch === ",") {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	if (current.trim() !== "") parts.push(current);
	return parts;
}

function stripComment(text: string): string {
	let quote: string | undefined;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			if (ch === quote) quote = undefined;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === "#" && i > 0 && text[i - 1] === " ") {
			return text.slice(0, i).trim();
		}
	}
	return text.trim();
}

function parseScalar(text: string): FmScalar {
	if (text === "" || text === "~" || text === "null") return null;
	if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
		return text.slice(1, -1).replace(/\\(["\\nt])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
	}
	if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) return text.slice(1, -1);
	if (text === "true") return true;
	if (text === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
	return text;
}
