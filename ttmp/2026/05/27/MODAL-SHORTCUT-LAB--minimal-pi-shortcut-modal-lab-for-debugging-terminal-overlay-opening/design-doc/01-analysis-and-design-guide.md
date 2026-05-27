---
Title: Analysis and Design Guide
Ticket: MODAL-SHORTCUT-LAB
Status: active
Topics:
    - pi
    - extensions
    - tui
    - debugging
    - shortcuts
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/modal-shortcut-lab/index.ts
      Note: Minimal lab extension implementation described by the guide
    - Path: extensions/modal-shortcut-lab/README.md
      Note: Quick runbook for running the lab
    - Path: extensions/command-palette/index.ts
      Note: Production shortcut path that motivated the investigation
    - Path: extensions/_shared/ui/command-palette.ts
      Note: Production overlay component used for comparison
    - Path: docs/pi-tui-ui-authoring-guide.md
      Note: Local reference for custom TUI components
ExternalSources:
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md: Official Pi extension API documentation"
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md: Official Pi TUI and overlay documentation"
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/keybindings.md: Official Pi keybinding format and defaults"
Summary: Design and implementation guide for an isolated Pi extension that reproduces and explains shortcut-opened modal behavior.
LastUpdated: 2026-05-27T21:55:00-04:00
WhatFor: Use this when debugging why a Pi shortcut opens, delays, fails to render, or immediately closes a custom overlay modal.
WhenToUse: Before changing the production command palette shortcut path; use the lab to reproduce each smaller layer first.
---


# Analysis and Design Guide

## Executive Summary

The command palette shortcut bug became hard to reason about because several independent systems were interacting at once: terminal key encoding, Pi shortcut dispatch, raw terminal input interception, `ctx.ui.custom()` overlay lifecycle, focus assignment, render scheduling, and component-level input handling. The production command palette also depends on the shared extension registry and a hierarchical palette component, which makes the symptom feel like a command-palette bug even when the root cause is lower in the UI stack.

This ticket introduces a deliberately small **Modal Shortcut Lab** extension. The lab is not meant to be a user feature. It is a controlled test surface for opening the simplest possible custom component through increasingly complex entry paths. We start with a slash command and a notification, then a command-opened custom UI, then an overlay, then registered shortcuts, then raw terminal shortcuts, and finally scheduled raw shortcuts that mimic the production `Ctrl+Shift+P` flow.

The guiding principle is to isolate one variable per experiment. If `/modal-lab overlay` works but `Ctrl+Shift+P` does not, the component and overlay renderer are probably valid and the problem is in shortcut capture or scheduling. If raw shortcut logs show `custom.onHandle` but no `modal.render`, the problem is render flushing. If `modal.render.done` appears and the user still does not see the modal, the problem is likely terminal output, repaint timing, hidden overlays, or a later input event closing the modal.

## Problem Statement

The production command palette has been patched several times in response to terminal-specific behavior observed under kitty/tmux. The patches were reasonable, but the debugging loop became too coupled to the production feature. Each time we changed the palette, we had to reason about both the product behavior and the lower-level Pi/TUI behavior.

The concrete symptoms observed so far include:

- `Ctrl+Shift+P` is recognized by the terminal listener, but the modal does not visibly paint until another key is pressed.
- Fast follow-up input such as `r` can arrive before the overlay is ready, so it must be buffered or consumed.
- kitty CSI-u sequences such as `ESC[112:80;6u` and `ESC[27u` may represent modified key events or releases, not simple printable input.
- `matchesKey()` is useful inside a focused component, but it may be too broad when deciding whether pre-mount terminal input should be replayed.
- The production palette includes hierarchy, registry lookup, key assignment, action execution, and search state, which all add noise to a low-level rendering investigation.

We need a smaller extension that can answer basic questions independently:

1. Does Pi load the extension and run a command?
2. Does `ctx.ui.notify()` work?
3. Does `ctx.ui.custom()` work without overlay mode?
4. Does `ctx.ui.custom(..., { overlay: true })` render immediately when opened by command?
5. Does `pi.registerShortcut()` call a handler at the expected time?
6. Does a registered shortcut handler safely open an overlay directly?
7. Does scheduling the open with `setImmediate()` change behavior?
8. Does `ctx.ui.onTerminalInput()` receive the exact terminal sequence?
9. Does a raw listener consume `Ctrl+Shift+P` before the editor sees it?
10. Does `onHandle` run, focus the overlay, and trigger render?
11. Does the component render but later close immediately because a buffered/replayed event is interpreted as Escape?

