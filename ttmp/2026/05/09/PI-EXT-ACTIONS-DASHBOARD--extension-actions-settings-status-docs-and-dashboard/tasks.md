# Tasks

## Phase 1: Registry actions and docs

- [x] 1. Extend shared registry types with actions, docs, settings, and dashboard widget contribution contracts.
- [x] 2. Change `/px` result model so the launcher can return select/actions/docs/settings/dashboard intents.
- [x] 3. Invoke extension `run` or default action from `/px` instead of only notifying the selected extension name.
- [x] 4. Add a generic action picker for extensions with multiple registered actions.
- [x] 5. Add a markdown documentation viewer and wire `?` from `/px`.
- [x] 6. Register pilot actions and docs for `pinned-skills`.
- [x] 7. Validate Phase 1 with `timeout 20 pi --list-models` and manual `/px` smoke test.

## Phase 2: Schema-driven settings

- [x] 8. Add shared settings schema types and validation result contracts.
- [x] 9. Implement a generic settings view backed by `SettingsList` for boolean/select/string-like fields.
- [x] 10. Add launcher/settings orchestration for registered schema settings.
- [x] 11. Register pilot schema settings for one simple extension.
- [x] 12. Validate settings apply/cancel behavior.

## Phase 3: Custom settings views

- [x] 13. Add custom settings contribution contract and opener.
- [x] 14. Register `pinned-skills` checklist/menu as a custom settings view.
- [x] 15. Wire launcher `s` key to open schema or custom settings for the selected extension.
- [x] 16. Validate custom settings flow manually.

## Phase 4: Dashboard widget registry and status bridge

- [x] 17. Add dashboard widget contribution types and widget key helpers.
- [x] 18. Add dashboard config read/write/merge helpers for global and project config.
- [x] 19. Implement inline status-bar rendering for `short` dashboard widgets.
- [x] 20. Add a dashboard manager that bridges rendered short widgets into `ctx.ui.setStatus("dashboard", ...)`.
- [x] 21. Register pilot widgets for `compaction-meter`, `pinned-skills`, and `kanban-demo`.
- [x] 22. Validate status bridge does not break existing extension statuses.

## Phase 5: Dashboard overlay and layout configuration

- [x] 23. Implement stack/grid dashboard overlay component.
- [x] 24. Add `/px dashboard` action or launcher key to open dashboard overlay.
- [x] 25. Add dashboard layout settings view for visibility/order/variant.
- [x] 26. Save dashboard layout changes to `.pi/dashboard.json`.
- [x] 27. Validate overlay and config persistence manually.

## Phase 6: Documentation, cleanup, and delivery

- [x] 28. Update the design guide with implementation notes and deviations.
- [x] 29. Update the investigation diary after each phase.
- [x] 30. Run `docmgr doctor --ticket PI-EXT-ACTIONS-DASHBOARD --stale-after 30`.
- [x] 31. Commit final docs and implementation.
- [x] 32. Re-upload the ticket bundle to reMarkable.
