# Changelog

## 2026-05-28

- Initial workspace created


## 2026-05-28

Created design/implementation guide for profile dropdown with custom fallback. Analyzed pinocchio profiles list JSON output, curated 8 vision-capable profiles, designed select+string dual-field schema.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/registry.ts — PiSettingsField select type and PiSchemaSettingsContribution schema-as-function
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/settings-view.ts — GenericSettingsView renders select dropdowns from options
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/index.ts — Current settings implementation to be replaced


## 2026-05-28

Step 1: Implemented profile dropdown. Created profiles.ts, rewrote index.ts settings with select+custom, updated README. Verified pi --list-models loads.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/README.md — Updated with vision profiles table and settings docs
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/index.ts — Rewrote settings with select dropdown
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/profiles.ts — New file — curated list