## Proposed Solution

Create `extensions/modal-shortcut-lab/index.ts`, a standalone Pi extension that can be run by itself with `--no-extensions -e`. It should be small enough for a new intern to read in one sitting. It should not depend on the command-palette overlay component, palette registry traversal, or any production action execution path.

The lab exposes one component, `LabModal`, and several entry paths into that component.

```text
User action
  │
  ├─ /modal-lab notify ───────────────► ctx.ui.notify()
  │
  ├─ /modal-lab replace ──────────────► ctx.ui.custom(..., overlay: false)
  │
  ├─ /modal-lab overlay ──────────────► ctx.ui.custom(..., overlay: true)
  │
  ├─ /modal-lab scheduled ────────────► setImmediate() ─► ctx.ui.custom(...)
  │
  ├─ Ctrl+Shift+M ────────────────────► pi.registerShortcut() direct open
  │
  ├─ Ctrl+Shift+Alt+M ────────────────► pi.registerShortcut() scheduled open
  │
  ├─ Ctrl+Shift+O ────────────────────► raw terminal direct open
  │
  └─ Ctrl+Shift+P ────────────────────► raw terminal scheduled open
```

The lab writes JSON lines to `/tmp/pi-modal-shortcut-lab.log`. Each event records the timestamp, event name, and relevant state. The log is the primary artifact for post-mortem analysis.

```text
/tmp/pi-modal-shortcut-lab.log
  raw.input
  schedule.request
  schedule.fire
  open.start
  custom.factory
  modal.construct
  custom.onHandle
  custom.onHandle.afterFocus
  renderKick
  custom.requestRender
  modal.render
  modal.render.done
  modal.handleInput
  open.done
```

The extension also includes a small README and ticket scripts:

- `extensions/modal-shortcut-lab/README.md`
- `ttmp/.../scripts/01-run-isolated-modal-lab.sh`
- `ttmp/.../scripts/02-smoke-tmux-ctrl-shift-p.sh`

## System Model for Interns

### Extension loading

Pi extensions are TypeScript modules that export a default function. Pi calls that function with an `ExtensionAPI` object. The extension registers commands, shortcuts, tools, event listeners, and UI behavior from inside that function.

Minimal shape:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI): void {
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (_args, ctx) => {
      ctx.ui.notify("hello", "info");
    },
  });
}
```

The official loading options matter for this ticket:

| Launch mode | Meaning | Why it matters here |
| --- | --- | --- |
| `pi` | Normal interactive Pi with discovered extensions | Too noisy for first reproduction |
| `pi -e ./file.ts` | Add one explicit extension | Useful for quick extension development |
| `pi --no-extensions -e ./file.ts` | Disable discovered extensions, but still load the explicit extension | The preferred lab mode |
| `pi --no-session` | Do not persist session | Keeps tests disposable |

The lab should usually be launched as:

```bash
PI_MODAL_SHORTCUT_LAB_DEBUG=1 \
pi --no-extensions --no-session \
  -e /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/modal-shortcut-lab/index.ts
```

### Command dispatch

A Pi command is a slash command registered with `pi.registerCommand(name, { handler })`. Commands run in interactive Pi when the user submits text like `/modal-lab overlay`.

For this investigation, command dispatch is the lowest-risk UI entry point. If command-opened overlays fail, there is no reason to debug keyboard shortcut capture yet.

```text
User types /modal-lab overlay
  └─ Pi command router
       └─ handler(args, ctx)
            └─ openLabModal(ctx, "command-overlay", "overlay")
