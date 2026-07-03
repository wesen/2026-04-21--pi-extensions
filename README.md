# Pi Extensions

A source-controlled collection of local [Pi coding agent](https://github.com/badlogic/pi-mono) extensions, plus the shared framework and documentation we use to build them consistently.

This repository is about making Pi extensions feel like one cohesive product instead of a pile of unrelated slash commands. Extensions live under `extensions/`, register through the shared framework, and can contribute launcher actions, docs, settings, dashboard widgets, commands, and LLM-callable tools.

## What is here

```text
extensions/
  _shared/                    # Shared registry, launcher/dashboard UI, common framework pieces
  agent-env/                  # Inject PI_AGENT_* context into shell executions
  command-palette/            # Keyboard-driven palette for extension actions
  compaction-meter/           # Context remaining/status widgets
  compaction-title/           # compact() + automatic session title generation
  direnv-bash/                # direnv-aware bash/user shell execution
  image-qa/                   # ask_questions_about_images tool via pinocchio
  kagi-web-search/            # kagi_web_search tool via surf
  launcher/                   # /px shared extension launcher
  markdown-recent-viewer/     # Session edit/write Markdown picker + md-view
  pinned-skills/              # Persistent pinned skill prompt injection
  prompto/                    # Prompt template picker/forms/plugins
  response-viewer/            # Browse and open assistant responses with md-view
  selective-compaction/       # User-selected range compaction
  session-search/             # Search session history and fork from matches
  session-summary/            # Mandatory <summary> block enforcement/widget
  session-tagger/             # Tag moments in session history

docs/
  pi-shared-extension-framework-guide.md  # How to write extensions in this repo
  pi-tui-ui-authoring-guide.md            # How to build Pi TUI components
  pi-testing-guide.md                     # Load checks and tmux smoke tests
  pi-compaction-textbook.md               # Compaction concepts and extension patterns

ttmp/                         # docmgr ticket workspaces and implementation diaries
```

## Shared framework

Every extension in this repo should call `registerPiExtension()` from `extensions/_shared/registry.ts`.

The shared framework lets an extension declare its contributions in a common shape:

- **metadata** — stable id, name, description, tags
- **actions** — user-facing verbs surfaced in `/px`
- **docs** — README/help pages opened from the launcher
- **settings** — schema or custom settings UI
- **widgets** — dashboard/status widgets
- **commands** — compatibility slash commands

The launcher and dashboard discover these contributions from the shared registry. Direct slash commands are still useful, but they should not be the only way to discover or use an extension.

Start here before adding or refactoring an extension:

- [`docs/pi-shared-extension-framework-guide.md`](docs/pi-shared-extension-framework-guide.md)
- [`docs/pi-tui-ui-authoring-guide.md`](docs/pi-tui-ui-authoring-guide.md) when building custom TUI
- [`docs/pi-testing-guide.md`](docs/pi-testing-guide.md) before validating or smoke-testing
- [`docs/pi-compaction-textbook.md`](docs/pi-compaction-textbook.md) before changing compaction-related extensions

## Current extensions

| Extension | Purpose | Main files |
|-----------|---------|------------|
| `launcher` | Provides `/px`, the shared extension launcher/dashboard entry point. | [`extensions/launcher/index.ts`](extensions/launcher/index.ts) |
| `_shared` | Registry, launcher UI, docs/settings UI, dashboard integration. | [`extensions/_shared/`](extensions/_shared/) |
| `agent-env` | Injects Pi session metadata (`PI_AGENT_*`) into bash/user shell executions. | [`extensions/agent-env/index.ts`](extensions/agent-env/index.ts), [`README`](extensions/agent-env/README.md) |
| `command-palette` | Provides a keyboard-driven palette for registered extension actions. | [`extensions/command-palette/index.ts`](extensions/command-palette/index.ts) |
| `direnv-bash` | Loads allowed `direnv` environments before bash/user shell commands. | [`extensions/direnv-bash/index.ts`](extensions/direnv-bash/index.ts), [`README`](extensions/direnv-bash/README.md) |
| `pinned-skills` | Keeps selected skill instructions loaded in prompt context. | [`extensions/pinned-skills/index.ts`](extensions/pinned-skills/index.ts), [`README`](extensions/pinned-skills/README.md) |
| `prompto` | Expands prompt templates through picker/forms/plugins. | [`extensions/prompto/index.ts`](extensions/prompto/index.ts), [`README`](extensions/prompto/README.md) |
| `response-viewer` | Browses assistant responses and opens them with md-view. | [`extensions/response-viewer/index.ts`](extensions/response-viewer/index.ts), [`README`](extensions/response-viewer/README.md) |
| `session-search` | Searches session history and navigates/forks from matches. | [`extensions/session-search/index.ts`](extensions/session-search/index.ts), [`README`](extensions/session-search/README.md) |
| `session-summary` | Enforces final `<summary>...</summary>` blocks and displays compact summaries. | [`extensions/session-summary/index.ts`](extensions/session-summary/index.ts) |
| `session-tagger` | Tags important session moments for later analysis/forking. | [`extensions/session-tagger/index.ts`](extensions/session-tagger/index.ts) |
| `compaction-meter` | Shows context/compaction status in Pi. | [`extensions/compaction-meter/index.ts`](extensions/compaction-meter/index.ts), [`README`](extensions/compaction-meter/README.md) |
| `compaction-title` | Runs compaction/title generation and stores session titles. | [`extensions/compaction-title/index.ts`](extensions/compaction-title/index.ts), [`README`](extensions/compaction-title/README.md) |
| `selective-compaction` | Lets the user compact a selected range instead of the whole branch. | [`extensions/selective-compaction/index.ts`](extensions/selective-compaction/index.ts), [`README`](extensions/selective-compaction/README.md) |
| `image-qa` | Adds `ask_questions_about_images` backed by `pinocchio code professional --images`. | [`extensions/image-qa/index.ts`](extensions/image-qa/index.ts), [`README`](extensions/image-qa/README.md) |
| `kagi-web-search` | Adds `kagi_web_search` backed by `surf kagi search --query`. | [`extensions/kagi-web-search/index.ts`](extensions/kagi-web-search/index.ts), [`README`](extensions/kagi-web-search/README.md) |
| `markdown-recent-viewer` | Lists Markdown files touched by session `edit`/`write` tool calls and opens them with `md-view view`. | [`extensions/markdown-recent-viewer/index.ts`](extensions/markdown-recent-viewer/index.ts), [`README`](extensions/markdown-recent-viewer/README.md) |

## Installing local extensions

Pi loads local extensions from `~/.pi/agent/extensions/`. For development, symlink repo directories into that folder:

```bash
mkdir -p ~/.pi/agent/extensions
ln -s "$PWD/extensions/launcher" ~/.pi/agent/extensions/launcher
ln -s "$PWD/extensions/_shared" ~/.pi/agent/extensions/_shared
ln -s "$PWD/extensions/image-qa" ~/.pi/agent/extensions/image-qa
```

Most extensions in this repo are developed this way. After adding or changing symlinks, start a fresh Pi session or run `/reload` inside Pi.

## Creating a new extension

1. Read [`docs/pi-shared-extension-framework-guide.md`](docs/pi-shared-extension-framework-guide.md).
2. Create a directory under `extensions/<extension-id>/`.
3. Register through the shared framework:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerPiExtension } from "../_shared/registry";

