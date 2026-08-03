# BusyBar Alert

Flash a short looping animation on a [BUSY Bar](https://busy.bar) LED dock every
time a pi turn finishes. A physical "your agent is done" light for long-running
sessions.

## How it works

1. pi emits a `turn_end` event (one per LLM response + tool calls).
2. The extension runs the `busybar` CLI (must be on `PATH`):
   `busybar show --input <cached .anim> --application-name pi-turn-alert --loop …`
3. After `holdSeconds` (default 3), it runs `busybar clear` for that
   application name.

The `.anim` asset is compiled once (`busybar create --pattern spinner …`) and
cached in `~/.cache/pi-busybar-alert/`. Every alert attempt is appended to
`~/.cache/pi-busybar-alert/alerts.jsonl`.

## Commands

- `/busybar-alert-test` — send one alert immediately (bypasses debounce)
- `/busybar-alert-toggle [on|off]` — enable/disable alerts
- `/busybar-alert-stats` — fired / skipped / error counts
- `/busybar-alert-self-test` — argument-construction and debounce self-tests (no device needed)

## Settings

Open via `/px` → BusyBar Alert → settings. Key fields: device `addr` (falls
back to `BUSYBAR_ADDR`, default `10.0.4.20`), `token` (falls back to
`BUSYBAR_TOKEN`), `alertOn` (`turn_end` per spec, or `agent_settled` for
"only when fully idle"), `minIntervalMs` debounce (default 2000), `holdSeconds`
(default 3), `priority` (1–100, default 60).

## Design doc

Full intern-ready design and implementation guide lives in ticket
`PI-EXT-BUSYBAR-ALERT`:
`ttmp/2026/08/03/PI-EXT-BUSYBAR-ALERT--pi-extension-turn-end-alert-to-busy-bar-dock/design-doc/01-busybar-turn-alert-extension-design-and-implementation-guide.md`
