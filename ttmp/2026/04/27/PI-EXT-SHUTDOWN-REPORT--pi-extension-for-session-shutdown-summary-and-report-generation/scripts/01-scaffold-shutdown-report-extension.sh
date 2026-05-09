#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd)"
ext_dir="$repo_root/extensions/shutdown-report"
mkdir -p "$ext_dir"

cat > "$ext_dir/index.ts" <<'TS'
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CUSTOM_TYPE = "shutdown-report-state";
const STATUS_KEY = "shutdown-report";

type Mode = "ask" | "auto-summary" | "auto-report" | "off";

interface ShutdownReportState {
  mode: Mode;
  reportGenerated: boolean;
  generatedAt?: string;
  reportPath?: string;
  skippedAt?: string;
  shutdownWithoutReportAt?: string;
}

function defaultState(): ShutdownReportState {
  return { mode: "ask", reportGenerated: false };
}

function restore(ctx: ExtensionContext, state: ShutdownReportState): void {
  Object.assign(state, defaultState());
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) {
      Object.assign(state, entry.data ?? {});
    }
  }
}

function setStatus(ctx: ExtensionContext, state: ShutdownReportState): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(STATUS_KEY, `report:${state.reportGenerated ? "done" : state.mode}`);
}

function textFromMessageEntry(entry: any): string {
  const msg = entry.message;
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  }
  return "";
}

async function writeBasicReport(ctx: ExtensionContext, state: ShutdownReportState, pi: ExtensionAPI): Promise<void> {
  const now = new Date().toISOString();
  const dir = join(ctx.cwd, ".pi", "shutdown-reports");
  await mkdir(dir, { recursive: true });
  const safeName = (pi.getSessionName() ?? "pi-session").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "pi-session";
  const path = join(dir, `${now.replace(/[:.]/g, "-")}-${safeName}-report.md`);
  const entries = ctx.sessionManager.getEntries();
  const recent = entries.filter((e) => e.type === "message").slice(-20).map(textFromMessageEntry).filter(Boolean);
  const body = `---\ntitle: ${pi.getSessionName() ?? "Pi session shutdown report"}\ngenerated_at: ${now}\nsession_file: ${ctx.sessionManager.getSessionFile() ?? ""}\ncwd: ${ctx.cwd}\ngenerated_by: shutdown-report\n---\n\n# Session shutdown report\n\n## Session\n\n- Name: ${pi.getSessionName() ?? "(none)"}\n- CWD: ${ctx.cwd}\n- Session file: ${ctx.sessionManager.getSessionFile() ?? "(ephemeral)"}\n\n## Recent context\n\n${recent.map((t) => `- ${t.split("\n")[0]?.slice(0, 240)}`).join("\n")}\n\n## Next steps\n\n- Review the recent context and continue from the latest session state.\n`;
  await writeFile(path, body, "utf8");
  Object.assign(state, { reportGenerated: true, generatedAt: now, reportPath: path });
  pi.appendEntry(CUSTOM_TYPE, { ...state });
}

export default function shutdownReportExtension(pi: ExtensionAPI): void {
  const state = defaultState();

  pi.on("session_start", async (_event, ctx) => {
    restore(ctx, state);
    setStatus(ctx, state);
  });

  pi.registerCommand("shutdown-report", {
    description: "Show/configure shutdown report state (args: ask auto-summary auto-report off)",
    handler: async (args, ctx) => {
      const mode = args.trim() as Mode;
      if (["ask", "auto-summary", "auto-report", "off"].includes(mode)) state.mode = mode;
      pi.appendEntry(CUSTOM_TYPE, { ...state });
      setStatus(ctx, state);
      ctx.ui.notify(JSON.stringify(state, null, 2), "info");
    },
  });

  pi.registerCommand("shutdown-report-now", {
    description: "Generate a basic shutdown report now",
    handler: async (_args, ctx) => {
      await writeBasicReport(ctx, state, pi);
      setStatus(ctx, state);
      ctx.ui.notify(`Wrote shutdown report: ${state.reportPath}`, "info");
    },
  });

  pi.registerCommand("finish-session", {
    description: "Generate a shutdown report if needed, then exit Pi",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      if (!state.reportGenerated) await writeBasicReport(ctx, state, pi);
      ctx.shutdown();
    },
  });

  pi.on("session_before_switch", async (_event, ctx) => {
    if (state.mode === "off" || state.reportGenerated || !ctx.hasUI) return;
    const choice = await ctx.ui.select("No shutdown report exists", ["Generate basic report", "Skip once", "Cancel switch"]);
    if (choice === "Cancel switch") return { cancel: true };
    if (choice === "Skip once") {
      state.skippedAt = new Date().toISOString();
      pi.appendEntry(CUSTOM_TYPE, { ...state });
      return;
    }
    if (choice === "Generate basic report") await writeBasicReport(ctx, state, pi);
  });

  pi.on("session_shutdown", async (event, ctx) => {
    if (event.reason === "reload" || state.mode === "off" || state.reportGenerated) return;
    if (state.mode === "auto-summary" || state.mode === "auto-report") {
      await writeBasicReport(ctx, state, pi);
      return;
    }
    state.shutdownWithoutReportAt = new Date().toISOString();
    pi.appendEntry(CUSTOM_TYPE, { ...state, shutdownReason: event.reason });
  });
}
TS

echo "Wrote scaffold extension to $ext_dir/index.ts"
