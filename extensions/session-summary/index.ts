/**
 * Session Summary Extension
 *
 * Source-controlled version of the session summary extension.
 *
 * The installed extension under ~/.pi/agent/extensions/session-summary is a
 * symlink to this directory so the behavior lives in git, not in a dotfile copy.
 */

import type { AssistantMessage, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { SYSTEM_PROMPT_INSTRUCTION } from "./prompt";
import { registerPiExtension } from "../_shared/registry";

const WIDGET_KEY = "session-summary";
const SUMMARY_COMMAND_PREVIEW_LINES = 30;
const SUMMARY_COMMAND_PREVIEW_CHARS = 200;

const SUMMARY_FIELDS = [
  { key: "this turn", label: "This turn" },
  { key: "session so far", label: "Session so far" },
  { key: "issues", label: "Issues" },
  { key: "next steps", label: "Next steps" },
] as const;

type SummaryFieldKey = (typeof SUMMARY_FIELDS)[number]["key"];

// ── Logging ──────────────────────────────────────────────────────────────
const LOG_DIR = join(homedir(), ".pi", "agent", "logs");
const LOG_FILE = join(LOG_DIR, "session-summary.log");

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function log(label: string, data: unknown): void {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  appendFileSync(LOG_FILE, `[${timestamp}] [${label}] ${payload}\n`);
}

// ── Prompt helpers ───────────────────────────────────────────────────────
const USER_PROMPT_REMINDER =
  "\n\n[REMINDER] Output a <summary>...</summary> block at the VERY END of your response. This is mandatory.";

// ── State ────────────────────────────────────────────────────────────────
interface SummaryState {
  lastSummary: string | null;
  lastTurnHadSummary: boolean;
  turnIndex: number;
  summaryCount: number;
  missingCount: number;
}

function extractAllText(message: AssistantMessage): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "thinking") {
      parts.push(block.thinking);
    }
  }
  return parts.join("");
}

type ParsedSummary = {
  sections: Record<SummaryFieldKey, string[]>;
  fallback: string[];
  foundFields: number;
};

function createEmptySections(): Record<SummaryFieldKey, string[]> {
  return {
    "this turn": [],
    "session so far": [],
    issues: [],
    "next steps": [],
  };
}

function parseSummary(summary: string): ParsedSummary {
  const sections = createEmptySections();
  const fallback: string[] = [];
  let currentField: SummaryFieldKey | null = null;
  let foundFields = 0;

  for (const rawLine of summary.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^([A-Za-z][A-Za-z ]*?):\s*(.*)$/);
    if (match) {
      const heading = match[1].trim().toLowerCase().replace(/[.\s]+$/g, "");
      const field = SUMMARY_FIELDS.find((item) => item.key === heading)?.key ?? null;
      if (field) {
        currentField = field;
        foundFields++;
        const rest = match[2].trim();
        if (rest) sections[field].push(rest);
        continue;
      }
    }

    if (currentField) {
      sections[currentField].push(line);
    } else {
      fallback.push(line);
    }
  }

  return { sections, fallback, foundFields };
}

