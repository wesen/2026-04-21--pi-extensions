---
Title: BusyBar Turn-Alert Extension — Design and Implementation Guide
Ticket: PI-EXT-BUSYBAR-ALERT
Status: active
Topics:
    - pi-extension
    - busybar
    - hardware
    - tooling
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/.pi/settings.json:Extension loading list — new extensions must be added here
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts:Shared extension registry contract (registerPiExtension) every extension must use
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/kagi-web-search/index.ts:Reference extension showing pi.exec usage for shelling out to a CLI
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/session-context/index.ts:Reference extension showing turn_end / session event subscriptions
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/08/03/PI-EXT-BUSYBAR-ALERT--pi-extension-turn-end-alert-to-busy-bar-dock/scripts/04-prototype-alert.sh:Shell prototype of the exact alert cycle the extension performs
    - Path: repo://.pi/settings.json
      Note: Extension loading list, must add busybar-alert entry
    - Path: repo://docs/pi-shared-extension-framework-guide.md
      Note: Framework guide cited throughout the design
    - Path: repo://extensions/_shared/registry.ts
      Note: registerPiExtension contract every extension must use
    - Path: repo://extensions/kagi-web-search/index.ts
      Note: Reference for pi.exec CLI shell-out pattern
    - Path: repo://extensions/session-context/index.ts
      Note: Reference for turn_end subscription, status widget, self-test pattern
    - Path: repo://ttmp/2026/08/03/PI-EXT-BUSYBAR-ALERT--pi-extension-turn-end-alert-to-busy-bar-dock/scripts/04-prototype-alert.sh
      Note: Shell prototype the extension ports to TypeScript
ExternalSources: []
Summary: Design and intern-ready implementation guide for a pi extension that fires a visual alert on a BUSY Bar LED dock every time an agent turn finishes.
LastUpdated: 2026-08-03T16:53:47.34873539-04:00
WhatFor: Design + implementation guide for the busybar-alert pi extension (turn_end -> busybar show/hold/clear).
WhenToUse: When implementing extensions/busybar-alert or debugging why turn-end alerts do not reach the BUSY Bar.
---


# BusyBar Turn-Alert Extension — Design and Implementation Guide

## 1. What we are building, in one paragraph

When you run the pi coding agent in a terminal, long agent turns mean you often
switch to another window while the model works. You then have to keep checking
the terminal to see whether pi is done. This project fixes that with a piece of
hardware: a **BUSY Bar** — a small USB/network LED dock with a 72×16 RGB front
display that sits on your desk. We will write a **pi extension** called
`busybar-alert` that listens for pi's `turn_end` lifecycle event and, every time
a turn finishes, plays a short looping animation on the BUSY Bar for a few
seconds and then clears it. The result: a physical "your agent is done" light.

This document explains every part of the system you need to understand to build
it: what pi extensions are and how they hook into the agent lifecycle, what the
BUSY Bar is and how its CLI works, how the two sides get glued together, the
exact design with pseudocode and diagrams, a file-by-file implementation plan,
and a validation runbook. It assumes you have never touched either codebase.

## 2. System overview

There are three independent pieces of software involved, plus one piece of
hardware:

```
┌─────────────────────────────────────────────────────────────────────┐
│  pi (terminal coding agent, Node.js, TypeScript)                    │
│  ─────────────────────────────────────────────                      │
│  Emits lifecycle events: turn_start, turn_end, agent_end, ...       │
│  Loads extensions from .pi/settings.json (TypeScript source)        │
│                                                                     │
│   ┌───────────────────────────────┐                                 │
│   │ extensions/busybar-alert/     │  ← THE THING WE ARE BUILDING    │
│   │  index.ts                     │                                 │
│   │   pi.on("turn_end", ...) ─────┼──► spawns child process         │
│   └───────────────────────────────┘                │                │
└────────────────────────────────────────────────────┼────────────────┘
                                                     ▼
                                        ┌────────────────────────┐
                                        │ busybar CLI (Go binary)│
                                        │  create / compile      │
                                        │  show / clear / smoke  │
                                        └──────────┬─────────────┘
                                                   │ HTTP + WebSocket
                                                   ▼
                                        ┌────────────────────────┐
                                        │ BUSY Bar hardware dock │
                                        │  front 72×16 RGB888    │
                                        │  back 160×80 gray4     │
                                        └────────────────────────┘
```

