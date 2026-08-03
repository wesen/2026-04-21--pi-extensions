---
Title: Diary
Ticket: PI-EXT-BUSYBAR-ALERT
Status: active
Topics:
    - pi-extension
    - busybar
    - hardware
    - tooling
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://extensions/busybar-alert/alert.ts
      Note: Core alert logic + self-tests (Step 4)
    - Path: repo://extensions/busybar-alert/index.ts
      Note: 'Extension entry: registry, event hooks, commands (Step 4)'
    - Path: repo://extensions/busybar-alert/settings.ts
      Note: Settings schema with env fallbacks (Step 4)
ExternalSources: []
Summary: ""
LastUpdated: 2026-08-03T16:53:47.34873539-04:00
WhatFor: ""
WhenToUse: ""
---


# Diary

## Goal

Design (and prepare the implementation of) a pi extension that fires an alert
on the BUSY Bar dock every time an agent turn finishes. Deliverables: docmgr
ticket with an intern-ready design/implementation guide, helper scripts in the
ticket's `scripts/` folder, evidence captured into `sources/`, and a reMarkable
upload of the design bundle.

## Step 1: Ticket creation and system reconnaissance

The first step was to understand both sides of the integration before writing
any design prose: how pi extensions hook into the agent lifecycle, and what the
busybar CLI can actually do. I created the docmgr ticket
`PI-EXT-BUSYBAR-ALERT`, then read the busybar help surface, the repo's
extension framework guide, the shared registry contract, and two existing
extensions that demonstrate the exact patterns this design needs
(`session-context` for `turn_end` subscriptions and status widgets,
`kagi-web-search` for `pi.exec`).

