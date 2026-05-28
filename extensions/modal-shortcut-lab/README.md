# Modal Shortcut Lab

Modal Shortcut Lab is an intentionally small Pi extension for isolating shortcut, raw terminal input, `ctx.ui.custom()`, overlay, focus, and render timing behavior.

Run it without other auto-discovered extensions when investigating command palette or shortcut/modal bugs:

```bash
PI_MODAL_SHORTCUT_LAB_DEBUG=1 \
pi --no-extensions \
  -e /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/modal-shortcut-lab/index.ts
```

## Commands

- `/modal-lab notify` — prove the extension is loaded and command dispatch works.
- `/modal-lab replace` — open a non-overlay `ctx.ui.custom()` component.
- `/modal-lab overlay` — open an overlay through a command.
- `/modal-lab scheduled` — schedule the command-opened overlay with `setImmediate()`.
- `/modal-lab status` — show build id, shortcuts, and log path.
- `/modal-lab-debug on` — enable logging.
- `/modal-lab-debug off` — disable logging.
- `/modal-lab-debug clear` — clear `/tmp/pi-modal-shortcut-lab.log`.
- `/modal-lab-debug tail` — show the last log lines in Pi.

## Shortcuts

The lab deliberately exposes several opening paths:

- `Ctrl+Shift+M` — `pi.registerShortcut()` direct overlay open.
- `Ctrl+Shift+Alt+M` — `pi.registerShortcut()` scheduled overlay open.
- `Ctrl+Shift+P` — raw terminal listener scheduled overlay open; this matches the old command-palette problem shortcut and should be tested only in isolated mode. In Kitty this is a built-in key-chord prefix, so it may not arrive until the next keypress.
- `Ctrl+Shift+Alt+N` — raw terminal listener scheduled overlay open for a Kitty-safe command-palette shortcut candidate.
- `Ctrl+Space` — raw terminal listener scheduled overlay open for an ergonomic alternate candidate; this may conflict with IME/tmux/user bindings on some machines.
- `Ctrl+Shift+O` — raw terminal listener direct overlay open; Kitty binds this by default to `pass_selection_to_program`, so it may not reach Pi.

## Log

The log is JSONL:

```text
/tmp/pi-modal-shortcut-lab.log
```

Important event names:

- `raw.input`
- `schedule.request`
- `schedule.fire`
- `open.start`
- `custom.factory`
- `custom.onHandle`
- `custom.requestRender`
- `renderKick`
- `modal.render`
- `modal.render.done`
- `modal.handleInput`
- `open.done`

## Expected Smoke Test

1. Start Pi with `--no-extensions -e .../modal-shortcut-lab/index.ts`.
2. Run `/modal-lab-debug clear` and `/modal-lab-debug on`.
3. Run `/modal-lab notify`; expect a notification.
4. Run `/modal-lab overlay`; expect the modal.
5. Press `Ctrl+Shift+M`; expect the modal.
6. Press `Ctrl+Shift+Alt+N`; expect the modal from the Kitty-safe raw terminal listener.
7. Press `Ctrl+Space`; expect the modal if your terminal/desktop does not reserve that shortcut.
8. Press `Ctrl+Shift+P`; in Kitty, expect delayed/prefix behavior rather than treating this as a safe app shortcut.
9. Inspect `/tmp/pi-modal-shortcut-lab.log` and compare lifecycle ordering.
