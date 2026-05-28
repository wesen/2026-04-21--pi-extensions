---
Title: 'Project Report: Modals and Keyboard Shortcuts in Pi Agent'
Ticket: MODAL-SHORTCUT-LAB
Status: active
Topics:
    - pi
    - extensions
    - tui
    - debugging
    - shortcuts
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/modal-shortcut-lab/index.ts
      Note: Minimal extension that isolates command, registered-shortcut, raw-terminal, overlay, focus, and render behavior.
    - Path: extensions/modal-shortcut-lab/README.md
      Note: Runbook for the modal shortcut lab and the tested shortcut variants.
    - Path: extensions/command-palette/index.ts
      Note: Production command-palette shortcut path that motivated the investigation and now uses a Kitty-safe default.
    - Path: extensions/_shared/ui/command-palette.ts
      Note: Production overlay component used as a comparison point for modal rendering and keyboard input.
    - Path: ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/scripts/03-terminal-key-probe.mjs
      Note: Raw-mode terminal key probe used to inspect Kitty/tmux key sequences with Pi TUI parsing.
    - Path: ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/scripts/04-smoke-tmux-safe-shortcuts.sh
      Note: Smoke script that verifies candidate shortcut sequences against the isolated lab.
ExternalSources:
    - "https://gist.github.com/AskinNet/0d0d4f7f0ee221f8362af9d9876d021a: Kitty default shortcuts list used to identify Ctrl+Shift+P and Ctrl+Shift+O collisions."
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md: Pi extension API documentation for commands, shortcuts, lifecycle events, and custom UI."
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md: Pi TUI component and overlay documentation."
    - "/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/keybindings.md: Pi keybinding syntax and built-in action defaults."
Summary: Deep technical report on implementing modal overlays and keyboard shortcuts in Pi extensions, including terminal protocol findings and the final shortcut recommendation.
LastUpdated: 2026-05-28T13:40:00-04:00
WhatFor: Preserve the modal and shortcut investigation as a reusable technical reference for Pi extension authors.
WhenToUse: Read before implementing a Pi modal opened by keyboard shortcut, debugging overlay render timing, or choosing terminal-safe shortcut chords.
---

# Project Report: Modals and Keyboard Shortcuts in Pi Agent

## 1. Purpose of This Report

This report explains how modal overlays and keyboard shortcuts work in Pi extensions, using the modal shortcut investigation as the concrete implementation record. By the end, a developer should understand how a Pi extension opens custom UI, how the TUI renders an overlay, how keyboard input moves from the terminal to a component, why some shortcuts never arrive or arrive late, and how to build diagnostic tooling that distinguishes terminal behavior from application behavior.

The immediate bug was narrow: a command palette bound to `Ctrl+Shift+P` did not appear reliably in the user’s Kitty terminal. The actual system was wider. The behavior involved terminal emulator shortcut tables, Kitty keyboard protocol sequences, tmux extended-key handling, Pi’s shortcut API, Pi’s raw terminal input listener, `ctx.ui.custom()`, overlay focus, render scheduling, key release filtering, and replay of input received while a modal is being mounted. The report preserves that system-level understanding so future work does not repeat the same debugging loop.

## 2. The Problem That Started the Investigation

The production command palette was intended to open with `Ctrl+Shift+P`. In practice, the behavior was inconsistent in the live terminal session. The user observed that `Ctrl+Shift+P` did nothing at first, then the palette appeared on the next keypress. Another raw shortcut, `Ctrl+Shift+O`, did not work. Other paths did work: a command-opened overlay rendered correctly, a scheduled command-opened overlay rendered correctly, `Ctrl+Shift+M` worked through `pi.registerShortcut()`, and `Ctrl+Shift+Alt+M` worked through a scheduled registered shortcut.