```

The lab command modes are:

| Command | Purpose | Expected result |
| --- | --- | --- |
| `/modal-lab notify` | Verify load and command dispatch | Notification appears |
| `/modal-lab replace` | Verify non-overlay custom UI | Full custom component replaces editor area |
| `/modal-lab overlay` | Verify overlay custom UI | Centered modal appears |
| `/modal-lab scheduled` | Verify scheduled command overlay | Modal appears after `setImmediate()` |
| `/modal-lab status` | Show build/log metadata | Notification with log path |

### Custom UI and overlay lifecycle

The core UI API under test is `ctx.ui.custom()`. It accepts a factory that returns a TUI component. The factory receives a `tui` object, a `theme`, keybindings, and a `done` callback. When the component calls `done(value)`, the custom UI closes and the promise resolves with `value`.

Pseudocode:

```ts
const result = await ctx.ui.custom<Result>(
  (tui, theme, keybindings, done) => {
    const component = new LabModal({ theme, done });
    return component;
  },
  {
    overlay: true,
    overlayOptions: { anchor: "center", width: 72 },
    onHandle: (handle) => {
      handle.focus();
      tui.requestRender(true);
    },
  },
);
```

Lifecycle diagram:

```text
openLabModal()
  │
  ├─ ctx.ui.custom(factory, options)
  │    │
  │    ├─ factory(tui, theme, keybindings, done)
  │    │    └─ new LabModal(...)
  │    │
  │    ├─ overlay handle is created
  │    │    └─ onHandle(handle)
  │    │         ├─ handle.focus()
  │    │         └─ tui.requestRender(true)
  │    │
  │    ├─ LabModal.render(width)
  │    │    └─ returns string[] terminal rows
  │    │
  │    ├─ LabModal.handleInput(data)
  │    │    ├─ Escape: done(cancel)
  │    │    ├─ Enter: done(ok)
  │    │    └─ other: update state + requestRender()
  │    │
  │    └─ promise resolves
  │
  └─ openLabModal logs result and notifies user
```

### TUI component contract

A Pi TUI component is a small object with a `render(width)` method and usually a `handleInput(data)` method.

API reference:

```ts
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

`render(width)` must return terminal rows whose visible width is no wider than `width`. If the strings contain ANSI color escapes, use helpers such as `visibleWidth()` and `truncateToWidth()` instead of `.length`.

The lab component intentionally renders only a frame and a few status lines:

```text
╭───────────────────────── Modal Shortcut Lab ─────────────────────────╮
│ build: modal-shortcut-lab-...                                        │
│ id: 1  mode: overlay                                                 │
│ source: raw-terminal-scheduled                                       │
│ renders: 1  inputs: 0                                                │
│ last input: none                                                     │
│                                                                      │
│ Enter = close OK    Esc = cancel                                     │
│ Type any key to force a component redraw.                            │
╰──────────────────────────────────────────────────────────────────────╯
```

The component has deliberately small state:

```ts
class LabModal implements Component {
  renderCount = 0;
  inputCount = 0;
  lastInput = "none";

  handleInput(data: string) {
    inputCount++;
    lastInput = JSON.stringify(data);
    if (matchesKey(data, Key.escape)) done(cancel);
    if (matchesKey(data, Key.enter)) done(ok);
    invalidate();
    requestRender();
  }

  render(width: number): string[] {
    renderCount++;
    return frameRows(...);
  }
}
```

### Registered shortcut dispatch

Pi has a high-level shortcut API:

```ts
pi.registerShortcut("ctrl+shift+m", {
  description: "Open lab modal",
  handler: async (ctx) => openLabModal(ctx, "registered-shortcut-direct", "overlay"),
});
```

This is the first shortcut layer to test because it avoids raw terminal protocol handling. If this path fails, the issue is probably not in our CSI-u parsing. It may be in Pi shortcut scope, editor focus, or opening overlays from a shortcut callback.

The lab has two registered shortcut paths:

| Shortcut | Source label | Purpose |
| --- | --- | --- |
| `Ctrl+Shift+M` | `registered-shortcut-direct` | Does direct overlay open work from `pi.registerShortcut()`? |
| `Ctrl+Shift+Alt+M` | `registered-shortcut-scheduled` | Does scheduling the open change mount/render behavior? |

### Raw terminal input dispatch

The production command palette moved beyond `pi.registerShortcut()` because the shortcut could race with editor input and focus transitions. Pi exposes a raw terminal input hook through `ctx.ui.onTerminalInput()` that receives the raw string for each terminal input event.

The lab registers the raw listener during `session_start` and unregisters it during `session_shutdown`.

Pseudocode:

