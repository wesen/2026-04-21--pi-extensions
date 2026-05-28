---
Title: 'Diary'
Ticket: IMGQA-002
Status: active
Topics:
    - pi-extension
    - vision
    - pinocchio
    - settings
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/index.ts
      Note: Main extension — rewrote settings with select dropdown + custom fallback
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/profiles.ts
      Note: New file — curated list, profile discovery, validation
    - Path: /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/README.md
      Note: Updated with vision profiles table and settings docs
ExternalSources: []
Summary: "Implementation diary for IMGQA-002 profile dropdown work."
LastUpdated: 2026-05-28T00:00:00.000000000-04:00
WhatFor: "Track implementation steps, decisions, and testing."
WhenToUse: "Read before continuing work on IMGQA-002."
---

# Diary

## Goal

Replace the hardcoded `gpt-5-low` profile in image-qa with a dynamic dropdown of vision-capable pinocchio profiles, plus a custom text fallback.

## Step 1: Create profiles.ts — curated list, discovery, validation

Created `extensions/image-qa/profiles.ts` with a curated list of 8 vision-capable profiles in the user's preferred order: gpt-5-nano-low, gpt-5-low, gpt-5-mini-low, gpt-5-mini, gpt-5-nano, haiku, sonnet, sonnet-low. Also includes `discoverPinocchioProfiles()` that shells out to `pinocchio profiles list --output json`, `validateProfile()` that checks existence and engine, and `getSelectedProfile()` that reads pinocchio's selected/default profile.

### Prompt Context

**User prompt (verbatim):** "go ahead, curated, per default: gpt-5-nano-low, gpt-5-low, gpt-5-mini-low, gpt-5-mini, gpt-5-nano, haiku, sonnet, sonnet-low"

**Assistant interpretation:** Implement the design — create profiles.ts with the curated list in that exact order, then rewrite index.ts settings with a select dropdown and custom fallback.

**Inferred user intent:** Get the profile dropdown implemented with the specific curated profiles they listed, ready for interactive use.

### What I did
- Created `profiles.ts` with curated list, discovery, validation, and selected-profile helpers
- Rewrote `index.ts` with dynamic `select` dropdown schema (function-based), custom text fallback, validation callback
- Updated `README.md` with vision profiles table and settings documentation
- Verified all 8 profiles exist in pinocchio via `pinocchio profiles list --output json`
- Verified pi loads with `timeout 20 pi --list-models`

### Why
The hardcoded `gpt-5-low` default gave no visibility or control over which VLM processes images. The dropdown makes it discoverable and safe.

### What worked
- `pinocchio profiles list --output json` returns structured data with all needed fields
- `PiSchemaSettingsContribution.schema` accepting a function enables dynamic dropdown options
- pi --list-models loads cleanly with the new code

### What didn't work
- Initially tried `npx tsc --noEmit` but the repo has no package.json — pi uses its own TS runtime
- pinocchio's JSON output needs bracket-wrapping (`"[...]json..."`) since it outputs concatenated objects

### What I learned
- The settings view's `select` type renders ←/→ arrows to cycle through `options[].value` entries
- `resolveProfile()` helper cleanly maps between dropdown value and custom text field

### What was tricky to build
- pinocchio JSON output is not a proper JSON array — it's concatenated objects separated by commas and newlines. Needed `"[{json}]".replace(/\}\s*,\s*\{/g, "},{")` to parse it.
- The `load()` function must map the current `state.profile` back to either a dropdown option or the `"(custom)"` sentinel, so the settings UI reflects the correct state.

### What warrants a second pair of eyes
- The JSON parsing in `discoverPinocchioProfiles()` — test with actual pinocchio output edge cases
- The `resolveProfile()` logic — ensure it handles all combinations of dropdown vs custom correctly
- The import of `PiSettingsOption` as a type — verify it works at runtime

### What should be done in the future
- Test the full interactive flow: `/px → Image QA → s` with the dropdown
- Consider adding an optional `profile` parameter to `ask_questions_about_images` tool for per-call override
- Add Gemini profiles to curated list if they prove vision-capable

### Code review instructions
- Start with `extensions/image-qa/profiles.ts` — curated list and discovery helpers
- Then `extensions/image-qa/index.ts` — focus on the `settings:` block and `resolveProfile()`
- Verify with `/px → Image QA → s` that the dropdown renders correctly
- Run `/image-qa` to see current profile

### Technical details
- `pinocchio profiles list --output json` fields used: `profile`, `display_name`, `effective_chat_engine`, `effective_chat_api_type`, `description`, `selected`, `default`
- `CURATED_PROFILES` order: gpt-5-nano-low, gpt-5-low, gpt-5-mini-low, gpt-5-mini, gpt-5-nano, haiku, sonnet, sonnet-low
- Custom sentinel value: `"(custom)"`
- Fallback default: `"gpt-5-low"` (when pinocchio is unavailable)