The responsibilities are deliberately separated:

- **pi** knows *when* a turn ends. It knows nothing about LEDs.
- **the extension** is a thin adapter: it translates "turn ended" into "run the
  alert command". It contains no device protocol code.
- **the busybar CLI** knows *how* to talk to the device (HTTP API, asset upload,
  priority arbitration). It knows nothing about pi.
- **the BUSY Bar** firmware owns the display. Multiple applications can own
  elements; a **priority** value from 1–100 arbitrates who is visible.

The only new code is the thin adapter in the middle. Everything else already
exists and is documented (see §9, References).

## 3. Understanding pi extensions

### 3.1 How pi loads extensions

pi discovers extensions through `.pi/settings.json`. In this repository the
file is `/home/manuel/code/wesen/2026-04-21--pi-extensions/.pi/settings.json`
and it is a plain JSON list of paths to TypeScript entry points:

```json
{
  "extensions": [
    "../extensions/launcher/index.ts",
    "../extensions/session-context/index.ts"
  ]
}
```

Extensions are loaded **as TypeScript source** — there is no build step. When
we create `extensions/busybar-alert/index.ts` we must also add
`"../extensions/busybar-alert/index.ts"` to this array or pi will never see it.
This is the single most common "my extension does nothing" mistake.

### 3.2 The extension entry point and the shared registry

Every extension in this repo is a module whose **default export is a function**
that receives the pi `ExtensionAPI` (conventionally named `pi`). The repo has a
hard convention (see `AGENTS.md`): every extension must call
`registerPiExtension()` from `extensions/_shared/registry.ts`. That registry is
what makes the extension visible in the `/px` launcher, the dashboard, the
command palette, and the docs viewer.

The minimal skeleton (from `docs/pi-shared-extension-framework-guide.md` §2):

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";

