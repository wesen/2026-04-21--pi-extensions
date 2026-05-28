---
Title: Profile selection design
Ticket: IMGQA-002
Status: active
Topics:
    - pi-extension
    - vision
    - pinocchio
    - settings
DocType: design
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/_shared/registry.ts
      Note: |-
        PiSettingsField select type, PiSettingsOption, PiSchemaSettingsContribution schema-as-function
        PiSettingsField select type
    - Path: extensions/_shared/ui/settings-view.ts
      Note: GenericSettingsView — renders select dropdowns from options array
    - Path: extensions/image-qa/README.md
      Note: Current docs for profile setting and /image-qa command
    - Path: extensions/image-qa/index.ts
      Note: Main extension source — profile hardcoded to gpt-5-low, passed as --profile to pinocchio
ExternalSources: []
Summary: Design and implementation guide for replacing the hardcoded profile with a dynamic dropdown of vision-capable pinocchio profiles, plus a custom-text fallback.
LastUpdated: 2026-05-28T00:00:00-04:00
WhatFor: Implement the profile dropdown with custom override in image-qa settings.
WhenToUse: Read this before changing image-qa profile selection or settings schema.
---


# Profile Selection Design & Implementation Guide

## Goal

Replace the hardcoded `gpt-5-low` profile default with a settings dropdown that:
1. Lists known vision-capable pinocchio profiles (curated list + auto-discovered)
2. Allows typing a custom profile name not in the list
3. Validates the profile exists before applying
4. Surfaces the active profile in the status action and tool result details

## Current State

```
extensions/image-qa/index.ts:135
  const state: ImageQaState = { profile: "gpt-5-low", timeout: 120 };
```

The profile is a plain `string` field in schema settings with no options, no validation, and no dropdown. The user must know the exact profile name and type it into a freeform text field.

## Architecture

### How schema settings dropdowns work

The shared settings view (`GenericSettingsView` in `_shared/ui/settings-view.ts`) supports a `select` field type. The field's `options` array becomes a left/right scrollable dropdown:

```ts
// registry.ts
interface PiSettingsOption {
  value: string;       // machine value stored in state
  label: string;       // display text
  description?: string; // shown as dim hint
}

type PiSettingsField =
  | ... 
  | { type: "select"; options: PiSettingsOption[] }
```

The settings view calls `valuesForField()` which returns `field.options.map(o => o.value)`. The `SettingsList` component renders ←/→ arrows to cycle through values.

**Key: the schema can be a function.** The `PiSchemaSettingsContribution.schema` field accepts either a static `PiSettingsSchema` or a function `(ctx) => PiSettingsSchema`. This means we can build the dropdown options dynamically (e.g. querying pinocchio) when the settings view opens.

### Where custom text fits

The `select` type only allows picking from the predefined options list — no freeform input. To support a custom profile name, we add a **second field** `customProfile` of type `string` that is shown when the user selects the special `"(custom)"` option from the dropdown.

The interaction model:

```
Profile: [gpt-5-low ◀▶]          ← dropdown with vision profiles + "(custom)"
Custom profile: gemini-3-pro     ← only visible/editable when Profile = "(custom)"
```

## Implementation Plan

### Step 1: Add profile discovery helper

Create a helper that runs `pinocchio profiles list --output json` and filters to profiles with an `effective_chat_engine` (i.e. actual models, not base/API-key profiles). Cache the result for the session.

