# AGENTS.md

Guidance for AI coding agents working in this repository.

## Docs

Concise implementation guides live in `docs/`:

- **Extension framework** → [`docs/pi-shared-extension-framework-guide.md`](docs/pi-shared-extension-framework-guide.md) — `registerPiExtension()`, actions, docs, settings, widgets, the shared registry, and the launcher/dashboard integration pattern. Read this before writing or refactoring any extension.
- **TUI authoring** → [`docs/pi-tui-ui-authoring-guide.md`](docs/pi-tui-ui-authoring-guide.md) — `@mariozechner/pi-tui` component contract, widget hierarchy, keyboard input, theming, and mapping declarative layouts to TypeScript. Read this before adding any UI to an extension.
- **Compaction** → [`docs/pi-compaction-textbook.md`](docs/pi-compaction-textbook.md) — how Pi compaction works, settings, intercepting compaction events, and building compaction-aware extensions. Read this before modifying `compaction-meter`, `compaction-title`, or `selective-compaction`.

## Conventions

- All extensions live under `extensions/`. No top-level extension directories.
- Every extension calls `registerPiExtension()` from `extensions/_shared/registry.ts` — no exceptions.
- Shared UI components (action picker, dashboard overlay, doc viewer, settings view) live under `extensions/_shared/ui/`.
- Doc paths in `registerPiExtension({ docs: [...] })` must be relative (e.g. `"extensions/foo/README.md"`), never absolute.
- Ticket workspaces live under `ttmp/` (managed by `docmgr`).

## Directory layout

```
extensions/
  _shared/          # registry, dashboard, UI components
  agent-env/        # direnv/env injection before bash calls
  compaction-meter/ # context-remaining status bar widget
  compaction-title/ # compact() + auto-title
  direnv-bash/      # direnv .envrc injection
  docmgr/           # docmgr ticket browser in Pi
  kanban-demo/      # TUI Kanban demo
  launcher/         # extension launcher + action picker
  pinned-skills/    # pinned skills loader
  response-capture/ # capture assistant responses to docmgr
  selective-compaction/ # user-selected range compaction
  session-summary/  # mandatory <summary> block enforcement
  session-tagger/   # tag moments for later analysis/forking
  tui-showcase/     # grab-bag TUI pattern demo
```