export default function myExtension(pi: ExtensionAPI): void {
  registerPiExtension({
    id: "my-extension",        // stable machine name — treat like a primary key
    name: "My Extension",
    description: "Demonstrates the shared extension framework.",
    commands: ["my-extension"],
    tags: ["demo"],
  });

  pi.registerCommand("my-extension", {
    description: "Show extension status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("My Extension is installed.", "info");
    },
  });
}
```

The registry registration fields that matter for us:

| Field | Purpose | We use it for |
| --- | --- | --- |
| `id` | Stable registry key | `"busybar-alert"` — never rename |
| `name` / `description` | Display text in `/px` | Human description of the alert |
| `commands` | Compatibility slash commands | `busybar-alert-toggle`, `busybar-alert-test` |
| `actions` | Named callbacks shown in launcher | "Test alert", "Toggle", "Open settings" |
| `settings` | Schema or custom settings view | Schema: enabled, addr, display, hold time… |
| `docs` | Help pages shown in doc viewer | This guide + a short README |

### 3.3 The pi lifecycle events we care about

pi emits events as the agent works. Verified against the installed package
(`@earendil-works/pi-coding-agent` **0.82.1**, `docs/extensions.md` — see
`sources/pi-events/event-presence.md` in this ticket for the verbatim check):

- `turn_start` — a turn begins. Payload: `event.turnIndex`, `event.timestamp`.
- `turn_end` — a turn ends. Payload: `event.turnIndex`, `event.message`,
  `event.toolResults`. **This is our trigger.**
- `agent_start` / `agent_end` — a whole low-level agent run begins/ends.
  `agent_end` is *not* the same as "pi is now idle": pi may auto-retry,
  auto-compact and retry, or consume queued follow-ups after `agent_end`.
- `agent_settled` — pi will not continue automatically; `ctx.isIdle()` is true.
- `session_start`, `session_shutdown`, `session_compact`, `session_tree` —
  session lifecycle; we use shutdown to clean up.

A "turn" is one LLM response plus the tool calls it triggered. A single user
prompt typically produces **many** turns (think → call tool → think → call tool
→ final answer). That has a direct design consequence: alerting on *every*
`turn_end` means the bar blinks many times per prompt. The user asked for "an
alert when a turn finishes", so per-turn alerting is the specified behavior —
but the design (§5.4) includes a `minIntervalMs` debounce and an optional
`alertOn: "agent_settled"` mode so the alert can be re-tuned to "only when pi
is fully idle" without code changes.

A real subscription, taken from the existing `session-context` extension
(`extensions/session-context/index.ts`), looks like:

```ts
pi.on("turn_end", async (_event, ctx) => {
  // react to the finished turn
});
```

### 3.4 How extensions run external commands

The `ExtensionAPI` exposes `pi.exec(command, args, options)` — a promise-based
child-process runner returning `{ code, stdout, stderr }`. The existing
`kagi-web-search` extension is the reference pattern
(`extensions/kagi-web-search/index.ts`):

```ts
const result = await pi.exec("surf", args, {
  signal,
  timeout: timeoutMs + 5_000,
});
if (result.code !== 0) { /* surface stderr */ }
```

We use `pi.exec` (not raw `child_process.spawn`) because it integrates with
pi's cancellation signals and keeps a uniform error surface. Note that
`image-qa` uses `spawn` directly — that is the older pattern; new code should
prefer `pi.exec`.

## 4. Understanding the BUSY Bar and the busybar CLI

### 4.1 The hardware

The BUSY Bar is a desktop LED dock (from the `2026-08-02--busy-bar-pi`
project). Facts that matter for this design:

- It has **two displays**: a **front** 72×16 full-color (RGB888) panel and a
  **back** 160×80 4-level grayscale (gray4) panel. An animation compiled for
  one display **cannot** be drawn on the other — dimensions must match.
- It exposes an **HTTP API** and a **WebSocket input stream** on the network.
  Default address the CLI assumes is `10.0.4.20`; yours may differ
  (`BUSYBAR_ADDR`). If the device has an access key set, every request needs
  the token (`BUSYBAR_TOKEN`, sent as `X-API-Token`).
- The firmware is **multi-application**: each client draws under an
  *application name*, and each draw carries a *priority* from 1–100. A draw at
  priority N is rejected with **HTTP 409** if another active application holds
  a higher priority. `clear` removes only the elements owned by one
  application name — it does not touch the clock or other apps.

### 4.2 The busybar CLI

`busybar` (Go binary, already installed on this machine) is the official way to
drive the device from scripts. `busybar help --all` lists the embedded Glazed
guides; the full command surface (captured verbatim into this ticket's
`sources/busybar-help/` by `scripts/01-capture-busybar-help.sh`):

| Command | What it does | We use it for |
| --- | --- | --- |
| `create` | Build a source animation zip from a built-in pattern or numbered PNG frames; optionally compile in one step (`--compile-output`) | One-time asset build |
| `compile` | Compile an existing source zip into firmware `.anim` format | (folded into `create`) |
| `inspect` | Validate + summarize a zip or `.anim` (dimensions, fps, color mode, bytes); `--format json` for automation | Pre-flight validation |
| `show` | Upload a compiled `.anim` under `--application-name` and send a draw request (`--display`, `--priority`, `--loop`) | **The alert itself** |
| `clear` | Remove display elements owned by one `--application-name` | Ending the alert |
| `smoke` | Visible hardware tour: text, image, rectangle, countdown, animation | Manual hardware validation |
| `stream` | Print device input events (buttons/encoder) as JSONL | Not needed for alerts |
| `script` | Host a CommonJS JavaScript app with `require("busybar")` | Not needed (see §7.2) |

Key flags for `show`:

```
busybar show \
  --input alert_front.anim \
  --addr "$BUSYBAR_ADDR" \
  --token "$BUSYBAR_TOKEN" \
  --application-name pi-turn-alert \
  --display front \
  --priority 60 \
  --loop
```

Important semantics from the CLI guide (`sources/busybar-help/busybar-help-animation-cli.md`):

- Upload and draw are **sequential, not atomic** — an upload can succeed and
  the draw can still be rejected (409). The extension must treat a non-zero
  exit as "alert failed" and log, not crash.
- `--priority` is display arbitration, 1–100. We default to **60**: above idle
  ambient apps, below a deliberate priority-100 takeover app.
- The CLI does **not** implicitly read `BUSYBAR_ADDR`/`BUSYBAR_TOKEN` for every
  command; the extension must pass `--addr`/`--token` explicitly from its
  settings (falling back to the environment).

### 4.3 Asset pipeline

The alert animation is built **once**, not on every turn:

```
busybar create --pattern spinner --display front --frames 12 --fps 12 \
  --output alert_front.zip --compile-output alert_front.anim