Those observations already constrained the failure. If `/modal-lab overlay` worked, then `ctx.ui.custom()` and overlay rendering were not generally broken. If `Ctrl+Shift+M` and `Ctrl+Shift+Alt+M` worked, then Pi could open overlays from shortcut callbacks. If `Ctrl+Shift+P` appeared only after a later keypress, then the key was probably being delayed before Pi received it or was being interpreted as part of a terminal-level key sequence. If `Ctrl+Shift+O` did nothing, then the terminal or tmux could be consuming that chord before the child process saw it.

The decisive clue was the Kitty shortcut list. Kitty binds `Ctrl+Shift+P` as a key-chord prefix for kitten actions, and it binds `Ctrl+Shift+O` to `pass_selection_to_program`. Those are terminal-level shortcuts. Pi cannot reliably bind an application shortcut that the terminal reserves for its own command processing unless the user changes the terminal configuration. This explains the delayed `Ctrl+Shift+P` behavior and the missing `Ctrl+Shift+O` behavior without requiring a rendering bug in Pi.

## 3. The Implementation Surface in Pi

A Pi extension is a TypeScript module that exports a default factory function. Pi calls the factory with `ExtensionAPI`, and the extension registers commands, shortcuts, tools, events, and UI contributions from that factory. The extension can also subscribe to session lifecycle events so that it can set up and tear down runtime resources.

The smallest extension shape is:

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

For modal and shortcut work, the relevant APIs are:

| API | Role in this investigation |
| --- | --- |
| `pi.registerCommand()` | Provides deterministic slash-command entry points such as `/modal-lab overlay` and `/palette`. |
| `pi.registerShortcut()` | Registers high-level Pi shortcuts, scoped through Pi’s interactive editor shortcut path. |
| `pi.on("session_start")` | Installs raw terminal listeners and reconstructs per-session UI state. |
| `pi.on("session_shutdown")` | Removes raw listeners and cleans up extension state. |
| `ctx.ui.notify()` | Emits non-blocking status messages. It is useful as a first load/dispatch check. |
| `ctx.ui.custom()` | Opens custom TUI components, either replacing the editor area or as an overlay. |
| `ctx.ui.onTerminalInput()` | Installs a raw terminal input listener that can consume input before it reaches the editor or focused component. |
| `matchesKey()` | Converts raw terminal strings into semantic key identifiers such as `ctrl+shift+alt+n`. |

A modal shortcut implementation depends on all of those pieces. The command path proves the UI. The registered shortcut path proves Pi-level keyboard dispatch. The raw input path proves the terminal sequence and lets the extension consume the opening key before the editor treats it as text or navigation.

## 4. The TUI Component Contract

Pi custom UI is built on `@mariozechner/pi-tui`. A component is a small object with a `render(width)` method and, optionally, a `handleInput(data)` method. The component receives raw keyboard data only while it has focus.

```ts
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

The contract is direct. A component reads its state and returns terminal rows. Each row must fit within the supplied width in visible terminal cells. If the row contains ANSI escape sequences, code must measure visible width with `visibleWidth()` and clip with `truncateToWidth()` rather than relying on string length.

The modal lab component follows this contract deliberately. It has a small state surface: render count, input count, and the last input received. It can be closed with Enter or Escape. Every input event is logged, every render call is logged, and every cache invalidation is logged.

```ts
class LabModal implements Component {
  public renderCount = 0;
  private inputCount = 0;
  private lastInput = "none";

  handleInput(data: string): void {
    this.inputCount++;
    this.lastInput = JSON.stringify(data);

    if (matchesKey(data, Key.escape)) {
      this.options.done({ kind: "cancel", source: this.options.source, inputCount: this.inputCount });
      return;
    }

    if (matchesKey(data, Key.enter)) {
      this.options.done({ kind: "ok", source: this.options.source, inputCount: this.inputCount });
      return;
    }

    this.invalidate();
    this.options.requestRender?.();
  }

