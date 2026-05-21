---
Title: Diary
Type: reference
Topics: pi-extension, response, viewer, markdown
Status: active
Intent: long-term
---

# Diary

## Goal

Build a Pi extension (`response-viewer`) that captures all assistant responses from a session, lets the user browse them in a TUI picker, and opens any selected response with `md-view view` for comfortable browser-based reading.

## Step 1: Scaffold extension with capture, save-to-temp, and md-view open

Created `extensions/response-viewer/` with two files: `response.ts` (capture logic, temp file management, md-view invocation) and `index.ts` (registration, turn_end handler, commands). Initially designed to track only the last response with a single `/rv` command.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to create a pi-extension that saves the last model response as a temporary markdown file and opens it with `md-view view XXX.md` so that I can read it in a nicer environment. Create an analysis and implementation guide, then a series of tasks in the ticket, then implement task by task, committing at appropriate intervals, keep a diary."

**Assistant interpretation:** Create a docmgr ticket, write analysis + tasks, then implement a Pi extension that captures the last assistant response and opens it via md-view.

**Inferred user intent:** A quick way to pop out Pi's long responses into a browser for comfortable reading.

**Commit (code):** 1247f6c — "feat(response-viewer): scaffold extension with capture, save-to-temp, and md-view open"

### What I did
- Created docmgr ticket `response-viewer` with analysis doc and 6 tasks
- Studied existing `response-capture` and `markdown-recent-viewer` extensions for patterns
- Wrote `response.ts` with CapturedResponse type, extractAssistantText, captureResponse, saveToTempFile (writes last-response.md + timestamped copy), openWithMdView (calls pi.exec), previewResponse
- Wrote `index.ts` with registerPiExtension, turn_end listener, /rv and /response-view commands

### Why
- Needed to understand Pi's extension API (types.d.ts) and the shared framework before implementing
- Followed existing patterns from response-capture (turn_end + extractAssistantText) and markdown-recent-viewer (pi.exec for md-view)

### What worked
- Extension loaded without errors (pi --list-models check passed)
- Clean separation of capture logic (response.ts) from registration (index.ts)

### What didn't work
- N/A — straightforward scaffold

### What I learned
- Pi's turn_end event provides the full assistant message after streaming completes
- pi.exec() runs child processes with configurable timeout — 15s is the established pattern
- md-view auto-starts its daemon if not running, so no explicit daemon management needed

### What was tricky to build
- Deciding where to save temp files: chose $TMPDIR/pi-response-viewer/ over .pi/response-capture/ to keep throwaway viewing separate from persistent captures

### What warrants a second pair of eyes
- The `last-response.md` overwrite strategy — md-view live-reload works with this pattern, but if the user opens multiple different responses in quick succession, the same file gets overwritten. The timestamped copies provide history.

### What should be done in the future
- Consider a "clear temp files" action
- Consider integration with response-capture (e.g. "save to docmgr" from the picker)

### Code review instructions
- Start with `extensions/response-viewer/response.ts` — review captureResponse, saveToTempFile, openWithMdView
- Then `extensions/response-viewer/index.ts` — review turn_end handler and command registrations
- Validate: `timeout 20 pi --list-models`

## Step 2: Add response picker, settings, and dashboard widget

User requested ability to scroll through all previous assistant responses and choose which one to open. Redesigned to accumulate all responses in state, added a TUI picker component, schema settings, and a status bar widget.

### Prompt Context

**User prompt (verbatim):** "In fact, allow me to scroll the previous final assistant turn responses, so I can choose which one to open"

**Assistant interpretation:** Add a scrollable picker UI showing all captured assistant responses, not just the last one. The user wants to browse and select.

**Inferred user intent:** Browse all responses from the session, pick any one to open in md-view. This is a significant UX upgrade over "just open the last one."

**Commit (code):** 00d8aae — "feat(response-viewer): add response picker, settings, dashboard widget"

### What I did
- Rewrote `response.ts` to use `responses: CapturedResponse[]` instead of `lastResponse`, added `lastResponse()` helper, `formatStatusShort()`, deduplication by turnIndex
- Created `ui.ts` with `ResponsePicker` TUI component (scrollable list, search, shows turn/time/chars/model/preview)
- Rewrote `index.ts` with picker flow: `/rv` opens picker, `/rv-last` opens most recent directly
- Added schema settings (openDark, noReload, autoOpen, browser)
- Added status bar widget

### Why
- A picker is the natural UX for "choose from a list" — follows the markdown-recent-viewer pattern exactly
- Accumulating all responses means the user can go back to any earlier turn
- Deduplication by turnIndex handles tree navigation (where the same turn index may be seen again)

### What worked
- The ResponsePicker component follows the established pattern from markdown-recent-viewer closely
- Showing most recent first is the natural ordering
- Search filters by response text, model name, and turn number

### What didn't work
- N/A — clean implementation following established patterns

### What I learned
- The `ctx.ui.custom<T>()` API requires a factory that returns a Component, with overlay options for positioning
- Deduplication by turnIndex is needed because `turn_end` fires for each branch point during tree navigation
- The picker should show reversed (most recent first) while the state stores chronological order