```ts
// extensions/image-qa/profiles.ts

import { execFileSync } from "child_process";

interface PinocchioProfile {
  profile: string;
  display_name: string;
  effective_chat_engine: string;
  effective_chat_api_type: string;
  description: string;
  selected: boolean;
  default: boolean;
}

let cachedProfiles: PinocchioProfile[] | undefined;

const VISION_PROFILE_WHITELIST = new Set([
  // Known vision-capable profiles (engines, not profile names)
  // This is a safety net — the curated list below is primary
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3-pro",
  "claude-haiku-4-5",
  "glm-5v-turbo",
]);

/**
 * Curated list of profiles known to support vision.
 * These appear first in the dropdown with labels and descriptions.
 */
const CURATED_PROFILES = [
  { value: "gpt-5-low",           label: "GPT-5 Low",         desc: "GPT-5 with low reasoning effort (fast, cheap)" },
  { value: "gpt-5-mini-low",      label: "GPT-5 Mini Low",    desc: "GPT-5 Mini with low reasoning effort" },
  { value: "gpt-5-nano-low",      label: "GPT-5 Nano Low",    desc: "GPT-5 Nano with low reasoning effort" },
  { value: "gemini-2.5-flash",    label: "Gemini 2.5 Flash",  desc: "Google Gemini Flash (fast, vision-capable)" },
  { value: "gemini-2.5-pro",      label: "Gemini 2.5 Pro",    desc: "Google Gemini Pro (high quality vision)" },
  { value: "gemini-3-pro",        label: "Gemini 3 Pro",      desc: "Google Gemini 3 Pro" },
  { value: "haiku",               label: "Claude Haiku 4.5",  desc: "Anthropic Claude Haiku 4.5 (vision-capable)" },
  { value: "z-ai-glm-5v-turbo",   label: "GLM-5V Turbo",      desc: "Z.ai GLM-5V Turbo (multimodal)" },
] as const;

export function getCuratedProfiles() {
  return CURATED_PROFILES;
}

export function discoverPinocchioProfiles(): PinocchioProfile[] {
  if (cachedProfiles) return cachedProfiles;
  try {
    const result = execFileSync("pinocchio", ["profiles", "list", "--output", "json"], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    cachedProfiles = JSON.parse(result.replace(/\n/g, ""));
    return cachedProfiles ?? [];
  } catch {
    return [];
  }
}

export function validateProfile(profile: string): { valid: boolean; warning?: string } {
  const all = discoverPinocchioProfiles();
  const match = all.find(p => p.profile === profile);
  if (!match) return { valid: false, warning: `Profile "${profile}" not found in pinocchio.` };
  if (!match.effective_chat_engine) return { valid: false, warning: `Profile "${profile}" has no chat engine (likely a base/API-key profile).` };
  // Check if the engine is known vision-capable
  const engine = match.effective_chat_engine;
  if (!VISION_PROFILE_WHITELIST.has(engine)) {
    return { valid: true, warning: `Profile "${profile}" uses engine "${engine}" which is not confirmed vision-capable. Image QA calls may fail.` };
  }
  return { valid: true };
}

export function getSelectedProfile(): string | undefined {
  const all = discoverPinocchioProfiles();
  return all.find(p => p.selected)?.profile ?? all.find(p => p.default)?.profile;
}
```

### Step 2: Convert schema to a function, add dropdown + custom field

Replace the static schema with a function that builds dropdown options dynamically.

