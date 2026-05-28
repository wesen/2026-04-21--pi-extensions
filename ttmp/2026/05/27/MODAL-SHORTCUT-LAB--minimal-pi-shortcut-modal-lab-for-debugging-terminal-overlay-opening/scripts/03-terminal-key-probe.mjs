#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PI_TUI_DIST =
	"/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-tui/dist";
const PI_TUI_DIST = process.env.PI_TUI_DIST ?? DEFAULT_PI_TUI_DIST;
const DEFAULT_CANDIDATES = [
	"ctrl+shift+alt+n",
	"ctrl+space",
	"ctrl+shift+p",
	"ctrl+shift+o",
	"ctrl+shift+m",
	"ctrl+shift+alt+m",
];

const keysModule = await import(pathToFileURL(path.join(PI_TUI_DIST, "keys.js")).href);
const stdinBufferModule = await import(pathToFileURL(path.join(PI_TUI_DIST, "stdin-buffer.js")).href);
const { matchesKey, parseKey, isKeyRelease, isKeyRepeat, setKittyProtocolActive } = keysModule;
const { StdinBuffer } = stdinBufferModule;

const args = process.argv.slice(2);
const candidates = parseCandidates(process.env.SHORTCUT_CANDIDATES ?? "");
const startedAt = Date.now();

if (args[0] === "--decode") {
	const inputs = args.slice(1);
	if (inputs.length === 0) {
		console.log("Usage: 03-terminal-key-probe.mjs --decode $'\\e[110:78;8u' $'\\e[32;5u'");
		process.exit(0);
	}
	for (const input of inputs) {
		console.log(formatEvent(input, candidates));
	}
	process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
	console.log(`Terminal key probe for Pi/Kitty shortcut debugging.

Usage:
  scripts/03-terminal-key-probe.mjs
  SHORTCUT_CANDIDATES=ctrl+space,ctrl+shift+alt+n scripts/03-terminal-key-probe.mjs
  scripts/03-terminal-key-probe.mjs --decode $'\\e[110:78;8u' $'\\e[32;5u'

What it does:
  - puts stdin in raw mode
  - asks for Kitty keyboard protocol and falls back to xterm modifyOtherKeys
  - splits stdin using Pi TUI's StdinBuffer
  - prints parseKey(), release/repeat flags, raw codepoints, and candidate matches

Press Ctrl+C to exit.

Default candidates:
  ${candidates.join(", ")}
`);
	process.exit(0);
}

const stdin = process.stdin;
const stdout = process.stdout;
const wasRaw = Boolean(stdin.isRaw);
let exiting = false;
let kittyProtocolActive = false;
let modifyOtherKeysActive = false;

function cleanup(exitCode = 0) {
	if (exiting) return;
	exiting = true;
	try {
		if (kittyProtocolActive) stdout.write("\x1b[<u");
		if (modifyOtherKeysActive) stdout.write("\x1b[>4;0m");
		stdout.write("\x1b[?2004l");
	} catch {
		// ignore cleanup write errors
	}
	try {
		if (stdin.setRawMode) stdin.setRawMode(wasRaw);
		stdin.pause();
	} catch {
		// ignore cleanup raw-mode errors
	}
	process.exit(exitCode);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
process.on("uncaughtException", (error) => {
	console.error(error);
	cleanup(1);
});

console.log("Terminal key probe running. Press candidate shortcuts, then Ctrl+C to exit.");
console.log(`Candidates: ${candidates.join(", ")}`);
console.log("Note: Kitty defaults consume Ctrl+Shift+P as a key-chord prefix and Ctrl+Shift+O as pass_selection_to_program.");
console.log("");

if (stdin.setRawMode) stdin.setRawMode(true);
stdin.setEncoding("utf8");
stdin.resume();
stdout.write("\x1b[?2004h");

const buffer = new StdinBuffer({ timeout: 10 });
const kittyResponsePattern = /^\x1b\[\?(\d+)u$/;

buffer.on("data", (sequence) => {
	const kittyResponse = sequence.match(kittyResponsePattern);
	if (!kittyProtocolActive && kittyResponse) {
		kittyProtocolActive = true;
		setKittyProtocolActive(true);
		stdout.write("\x1b[>7u");
		console.log(`[${elapsed()}] kitty protocol response flags=${kittyResponse[1]} -> enabled flags 1+2+4`);
		return;
	}

	console.log(formatEvent(sequence, candidates));
	if (parseKey(sequence) === "ctrl+c") cleanup(0);
});

buffer.on("paste", (content) => {
	console.log(`[${elapsed()}] paste len=${content.length} json=${JSON.stringify(content)}`);
});

stdin.on("data", (chunk) => buffer.process(chunk));

stdout.write("\x1b[?u");
setTimeout(() => {
	if (!kittyProtocolActive && !modifyOtherKeysActive) {
		stdout.write("\x1b[>4;2m");
		modifyOtherKeysActive = true;
		console.log(`[${elapsed()}] no kitty response yet -> enabled xterm modifyOtherKeys mode 2`);
	}
}, 150);

function parseCandidates(value) {
	const parsed = value
		.split(/[\s,]+/)
		.map((candidate) => candidate.trim().toLowerCase())
		.filter(Boolean);
	return parsed.length > 0 ? parsed : DEFAULT_CANDIDATES;
}

function formatEvent(sequence, candidateKeys) {
	const parsed = parseKey(sequence);
	const matches = candidateKeys.filter((candidate) => matchesKey(sequence, candidate));
	return [
		`[${elapsed()}]`,
		`raw=${JSON.stringify(sequence)}`,
		`parse=${parsed ?? "?"}`,
		`release=${isKeyRelease(sequence)}`,
		`repeat=${isKeyRepeat(sequence)}`,
		`matches=${matches.length > 0 ? matches.join(",") : "-"}`,
		`chars=${chars(sequence).join(" ")}`,
	].join(" ");
}

function elapsed() {
	return `${((Date.now() - startedAt) / 1000).toFixed(3)}s`;
}

function chars(sequence) {
	return [...sequence].map((char) => {
		const code = char.codePointAt(0) ?? 0;
		return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
	});
}