```

This produces a 3990-byte `.anim` (12 frames, 12 fps, 72×16, rgb888) — verified
by `scripts/04-prototype-alert.sh --prepare-only`, output captured in
`sources/alert-assets/`. At runtime the extension only runs `show` and `clear`;
asset building happens at setup time (or lazily on first alert if the file is
missing, then cached).

## 5. Design

### 5.1 Design goals and non-goals

Goals:

- Alert on the BUSY Bar within ~1 second of a turn ending.
- Zero device-protocol code in the extension — everything goes through the
  `busybar` CLI so device behavior improvements come for free.
- Never block, slow down, or crash the agent loop because of hardware.
- Fully configurable without editing code (settings UI + env fallbacks).
- Degrade gracefully when the bar is unplugged/unreachable: log once, stay
  quiet, keep pi fast.

Non-goals (explicitly out of scope for v1):

- Interactive input handling (buttons/encoder via `busybar stream` or
  `busybar script --keep-alive`). Possible v2: "press the bar's button to focus
  the pi window".
- Rendering turn metadata (model name, cost, duration) as scrolling text.
- Back-display dashboards. Front display only in v1.

### 5.2 Alert cycle

One alert cycle is exactly what `scripts/04-prototype-alert.sh` does:

```
 turn_end fires
      │
      ▼
 enabled? ──no──► return immediately
      │ yes
      ▼
 debounce: now - lastAlertAt >= minIntervalMs? ──no──► skip (count it)
      │ yes
      ▼
 asset exists? ──no──► busybar create (+compile), cache path
      │ yes
      ▼
 busybar show --input <anim> --application-name pi-turn-alert
             --display front --priority 60 --loop --addr ... [--token ...]
      │
      ▼ (fire-and-forget; do NOT await in the event handler)
 schedule clear after holdSeconds (default 3s)
      │
      ▼
 busybar clear --application-name pi-turn-alert --addr ...
```

Two implementation notes:

1. **Never await the network in the event handler.** `turn_end` handlers run
   inside pi's agent loop. The handler kicks off the cycle and returns; a
   `setTimeout` owns the clear. If `show` hangs, a timeout kills the child
   process — pi is unaffected.
2. **Serialize cycles.** If turns end faster than the debounce allows (they
   will), we skip. We also guard with an `inFlight` flag so two `show`
   processes never overlap; a second turn_end while one cycle is running
   extends nothing and is counted as skipped.

### 5.3 Pseudocode for the extension core

```ts
// state
let settings = loadSettings();            // from shared settings schema
let lastAlertAt = 0;
let inFlight = false;
let skippedCount = 0;

pi.on("turn_end", (event, ctx) => {
  if (!settings.enabled) return;
  if (settings.alertOn === "agent_settled") return;   // handled by other hook
  void runAlertCycle(ctx, `turn ${event.turnIndex}`);
});

pi.on("agent_settled", (_event, ctx) => {
  if (!settings.enabled || settings.alertOn !== "agent_settled") return;
  void runAlertCycle(ctx, "agent settled");
});

pi.on("session_shutdown", (_event, ctx) => {
  if (settings.clearOnShutdown) void clearDisplay();  // best effort
});