### What was tricky to build
- Getting the picker right: the modal border pattern (╭─╮│╰╯) requires careful width calculation with visibleWidth() for CJK/emoji safety
- The `saveAndOpenResponse` helper needs to update both `lastSavedPath` and `lastSavedTurnIndex` for the status bar to correctly show "saved" vs "unsaved"

### What warrants a second pair of eyes
- The `reversed = [...responses].reverse()` in openPicker creates a new array each time the picker opens — this is fine for the expected number of responses (typically < 100 per session), but if sessions grow very long, consider lazy reversal
- The `existing >= 0` deduplication check in the turn_end handler: if turnIndex is reused across different branches (not just tree navigation), this could overwrite data. Pi's turn indices are monotonically increasing within a session, so this should be safe.

### What should be done in the future
- Add keyboard shortcut for quick "open last response" (e.g. Ctrl+R or similar)
- Consider adding a "copy path" action in the picker for piping to other tools
- Consider preview pane in the picker showing more of the selected response

### Code review instructions
- Start with `extensions/response-viewer/ui.ts` — review ResponsePicker class, especially handleInput, render, filtered
- Then `extensions/response-viewer/response.ts` — review the state accumulation and formatStatusShort
- Then `extensions/response-viewer/index.ts` — review openPicker flow, turn_end handler, settings
- Validate: `timeout 20 pi --list-models`, then interactively: `/reload` + `/rv`

## Step 3: Add README, cleanup, and validate

Wrote user-facing docs, cleaned up unused exports, validated load.

**Commit (code):** 5384d4d — "docs(response-viewer): add README", 3c0d7e5 — "chore(response-viewer): remove unused responseByTurn"

### What I did
- Created README.md with full documentation (commands, picker keys, settings, how it works)
- Removed unused `responseByTurn` export
- Validated with `pi --list-models`
- Committed docmgr ticket files

### What should be done in the future
- N/A

## Step 4: Fix — read responses from session history instead of in-memory accumulator

The user pointed out that responses disappear after `/reload` because the `turn_end` accumulator pattern stores data in a JS array that gets wiped when extensions reload. The fix: read from `ctx.sessionManager.getBranch()` directly, which has the full session timeline.

### Prompt Context

**User prompt (verbatim):** "aren't we using the session timeline to get the last responses? why would they be gone after /reload?"

**Assistant interpretation:** The in-memory accumulator is wrong — we should read from the session history like markdown-recent-viewer does.

**Inferred user intent:** Responses should survive /reload and be available from before the extension was loaded.

**Commit (code):** e359eae — "fix(response-viewer): read responses from session history instead of in-memory accumulator"

### What I did
- Replaced `state.responses` accumulator with `getResponsesFromSession(ctx)` that reads `ctx.sessionManager.getBranch()`
- `CapturedResponse` now includes `entryId` from the session entry
- Removed `state.responses` array entirely; state only tracks `lastSavedPath` and `lastSavedTurnIndex`
- `formatStatusShort()` reads from session history too
- `turn_end` handler kept only for the `autoOpen` feature
- Tested in tmux: `/rv` picker showed all 5 responses from the session (including pre-reload ones), `Enter` opened in md-view, `/rv-preview` and `/rv-reopen` work

### Why
- Session history is the authoritative source — it survives /reload, persists across extension loads, and requires zero state management
- The `markdown-recent-viewer` extension already proved this pattern works

### What worked
- After `/reload`, the status bar immediately showed `rv:5turns/last:5/…` — all responses visible
- The picker rendered correctly with all 5 responses (most recent first)
- `Enter` on the selected response saved to `/tmp/pi-response-viewer/last-response.md` and opened with md-view
- `/rv-preview` showed the terminal preview correctly
- `/rv-reopen` re-opened the last saved file

### What didn't work
- Arrow keys in the tmux picker didn't seem to register (tmux warning: `extended-keys is off`), but this is a tmux configuration issue, not an extension bug
- `/px` was sent to the LLM instead of being parsed as a slash command (possibly timing issue with tmux)

### What I learned
- Always prefer reading from `sessionManager.getBranch()` over accumulating state in memory — it's the canonical source and survives extension lifecycle events
- The `getBranch()` returns `SessionEntry[]` where type `"message"` entries have `message: AgentMessage` with `role`, `content`, etc.

### What was tricky to build
- The `extractTextFromContent` function needs to handle `content` blocks generically (using `as any`) because the session entry message type is `AgentMessage` not the more specific `AssistantMessage` from the turn_end event

### What warrants a second pair of eyes
- The `getResponsesFromSession` function iterates all entries and filters for `role === "assistant"` with text content. If a session has very many entries, this could be slow. Consider caching the result and invalidating on session change events.
- The `formatStatusShort` in the widget render callback calls `getResponsesFromSession` on every render — this is a potential perf concern per the framework guide's "keep render cheap" rule. Should cache the response count.

### What should be done in the future
- Cache the response count in the widget (invalidate on turn_end or message_end events)
- Add keyboard shortcut for quick open-last
