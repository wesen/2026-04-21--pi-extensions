# Tasks

## Completed design/delivery work

- [x] Map current shared launcher, docs, actions, palette, and prompto flows
- [x] Write intern-ready design and implementation guide
- [x] Validate ticket docs and upload final bundle to reMarkable

## Phase 0: Commit existing prompto work

- [x] Review prompto picker/template changes before staging
- [x] Run extension load validation with `timeout 20 pi --list-models`
- [x] Commit prompto picker and prompt templates separately from EXTENSION-UX docs
- [x] Record the prompto commit hash in the diary and changelog

## Phase 1: Launcher state restoration and wraparound navigation

- [x] Add `ExtensionLauncherState` to `extensions/_shared/ui/extension-launcher.ts`
- [x] Add optional `initialState` to `ExtensionLauncherOptions`
- [x] Hydrate launcher state from `initialState` in the constructor
- [x] Add a `snapshot()` helper that captures query/search/cursor/list-scroll/details-scroll
- [x] Include state snapshots in launcher results for select/actions/docs/settings/dashboard/palette
- [x] Thread saved state through `openLauncher(ctx, initialState?)` in `extensions/launcher/index.ts`
- [x] Reopen launcher after docs/actions/settings with the previous selection and search restored
- [x] Change extension list arrow movement to wrap from top to bottom and bottom to top
- [x] Reset right-pane scroll when selected extension or query changes
- [ ] Validate `/px` docs-back behavior and list wraparound manually
- [x] Commit Phase 1 implementation
- [x] Update diary/changelog for Phase 1

## Phase 2: Shared fuzzy search behavior

- [x] Replace `scoreExtension()` with chunk/token matching using `fuzzyMatch()`
- [x] Include extension id/name/description/commands/tags in search chunks
- [x] Include action id/title/description/tags in search chunks
- [x] Include doc id/title/description/tags in search chunks
- [x] Include palette item id/title/description/tags recursively in search chunks
- [x] Require every query token to match at least one meaningful chunk
- [x] Sort fuzzy results by score, then extension name
- [ ] Verify `/` search for `prompto`, `prompt template`, and nonsense terms
- [x] Commit Phase 2 implementation
- [x] Update diary/changelog for Phase 2

## Phase 3: Scrollable launcher details pane and dynamic overlay height

- [x] Add `detailsScroll` state to `ExtensionLauncher`
- [x] Split details rendering into `buildDetailsLines()` and scroll-window rendering
- [x] Add modified-arrow or fallback-key handlers for right-pane scrolling
- [x] Clamp details scroll during render based on actual detail line count
- [x] Add visible scroll range hints for the right details pane
- [x] Add a terminal-row helper for dynamic body row calculation
- [x] Replace fixed launcher `bodyRows = 16` with a dynamic clamp
- [x] Increase launcher overlay max height in `extensions/launcher/index.ts`
- [x] Replace fixed doc viewer `bodyRows = 18` with a dynamic clamp
- [x] Update help/footer text to advertise list vs details scroll keys
- [ ] Manually validate long extension details and prompto docs scrolling
- [x] Commit Phase 3 implementation
- [x] Update diary/changelog for Phase 3

## Phase 4: Prompto shortcut and paste insertion workflow

- [x] Add `RunPromptoOptions` to `extensions/prompto/run.ts`
- [x] Support `replace-editor`, `paste-editor`, and `send` output modes
- [x] Keep `/prompto` default behavior backward-compatible
- [x] Add a prompto shortcut with `pi.registerShortcut()` in `extensions/prompto/index.ts`
- [x] Wire shortcut to prompto picker using paste insertion
- [x] Add a visible action/palette item for paste insertion if useful
- [x] Update prompto docs/help text for replacement vs paste behavior
- [ ] Validate shortcut insertion with existing editor text
- [x] Commit Phase 4 implementation
- [x] Update diary/changelog for Phase 4

## Final validation and delivery

- [x] Run `timeout 20 pi --list-models`
- [x] Run `docmgr doctor --ticket EXTENSION-UX --stale-after 30`
- [x] Upload the updated ticket bundle to reMarkable after implementation
- [ ] Commit final docmgr updates