  render(width: number): string[] {
    this.renderCount++;
    // Build a bounded, ANSI-safe frame and diagnostic rows.
  }
}
```

This component is intentionally less capable than the production command palette. That is the point. If this component fails to appear, the failure is in the modal path, focus, render scheduling, or terminal output. If this component appears and the command palette does not, then the production feature has an additional state or input issue.

## 5. Opening Custom UI with `ctx.ui.custom()`

The central UI API is `ctx.ui.custom()`. The extension provides a factory function. Pi calls the factory with the active TUI instance, the current theme, the keybinding manager, and a `done` callback. The component calls `done(result)` when it wants to close. The promise returned by `ctx.ui.custom()` resolves to that result.

```ts
const result = await ctx.ui.custom<LabResult>(
  (tui, theme, _keybindings, done) => {
    const component = new LabModal({ theme, done, requestRender: () => tui.requestRender() });
    return component;
  },
  {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      width: 72,
      maxHeight: 16,
      margin: 1,
    },
  },
);
```

Overlay mode changes placement, not the component contract. The component still returns `string[]`. Pi renders those rows above the existing chat/editor content instead of replacing the editor component. `overlayOptions` controls the overlay’s width, height limit, anchor, offsets, margins, and visibility behavior.

The production `showExtensionCustom()` implementation in Pi creates the component, adds it as an overlay, optionally invokes `onHandle`, focuses the overlay when requested, and later hides the overlay when `done()` is called. In replacement mode, it clears the editor container and inserts the custom component; in overlay mode, it leaves the normal UI in place and stacks the overlay.

The lifecycle is:

```text
extension command or shortcut
  └─ openLabModal(ctx, source, mode)
       └─ ctx.ui.custom(factory, options)
            ├─ factory(tui, theme, keybindings, done)
            │    └─ new LabModal(...)
            ├─ ui.showOverlay(component, overlayOptions)
            ├─ options.onHandle(handle)
            │    ├─ handle.focus()
            │    └─ tui.requestRender(true)
            ├─ component.render(width)
            ├─ focused component receives handleInput(data)
            └─ done(result) hides overlay and resolves promise