function normalizeSectionText(lines: string[]): string {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function buildSummaryLines(summary: string, width: number, theme: { fg: (color: string, text: string) => string; bold: (text: string) => string }, title: string, isWarning: boolean): string[] {
  const lines: string[] = [];
  const accentColor = isWarning ? "warning" : "accent";

  lines.push(theme.fg(accentColor, theme.bold(title)));
  lines.push("");

  const parsed = parseSummary(summary);
  if (parsed.foundFields > 0) {
    for (const field of SUMMARY_FIELDS) {
      const body = normalizeSectionText(parsed.sections[field.key]);
      if (!body) continue;

      const rawLine = `${theme.fg(accentColor, theme.bold(`${field.label}:`))} ${body}`;
      const wrapped = wrapTextWithAnsi(rawLine, width);
      lines.push(...wrapped);
      lines.push("");
    }
  } else {
    const body = parsed.fallback.length > 0 ? parsed.fallback.join(" ") : summary;
    lines.push(...wrapTextWithAnsi(body, width));
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.map((line) => truncateToWidth(line, width));
}

function createSummaryWidget(
  title: string,
  summary: string,
  isWarning: boolean,
  theme: { fg: (color: string, text: string) => string; bold: (text: string) => string },
) {
  let cachedWidth = -1;
  let cachedLines: string[] = [];

  return {
    render(width: number): string[] {
      if (cachedWidth === width) return cachedLines;
      cachedWidth = width;
      cachedLines = buildSummaryLines(summary, width, theme, title, isWarning);
      return cachedLines;
    },
    invalidate(): void {
      cachedWidth = -1;
      cachedLines = [];
    },
  };
}

// ── Main extension ───────────────────────────────────────────────────────
export default function (pi: ExtensionAPI) {
  registerPiExtension({
    id: "session-summary",
    name: "Session Summary",
    description: "Requires compact <summary> blocks, displays the latest summary widget, and exposes summary diagnostics.",
    commands: ["summary", "summary-toggle", "summary-logs", "summary-debug"],
    tags: ["summary", "prompt", "widget"],
    docs: [
      { id: "overview", title: "Session Summary overview", path: "extensions/session-summary/README.md" },
    ],
  });
  const state: SummaryState = {
    lastSummary: null,
    lastTurnHadSummary: false,
    turnIndex: 0,
    summaryCount: 0,
    missingCount: 0,
  };

  let remindersEnabled = true;

  log("INIT", "Session Summary extension loaded");

  pi.on("session_start", async () => {
    state.lastSummary = null;
    state.lastTurnHadSummary = false;
    state.turnIndex = 0;
    state.summaryCount = 0;
    state.missingCount = 0;
    log("SESSION", "State reset");
  });

  pi.on("before_agent_start", async (event) => {
    log("BEFORE_AGENT", "Appending system prompt instruction");
    return {
      systemPrompt: `${event.systemPrompt}\n\n${SYSTEM_PROMPT_INSTRUCTION}`,
    };
  });

  pi.on("input", async (event) => {
    if (event.source !== "user") {
      log("INPUT", `Skipped: source=${event.source}`);
      return;
    }
    if (!remindersEnabled) return;
    if (event.prompt.includes(USER_PROMPT_REMINDER.trim())) return;

    log("INPUT", "Appending reminder to user prompt");
    return { prompt: event.prompt + USER_PROMPT_REMINDER };
  });

  pi.on("turn_end", async (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;

    state.turnIndex = event.turnIndex;

    const fullText = extractAllText(message);
    log("TURN_END", { turnIndex: event.turnIndex, textLength: fullText.length });
    log("TURN_END_BLOCKS", message.content.map((b) => b.type));
    log("TURN_END_TAIL", fullText.slice(-500));

    const allMatches = [...fullText.matchAll(/<summary>([\s\S]*?)<\/summary>/gi)];
    log("TURN_END_MATCHES", { count: allMatches.length });

    const lastMatch = allMatches.length > 0 ? allMatches[allMatches.length - 1] : null;

    if (lastMatch && lastMatch[1].trim()) {
      const summary = lastMatch[1].trim();
      state.lastSummary = summary;
      state.lastTurnHadSummary = true;
      state.summaryCount++;

      log("TURN_END_FOUND", { summaryLength: summary.length, summary: summary.slice(0, 200), summaryCount: state.summaryCount, missingCount: state.missingCount });

      const title = `📋 Turn ${event.turnIndex + 1} Summary`;

      ctx.ui.setWidget(
        WIDGET_KEY,
        (_tui, theme) =>
          createSummaryWidget(
            title,
            summary,
            false,
            theme,
          ),
        { placement: "aboveEditor" },
      );
    } else {
      state.lastSummary = null;
      state.lastTurnHadSummary = false;
      state.missingCount++;

      log("TURN_END_MISSING", { missingCount: state.missingCount, summaryCount: state.summaryCount, message: "No <summary>...</summary> found" });

      const title = `⚠️ Turn ${event.turnIndex + 1}: No Summary`;
      const body = "The model did not produce a <summary>...</summary> block.";

      ctx.ui.setWidget(
        WIDGET_KEY,
        (_tui, theme) =>
          createSummaryWidget(
            title,
            body,
            true,
            theme,
          ),
        { placement: "aboveEditor" },
      );
    }
  });

  pi.on("turn_start", async (_event, ctx) => {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    log("TURN_START", "Widget cleared for new turn");
  });

  pi.registerCommand("summary", {
    description: "Show the last detected summary",
    handler: async (_args, ctx) => {
      if (state.lastSummary) {
        ctx.ui.notify(
          `Last summary (Turn ${state.turnIndex + 1}):\n${state.lastSummary.slice(0, SUMMARY_COMMAND_PREVIEW_CHARS)}${state.lastSummary.length > SUMMARY_COMMAND_PREVIEW_CHARS ? "..." : ""}`,
          "info",
        );
      } else if (state.turnIndex === 0) {
        ctx.ui.notify("No turns have completed yet.", "warning");
      } else {
        ctx.ui.notify(`No summary was detected in the last turn (Turn ${state.turnIndex + 1}).`, "warning");
      }
    },
  });

  pi.registerCommand("summary-toggle", {
    description: "Toggle summary reminders on/off",
    handler: async (_args, ctx) => {
      remindersEnabled = !remindersEnabled;
      ctx.ui.notify(`Summary reminders ${remindersEnabled ? "enabled" : "disabled"}.`, "info");
    },
  });

  pi.registerCommand("summary-logs", {
    description: "Tail the extension log file",
    handler: async (_args, ctx) => {
      try {
        const all = readFileSync(LOG_FILE, "utf-8").split("\n").filter(Boolean);
        const lastLines = all.slice(-SUMMARY_COMMAND_PREVIEW_LINES);
        ctx.ui.notify(lastLines.join("\n"), "info");
      } catch {
        ctx.ui.notify("No log file found.", "warning");
      }
    },
  });

  pi.registerCommand("summary-debug", {
    description: "Dump last 20 log entries to widget",
    handler: async (_args, ctx) => {
      try {
        const lines = readFileSync(LOG_FILE, "utf-8").split("\n").filter(Boolean).slice(-20);
        const preview = lines.join("\n");
        ctx.ui.setWidget(
          WIDGET_KEY,
          (_tui, theme) =>
            createSummaryWidget(
              "📋 Debug Log",
              preview,
              false,
              theme,
            ),
          { placement: "aboveEditor" },
        );
      } catch {
        ctx.ui.notify("No log file found.", "warning");
      }
    },
  });
}