async function runAlertCycle(ctx, reason) {
  const now = Date.now();
  if (inFlight) { skippedCount++; return; }
  if (now - lastAlertAt < settings.minIntervalMs) { skippedCount++; return; }
  inFlight = true; lastAlertAt = now;
  setStatus(ctx, `alerting (${reason})`);
  try {
    const anim = await ensureAsset();     // create+compile once, then cache
    await execOrLog("busybar", showArgs(anim), { timeout: 10_000 });
    setTimeout(() => {                    // clear is fire-and-forget
      void execOrLog("busybar", clearArgs(), { timeout: 5_000 })
        .finally(() => { inFlight = false; setStatus(ctx, idleText()); });
    }, settings.holdSeconds * 1000);
  } catch (err) {
    inFlight = false;
    logOncePerSession(`busybar-alert: ${err}`);  // notify once, then stay quiet
    setStatus(ctx, "busybar: unreachable");
  }
}
```

`execOrLog` wraps `pi.exec`, checks `result.code !== 0`, and routes failures to
a `notify`-once + status-widget pattern so an unplugged bar produces exactly
one warning per session instead of one per turn.

### 5.4 Settings schema

Registered as a **schema settings contribution** (framework guide §6.1 — plain
fields, no custom TUI needed):

| Setting | Type | Default | Notes |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Master switch; also `/busybar-alert-toggle` |
| `alertOn` | select: `turn_end` / `agent_settled` | `turn_end` | Per spec: every turn. `agent_settled` = "only when fully idle" |
| `addr` | string | `env BUSYBAR_ADDR` or `10.0.4.20` | Device address |
| `token` | string (secret) | `env BUSYBAR_TOKEN` | Passed as `--token` when non-empty |
| `applicationName` | string | `pi-turn-alert` | Device-side ownership + clear scope |
| `display` | select: `front` / `back` | `front` | Must match the compiled asset |
| `priority` | number 1–100 | `60` | Above ambient, below takeover apps |
| `holdSeconds` | number 0–60 | `3` | Delay between `show` and `clear` |
| `minIntervalMs` | number | `2000` | Debounce across rapid turn_end bursts |
| `pattern` | select: `spinner` / custom frames dir | `spinner` | Asset source |
| `clearOnShutdown` | boolean | `false` | Tidy the bar when pi exits |

### 5.5 Actions, commands, and status

- **Actions** (visible in `/px` launcher):
  - `test-alert` *(default)* — run one alert cycle immediately, bypassing the
    debounce. This is the "is my bar wired up?" button.
  - `toggle` — flip `enabled`.
  - `show-stats` — notify with alerts fired / skipped / last error.
  - `prepare-assets` — force (re)build of the `.anim` (e.g. after changing
    `display` or `pattern`).
- **Slash commands**: `/busybar-alert-test`, `/busybar-alert-toggle` —
  registered via `pi.registerCommand` for muscle memory.
- **Status bar**: `ctx.ui.setStatus("busybar-alert", …)` shows
  `busybar:on`, `busybar:alerting`, `busybar:off`, or `busybar: unreachable`
  (same pattern as `session-context`).

### 5.6 File layout

```
extensions/busybar-alert/
  index.ts       # entry: registerPiExtension + event hooks + commands (~150 lines)
  alert.ts       # runAlertCycle, ensureAsset, execOrLog — pure logic, testable
  settings.ts    # schema definition + load/apply, env fallbacks
  README.md      # short user-facing doc (surfaced via docs[] in the registry)
```

Plus the one-line addition to `.pi/settings.json`. Asset files
(`alert_front.anim`) live in a per-user cache dir (e.g.
`~/.cache/pi-busybar-alert/`) — **not** in the repo, since they are derived
artifacts. The design-stage prototype assets live in this ticket under
`sources/alert-assets/` for reference.

### 5.7 Sequence diagram — one alert cycle

```
pi agent loop        busybar-alert ext        busybar CLI           BUSY Bar
     │                     │                      │                    │
     │── turn_end ────────►│                      │                    │
     │                     │─ ensureAsset() ─────►│ (cached after 1st) │
     │                     │─ show --loop ───────►│── HTTP upload+draw►│ LED on
     │◄─ handler returns ──│  (pi keeps working)  │                    │
     │                     │─ setTimeout(3s)      │                    │
     │                     │─ clear ─────────────►│── HTTP clear ─────►│ LED off