```ts
pi.on("session_start", (_event, ctx) => {
  unsubscribe = ctx.ui.onTerminalInput((data) => {
    const matchesTarget = matchesKey(data, "ctrl+shift+p");
    log("raw.input", { data, matchesTarget });

    if (matchesTarget) {
      scheduleOpen(ctx, "raw-terminal-scheduled", "overlay");
      return { consume: true };
    }

    return undefined;
  });
});

pi.on("session_shutdown", () => {
  unsubscribe?.();
});
```

Important raw sequences observed under kitty/tmux include:

| User key | Observed string | JSON representation | Notes |
| --- | --- | --- | --- |
| `Ctrl+Shift+P` press | CSI-u | `"\u001b[112:80;6u"` | Seen in production logs |
| `Ctrl+Shift+P` alternate/release | CSI-u | `"\u001b[112;6:3u"` | Seen after press in production logs |
| encoded Escape | CSI-u | `"\u001b[27u"` | Can be classified as Escape by `matchesKey()` |
| Space release/alternate | CSI-u | `"\u001b[32;1:3u"` | Should not be replayed as normal input |

The lab does not yet implement production buffering. Its first job is to record raw terminal behavior and prove the basic raw-open path. Buffering should be added as a later controlled phase after the base raw listener is stable.

### Scheduling and render timing

Opening an overlay directly inside a raw input callback can couple UI construction to the current input dispatch stack. The production palette uses `setImmediate()` so that the raw listener can consume the shortcut and return before the overlay is created.

Pseudocode:

```ts
function scheduleOpen(ctx, source, mode) {
  if (openScheduled) return;
  openScheduled = true;
  setImmediate(() => {
    openScheduled = false;
    void openLabModal(ctx, source, mode);
  });
}
```

The lab logs both the scheduling and the actual opening:

```json
{"event":"schedule.request","source":"raw-terminal-scheduled"}
{"event":"schedule.fire","source":"raw-terminal-scheduled"}
{"event":"open.start","source":"raw-terminal-scheduled"}
```

After `onHandle`, the lab calls a short render burst:

```ts
requestRender(true);              // immediate
process.nextTick(() => ...);      // next microtask-ish phase
setTimeout(() => ..., 0);         // timer phase
setImmediate(() => ...);          // check phase
setTimeout(() => ..., 25);        // delayed confirmation
```

This is not the final desired production shape. It is a diagnostic tool. It tells us whether rendering happens at all and whether a delayed render produces a visible paint.

## Implementation Guide

### Files

| File | Role |
| --- | --- |
| `extensions/modal-shortcut-lab/index.ts` | Extension implementation, commands, shortcuts, raw listener, component, logging |
| `extensions/modal-shortcut-lab/README.md` | Quick user-facing runbook |
| `ttmp/.../scripts/01-run-isolated-modal-lab.sh` | Launch Pi with only the lab extension |
| `ttmp/.../scripts/02-smoke-tmux-ctrl-shift-p.sh` | Reproduce raw `Ctrl+Shift+P` in a disposable tmux session |
| `extensions/command-palette/index.ts` | Production code to compare after lab findings |
| `extensions/_shared/ui/command-palette.ts` | Production component to compare render/input behavior |

### Step 1: Verify extension load

Run:

```bash
timeout 25 pi --no-extensions \
  -e /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/modal-shortcut-lab/index.ts \
  --list-models
```

Expected result:

- Exit code `0`.
- No extension load stack trace.
- Models list prints.

### Step 2: Run isolated interactive Pi

Run:

```bash
ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/scripts/01-run-isolated-modal-lab.sh
```

Equivalent direct command:

```bash
PI_MODAL_SHORTCUT_LAB_DEBUG=1 \
pi --no-extensions --no-session \
  -e /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/modal-shortcut-lab/index.ts
```

The `--no-extensions` flag disables discovered global and project extensions. The explicit `-e` path still loads the lab. This gives a clean baseline without command-palette, launcher, dashboard, or duplicate shortcut handlers.

### Step 3: Verify commands

Inside Pi:

```text
/modal-lab-debug clear
/modal-lab-debug on
/modal-lab notify
/modal-lab replace
/modal-lab overlay
/modal-lab scheduled
```

Expected log shape for `/modal-lab overlay`:

```json
{"event":"command.modal-lab","mode":"overlay"}
{"event":"open.start","source":"command-overlay","mode":"overlay"}
{"event":"custom.factory"}
{"event":"modal.construct"}
{"event":"custom.onHandle"}
{"event":"custom.onHandle.afterFocus"}
{"event":"renderKick","phase":"immediate"}
{"event":"custom.requestRender","force":true}
{"event":"modal.render","cached":false}
{"event":"modal.render.done"}
```

