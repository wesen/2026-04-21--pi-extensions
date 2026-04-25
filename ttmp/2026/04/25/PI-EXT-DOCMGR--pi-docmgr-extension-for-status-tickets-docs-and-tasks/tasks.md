# Tasks

## Done

- [x] Create the PI-EXT-DOCMGR workspace
- [x] Draft the design doc with ASCII UI mockups
- [x] Draft the implementation guide
- [x] Draft the diary

## TODO

- [x] Implement the shared docmgr CLI adapter
- [x] Implement the status bar snapshot and refresh flow
- [x] Implement the ticket browser and close dialog
- [x] Implement the docs browser and preview pane
- [x] Implement the tasks browser and toggle flow
- [x] Validate the workspace with `docmgr doctor`
- [x] Upload the ticket docs to reMarkable
- [x] Create the extension skeleton under extensions/docmgr/ with a directory entrypoint, module split, and reload-safe startup hook
- [x] Build a shared docmgr CLI adapter that runs status, ticket list, doc list, and task list with structured output first and text parsing only as fallback
- [x] Define a workspace snapshot model that tracks configured root, open ticket count, current filters, and the last manipulated ticket
- [x] Render the Pi status bar / footer with root path, open-ticket count, and last manipulated ticket in a width-safe format
- [x] Implement a ticket browser modal that lists tickets, shows the selected ticket summary, and lets the user open the close flow
- [x] Implement the close dialog with confirm/cancel flow, default status handling, optional intent, and changelog note text
- [x] Implement a docs browser that lists docs for the current ticket and renders a markdown preview of the selected doc
- [x] Implement a tasks browser that lists checkbox tasks and toggles them from Pi while refreshing the snapshot afterward
- [x] Add commands or shortcuts for opening the ticket, docs, and tasks browsers and for refreshing the current snapshot
- [x] Handle empty states, cancellation, CLI failures, and width-constrained rendering across all screens
- [x] Add smoke-test coverage or a playbook to validate status, ticket close, doc preview, and task toggling against a live docmgr workspace