```

Two facts are important for shortcut-opened overlays. First, the overlay must receive focus if it should consume Escape, Enter, arrows, or printable keys. Second, a render request should occur after the overlay is mounted. A component that is constructed but never rendered is not visible. A component that renders but is immediately closed by a later input event may appear as a flicker or may not be perceived at all.

## 6. Why the Lab Uses Multiple Entry Paths

The modal shortcut lab exposes multiple ways to open the same component. The design is not for user convenience. It is a diagnostic matrix. Each entry path removes or adds one layer of behavior.

| Entry path | Command or key | What it proves |
| --- | --- | --- |
| Notification | `/modal-lab notify` | Extension load, command routing, and `ctx.ui.notify()` work. |
| Replacement custom UI | `/modal-lab replace` | `ctx.ui.custom()` can create and focus a non-overlay component. |
| Command overlay | `/modal-lab overlay` | Overlay rendering works without shortcut timing. |
| Scheduled command overlay | `/modal-lab scheduled` | Deferring the open with `setImmediate()` does not break overlay mounting. |
| Registered direct shortcut | `Ctrl+Shift+M` | Pi’s high-level shortcut API can open an overlay directly. |
| Registered scheduled shortcut | `Ctrl+Shift+Alt+M` | A high-level shortcut can schedule an overlay open. |
| Raw scheduled target | `Ctrl+Shift+P` | The original problematic chord can be recorded and compared. |
| Raw scheduled candidate | `Ctrl+Shift+Alt+N` | A Kitty-safe candidate can be verified through the same raw path. |
| Raw scheduled alternate | `Ctrl+Space` | An ergonomic alternate can be tested when terminal/IME config allows it. |
| Raw direct comparison | `Ctrl+Shift+O` | The old direct raw path can be compared, with Kitty caveats. |

The lab logs every transition to `/tmp/pi-modal-shortcut-lab.log`. The log is the evidence source. A visible modal without log evidence is not enough; a log sequence without a visible modal points to output or repaint behavior. Both observations matter.

A successful raw scheduled open looks like this:

```json
{"event":"raw.input","matchesSafeCandidate":true}
{"event":"schedule.request","source":"raw-terminal-safe-candidate"}
{"event":"schedule.fire","source":"raw-terminal-safe-candidate"}
{"event":"open.start","source":"raw-terminal-safe-candidate","hasUI":true}
{"event":"custom.factory","source":"raw-terminal-safe-candidate"}
{"event":"custom.onHandle","isFocusedBefore":true}
{"event":"custom.onHandle.afterFocus","isFocusedAfter":true}
{"event":"renderKick","phase":"immediate"}
{"event":"modal.render","renderCount":1,"cached":false}
{"event":"modal.render.done","lineCount":10}
```

This sequence proves that raw input reached Pi, the listener matched it, the scheduled callback fired, `ctx.ui.custom()` called the factory, the overlay handle existed, focus was set, render was requested, and the component returned rows.

## 7. Registered Shortcuts and Raw Terminal Input Are Different Tools

Pi exposes `pi.registerShortcut()` for extension shortcuts. This is the first API an extension author should consider because it is simple and documented. It works well when the shortcut reaches Pi and when the focused editor is in the normal interactive path.

```ts
pi.registerShortcut("ctrl+shift+m", {
  description: "Modal Shortcut Lab: open overlay directly through pi.registerShortcut",
  handler: async (ctx) => {
    await openLabModal(ctx, "registered-shortcut-direct", "overlay");
  },
});
```

The command palette uses a raw terminal listener as well:

```ts
pi.on("session_start", async (_event, ctx) => {
  unsubscribe = ctx.ui.onTerminalInput((data) => {
    if (matchesKey(data, "ctrl+shift+alt+n")) {
      scheduleOpenPalette(ctx, "raw-terminal-shortcut:ctrl+shift+alt+n");
      return { consume: true };
    }
    return undefined;
  });
});
```

The raw listener receives input before the editor or focused component handles it. That allows the extension to consume the opening shortcut so the editor does not insert text or trigger another binding. This is useful for global modal shortcuts, but it comes with responsibility. The extension is now participating in the terminal input pipeline. It must clean up the listener on `session_shutdown`. It must avoid consuming unrelated input. It must handle key releases and terminal protocol sequences carefully.

The two APIs therefore serve different purposes:

| Property | `pi.registerShortcut()` | `ctx.ui.onTerminalInput()` |
| --- | --- | --- |
| Primary use | Normal extension shortcut. | Global or pre-editor interception. |
| Registration time | Extension factory. | Usually `session_start`, because it needs `ctx.ui`. |
| Cleanup | Managed by extension runtime. | Extension should unsubscribe on `session_shutdown`. |
| Input visibility | Depends on Pi shortcut handling path. | Sees raw TUI input before focused component dispatch. |
| Consumption | Shortcut handler returns by matching internally. | Listener can return `{ consume: true }`. |
| Risk | Lower. | Higher, because incorrect matching can swallow input. |

The production command palette keeps both. It uses the raw listener as the primary path and registers the same shortcut through `pi.registerShortcut()` as a fallback for moments when the raw listener is not installed, such as immediately after a reload before the next `session_start` setup has completed.

## 8. Scheduling the Modal Open

Opening an overlay inside a raw terminal input callback can couple overlay creation to the current input dispatch stack. The lab and the command palette therefore use a scheduled open for the raw shortcut path. The listener consumes the key and returns. A `setImmediate()` callback opens the modal after the current input event has unwound.

```ts
function scheduleOpen(ctx: ExtensionContext, source: OpenSource, mode: OpenMode): void {
  if (rawOpenScheduled) return;
  rawOpenScheduled = true;
  setImmediate(() => {
    rawOpenScheduled = false;
    void openLabModal(ctx, source, mode);
  });
}
```

The guard prevents duplicate opens from press and release events that arrive close together. Under Kitty keyboard protocol, a physical key can produce both a press sequence and a release sequence. If both match the same logical shortcut and the code has no guard, the extension may try to open the modal twice.

The command palette uses the same idea:

```ts
function scheduleOpenPalette(ctx: ExtensionCommandContext, source: string): void {
  if (paletteOpen || paletteOpenScheduled) return;
  pendingOpeningInputs = [];
  paletteOpenScheduled = true;
  setImmediate(() => {
    paletteOpenScheduled = false;
    void openPalette(ctx, source);
  });
}
```

The scheduled open is not a substitute for choosing a safe shortcut. It solves ordering between input dispatch and UI creation. It cannot make a terminal deliver a reserved shortcut immediately.

## 9. Focus, Render Requests, and Render Bursts

The lab uses `onHandle` to focus the overlay and request a forced render. This is the phase where a constructed component becomes user-visible.

```ts
onHandle: (handle) => {
  handle.focus();
  forceRenderBurst(id, source, requestRender);
}
```

The render burst intentionally requests several renders across event-loop phases:

```ts
requestRender(true);                  // immediate
process.nextTick(() => requestRender(true));
setTimeout(() => requestRender(true), 0);
setImmediate(() => requestRender(true));
setTimeout(() => requestRender(true), 25);
```

This is diagnostic instrumentation. It should not be treated as the ideal production pattern. Its purpose is to answer which phase produces a visible paint and whether any render call happens at all. If the log shows `modal.render.done` during the immediate render and the user still sees nothing, then the next question is terminal output or immediate closure. If the log shows `custom.onHandle` but no render, then the render request path is suspect.

The command palette currently keeps a similar render burst behind debug logging. Once the shortcut issue is stable, this can be reduced if a single forced render after focus is sufficient.

## 10. Terminal Protocols and Why `Ctrl+Shift+P` Failed

Modern terminals can encode modified keys using Kitty keyboard protocol or xterm `modifyOtherKeys`. Pi TUI supports these protocols. The parser can interpret sequences such as:

| Physical key | Kitty CSI-u sequence | Pi parse result | Notes |
| --- | --- | --- | --- |
| `Ctrl+Shift+P` | `ESC[112:80;6u` | `shift+ctrl+p` | Parser can recognize it, but Kitty reserves the chord prefix by default. |
| `Ctrl+Shift+Alt+N` | `ESC[110:78;8u` | `shift+ctrl+alt+n` | Verified safe candidate in tmux smoke tests. |
| `Ctrl+Space` | `ESC[32;5u` | `ctrl+space` | Verified in CSI-u smoke tests; live behavior may vary with IME/tmux/user bindings. |
| Escape | `ESC[27u` | `escape` | Can close a freshly mounted overlay if replayed incorrectly. |

The parser was not the root cause. `matchesKey(data, "ctrl+shift+p")` returned true for the CSI-u `Ctrl+Shift+P` sequence when Pi received it. The problem was that Kitty’s default configuration treats `Ctrl+Shift+P` as a prefix for multi-key kitten shortcuts. That terminal-level behavior explains why the palette appeared only after another keypress: the first key was part of Kitty’s pending key-chord state, and the later key caused the sequence to resolve or be forwarded.

`Ctrl+Shift+O` had a different conflict. Kitty maps it to `pass_selection_to_program`. A terminal-level action can prevent the child application from ever seeing the key. If no raw input is delivered to Pi, no Pi parser or overlay code can respond.

The corrected production decision was to move the default command palette shortcut to `Ctrl+Shift+Alt+N`, while preserving `/palette` and environment overrides for local experimentation.

## 11. The Terminal Key Probe

The ticket includes `scripts/03-terminal-key-probe.mjs` to inspect live terminal input. The script runs in raw mode, asks for Kitty keyboard protocol, falls back to `modifyOtherKeys`, splits input with Pi TUI’s `StdinBuffer`, and prints the raw string, parsed key, release/repeat flags, and candidate matches.

Example decode-mode output:

```text
raw="\u001b[110:78;8u" parse=shift+ctrl+alt+n release=false repeat=false matches=ctrl+shift+alt+n
raw="\u001b[32;5u" parse=ctrl+space release=false repeat=false matches=ctrl+space
raw="\u001b[112:80;6u" parse=shift+ctrl+p release=false repeat=false matches=ctrl+shift+p
```

The script is useful because it tests the terminal path outside Pi’s extension runtime while still using Pi TUI’s parser. This avoids a common debugging error: writing a new parser that disagrees with the application parser and then chasing differences that do not exist in production.

Run it in the same terminal where Pi normally runs:

```bash
ttmp/2026/05/27/MODAL-SHORTCUT-LAB--minimal-pi-shortcut-modal-lab-for-debugging-terminal-overlay-opening/scripts/03-terminal-key-probe.mjs
```

Then press the candidate shortcuts. If the script does not print an event for a key, Pi will not see that key either unless the application enables a different terminal mode or the user changes terminal configuration.

## 12. Buffering and Replay During Modal Mount

The command palette supports a fast sequence such as opening the palette and immediately pressing a menu key. If the user presses the second key before the overlay is fully ready, the raw listener can see that input while `paletteOpenScheduled` is true or while `paletteOpen` is true but `paletteInputReady` is false.

The production code buffers only simple replayable input:

```ts
if (paletteOpenScheduled || (paletteOpen && !paletteInputReady)) {
  if (shouldReplayOpeningInput(data)) {
    pendingOpeningInputs.push(data);
  }
  return { consume: true };
}
```

The replay policy is intentionally narrow. Literal printable characters can be replayed into the overlay because they represent user intent such as pressing `r` to enter Response Viewer. CSI-u release events should not be replayed. A release event such as `ESC[27u` can match Escape and immediately close the overlay. A space release event such as `ESC[32;1:3u` should not be replayed as a deliberate space input.

The principle is:

- Buffer user-intent keys that are safe and meaningful in the overlay.
- Consume or ignore terminal protocol artifacts during the mount window.
- Log every buffer/consume decision during debugging.

This distinction matters because keyboard protocols report more than text. They can report press, repeat, release, alternate shifted key, and base-layout key information. Modal components should handle semantic input after focus; mount-time replay should be stricter.

## 13. Diagnostic Decision Tree

When a modal opened by shortcut fails, debug in layers. Do not start by changing the production feature.

```text
Does a slash command run?
  ├─ no: extension loading or command registration failed.
  └─ yes
      Does ctx.ui.notify() display?
        ├─ no: command ran but UI feedback path failed.
        └─ yes
            Does /modal-lab overlay render?
              ├─ no: debug ctx.ui.custom(), overlay options, component render, and width handling.
              └─ yes
                  Does pi.registerShortcut() open the overlay?
                    ├─ no: debug Pi shortcut scope and conflicts.
                    └─ yes
                        Does ctx.ui.onTerminalInput() receive the target key?
                          ├─ no: terminal/tmux/desktop consumed or delayed the key.
                          └─ yes
                              Does schedule.fire run?
                                ├─ no: scheduling guard or duplicate state blocked it.
                                └─ yes
                                    Does custom.onHandle run?
                                      ├─ no: overlay mount failed.
                                      └─ yes
                                          Does render.done run?
                                            ├─ no: render scheduling failed.
                                            └─ yes: inspect terminal repaint or immediate close input.
```

This decision tree is the main lesson from the investigation. It separates extension loading, command dispatch, UI construction, overlay mounting, focus, render scheduling, terminal input delivery, and protocol artifacts. Each layer has a different fix.

## 14. The Final Shortcut Recommendation

The command palette now defaults to:

```text
Ctrl+Shift+Alt+N
```

In code:

```ts
const DEFAULT_SHORTCUT = "ctrl+shift+alt+n";
```

The extension also supports environment overrides:

```bash
PI_COMMAND_PALETTE_SHORTCUT=ctrl+space pi
PI_COMMAND_PALETTE_EXTRA_SHORTCUTS=ctrl+space,ctrl+shift+alt+n pi
```

The recommendation has three parts:

- Use `Ctrl+Shift+Alt+N` as the default because it is not in the captured Kitty default shortcut table and it was verified through the same raw-input path as the production command palette.
- Keep `/palette` as the universal fallback because slash commands do not depend on terminal-level shortcut availability.
- Treat `Ctrl+Space` as an opt-in candidate because it is ergonomic but commonly involved in IME, shell, tmux, editor, or desktop shortcuts.

A shortcut should be evaluated at three levels before becoming a default:

| Level | Question | Evidence |
| --- | --- | --- |
| Terminal emulator | Does the terminal reserve this key? | Terminal docs, shortcut table, live probe. |
| Multiplexer/session | Does tmux or SSH alter or consume it? | `03-terminal-key-probe.mjs` inside the actual session. |
| Pi application | Does `matchesKey()` recognize it and can the extension consume it? | Lab logs and command-palette debug logs. |

## 15. Implementation Checklist for Future Modal Shortcuts

Use this checklist when adding a modal that opens from a keyboard shortcut.

- Verify the UI through a slash command before adding any shortcut.
- Implement the component with the `Component` contract: `render(width)`, `handleInput(data)`, and `invalidate()`.
- Ensure every rendered line fits the supplied width using `visibleWidth()` and `truncateToWidth()` when ANSI styling is present.
- Use `ctx.ui.custom()` with explicit `overlayOptions` for modal overlays.
- Focus the overlay in `onHandle` when it should receive keyboard input.
- Request a render after focus; keep additional render bursts behind debug instrumentation if needed.
- Prefer `pi.registerShortcut()` for ordinary extension shortcuts.
- Use `ctx.ui.onTerminalInput()` only when the shortcut must be consumed before the editor sees it.
- Register raw listeners during `session_start` and unsubscribe during `session_shutdown`.
- Avoid terminal-reserved shortcuts. Test in the same terminal and tmux configuration used by the user.
- Treat key release CSI-u sequences as protocol events, not user-intent input for mount-time replay.
- Keep a structured debug log with event names that map to lifecycle phases.
- Provide a slash-command fallback for every keyboard-only feature.

## 16. What the Investigation Changed

The work produced both code and process changes.

The code changes were:

- `extensions/modal-shortcut-lab/` now contains an isolated lab for modal and shortcut experiments.
- The lab can test command overlays, registered shortcuts, raw terminal shortcuts, scheduled opens, `Ctrl+Shift+Alt+N`, and `Ctrl+Space`.
- `scripts/03-terminal-key-probe.mjs` can inspect live terminal key sequences using Pi TUI parsing.
- `scripts/04-smoke-tmux-safe-shortcuts.sh` can verify the safe candidate sequences in a disposable tmux session.
- `extensions/command-palette/index.ts` now defaults to `Ctrl+Shift+Alt+N` and exposes environment overrides.

The process changes were:

- Shortcut bugs should be reduced to a minimal lab before production code is repeatedly patched.
- Terminal-level shortcut tables must be checked before assigning application shortcuts.
- Raw terminal logs should include both the raw string and the semantic `matchesKey()` result.
- Debugging should record whether `render()` ran, not just whether `ctx.ui.custom()` was called.

## 17. Closing Summary

The root cause was not a single missing render call. The modal and shortcut system spans terminal input, Pi extension dispatch, TUI overlay lifecycle, and component rendering. The command-opened overlay worked because it bypassed terminal shortcut conflicts. The registered shortcut paths worked for keys that reached Pi. `Ctrl+Shift+P` failed because Kitty reserves it as a key-chord prefix, and `Ctrl+Shift+O` failed because Kitty binds it to a terminal action.

The durable result is a working implementation and a repeatable method. Use a command path to prove the modal. Use registered shortcuts to prove Pi shortcut handling. Use raw terminal probes to prove the terminal delivers the key. Use structured logs to prove focus and render. Choose default shortcuts only after testing them at all three layers.