If this fails, stop. The problem is below shortcut handling.

### Step 4: Verify registered shortcuts

Inside isolated Pi:

```text
Ctrl+Shift+M
Ctrl+Shift+Alt+M
```

Expected labels:

- `registered-shortcut-direct`
- `registered-shortcut-scheduled`

If command-opened overlay works but registered shortcut fails, inspect:

- whether the terminal sends a recognizable sequence for that shortcut,
- whether Pi's high-level shortcut scope is active while the editor is focused,
- whether another built-in or extension shortcut conflicts.

In isolated mode, there should be no extension conflict from the command palette.

### Step 5: Verify raw terminal shortcut

Inside isolated Pi:

```text
Ctrl+Shift+P
```

Expected label:

- `raw-terminal-scheduled`

Expected log shape:

```json
{"event":"raw.input","matchesTarget":true}
{"event":"schedule.request","source":"raw-terminal-scheduled"}
{"event":"schedule.fire","source":"raw-terminal-scheduled"}
{"event":"open.start","source":"raw-terminal-scheduled"}
{"event":"custom.factory"}
{"event":"custom.onHandle"}
{"event":"modal.render.done"}
```

If `raw.input` appears but `schedule.fire` does not, investigate the scheduling guard. If `schedule.fire` appears but `custom.factory` does not, investigate `ctx.ui.custom()`. If `custom.factory` appears but `custom.onHandle` does not, investigate overlay registration/mount. If `modal.render.done` appears but nothing is visible, capture the terminal output stream or inspect whether another key immediately closes the overlay.

### Step 6: Run the tmux smoke script

Run outside Pi:

```bash
ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/scripts/02-smoke-tmux-ctrl-shift-p.sh
```

This starts isolated Pi in tmux, sends the observed kitty/tmux `Ctrl+Shift+P` CSI-u sequence, captures the pane, prints a log tail, and closes the session.

The current smoke result shows the modal on screen and logs render completion:

```json
{"event":"raw.input","matchesTarget":true}
{"event":"schedule.fire","source":"raw-terminal-scheduled"}
{"event":"modal.render.done","lineCount":10}
```

## Diagnostic Decision Tree

Use this decision tree when a future reproduction fails.

```text
Start with isolated lab
  │
  ├─ Does /modal-lab notify work?
  │    ├─ no  -> extension did not load or command dispatch is broken
  │    └─ yes -> continue
  │
  ├─ Does /modal-lab overlay render?
  │    ├─ no  -> debug ctx.ui.custom overlay/component rendering
  │    └─ yes -> continue
  │
  ├─ Does Ctrl+Shift+M render?
  │    ├─ no  -> debug pi.registerShortcut scope/conflicts
  │    └─ yes -> continue
  │
  ├─ Does raw.input log for Ctrl+Shift+P?
  │    ├─ no  -> terminal encoding or raw listener registration problem
  │    └─ yes -> continue
  │
  ├─ Does schedule.fire log?
  │    ├─ no  -> scheduling guard/state problem
  │    └─ yes -> continue
  │
  ├─ Does custom.onHandle log?
  │    ├─ no  -> overlay handle/mount problem
  │    └─ yes -> continue
  │
  ├─ Does modal.render.done log?
  │    ├─ no  -> render scheduling/flushing problem
  │    └─ yes -> continue
  │
  └─ Does user see modal?
       ├─ no  -> terminal repaint/output or immediate close problem
       └─ yes -> production bug is above the lab layer
```

## Design Decisions

### Decision 1: Use a separate extension rather than more command-palette instrumentation

The command palette is a real user feature. It has action hierarchy, shared registry integration, key assignment, buffering, search, and action execution. Those details are valuable in production but distract from the question "can a shortcut open a modal and paint it immediately?"

The lab strips the problem to one modal and a handful of entry paths. Once the lab reproduces a failure, the fix can be understood at the correct layer and then ported to the command palette.

### Decision 2: Run with `--no-extensions -e`

The investigation needs a process with no global/project extension conflicts. Pi's CLI supports exactly that:

```bash
pi --no-extensions -e ./extensions/modal-shortcut-lab/index.ts
```

This disables extension discovery while still loading the explicit file. It is safer than editing global settings or moving symlinks around for every test.

### Decision 3: Keep `Ctrl+Shift+P` only in the isolated lab path

The lab deliberately listens for `Ctrl+Shift+P` because that is the production problem shortcut. This would conflict with the production command palette if both extensions were loaded together. Therefore the guide treats the lab as an isolated extension and documents `--no-extensions` as the default launch mode.

### Decision 4: Log JSONL instead of prose messages

JSONL gives us structured events that can be grepped, diffed, or later loaded into analysis tools. A post-mortem can reconstruct exact order from timestamps and event names.

The log must never change behavior. `debugLog()` catches and ignores file write errors.

### Decision 5: Use a narrow component

The component renders a frame and simple counters. It does not search, scroll, query the registry, or execute actions. This makes render failures meaningful. If `LabModal.render()` fails to show, the problem is not due to palette search or item filtering.

### Decision 6: Include direct and scheduled open paths

Scheduling changed the production palette behavior. The lab preserves both versions so we can prove the difference:

- direct: open during the callback that detected the key,
- scheduled: return from the callback first, then open in `setImmediate()`.

### Decision 7: Keep render burst as diagnostic, not final architecture

The render burst is intentionally more aggressive than a clean production implementation. Its purpose is to classify the failure. Once the layer is understood, production code should use the smallest reliable render trigger.

## Alternatives Considered

### Alternative: Keep debugging only in production command palette

Rejected for now. Production code already contains useful logs, but it mixes low-level UI lifecycle with palette-specific concerns. Continuing there risks more patches that address symptoms without isolating cause.

### Alternative: Use only official `pi.registerShortcut()`

Rejected as the only test path. It is useful, and the lab includes it, but the production palette needs to intercept `Ctrl+Shift+P` before editor input in some cases. Raw terminal input must be tested directly.

### Alternative: Write an external terminal test program outside Pi

Rejected as the first step. An external Node script could inspect terminal escape sequences, but it would not exercise Pi's `ctx.ui.custom()`, overlay manager, focus, or render scheduling.

### Alternative: Disable kitty CSI-u

Rejected as a debugging strategy. The user environment emits CSI-u sequences, and Pi's TUI supports modern terminal input. We need to understand and handle this environment rather than simplify it away.

## Implementation Plan

### Phase 1: Documentation and test harness skeleton

- Create ticket `MODAL-SHORTCUT-LAB`.
- Add tasks, changelog, diary.
- Write the intern-ready design guide.
- Add the lab extension directory and README.

### Phase 2: Minimal command-opened modal

- Implement `/modal-lab notify`.
- Implement `/modal-lab replace`.
- Implement `/modal-lab overlay`.
- Add `LabModal.render()` and `LabModal.handleInput()` logging.

### Phase 3: Shortcut paths

- Add `Ctrl+Shift+M` registered direct shortcut.
- Add `Ctrl+Shift+Alt+M` registered scheduled shortcut.
- Add raw `Ctrl+Shift+O` direct shortcut.
- Add raw `Ctrl+Shift+P` scheduled shortcut.

### Phase 4: Structured logging and reproducibility

- Add `/modal-lab-debug` control command.
- Add `/tmp/pi-modal-shortcut-lab.log` JSONL logging.
- Add scripts for isolated launch and tmux smoke reproduction.

### Phase 5: Controlled buffering experiments

This remains future work. After the base raw scheduled path is stable, add explicit modes for buffering one printable key typed during the open window. Keep CSI-u sequences logged separately so the lab can reproduce the production `ESC[27u` cancellation bug without hiding it.

Possible commands:

```text
/modal-lab buffer on
/modal-lab buffer off
/modal-lab replay-policy printable-only
/modal-lab replay-policy matches-key
```

Possible additional events:

```json
{"event":"raw.bufferBeforeReady"}
{"event":"raw.consumeBeforeReady"}
{"event":"modal.replayBufferedInput"}
```

### Phase 6: Compare against production command palette

Once the lab establishes the reliable sequence, compare production code:

- `extensions/command-palette/index.ts`
- `extensions/_shared/ui/command-palette.ts`

Look for differences in:

