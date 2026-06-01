# Tasks

## TODO

- [x] Create `extensions/image-qa/profiles.ts` — profile discovery, curated list, validation helper
- [x] Convert settings schema to function with `select` dropdown (curated + discovered + Custom option)
- [x] Add `customProfile` string field + `resolveProfile()` helper for custom fallback
- [x] Add `validate()` callback to check profile exists and warn if not vision-capable
- [x] Initialize `state.profile` from pinocchio's selected/default profile on startup (fallback `gpt-5-low`)
- [x] Update `renderCall()` to show profile name in tool output
- [x] Update `extensions/image-qa/README.md` with vision profiles table and Custom option docs
- [ ] Consider adding optional `profile` parameter to `ask_questions_about_images` tool (future)
