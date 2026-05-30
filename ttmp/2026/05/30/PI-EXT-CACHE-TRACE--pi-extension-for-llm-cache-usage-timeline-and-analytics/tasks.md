# Tasks

## TODO

- [ ] Review whether visible cache trace cards should remain custom messages or move to a non-context transcript surface if Pi adds one.
- [ ] Consider provider-specific header parsers for cache/debug headers when available.

## Done

- [x] Run a live-model tmux smoke test that completes two prompts and verifies timeline cards plus modal records after real LLM calls.
- [x] Fix timeline-card feedback turns by deferring `pi.sendMessage()` until `ctx.isIdle()` is true.
- [x] Run an interactive tmux smoke test that opens `/cache-trace` and verifies the modal renders in a real Pi TUI session.
- [x] Create docmgr ticket workspace and primary design/diary documents.
- [x] Investigate extension framework, TUI, session, lifecycle hook, and usage accounting references.
- [x] Write the intern-oriented design and implementation guide.
- [x] Implement `extensions/cache-trace` with lifecycle hooks, timeline cards, status widget, commands, palette actions, persisted custom entries, and ASCII plots.
- [x] Run extension load checks with `pi -e ./extensions/cache-trace --list-models` and all-extension `pi --list-models`.