- raw input matching,
- scheduling,
- guard state,
- focus timing,
- render triggering,
- buffered event replay,
- component cancellation behavior.

## API Reference

### `pi.registerCommand()`

Registers a slash command.

```ts
pi.registerCommand("modal-lab", {
  description: "Run modal shortcut lab scenarios",
  handler: async (args, ctx) => { ... },
});
```

Relevant docs:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`

### `pi.registerShortcut()`

Registers a high-level shortcut using Pi keybinding syntax.

```ts
pi.registerShortcut("ctrl+shift+m", {
  description: "Open lab modal",
  handler: async (ctx) => { ... },
});
```

Relevant docs:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/keybindings.md`

### `ctx.ui.custom()`

Opens a custom TUI component. With `overlay: true`, it renders as a floating overlay.

```ts
await ctx.ui.custom<Result>(factory, {
  overlay: true,
  overlayOptions: { anchor: "center", width: 72, maxHeight: 16 },
  onHandle: (handle) => handle.focus(),
});
```

Relevant docs:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
- `docs/pi-tui-ui-authoring-guide.md`

### `ctx.ui.onTerminalInput()`

Registers a raw terminal input listener. This API is used by the production command palette and by the lab. It receives raw strings and can return `{ consume: true }` to prevent the input from continuing to the editor or focused component.

Pseudocode:

```ts
const unsubscribe = ctx.ui.onTerminalInput((data) => {
  if (matchesKey(data, "ctrl+shift+p")) {
    scheduleOpen(ctx);
    return { consume: true };
  }
});
```

### `matchesKey()` and `Key`

Interprets raw input strings as semantic keys.

```ts
if (matchesKey(data, Key.escape)) done(cancel);
if (matchesKey(data, "ctrl+shift+p")) scheduleOpen(ctx);
```

Caution: `matchesKey()` may classify CSI-u sequences such as `ESC[27u` as Escape. That is appropriate inside a focused component, but may be too broad when deciding whether to replay events buffered before mount.

### `tui.requestRender(force?)`

Requests a TUI render. The lab logs every call and uses `force = true` in `onHandle` diagnostic kicks.

```ts
requestRender = (force = false) => {
  log("custom.requestRender", { force });
  tui.requestRender(force);
};
```

## Post-Mortem Evidence Checklist

When collecting evidence for a future post-mortem, preserve:

- The exact Pi launch command.
- Terminal emulator and tmux version if relevant.
- The exact key sequence or physical keys pressed.
- `/tmp/pi-modal-shortcut-lab.log` tail covering the reproduction.
- A pane screenshot or `tmux capture-pane` output if available.
- Whether the failure reproduces in isolated lab mode.
- Whether it reproduces in normal project mode.
- The latest commit hash for both the lab and command palette.

Minimum useful log section:

```bash
tail -160 /tmp/pi-modal-shortcut-lab.log
```

## Current Status

Implemented and smoke-tested:

- Isolated extension load with `--no-extensions -e`.
- Command-opened overlay and replacement custom UI.
- Registered direct and scheduled shortcuts.
- Raw direct and raw scheduled shortcuts.
- `Ctrl+Shift+P` raw scheduled path.
- JSONL debug logging.
- Tmux smoke script for the observed kitty/tmux CSI-u `Ctrl+Shift+P` sequence.

The first tmux smoke test succeeded: the modal was visible and `modal.render.done` appeared in the log.

## Open Questions

- Does the same isolated lab behavior hold in the user's live kitty/tmux pane, not just a scripted tmux session?
- Which exact CSI-u release events arrive after physical `Ctrl+Shift+P` in the live environment?
- Does direct raw open ever deadlock or delay `onHandle`, or is scheduled open always sufficient?
- What is the smallest production render trigger needed after `onHandle`: one forced render, delayed render, or no forced render once replay policy is fixed?
- Should the production command palette keep render-level debug logging permanently behind `/palette-debug`, or should it be reduced after this investigation?

## References

- Pi extension docs: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- Pi TUI docs: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
- Pi keybinding docs: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/keybindings.md`
- Local extension framework guide: `docs/pi-shared-extension-framework-guide.md`
- Local TUI authoring guide: `docs/pi-tui-ui-authoring-guide.md`
- Lab extension: `extensions/modal-shortcut-lab/index.ts`
- Production command palette: `extensions/command-palette/index.ts`