The reconnaissance confirmed the design is a thin adapter: pi already emits
`turn_end` with a documented payload, and busybar already owns the entire
device protocol (asset upload, priority arbitration, clear semantics). No new
protocol code is required anywhere.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to create a pi extension that triggers an alert when a turn finishes, to be sent to my busy.bar dock (see `busybar help --all`, which is from /home/manuel/code/wesen/2026-08-02--busy-bar-pi (only look if you really must, don't modify without asking me, in case some functionality is missing or unclear). 

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.


Store all scripts youo write while writing the design document in the scripts/ folder of the ticket.

Keep a detailed diary as you work (see diary skill for the format)"

**Assistant interpretation:** Create a docmgr ticket in the pi-extensions repo, research the busybar CLI and pi extension events, write a thorough intern-ready design document for a `turn_end` → BUSY Bar alert extension, keep scripts inside the ticket's scripts/ folder, maintain a diary, and upload the final document to reMarkable.

**Inferred user intent:** The user wants a well-documented, evidence-backed design package they can hand to an intern (or a future agent session) to implement the extension without re-doing any discovery — plus an offline copy on their reMarkable for reading.

**Commit (code):** N/A (documentation-only ticket so far)

### What I did
- `docmgr ticket create-ticket --ticket PI-EXT-BUSYBAR-ALERT --title "Pi extension: turn-end alert to BUSY Bar dock" --topics pi-extension,busybar,hardware,tooling`
- `docmgr doc add` for the design doc and this diary.
- Read `busybar help --all`, `busybar help busybar-animation-cli`, and `busybar help busybar-goja`.
- Read `docs/pi-shared-extension-framework-guide.md` (sections 2, 3, 6), `extensions/_shared/registry.ts`, `extensions/session-context/index.ts`, `extensions/kagi-web-search/index.ts`, and `.pi/settings.json`.
- Verified event names against the installed pi package docs (`@earendil-works/pi-coding-agent` 0.82.1, `docs/extensions.md`).

### Why
- The design doc must quote real API surfaces, not guesses; capturing them as evidence keeps the doc honest and reviewable.

### What worked
- The repo's conventions made recon fast: one registry contract, one framework guide, and existing extensions that already use every pattern needed (`pi.on("turn_end")`, `pi.exec`, schema settings, status widgets).

### What didn't work
- Nothing blocking. The BUSY Bar device itself is not reachable from this host right now (TCP probe to `10.0.4.20:80` times out), so hardware validation is deferred; the probe script reports this gracefully instead of hanging.

### What I learned
- pi 0.82.1 distinguishes `agent_end` (run ended, but pi may still auto-retry/compact) from `agent_settled` (truly idle). Per-turn alerting must use `turn_end`; "alert when fully idle" is an `agent_settled` variant worth exposing as a setting.
- `turn_end` fires once per LLM response+tool-call cycle, i.e. many times per user prompt — a debounce is mandatory for a physical alert.
- busybar's `show` is upload-then-draw, not atomic; HTTP 409 means a higher-priority application owns the display. The extension must treat non-zero exits as log-and-continue, never crash.
- Extensions in this repo load as TypeScript source via `.pi/settings.json` — forgetting to add the entry there is the classic "extension does nothing" failure.

### What was tricky to build
- Choosing the right trigger event. The user said "when a turn finishes", which maps literally to `turn_end`, but a naive implementation would flash the bar dozens of times per prompt. I resolved this by keeping `turn_end` as the spec-compliant default and adding a `minIntervalMs` debounce plus an `alertOn: agent_settled` setting, documented as a deliberate trade-off in §3.3 and §5.4 of the design doc.

### What warrants a second pair of eyes
- The debounce/serialization logic in §5.3 (`inFlight` flag + `setTimeout`-owned clear) — race conditions there would either double-draw or leave the bar stuck on.
- The claim that `pi.exec` is preferable to raw `spawn` for new code (based on `image-qa` using `spawn` as the older pattern) — worth confirming with the repo owner.

### What should be done in the future
- Implement `extensions/busybar-alert/` per §6 of the design doc (separate implementation step, not part of this documentation pass).
- When the device is reachable, run `scripts/03-probe-device.sh` and `scripts/04-prototype-alert.sh` end-to-end and attach a photo/jsonl capture to the ticket.

### Code review instructions
- Start with the design doc §5 (Design) and §9 (References); every factual claim about busybar or pi events is backed by a file in `sources/`.
- Validate by re-running `scripts/01-capture-busybar-help.sh` and `scripts/02-verify-pi-events.sh` and diffing against `sources/`.

### Technical details
- Installed pi version: `@earendil-works/pi-coding-agent` 0.82.1 (evidence: `sources/pi-events/pi-version.txt`).
- Alert asset: `busybar create --pattern spinner --display front --frames 12 --fps 12` → 3990-byte `.anim`, 72×16 rgb888 (evidence: `sources/alert-assets/`).

## Step 2: Evidence-capture and prototype scripts

With the API surfaces understood, I wrote four numbered scripts into the
ticket's `scripts/` folder (per the docmgr convention: numbered prefixes,
ticket-local storage) and ran each one. Three capture evidence into `sources/`;
the fourth is a working shell prototype of the exact alert cycle the extension
will perform, so the TypeScript implementation is a port rather than an
invention.

All four scripts ran successfully. The asset pipeline produced a real
`.anim` file without any hardware attached, which proves the offline parts of
the design.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** "Store all scripts you write while writing the design document in the scripts/ folder of the ticket" — any helper used during design work must live in `ttmp/.../scripts/`.

**Inferred user intent:** Keep the ticket self-contained and reproducible: anyone picking it up can re-run the same probes and captures.

**Commit (code):** N/A

### What I did
- `scripts/01-capture-busybar-help.sh` — dumps `busybar help` topics and per-command `--help` into `sources/busybar-help/*.md` (10 files).
- `scripts/02-verify-pi-events.sh` — checks 14 lifecycle event names against installed pi docs, records version, extracts the agent-events doc section into `sources/pi-events/`.
- `scripts/03-probe-device.sh` — bounded TCP-then-`stream` probe; exits gracefully when the device is unreachable.
- `scripts/04-prototype-alert.sh` — `create`→`inspect`→`show`→hold→`clear` cycle; ran with `--prepare-only` (no hardware) and produced `sources/alert-assets/alert_front.anim` (3990 bytes, 72×16, rgb888, 12fps).
- Ran `docmgr task add` ×6 for the ticket task list.

### Why
- The user explicitly required scripts to live in the ticket; beyond that, runnable evidence beats prose claims for an intern-ready handoff.

### What worked
- All scripts ran clean on the first pass. `04-prototype-alert.sh --prepare-only` validated the whole asset pipeline offline.

### What didn't work
- `scripts/03-probe-device.sh` reported `UNREACHABLE` for the default `10.0.4.20` address — expected if the bar is off or on another subnet; not a script bug. No `BUSYBAR_ADDR` was set in the environment.

### What I learned
- The busybar CLI's `--format jsonl` / `--format json` output is genuinely automation-friendly: the `create` row and `inspect` fields (`width,height,fps,color_mode,bytes`) are exactly what the extension needs for pre-flight validation.
- `busybar create` caching matters: rebuilding the `.anim` per alert would add avoidable latency, so the extension builds once and caches (mirrored by the prototype's `if [ ! -f "$ANIM" ]` guard).

### What was tricky to build
- Making the probe safe to run with no hardware: `busybar` commands hang against an unplugged bar (documented in the CLI troubleshooting table), so the probe does a 3-second `/dev/tcp` reachability check first and stops early. That ordering (cheap check before expensive check) is the fix for the documented hang.

### What warrants a second pair of eyes
- `04-prototype-alert.sh` uses priority 60 and a fixed 3s hold — these become the extension's defaults; confirm they match the user's taste before implementation.

### What should be done in the future
- Re-run `03-probe-device.sh` with `BUSYBAR_ADDR` set once the bar is online; consider adding a `--format json` probe of `smoke` for a structured capability check.

### Code review instructions
- Read the scripts in numeric order; each header comment states intent and usage. Re-run any of them from the repo root — they self-locate the ticket directory via `BASH_SOURCE`.

### Technical details
- Probe report: `sources/device-probe/probe-20260803T205505Z.md`.
- Asset: `sources/alert-assets/alert_front.anim` (+ `.zip` source).

## Step 3: Design document, diary, and docmgr bookkeeping

I wrote the full design/implementation guide into
`design-doc/01-busybar-turn-alert-extension-design-and-implementation-guide.md`,
replacing the docmgr template. The document is structured for a new intern:
system overview diagram, separate "understanding pi extensions" and
"understanding the BUSY Bar" chapters that assume zero prior knowledge, a
design chapter (goals/non-goals, alert-cycle flowchart, pseudocode, settings
schema, sequence diagram, error matrix), an implementation plan, alternatives
considered, a validation runbook, and a references section that pins every
claim to a file path — repo files, installed pi docs, or ticket-captured
evidence.

This diary step records that writing, plus the bookkeeping: relating files to
the ticket, updating the changelog, and checking off tasks.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** "Create a detailed analysis / design / implementation guide that is for a new intern ... with prose paragraphs and bullet points and pseudocode and diagrams and api references and file references."

**Inferred user intent:** The doc is the primary deliverable; it must stand alone as a teaching document, not just a sketch for someone already familiar with the codebases.

**Commit (code):** N/A

### What I did
- Wrote the ~26 KB design doc covering §1–§9 as described above.
- Updated the design doc frontmatter: `Summary`, `WhatFor`, `WhenToUse`, and `RelatedFiles` (registry, session-context, kagi-web-search, .pi/settings.json, framework guide, prototype script).
- Wrote this diary (Steps 1–3).

### Why
- An intern-ready doc needs the *why* (goals, alternatives rejected) as much as the *what* (APIs, pseudocode); the structure follows the repo's existing design-doc conventions.

### What worked
- The evidence captured in Step 2 made the references section concrete — every busybar behavior claim cites a file in `sources/busybar-help/`, and every pi event claim cites the installed 0.82.1 docs or `sources/pi-events/`.

### What didn't work
- N/A for the writing itself.

### What I learned
- Writing the error matrix (§5.8) forced one design change: asset/display mismatch detection moved to a `prepare-assets` action with `inspect`-based pre-flight validation instead of failing at alert time.

### What was tricky to build
- Keeping the doc intern-readable while technically precise. The solution was strict layering: prose explanation first in each section, then bullets/tables, then code/pseudocode, with file references collected in §9 rather than inline everywhere.

### What warrants a second pair of eyes
- §5.3 pseudocode's notify-once-per-session behavior for unreachable devices — confirm that matches how the user wants failures surfaced (silent status vs. repeated notifications).

### What should be done in the future
- Upload the design bundle to reMarkable (Step 4).
- After implementation, add a follow-up diary step linking the real `extensions/busybar-alert/` files and updating the changelog with commit hashes.

### Code review instructions
- Read `design-doc/01-...md` top to bottom; §5 and §6 are the implementable core. Cross-check any claim against the cited file in §9.

### Technical details
- Design doc path: `ttmp/2026/08/03/PI-EXT-BUSYBAR-ALERT--pi-extension-turn-end-alert-to-busy-bar-dock/design-doc/01-busybar-turn-alert-extension-design-and-implementation-guide.md`.

## Step 4: Implementing extensions/busybar-alert

The user asked to test the design with a real pi session in tmux, which required implementing the extension first. I created `extensions/busybar-alert/` with four files (`index.ts`, `alert.ts`, `settings.ts`, `README.md`) as a direct port of the design doc and the shell prototype, registered it in `.pi/settings.json`, and ran the built-in self-tests under `node --experimental-strip-types` before ever starting pi.

One self-test failed on the first run (debounce test), which exposed a real gap between the fake exec and `ensureAsset`'s post-create `fs.existsSync` check; the fix was to pre-seed a cached asset file in the async self-test rather than weaken the production check.

### Prompt Context

**User prompt (verbatim):** "test it with a test pi session in tmux, using a model like gpt-5.6-luna on low thinking for quick responses."

**Assistant interpretation:** Implement the extension per the design, then run a real pi session in tmux with model gpt-5.6-luna (low thinking) and verify turn_end events trigger busybar alerts.

**Inferred user intent:** Prove the design works end-to-end in a realistic session, not just on paper — quick model = quick turns = several alert opportunities.

**Commit (code):** N/A (not yet committed at diary time)

### What I did
- Wrote `extensions/busybar-alert/settings.ts` (schema + env fallbacks), `alert.ts` (exec-agnostic core: arg builders, ensureAsset cache, debounced runAlertCycle, self-tests), `index.ts` (registry registration, turn_end/agent_settled/session hooks, 4 actions, 4 slash commands, status widget, JSONL alert log at `~/.cache/pi-busybar-alert/alerts.jsonl`), `README.md`.
- Added `"../extensions/busybar-alert/index.ts"` to `.pi/settings.json`.
- Ran self-tests via `node --experimental-strip-types`: 3/4 passed initially.

### Why
- Keeping `alert.ts` free of pi imports (ExecFn injected) made the core testable under plain node, which caught the debounce bug before any pi session was started.

### What worked
- Self-tests caught a real test-harness gap (see below). After the fix: 4/4 PASS (arg construction, token omission, debounce skip, error containment).

### What didn't work
- First self-test run: `FAIL debounce skips rapid second alert — first=error ... calls=create`. Cause: the fake exec returns exit 0 for `busybar create` but cannot produce a real `.anim` file, so `ensureAsset`'s `fs.existsSync(anim)` post-check threw. Fixed by pre-seeding the cached asset in `runAsyncSelfTests` (test-harness fix; the production check stays).
- `node --experimental-strip-types` cannot resolve the repo's extensionless `../_shared/registry` import in `index.ts` — but the known-good `session-context` fails identically, confirming it is a node loader limitation, not a code bug. pi's own loader handles it.

### What I learned
- `pi.exec(command, args, { timeout })` returns `{ stdout, stderr, code, killed }`; `killed: true` is the timeout signal and maps cleanly to "device unreachable".
- A JSONL alert log (`alerts.jsonl`) is the single most useful observability feature for this kind of extension: it made the tmux test trivially verifiable without watching the physical device.

### What was tricky to build
- Releasing the `inFlight` lock only after the delayed `clear` finishes (in the `setTimeout(...).finally`) rather than after `show`: early release would let a fast second turn start a second `show` while the first animation is still on screen, double-drawing under one application name.

### What warrants a second pair of eyes
- `prepare-assets` action deletes the whole cache dir with `fs.rmSync(..., { recursive: true })` — fine for a derived-artifact cache, but worth a glance.
- Settings are in-memory only (not persisted across pi restarts). If the user wants persistence, that is a follow-up using the same load/onApply hooks plus a JSON file.

### What should be done in the future
- Persist settings; consider back-display text alerts with turn metadata; commit the extension.

### Code review instructions
- Start at `extensions/busybar-alert/index.ts` (wiring), then `alert.ts` (logic), then `settings.ts` (schema). Validate with `/busybar-alert-self-test` inside pi, or `node --experimental-strip-types` against `alert.ts` as shown in the diary.

### Technical details
- `runAlertCycle(exec, settings, state, cacheDir, reason, hooks)` never throws; outcomes are `"fired" | "skipped" | "error"` plus stats and JSONL log entries.
- Asset cache path pattern: `~/.cache/pi-busybar-alert/alert_<display>_<pattern>.anim`.

## Step 5: End-to-end test in tmux with real hardware

With the extension implemented, I ran the requested test: an interactive pi session in tmux (`bbtest`), model `openai-codex/gpt-5.6-luna` with `--thinking low`, in the pi-extensions repo so the project `.pi/settings.json` loaded the new extension, against the real BUSY Bar at 192.168.0.136.

The test passed completely: the status bar showed `busybar:on` at startup, a one-prompt session produced a `fired` alert on turn 0 and a correctly debounced `skipped` on turn 1, and a manual `/busybar-alert-test` produced a third `fired` entry with a confirmation notification.

### Prompt Context

**User prompt (verbatim):** (same as Step 4) plus "use 192.168.0.136"

**Assistant interpretation:** Run the tmux test against the real device at 192.168.0.136 (the earlier "unreachable" claim was about the CLI default 10.0.4.20; the user confirmed the LAN address).

**Inferred user intent:** Verify the physical alert actually fires on their desk dock during a real agent session.

**Commit (code):** N/A

### What I did
- Resolved the model name: bare `gpt-5.6-luna` resolved to provider `azure-openai-responses` (no key); qualified `openai-codex/gpt-5.6-luna` uses the ChatGPT-backend OAuth credentials in `~/.pi/agent/auth.json` and works.
- `tmux new-session -d -s bbtest "BUSYBAR_ADDR=192.168.0.136 pi --model openai-codex/gpt-5.6-luna --thinking low"` in the repo.
- Sent one prompt that forces a bash tool call (guaranteeing ≥2 turns), waited, inspected `~/.cache/pi-busybar-alert/alerts.jsonl` and the pane.
- Ran `/busybar-alert-test` for the manual path, then killed the tmux session.

### Why
- tmux gives pi a real pty (the TUI requires it) while remaining scriptable via `send-keys`/`capture-pane`.

### What worked
- Everything: extension loaded with no errors; `busybar:on` in the status bar; alert log shows `{"outcome":"fired","reason":"turn 0"}` at 21:05:00, `{"outcome":"skipped","reason":"turn 1"}` at 21:05:02 (debounce, 2s window), and `{"outcome":"fired","reason":"manual test"}` at 21:05:33; the device at 192.168.0.136 accepted every `show`/`clear` (exit 0, no token needed).
- The first alert compiled the `.anim` on the fly via `ensureAsset` and cached it.

### What didn't work
- Bare `--model gpt-5.6-luna` (without provider prefix) fails with "No API key found for azure-openai-responses" — model-pattern resolution picked the wrong catalog entry. Workaround: always qualify `openai-codex/gpt-5.6-luna`.

### What I learned
- `models-store.json` under `~/.pi/agent/` is where the codex catalog models (gpt-5.6-luna/sol/terra) live; auth.json holds the OAuth creds. Provider-qualified model strings avoid ambiguous resolution.
- The device needs no token on this LAN (draw endpoints returned ok without `--token`).

### What was tricky to build
- Nothing new in this step; the earlier design decision to log every outcome as JSONL is what made verification a one-command check.

### What warrants a second pair of eyes
- The turn-0 alert fires while the very first turn of a session ends — some users may want to suppress alerting until after the first user prompt. Current behavior matches the spec ("when a turn finishes").

### What should be done in the future
- Commit the extension + ticket docs; upload the design bundle to reMarkable (Step 6); optionally add a `--session-name`-based quiet list.

### Code review instructions
- Reproduce: `BUSYBAR_ADDR=192.168.0.136 pi --model openai-codex/gpt-5.6-luna --thinking low` in this repo, send any prompt, then `cat ~/.cache/pi-busybar-alert/alerts.jsonl`.

### Technical details
- Evidence: `alerts.jsonl` entries quoted above; pane capture showed `Alert sent to 192.168.0.136 (app "pi-turn-alert", front, hold 3s)`.

## Step 6: reMarkable upload and commit

The final step closed out the ticket deliverables: the design doc and diary were uploaded to the reMarkable as a single bundled PDF, and the extension code plus ticket workspace were committed to git.

### Prompt Context

**User prompt (verbatim):** "continue"

**Assistant interpretation:** Finish the remaining next steps from the previous turn's summary: commit the extension + ticket docs (settings persistence was explicitly optional and is left as follow-up).

**Inferred user intent:** Leave the repo in a clean, committed state with the ticket fully recorded.

**Commit (code):** `aa787b2` — "Add busybar-alert extension: flash BUSY Bar on turn_end"

### What I did
- Uploaded `design-doc/01-...md` + `reference/01-diary.md` as one bundled PDF (ToC depth 2) via `remarquee upload bundle` → `/ai/2026/08/03/busybar-alert/PI-EXT-BUSYBAR-ALERT Design and Diary.pdf`.
- Checked off the last task (`87lm`), updated the changelog.
- `git add extensions/busybar-alert/ .pi/settings.json && git commit` → `aa787b2`.

### Why
- Bundling design doc + diary into one PDF keeps the reMarkable copy a single readable document; committing code separately from docs keeps the code commit focused.

### What worked
- Upload succeeded on the first call (`OK: uploaded ... -> /ai/2026/08/03/busybar-alert`), no auth issues.

### What didn't work
- N/A.

### What I learned
- N/A.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- The committed `.pi/settings.json` now loads `busybar-alert` for every pi session in this repo; if the bar is off-network, alerts fail silently after one warning — intended behavior, but noticeable in the status bar (`busybar:unreachable`).

### What should be done in the future
- Settings persistence across restarts; optional `agent_settled` default for users who find per-turn alerts too chatty; suppress alerts for sessions on machines without a bar.

### Code review instructions
- `git show aa787b2 --stat`; logic review starts in `extensions/busybar-alert/alert.ts`.

### Technical details
- Commit: `aa787b2` (5 files, +776/-1). reMarkable path: `/ai/2026/08/03/busybar-alert`.
