---
Title: Pi docmgr extension implementation guide
Ticket: PI-EXT-DOCMGR
Status: active
Topics:
    - tooling
    - documentation
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.pi/agent/skills/docmgr/SKILL.md
      Note: Workflow commands and ticket/document/task operations referenced by the implementation guide
    - Path: ../../../../../../../../../.pi/agent/skills/remarkable-upload/SKILL.md
      Note: Upload workflow for the final doc bundle to reMarkable
    - Path: extensions/docmgr/docmgr-cli.ts
      Note: CLI adapter validation commands and smoke tests
    - Path: extensions/docmgr/index.ts
      Note: Command handlers and refresh/status flow validated by the playbook
ExternalSources: []
Summary: Step-by-step implementation and validation guide for the docmgr Pi extension v1.
LastUpdated: 2026-04-25T10:29:57.01129208-04:00
WhatFor: ""
WhenToUse: ""
---



# Pi docmgr extension implementation guide

## Purpose

This playbook captures the first implementation pass for the docmgr Pi extension described in the design doc. It is intentionally operational: it tells you what to build, in what order, and how to validate it.

The goal is to keep the first slice small and reliable:

- status bar snapshot,
- ticket browser + close dialog,
- docs browser + preview,
- tasks browser + toggle.

## Environment Assumptions

- Pi is installed and can load a local extension from `~/.pi/agent/extensions/`.
- `docmgr` is installed and available on `PATH`.
- The docs root is the repository’s `ttmp/` directory.
- The ticket workspace exists in `ttmp/` and has the expected `index.md`, `tasks.md`, and `changelog.md` files.
- The extension will use a directory layout (`extensions/docmgr/index.ts`) so helper modules can be imported relatively.

## Commands

### 1) Confirm the docmgr workspace

```bash
docmgr status --summary-only
docmgr ticket tickets --status active
docmgr doc list --ticket PI-EXT-DOCMGR
docmgr task list --ticket PI-EXT-DOCMGR
```

Expected result:
- a valid root path,
- non-zero ticket list when the workspace has content,
- doc/task listings that match the ticket workspace.

### 2) Scaffold the extension directory

```bash
mkdir -p extensions/docmgr/ui
cat > extensions/docmgr/index.ts <<'EOF'
// extension entrypoint
EOF
ln -sfn "$PWD/extensions/docmgr" ~/.pi/agent/extensions/docmgr
```

Expected result:
- Pi loads `~/.pi/agent/extensions/docmgr/index.ts`,
- helper modules resolve from the directory.

### 3) Implement the shared docmgr runner

Create `extensions/docmgr/docmgr-cli.ts` with a tiny wrapper that:

- spawns `docmgr` via `execFile`,
- passes structured-output flags when the subcommand supports them,
- returns parsed JSON objects for ticket/doc/task snapshots,
- falls back to plain text only when the command has no machine-readable form.

Recommended commands to support first:

```bash
docmgr status --summary-only
docmgr ticket tickets --with-glaze-output --output json
docmgr doc list --with-glaze-output --output json
docmgr task list --with-glaze-output --output json
```

### 4) Implement the status bar

Hook the status bar to a snapshot object with:

- root path,
- open ticket count,
- last manipulated ticket (if present).

Refresh it on:

- `session_start`,
- successful ticket/doc/task operations,
- explicit refresh commands.

### 5) Implement the ticket browser and close dialog

Start with a simple list + confirm flow:

1. show active tickets,
2. select one,
3. press `c` to open the close dialog,
4. confirm the action,
5. call `docmgr ticket close`.

Recommended default close command:

```bash
docmgr ticket close --ticket PI-EXT-DOCMGR --status complete --changelog-entry "Ticket closed from Pi"
```

If you need to support a custom note, collect it in a second step rather than building a full form immediately.

### 6) Implement the docs browser

Load docs with `docmgr doc list`, then read the selected markdown file and render it in a preview pane.

Suggested behavior:
- left pane: doc list,
- right pane: preview,
- enter: open preview,
- r: refresh.

### 7) Implement the tasks browser

Load tasks with `docmgr task list`, show checkbox state, and map space/enter to toggle.

After a successful toggle:
- refresh the task list,
- refresh the status bar,
- append a custom session entry recording the action.

### 8) Validate

```bash
docmgr doctor --ticket PI-EXT-DOCMGR --stale-after 30
pi -e ~/.pi/agent/extensions/docmgr
```

Manual checks:
- status bar shows the configured root,
- open ticket count updates,
- last manipulated ticket updates after close/toggle operations,
- ticket list opens and closes cleanly,
- doc preview matches the file,
- task toggles persist in `tasks.md`.

## Exit Criteria

The implementation pass is complete when all of the following are true:

- the footer/status bar renders without wrapping,
- ticket list + close dialog work,
- doc list + preview work,
- task list + toggle work,
- the extension remembers the last manipulated ticket in session metadata,
- `docmgr doctor` passes for the ticket workspace,
- the design doc and playbook are uploaded to reMarkable.

## Smoke Test Checklist

Use this quick pass after code changes:

```bash
cd /home/manuel/code/wesen/2026-04-21--pi-extensions

docmgr status --summary-only
docmgr ticket tickets --ticket PI-EXT-DOCMGR --with-glaze-output --output json
docmgr doc list --ticket PI-EXT-DOCMGR --with-glaze-output --output json
docmgr task list --ticket PI-EXT-DOCMGR --with-glaze-output --output json
PI_OFFLINE=1 pi -e /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/docmgr/index.ts --list-models
```

Then open Pi interactively and verify the extension-specific commands:

- `/docmgr-refresh` updates the footer to show the configured root and ticket count.
- `/docmgr-debug` shows a diagnostics widget below the editor, and saves raw probe snapshots to `/tmp/docmgr-debug-*.txt` for comparison.
- `/docmgr-tickets` opens the ticket browser.
- `/docmgr-docs` opens the docs browser for the active ticket.
- `/docmgr-tasks` opens the task browser.
- `/docmgr-close` walks the close flow and updates the last manipulated ticket.

The first tmux smoke test that mattered here was reproducing the `getMarkdownTheme` import bug and confirming the extension still loads after the fix.

## Notes

- Prefer structured output over brittle text scraping.
- Keep the first close dialog simple; default values are fine for v1.
- If a screen can be width-clamped rather than scrollable, clamp it.
- Future phases can add import, search, and richer editing flows, but do not block v1 on them.