export default function myExtension(pi: ExtensionAPI): void {
  registerPiExtension({
    id: "my-extension",
    name: "My Extension",
    description: "What this extension does.",
    commands: ["my-extension"],
    tags: ["demo"],
    run: async (ctx) => ctx.ui.notify("My Extension is installed.", "info"),
    docs: [{ id: "overview", title: "Overview", path: "extensions/my-extension/README.md" }],
  });

  pi.registerCommand("my-extension", {
    description: "Show extension status",
    handler: async (_args, ctx) => ctx.ui.notify("My Extension is installed.", "info"),
  });
}
```

4. Add `README.md` for user-facing docs.
5. Add settings/actions/widgets/tools only as needed.
6. Validate and smoke test.

## Testing and smoke tests

Quick load check:

```bash
timeout 20 pi --list-models
```

This catches extension import/registration errors without starting an interactive session.

For interactive validation, use tmux as described in [`docs/pi-testing-guide.md`](docs/pi-testing-guide.md):

```bash
SESSION="pi-smoke"
tmux new-session -d -s "$SESSION" -x 120 -y 40
tmux send-keys -t "$SESSION" "pi" Enter
sleep 5
tmux capture-pane -t "$SESSION" -p -S -80 | grep "your-extension-id"
```

A complete handoff should usually verify:

- `timeout 20 pi --list-models` passes
- extension appears in startup `[Extensions]`
- `/px` can discover the extension
- extension default action works
- direct slash commands work
- docs/settings open if registered
- tools execute end-to-end if the extension registers tools

## Docmgr workflow

Non-trivial extension work should have a docmgr ticket under `ttmp/` with:

- design doc
- diary/reference doc
- task list
- changelog
- related files

Useful commands:

```bash
docmgr ticket create-ticket --ticket TICKET-ID --title "Short title" --topics pi-extension,tools
docmgr doc add --ticket TICKET-ID --doc-type design --title "Extension Design"
docmgr doc add --ticket TICKET-ID --doc-type reference --title "Diary"
docmgr task add --ticket TICKET-ID --text "Implement extension"
docmgr changelog update --ticket TICKET-ID --entry "What changed and why"
```

Implementation diaries should record what changed, why, what failed, what was tricky, and how to validate.

## Conventions

- All extensions live under `extensions/`.
- Every extension calls `registerPiExtension()` from `extensions/_shared/registry.ts`.
- Shared UI/framework code belongs under `extensions/_shared/`.
- Extension docs paths in `registerPiExtension({ docs: [...] })` are relative paths, never absolute paths.
- Prefer schema settings for simple booleans/numbers/strings.
- Use custom TUI components for pickers, dashboards, multi-step flows, and rich interaction.
- Keep dashboard render callbacks cheap; don't scan large directories in a widget render.
- Validate with `timeout 20 pi --list-models` before committing.
- Use tmux smoke tests for interactive commands, tools, and overlays.

## Further reading

- [`docs/pi-shared-extension-framework-guide.md`](docs/pi-shared-extension-framework-guide.md)
- [`docs/pi-tui-ui-authoring-guide.md`](docs/pi-tui-ui-authoring-guide.md)
- [`docs/pi-testing-guide.md`](docs/pi-testing-guide.md)
- [`docs/pi-compaction-textbook.md`](docs/pi-compaction-textbook.md)
