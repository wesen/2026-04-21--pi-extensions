---
Title: Tasks
Type: tasks
Topics: pi-extension, response, viewer, markdown
Status: active
Intent: long-term
---

# Tasks

## Task 1: Scaffold extension directory and create response.ts

Create `extensions/response-viewer/` with `response.ts` containing:
- `CapturedResponse` type (turnIndex, capturedAt, sessionId, modelProvider, modelId, modelName, text)
- `ResponseViewerState` type (lastResponse, lastSavedPath, autoOpen)
- `createState()` factory
- `extractAssistantText()` — extract text blocks from AssistantMessage
- `captureResponse()` — build CapturedResponse from turn_end event
- `ensureTempDir()` — create `$TMPDIR/pi-response-viewer/` if needed
- `saveToTempFile()` — write markdown with YAML frontmatter to `last-response.md` + timestamped copy
- `openWithMdView()` — call `pi.exec("md-view", ["view", path, ...opts])`

## Task 2: Create index.ts with registration, event handler, commands, and actions

Create `extensions/response-viewer/index.ts`:
- `registerPiExtension()` with id `response-viewer`, actions, docs
- `pi.on("turn_end")` to capture assistant responses
- `pi.registerCommand("rv")` — save and open
- `pi.registerCommand("response-view")` — alias
- `pi.registerCommand("rv-preview")` — preview in terminal

## Task 3: Add schema settings (openDark, noReload, autoOpen, browser)

Add `settings: { kind: "schema", ... }` to the registration:
- openDark (boolean, default false)
- noReload (boolean, default false)
- autoOpen (boolean, default false)
- browser (string, default "")

Wire settings to the `openWithMdView()` call.

## Task 4: Add dashboard widget and status bar

Add a status bar widget showing last response state:
- Short variant: `rv:turn:N/chars:NNN`
- Compact variant: multi-line with model, turn, char count, saved path

## Task 5: Create README.md with usage docs

Write user-facing documentation explaining:
- What the extension does
- Commands: /rv, /response-view, /rv-preview
- Settings
- How it works with md-view

## Task 6: Validate and commit

- Run `timeout 20 pi --list-models`
- Manual smoke test plan
- Final commit
- [x] Task 3: Add schema settings (openDark, noReload, autoOpen, browser)
- [x] Task 4: Add dashboard widget and status bar
- [x] Task 6: Validate and final commit
- [x] Task 1: Scaffold extension directory and create response.ts with capture/save/open logic
- [x] Task 2: Create index.ts with registration, event handler, commands, and actions
- [x] Task 5: Create README.md with usage docs