```ts
// In extensions/image-qa/index.ts

const CUSTOM_VALUE = "(custom)";

// The resolveProfile helper: if user picked "(custom)", use the customProfile field
function resolveProfile(values: Record<string, unknown>): string {
  const profile = String(values.profile ?? "");
  if (profile === CUSTOM_VALUE) return String(values.customProfile ?? "").trim();
  return profile;
}

// Inside registerPiExtension({ settings: { ... } }):

settings: {
  kind: "schema",
  schema: () => {
    const curated = getCuratedProfiles();
    // Also discover any non-curated profiles with engines and add them
    const allDiscovered = discoverPinocchioProfiles()
      .filter(p => p.effective_chat_engine && !curated.find(c => c.value === p.profile));
    
    const options: PiSettingsOption[] = [
      ...curated.map(c => ({
        value: c.value,
        label: c.label,
        description: c.desc,
      })),
      ...allDiscovered.map(p => ({
        value: p.profile,
        label: p.display_name || p.profile,
        description: p.effective_chat_engine,
      })),
      { value: CUSTOM_VALUE, label: "Custom...", description: "Type a custom profile name" },
    ];

    return {
      version: 1,
      title: "Image QA Settings",
      description: "Configure the pinocchio profile and timeout for image QA calls.",
      sections: [
        {
          id: "main",
          title: "Main",
          fields: [
            {
              id: "profile",
              label: "Profile",
              type: "select" as const,
              options,
              description: "Pinocchio profile for vision calls. Select 'Custom...' to type a name.",
            },
            {
              id: "customProfile",
              label: "Custom profile",
              type: "string" as const,
              description: "Pinocchio profile name (used when Profile is set to 'Custom...').",
              // This field is only meaningful when profile === "(custom)"
            },
            {
              id: "timeout",
              label: "Timeout (seconds)",
              type: "number" as const,
              description: "Maximum seconds to wait for a pinocchio response.",
              min: 10,
              max: 600,
              step: 10,
            },
          ],
        },
      ],
    };
  },
  load: () => {
    // Determine if current state.profile is in curated list or is custom
    const curated = getCuratedProfiles();
    const isInDropdown = curated.some(c => c.value === state.profile) || 
      discoverPinocchioProfiles().some(p => p.profile === state.profile && !curated.find(c => c.value === p.profile));
    return {
      profile: isInDropdown ? state.profile : CUSTOM_VALUE,
      customProfile: isInDropdown ? "" : state.profile,
      timeout: state.timeout,
    };
  },
  validate: (values) => {
    const errors: Array<{ fieldId?: string; message: string }> = [];
    const warnings: Array<{ fieldId?: string; message: string }> = [];
    
    const resolved = resolveProfile(values);
    if (!resolved) {
      errors.push({ fieldId: "profile", message: "Profile must not be empty." });
      return { ok: false, errors, warnings };
    }
    
    const result = validateProfile(resolved);
    if (!result.valid) {
      errors.push({ fieldId: "profile", message: result.warning! });
      return { ok: false, errors, warnings };
    }
    if (result.warning) {
      warnings.push({ fieldId: "profile", message: result.warning });
    }
    
    return { ok: true, warnings };
  },
  onApply: (values, ctx) => {
    state.profile = resolveProfile(values);
    if (values.timeout) state.timeout = Number(values.timeout);
    ctx.ui.notify(
      `image-qa: profile=${state.profile} timeout=${state.timeout}s`,
      "info",
    );
  },
},
```

### Step 3: Initialize from pinocchio default on startup

Replace the hardcoded `"gpt-5-low"` with pinocchio's selected/default profile, falling back to `"gpt-5-low"`.

```ts
// At the top of imageQaExtension():

const pinocchioDefault = getSelectedProfile();

const state: ImageQaState = {
  profile: pinocchioDefault ?? "gpt-5-low",
  timeout: 120,
};
```

### Step 4: Update tool description and renderCall to surface the profile

```ts
// In the tool description, add a note about profile configurability:
description:
  "Ask a vision-capable model questions about one or more images. " +
  // ... existing text ...
  "The underlying pinocchio profile can be changed via /px → Image QA → Settings.",

// In renderCall, show the profile:
renderCall(args, theme) {
  const images = argImages(args);
  const context = argString(args, "context").trim();
  const question = argString(args, "question").trim();
  const text = [
    `${theme.fg("toolTitle", theme.bold("ask_questions_about_images"))} ${theme.fg("dim", `${images.length} image(s) · profile: ${state.profile}`)}`,
    `${theme.fg("accent", "Context:")} ${context || theme.fg("warning", "(empty)")}`,
    `${theme.fg("accent", "Question:")} ${question || theme.fg("warning", "(empty)")}`,
  ].join("\n");
  return new Text(text, 0, 0);
},
```

### Step 5: Update README