```

### 5.8 Error matrix

| Failure | Detection | Behavior |
| --- | --- | --- |
| `busybar` binary not on PATH | `pi.exec` throws / exit 127 | Notify once: "install busybar"; disable until toggled |
| Device unreachable | non-zero exit / timeout on `show` | Notify once per session; status `unreachable`; keep skipping cheaply |
| HTTP 403 (bad/missing token) | stderr contains `403` | Notify with hint to set `token` setting / `BUSYBAR_TOKEN` |
| HTTP 409 (priority conflict) | stderr contains `409` | Count as skipped; suggest raising `priority` in stats |
| Asset/display mismatch (e.g. front anim on back) | `inspect` at prepare time | Refuse to alert; point at `prepare-assets` action |
| Turns end faster than debounce | `now - lastAlertAt` check | Silently skip, count in stats |

## 6. Implementation plan (step by step)

1. **Scaffold** — create `extensions/busybar-alert/` with the four files above;
   add `"../extensions/busybar-alert/index.ts"` to `.pi/settings.json`.
2. **Port the prototype** — `alert.ts` is a line-by-line TypeScript port of
   `scripts/04-prototype-alert.sh` (`create` → `inspect` → `show` → sleep →
   `clear`), with `pi.exec` replacing bash and the settings object replacing
   env vars.
3. **Wire events** — `turn_end`, `agent_settled`, `session_shutdown` in
   `index.ts`; register actions, commands, settings, docs, and the status
   widget per §5.4–5.5.
4. **Validate without hardware** — run the prepare step
   (`busybar create … --compile-output …`) and `inspect --format json`; unit
   self-test command `/busybar-alert-self-test` that exercises argument
   construction and debounce logic with a stubbed exec (pattern: the
   `runSnapshotSelfTests` approach in `session-context`).
5. **Validate with hardware** — `scripts/03-probe-device.sh`, then
   `/busybar-alert-test`, then `busybar smoke` as an independent sanity check,
   then a real pi session.

## 7. Alternatives considered

### 7.1 Why not talk HTTP directly from the extension?

We could `fetch()` the device's HTTP API from TypeScript and skip the CLI. That
would save a process spawn (~50–100 ms) but would re-implement asset upload,
priority arbitration, and error mapping — all of which the CLI already gets
right and keeps improving. The spawn cost is irrelevant against a 3-second
hold. **Rejected: unnecessary protocol ownership.**

### 7.2 Why not `busybar script` (goja JavaScript host)?

`busybar script` hosts a long-lived CommonJS app with `require("busybar")` and
a WebSocket input stream — ideal for *interactive* applications (menus,
button-driven UIs). Our extension is the opposite: rare, one-shot,
device-as-output-only. Running a persistent JS host per pi session adds a
process lifecycle to manage for zero benefit. **Rejected for v1; revisit if we
add button input.**

### 7.3 Why not alert on `agent_end`?

`agent_end` fires when a low-level run ends, but pi may still auto-retry or
auto-compact — the terminal is *not* necessarily ready for you. `agent_settled`
is the correct "pi is idle" signal, and `turn_end` is the correct "a turn
finished" signal. The spec says turn finish, so `turn_end` is the default;
`agent_settled` is exposed as a setting for people who want fewer alerts.

## 8. Validation runbook

```bash
# 1. Asset pipeline (no hardware needed)
scripts/04-prototype-alert.sh --prepare-only

# 2. Hardware reachability (bounded, safe when unplugged)
BUSYBAR_ADDR=192.168.0.136 scripts/03-probe-device.sh

# 3. Full shell-level alert cycle (hardware needed)
BUSYBAR_ADDR=192.168.0.136 scripts/04-prototype-alert.sh

# 4. In pi: /px → BusyBar Alert → Test alert
# 5. In pi: send any prompt; bar should flash after each turn (debounced)
```

## 9. References

- **Framework guide**: `docs/pi-shared-extension-framework-guide.md`
  (registry contract §3, actions §4, settings §6, checklist §14).
- **pi extension API docs** (installed package 0.82.1):
  `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
  — lifecycle events (`turn_end` payload: `turnIndex`, `message`,
  `toolResults`); verbatim excerpts in this ticket's `sources/pi-events/`.
- **busybar CLI guides** (embedded Glazed help, captured 2026-08-03):
  this ticket's `sources/busybar-help/` — especially
  `busybar-help-animation-cli.md` (full CLI user guide incl. troubleshooting
  table) and `busybar-help-goja.md` (JS API, for future interactive work).
- **Reference extensions**: `extensions/session-context/index.ts` (event
  subscriptions, status widget, self-test pattern),
  `extensions/kagi-web-search/index.ts` (`pi.exec` pattern),
  `extensions/response-viewer/index.ts` (auto-open on `turn_end` gated by a
  setting).
- **busybar source project** (read-only for this ticket):
  `/home/manuel/code/wesen/2026-08-02--busy-bar-pi`.
- **Ticket scripts**: `scripts/01-capture-busybar-help.sh` (evidence capture),
  `scripts/02-verify-pi-events.sh` (event verification),
  `scripts/03-probe-device.sh` (bounded hardware probe),
  `scripts/04-prototype-alert.sh` (alert-cycle prototype to port).