Add a table of curated vision profiles and explain the Custom option:

```markdown
### Vision-capable profiles

| Profile | Engine | Notes |
|---------|--------|-------|
| gpt-5-low | GPT-5 | Default. Low reasoning effort, fast |
| gpt-5-mini-low | GPT-5 Mini | Smaller model, low reasoning |
| gpt-5-nano-low | GPT-5 Nano | Smallest GPT-5 variant |
| gemini-2.5-flash | Gemini 2.5 Flash | Fast, good vision |
| gemini-2.5-pro | Gemini 2.5 Pro | Higher quality vision |
| gemini-3-pro | Gemini 3 Pro | Latest Gemini |
| haiku | Claude Haiku 4.5 | Anthropic vision |
| z-ai-glm-5v-turbo | GLM-5V Turbo | Z.ai multimodal |

Non-curated pinocchio profiles with a chat engine also appear in the dropdown.
Select **Custom...** and type any profile name to use a profile not in the list.

Changing the profile takes effect immediately for subsequent calls.
```

## Interaction Flow

```
User opens settings (/px → Image QA → s):

  ┌─ Image QA Settings ──────────────────────────────┐
  │ Configure the pinocchio profile and timeout...    │
  │                                                   │
  │ ▶ Profile:        ◀ gpt-5-low ▶                  │
  │   Custom profile:                                 │
  │   Timeout (s):    ◀ 120 ▶                        │
  │                                                   │
  │   GPT-5 Low — GPT-5 with low reasoning effort    │
  │                                                   │
  │ Ctrl+S apply · Esc cancel · ↑↓ move · ←→ change  │
  └───────────────────────────────────────────────────┘

User presses → to cycle:

  Profile: ◀ gemini-2.5-flash ▶    "Gemini 2.5 Flash — fast, vision-capable"
  Profile: ◀ gemini-2.5-pro ▶      "Gemini 2.5 Pro — high quality vision"
  ...
  Profile: ◀ (custom) ▶            "Type a custom profile name"

When (custom) is selected, the user tabs to the Custom profile field and types.
```

## File Changes Summary

| File | Change |
|------|--------|
| `extensions/image-qa/profiles.ts` | **New.** Profile discovery, validation, curated list. |
| `extensions/image-qa/index.ts` | Rewrite settings to use `schema` function with `select` dropdown. Add `resolveProfile()`. Initialize from pinocchio default. Update `renderCall`. |
| `extensions/image-qa/README.md` | Add vision profiles table, document Custom option. |

## Edge Cases

1. **pinocchio not installed or unavailable** — `discoverPinocchioProfiles()` returns `[]`. The dropdown shows only curated profiles + Custom. Validation warns but allows.
2. **Profile deleted after selection** — `validate()` catches it on next settings apply. Runtime error from pinocchio is caught and returned as tool error (existing behavior).
3. **Custom profile is empty** — `resolveProfile()` returns empty string. `validate()` blocks with "Profile must not be empty."
4. **New pinocchio profile added after session start** — The schema function re-runs each time settings open, picking up new profiles. The cache is per-session.

## Testing Checklist

- [ ] `/px → Image QA → s` opens settings with dropdown
- [ ] ←/→ cycles through curated + discovered + Custom profiles
- [ ] Selecting Custom shows the customProfile text field
- [ ] Typing a valid profile name in custom works
- [ ] Typing an invalid profile name shows validation error on Ctrl+S
- [ ] Timeout ←/→ increments by 10
- [ ] Ctrl+S applies and shows notification with resolved profile name
- [ ] Esc cancels without changing state
- [ ] `/image-qa` shows current profile and timeout
- [ ] `ask_questions_about_images` tool call uses the selected profile
- [ ] Tool result details include the profile name
- [ ] Default profile on fresh start matches pinocchio's selected/default
- [ ] Fallback to `gpt-5-low` when pinocchio is unavailable
