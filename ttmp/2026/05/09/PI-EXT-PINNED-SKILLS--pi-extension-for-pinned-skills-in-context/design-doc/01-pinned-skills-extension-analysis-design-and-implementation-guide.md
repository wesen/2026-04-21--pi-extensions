---
Title: Pinned skills extension analysis design and implementation guide
Ticket: PI-EXT-PINNED-SKILLS
Status: active
Topics:
    - pi
    - extensions
    - skills
    - compaction
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md
      Note: Compaction behavior and system prompt continuity evidence
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
      Note: Extension lifecycle
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md
      Note: Skill discovery and progressive disclosure evidence
    - Path: extensions/compaction-meter/settings.ts
      Note: Existing extension-owned JSON config reading pattern
    - Path: extensions/compaction-title/index.ts
      Note: Existing compaction hook
ExternalSources: []
Summary: Design for a Pi extension that pins selected full skill instructions into every turn's system prompt, with config-file and checklist UI workflows.
LastUpdated: 2026-05-09T16:55:00-04:00
WhatFor: Use when implementing or reviewing the pinned-skills Pi extension.
WhenToUse: When an engineer needs to understand Pi skills, extension hooks, system-prompt injection, compaction behavior, and the phased implementation plan.
---


# Pinned skills extension analysis design and implementation guide

## Executive Summary

This ticket designs a Pi extension tentatively named `pinned-skills`. Its job is to keep selected skills fully loaded in the LLM context on every agent turn, instead of relying on Pi's default progressive-disclosure behavior where only skill names and descriptions are initially present and the model must call `read` to load the full `SKILL.md` when relevant.

The recommended design is deliberately small and robust:

- Use a JSON configuration file as the source of truth for pinned skill names.
- Add a `/pinned-skills` command for listing, adding, removing, and eventually opening an interactive checklist UI.
- During `before_agent_start`, inspect Pi's already-loaded skill metadata from `event.systemPromptOptions.skills`, read the configured `SKILL.md` files, and append a clearly delimited "Pinned skills" section to the system prompt.
- Do not mutate Pi's resource loader or skill discovery pipeline. Let Pi continue scanning skills normally and let the extension act only as a prompt-layer adapter.
- Treat compaction as already handled by this design because system-prompt injection occurs for every post-compaction turn. Add a status notification after `session_compact` so the user can see that pinned skills will remain active on the next prompt.

The important tradeoff is token cost. Full skill files can be large, and pinning too many of them defeats the purpose of progressive disclosure. The implementation should therefore include explicit limits, warnings, and status text showing how many skills are pinned and approximately how many characters were injected.

## Problem Statement and Scope

Pi already supports skills, but skills are intentionally lazy. At startup, Pi scans skill locations, extracts names and descriptions, and puts those summaries in the system prompt. The full skill instructions are loaded only when the task matches and the model reads the skill file. This behavior is documented in `docs/skills.md`: Pi scans locations and includes available skills in the system prompt, then the model uses `read` to load full `SKILL.md` content when a task matches; only descriptions are always in context by default (`docs/skills.md:64-71`).

The user wants a way to select some skills that should always be in context:

- immediately on start,
- after compaction,
- configured through a config file or an interactive modal with a checkmark list of scanned skills.

This design covers a Pi extension. It does not require core Pi changes. It does not implement a new skill format. It does not change the `/skill:name` command behavior. It layers on top of the existing extension API and resource discovery model.

## Current-State Architecture

### Skills are discovered separately from full skill loading

Pi skill locations include global directories, project directories, package-provided `skills/`, settings-provided paths, and explicit CLI `--skill` paths (`docs/skills.md:24-35`). Discovery treats directories containing `SKILL.md` as skill roots and recursively searches for such directories (`docs/skills.md:36-39`).

The public `Skill` type contains exactly the metadata needed by this extension:

```ts
interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  sourceInfo: SourceInfo;
  disableModelInvocation: boolean;
}
```

This shape is visible in the installed type declarations at `dist/core/skills.d.ts:9-16`. `filePath` points at the concrete `SKILL.md` or top-level skill markdown file, and `baseDir` is the directory that relative references should resolve against.

### Pi's default system prompt already carries skill metadata

The `BuildSystemPromptOptions` type includes `skills?: Skill[]` (`dist/core/system-prompt.d.ts:23-24`). Extensions can see those structured options during `before_agent_start`; the API docs say `systemPromptOptions` includes `.skills`, and that the field lets extensions inspect what Pi loaded without rediscovering resources (`docs/extensions.md:470-495`).

This is the central enabling API: the extension does not need to implement Pi's scanning rules. It can wait until Pi has done discovery, then choose which skills to expand into full text.

### `before_agent_start` is the correct injection point

The `before_agent_start` event fires after a user prompt is submitted and before the agent loop. Its result may replace the system prompt for the turn (`dist/core/extensions/types.d.ts:462-473` and `dist/core/extensions/types.d.ts:720-724`). The docs show this hook returning a new `systemPrompt` string (`docs/extensions.md:481-490`).

Existing repository code already uses this pattern. The `extensions/session-summary/index.ts` extension appends a mandatory summary instruction to `event.systemPrompt` in `before_agent_start` (`extensions/session-summary/index.ts:198-202`). The new extension should use the same pattern, but the injected content will be selected skill files instead of a summary rule.

There is no separate "first turn of a new session where the system prompt can be modified" event. `session_start` is useful for restoring in-memory state and setting UI, but it cannot return a changed system prompt. The extension therefore needs a small prompt-epoch policy inside `before_agent_start`: apply the configured pinned-skills prompt only before the first assistant turn of the active session/epoch, keep the rendered prompt byte-for-byte stable for cache friendliness, and defer later config changes until the next prompt epoch.

### Cache-safe prompt epochs and deferred toggles

Provider prompt/KV caches are most effective when the system prompt prefix remains byte-for-byte stable. A pinned-skills extension should therefore avoid changing the injected prompt every turn and should never include volatile metadata such as timestamps, token counts, warning counters, or "last applied" records inside the system prompt.

Use this policy:

- **New session / first assistant turn:** read current config, render the pinned-skills section, append it in `before_agent_start`, and persist a custom metadata entry containing the rendered prompt hash.
- **Same prompt epoch:** keep returning the same rendered section. Do not let command-time config changes alter the system prompt immediately.
- **User changes pinned skills after the epoch started:** write the new config, mark it pending in extension metadata/UI, and tell the user that the change takes effect after `/compact` or in a new session.
- **After compaction:** consider this a new prompt epoch. The next `before_agent_start` may apply pending config because compaction already rebuilds the effective context around a new summary plus system prompt.

The user-facing warning should be explicit. For example:

```text
Pinned skills config changed. To preserve prompt-cache stability, this session will keep using the currently loaded pinned-skills prompt until /compact or a new session. The new selection is saved and pending.
```

Persist idempotency metadata with `pi.appendEntry()`, not in the system prompt. Suggested metadata:

```json
{
  "customType": "pinned-skills-state",
  "data": {
    "promptHash": "sha256-of-rendered-pinned-section",
    "configHash": "sha256-of-normalized-config",
    "pendingConfigHash": "sha256-of-new-config-or-null",
    "epoch": 0,
    "appliedAtEntryId": "optional-session-entry-id"
  }
}
```

This metadata is for the extension, not the model. It makes command handling idempotent and helps future maintainers understand why a config file and the active prompt can temporarily differ.

### Commands and UI are available for configuration

Extension commands are registered with `pi.registerCommand()` (`docs/extensions.md:1338-1352`). Commands can display notifications and interact with users. The UI context supports selection, confirmation, input, notifications, widgets, and custom components (`dist/core/extensions/types.d.ts:66-185`). For simple interaction, `ctx.ui.select()` gives single-choice selection. For a true checkmark list, use `ctx.ui.custom()` and a TUI component; the API supports custom components and overlay mode (`docs/extensions.md:2285-2341` in the local docs; the installed type signature is at `dist/core/extensions/types.d.ts:112-123`).

The API also exposes `pi.getCommands()`. Its return includes extension commands, prompt templates, and skill commands, and each command has `source`, `sourceInfo.path`, `scope`, and origin metadata (`docs/extensions.md:1373-1401`). That is useful for a command palette, but the richer `Skill` metadata in `event.systemPromptOptions.skills` is better for prompt injection because it gives direct `filePath` and `baseDir`.

### Compaction does not remove system-prompt injection

Pi compaction summarizes older messages, appends a `CompactionEntry`, and reloads the active context from the compaction summary plus recent messages (`docs/compaction.md:39-45`). The LLM context after compaction still starts with the system prompt (`docs/compaction.md:70-76`). Therefore, if the extension appends pinned skills in `before_agent_start` for every user prompt, pinned skills are present after compaction without having to store them in the session history.

The extension can optionally observe `session_compact`, whose event exists in the type declarations (`dist/core/extensions/types.d.ts:404-409`), to update status or record that pinned skills remain active. It does not need to customize `session_before_compact` unless we later want the compaction summarizer itself to mention pinned skills.

### Settings files exist, but arbitrary extension config should be isolated

Pi settings are JSON files at `~/.pi/agent/settings.json` and `.pi/settings.json`, with project settings overriding global settings (`docs/settings.md:168-180`). Existing repository code demonstrates safe direct JSON reading and merge-like behavior in `extensions/compaction-meter/settings.ts:70-79`.

For this extension, the cleanest configuration is a separate file rather than adding non-core keys to Pi settings:

- global: `~/.pi/agent/pinned-skills.json`
- project: `.pi/pinned-skills.json`

This keeps extension config discoverable, avoids relying on undocumented settings-key tolerance, and lets the command update a small file atomically.

## Gap Analysis

Current Pi behavior gives the user these capabilities:

- Discover skills and show skill descriptions in the default system prompt.
- Invoke full skills manually with `/skill:name`.
- Add skill directories through settings or CLI.
- Customize system prompts through extensions.

The missing feature is a user-controlled bridge from "scanned skill metadata" to "full skill files appended every turn." That bridge needs to solve five concrete problems:

1. **Selection:** choose which scanned skills are pinned.
2. **Persistence:** remember selected skills across sessions and restarts.
3. **Injection:** read full skill files and append them to the system prompt every turn.
4. **Reload/compaction continuity:** keep behavior stable after `/reload`, `/new`, `/resume`, and compaction.
5. **Safety and token discipline:** avoid silently injecting huge or missing files.

The extension API covers these problems without core changes: `systemPromptOptions.skills` supplies discovered skill metadata; `before_agent_start` supplies a prompt injection hook; `registerCommand` and `ctx.ui` supply configuration workflows; plain Node `fs` APIs can persist configuration.

## Proposed Architecture

### High-level design

```text
┌──────────────────────────┐
│ Pi skill discovery        │
│ - global/project/package  │
│ - settings/CLI paths      │
└─────────────┬────────────┘
              │ Skill[] in BuildSystemPromptOptions
              ▼
┌──────────────────────────┐
│ pinned-skills extension   │
│ - read config             │
│ - match names             │
│ - read SKILL.md files     │
│ - enforce limits          │
└─────────────┬────────────┘
              │ before_agent_start returns systemPrompt
              ▼
┌──────────────────────────┐
│ LLM request context       │
│ default Pi prompt         │
│ + skill descriptions      │
│ + full pinned skills      │
│ + current messages        │
└──────────────────────────┘
```

### Core modules

Implement as a project-local extension first:

```text
extensions/pinned-skills/
├── index.ts        # Extension entry point: events and commands
├── config.ts       # Locate/read/write/merge config files
├── prompt.ts       # Render pinned skill files into system-prompt section
├── ui.ts           # Optional checkmark-list modal implementation
└── README.md       # User-facing setup and commands
```

After it works locally, package it with a `package.json` if it should be distributed as a Pi package.

### Configuration schema

Use JSON because Pi settings are JSON and because the extension can safely edit it from a command.

```json
{
  "version": 1,
  "enabled": true,
  "skills": ["docmgr", "diary", "remarkable-upload"],
  "maxSkillBytes": 50000,
  "maxTotalBytes": 150000,
  "includeDisabledModelInvocation": false,
  "showStatus": true
}
```

Field semantics:

- `version`: schema version for future migrations.
- `enabled`: global switch. If false, the extension registers commands and status but does not inject skills.
- `skills`: skill names to pin. Use names, not paths, so config survives machine-specific paths.
- `maxSkillBytes`: per-skill byte cap to prevent one large skill from dominating context.
- `maxTotalBytes`: total injected byte cap.
- `includeDisabledModelInvocation`: default false. Skills with `disable-model-invocation` are excluded from Pi's default skill prompt (`dist/core/skills.d.ts:41-44`); respect that intent unless the user explicitly opts in.
- `showStatus`: show a footer status such as `pins:3/42k`.

Merge order:

1. Built-in defaults.
2. Global config `~/.pi/agent/pinned-skills.json`.
3. Project config `.pi/pinned-skills.json`.

Project `skills` should replace the global list by default. If additive behavior is desired later, add an explicit `inheritGlobalSkills` field rather than guessing.

### Prompt rendering format

The injected prompt section should be easy for a model to recognize and hard to confuse with the current user request:

```markdown

---

# Pinned skills loaded by pinned-skills extension

These skills were selected by the user to remain fully loaded in context on every turn. Follow each skill's instructions when the task matches. Relative paths mentioned by a skill are relative to that skill's base directory.

<pinned-skill name="docmgr" file="/home/manuel/.pi/agent/skills/docmgr/SKILL.md" baseDir="/home/manuel/.pi/agent/skills/docmgr">
...full SKILL.md content...
</pinned-skill>
```

Important rendering rules:

- Include skill name, file path, and base directory.
- Preserve the skill file text exactly except for trimming trailing whitespace.
- Add a relative-path note because many skill files reference sibling `references/` or `scripts/` paths.
- If a file is truncated by `maxSkillBytes`, include a clear marker and a warning.
- If a configured skill is missing, include a warning in UI/status, not in the LLM prompt by default.

### Runtime flow

```text
Pi startup or /reload
  ├─ loads extension
  ├─ discovers resources
  └─ starts session

User prompt
  ├─ Pi expands commands/templates/skills if needed
  ├─ before_agent_start fires
  │   ├─ extension reads config
  │   ├─ extension inspects event.systemPromptOptions.skills
  │   ├─ extension matches configured skill names
  │   ├─ extension reads and limits skill files
  │   ├─ extension updates status/warnings
  │   └─ extension returns { systemPrompt: event.systemPrompt + renderedPinnedSkills }
  └─ LLM receives the augmented system prompt

Compaction
  ├─ Pi summarizes old messages and reloads compacted context
  ├─ extension sees session_compact and updates status
  └─ next user prompt repeats before_agent_start injection
```

## API References for the Intern

### `ExtensionAPI`

Use these APIs from `@mariozechner/pi-coding-agent`:

- `pi.on("before_agent_start", handler)` to inject pinned skills into the system prompt (`dist/core/extensions/types.d.ts:781`).
- `pi.on("session_compact", handler)` to refresh status after compaction (`dist/core/extensions/types.d.ts:774`).
- `pi.registerCommand("pinned-skills", { ... })` to add a slash command (`dist/core/extensions/types.d.ts:799-800`).
- `pi.appendEntry(customType, data)` only if you want session-local state; config file persistence is preferred for selected skills (`dist/core/extensions/types.d.ts:828-829`).

### `BeforeAgentStartEvent`

The event includes:

- `prompt`: the raw prompt after expansion,
- `systemPrompt`: the current system prompt string,
- `systemPromptOptions`: structured data used to build it, including `skills` (`dist/core/extensions/types.d.ts:462-473`).

Return:

```ts
return { systemPrompt: `${event.systemPrompt}\n\n${pinnedSection}` };
```

The result type explicitly supports `systemPrompt?: string` (`dist/core/extensions/types.d.ts:720-724`).

### `Skill`

The useful fields are:

- `name`: stable config key,
- `description`: UI display text,
- `filePath`: file to read,
- `baseDir`: directory for relative references,
- `sourceInfo`: source/scope/provenance,
- `disableModelInvocation`: whether the skill is hidden from normal model invocation (`dist/core/skills.d.ts:9-16`).

### `ctx.ui`

Use these methods:

- `ctx.ui.notify(message, "info" | "warning" | "error")` for command feedback.
- `ctx.ui.setStatus("pinned-skills", text)` for footer status.
- `ctx.ui.custom()` for a future checkmark-list UI (`dist/core/extensions/types.d.ts:112-123`).

Always guard UI calls where appropriate:

```ts
if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, statusText);
```

Existing repository code follows this guard in `extensions/compaction-title/index.ts:54-58` and `extensions/compaction-meter/index.ts:24-28`.

## Implementation Guide

### Phase 1: File-based MVP

Implement config-file selection and system-prompt injection first. This directly satisfies the core requirement without building custom TUI components.

#### `config.ts` pseudocode

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface PinnedSkillsConfig {
  version: 1;
  enabled: boolean;
  skills: string[];
  maxSkillBytes: number;
  maxTotalBytes: number;
  includeDisabledModelInvocation: boolean;
  showStatus: boolean;
}

const DEFAULT_CONFIG: PinnedSkillsConfig = {
  version: 1,
  enabled: true,
  skills: [],
  maxSkillBytes: 50_000,
  maxTotalBytes: 150_000,
  includeDisabledModelInvocation: false,
  showStatus: true,
};

export function getGlobalConfigPath() {
  return join(homedir(), ".pi", "agent", "pinned-skills.json");
}

export function getProjectConfigPath(cwd: string) {
  return join(cwd, ".pi", "pinned-skills.json");
}

function readOne(path: string): Partial<PinnedSkillsConfig> | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readConfig(cwd: string): { config: PinnedSkillsConfig; warnings: string[] } {
  const warnings: string[] = [];
  const global = safeRead(getGlobalConfigPath(), warnings);
  const project = safeRead(getProjectConfigPath(cwd), warnings);
  return { config: normalize({ ...DEFAULT_CONFIG, ...global, ...project }, warnings), warnings };
}

export function writeProjectConfig(cwd: string, config: PinnedSkillsConfig) {
  const path = getProjectConfigPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
```

Validation rules:

- Unknown fields are ignored.
- `skills` must be an array of strings; de-duplicate and sort when writing.
- Numeric limits must be finite positive numbers.
- Do not crash a user turn for a bad config file; warn and fall back to defaults.

#### `prompt.ts` pseudocode

```ts
import { readFileSync } from "node:fs";
import type { Skill } from "@mariozechner/pi-coding-agent";
import type { PinnedSkillsConfig } from "./config";

export interface RenderPinnedSkillsResult {
  prompt: string;
  included: string[];
  missing: string[];
  skipped: string[];
  warnings: string[];
  bytes: number;
}

export function renderPinnedSkills(skills: Skill[], config: PinnedSkillsConfig): RenderPinnedSkillsResult {
  if (!config.enabled || config.skills.length === 0) return emptyResult();

  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const blocks: string[] = [];
  let totalBytes = 0;

  for (const name of config.skills) {
    const skill = byName.get(name);
    if (!skill) { missing.push(name); continue; }
    if (skill.disableModelInvocation && !config.includeDisabledModelInvocation) {
      skipped.push(`${name}: disable-model-invocation`);
      continue;
    }

    let content = readFileSync(skill.filePath, "utf8");
    const originalBytes = Buffer.byteLength(content, "utf8");
    if (originalBytes > config.maxSkillBytes) {
      content = truncateUtf8(content, config.maxSkillBytes);
      warnings.push(`${name}: truncated from ${originalBytes} bytes`);
    }

    const block = renderBlock(skill, content);
    const blockBytes = Buffer.byteLength(block, "utf8");
    if (totalBytes + blockBytes > config.maxTotalBytes) {
      warnings.push(`stopped before ${name}: maxTotalBytes exceeded`);
      break;
    }

    blocks.push(block);
    totalBytes += blockBytes;
    included.push(name);
  }

  return { prompt: renderSection(blocks), included, missing, skipped, warnings, bytes: totalBytes };
}
```

Do not attempt to parse markdown frontmatter for MVP. Pi already parsed and validated skill names. Reading and injecting the complete file is simpler and preserves all instructions.

#### `index.ts` pseudocode

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readConfig, writeProjectConfig } from "./config";
import { renderPinnedSkills } from "./prompt";

const STATUS_KEY = "pinned-skills";

export default function pinnedSkills(pi: ExtensionAPI): void {
  let lastRender = { included: [], bytes: 0, warnings: [] };
  let activePrompt: string | undefined;
  let activePromptHash: string | undefined;
  let pendingConfigHash: string | undefined;

  pi.on("before_agent_start", async (event, ctx) => {
    const { config, warnings: configWarnings } = readConfig(ctx.cwd);
    const skills = event.systemPromptOptions.skills ?? [];
    const rendered = renderPinnedSkills(skills, config);
    const renderedHash = hashString(rendered.prompt);

    // Cache-safe rule: once this prompt epoch has an active rendered prompt,
    // do not switch to a different rendered prompt until compaction or a new session.
    if (activePrompt && activePromptHash && renderedHash !== activePromptHash) {
      pendingConfigHash = hashConfig(config);
      setPendingStatus(ctx, lastRender);
      return { systemPrompt: `${event.systemPrompt}\n\n${activePrompt}` };
    }

    activePrompt = rendered.prompt;
    activePromptHash = renderedHash;
    pendingConfigHash = undefined;
    lastRender = rendered;
    pi.appendEntry(CUSTOM_TYPE, { activePromptHash, pendingConfigHash });

    if (ctx.hasUI && config.showStatus) {
      ctx.ui.setStatus(STATUS_KEY, formatStatus(rendered));
      for (const warning of [...configWarnings, ...rendered.warnings].slice(0, 3)) {
        ctx.ui.notify(`pinned-skills: ${warning}`, "warning");
      }
    }

    if (!rendered.prompt) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${rendered.prompt}` };
  });

  pi.on("session_compact", async (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, formatStatus(lastRender));
  });

  pi.registerCommand("pinned-skills", {
    description: "List or configure skills pinned into every prompt",
    handler: async (args, ctx) => {
      // MVP command verbs:
      //   /pinned-skills
      //   /pinned-skills list
      //   /pinned-skills add docmgr diary
      //   /pinned-skills remove docmgr
      //   /pinned-skills clear
      //   /pinned-skills on|off
    },
  });
}
```

### Phase 2: Command UX

Add command verbs before building the modal:

```text
/pinned-skills
  Shows current project and global config paths, pinned names, available count, last injected bytes.

/pinned-skills list
  Lists all scanned skill names and descriptions from the last known discovery snapshot.

/pinned-skills add <name...>
  Adds names to project config.

/pinned-skills remove <name...>
  Removes names from project config.

/pinned-skills clear
  Clears project pinned skill names.

/pinned-skills on|off
  Toggles injection for the next prompt epoch if the current one already started.
```

A subtle implementation issue is that command handlers do not receive `event.systemPromptOptions.skills`. Store the most recent skills snapshot from `before_agent_start` in memory, and use `pi.getCommands()` as a fallback for command listing. The docs confirm `pi.getCommands()` includes skill commands and their `sourceInfo` (`docs/extensions.md:1373-1401`). The fallback can list skill names but cannot reliably read full files unless `sourceInfo.path` is the skill file; treat it as display-only unless verified in tests.

Command handlers that change config after an active prompt has already been applied should not immediately change the system prompt. They should write the config file, set a pending flag, and display the cache-stability warning. If the model must know, send a follow-up user message rather than changing the system prompt mid-epoch:

```ts
pi.sendUserMessage(
  "Pinned skills configuration changed. For prompt-cache stability, the saved change will take effect after /compact or in a new session.",
  { deliverAs: "followUp" },
);
```

### Phase 3: Checklist modal

The modal should be a convenience layer over the same project config file. Do not create a separate state path.

Workflow:

1. User runs `/pinned-skills ui`.
2. Extension obtains available skills from the latest `Skill[]` snapshot.
3. Extension opens a checkmark list with current pinned skills checked.
4. User toggles entries with Space, searches by typing, confirms with Enter, cancels with Escape.
5. Extension writes `.pi/pinned-skills.json` and notifies the user.

Pseudocode shape:

```ts
async function openPinnedSkillsChecklist(ctx, availableSkills, currentConfig) {
  if (!ctx.hasUI) {
    ctx.ui.notify("pinned-skills UI requires interactive mode", "warning");
    return;
  }

  const selected = new Set(currentConfig.skills);
  const result = await ctx.ui.custom<string[] | undefined>((tui, theme, keybindings, done) => {
    return new CheckListComponent({
      title: "Pinned skills",
      items: availableSkills.map((skill) => ({
        id: skill.name,
        label: skill.name,
        description: skill.description,
        checked: selected.has(skill.name),
      })),
      onToggle: (id) => toggle(selected, id),
      onSubmit: () => done([...selected].sort()),
      onCancel: () => done(undefined),
    });
  }, { overlay: true });

  if (result) writeProjectConfig(ctx.cwd, { ...currentConfig, skills: result });
}
```

For an intern, the fastest path is to first use `ctx.ui.editor()` to edit the list as newline-delimited text, then replace it with a proper TUI checklist after reading `docs/tui.md` and existing TUI examples. The user asked for a modal checkmark list as an option, but the config-file MVP should ship first.

### Phase 4: Tests and smoke validation

Write unit tests for pure helpers:

- config normalization,
- merge behavior,
- skill matching,
- prompt rendering,
- per-skill truncation,
- total truncation,
- disabled skill skipping.

Add smoke scripts under the ticket or repo scripts:

```bash
# Show available commands with extension loaded.
pi --no-session --extension ./extensions/pinned-skills/index.ts -p "Say ok" --no-context-files

# Manual interactive smoke.
pi --extension ./extensions/pinned-skills/index.ts
/pinned-skills add docmgr diary
/pinned-skills
/compact
```

For noninteractive tests, add a diagnostic command that prints what would be injected without sending it to the model:

```text
/pinned-skills preview
```

It should show names, byte counts, and warnings, not the entire skill body unless `--full` is passed.

## Risks and Mitigations

### Risk: prompt bloat

Pinned skills are full markdown files. Pinning many large skills can increase latency and cost. Mitigate with `maxSkillBytes`, `maxTotalBytes`, status text, and warnings.

### Risk: stale or missing skill names

Config uses names. A skill may be renamed or absent in a project. Mitigate by warning in `/pinned-skills` output and not injecting missing entries.

### Risk: duplicate skill names

Pi warns and keeps the first skill found on collisions. The extension should use Pi's `Skill[]` and not implement its own collision behavior. If duplicates are visible later through richer APIs, show provenance in the UI.

### Risk: disabled model invocation

A skill can set `disable-model-invocation`, and Pi excludes such skills from normal prompt inclusion (`dist/core/skills.d.ts:41-44`). Respect that by default. Let advanced users opt in with `includeDisabledModelInvocation: true`.

### Risk: custom UI complexity

A proper checkmark modal requires TUI component work. Ship command and config UX first, then implement the modal. Keep the modal as a frontend over the same config file so no behavior changes are needed.

### Risk: compaction misunderstanding

The extension does not put pinned skills into session history. That is intentional. The system prompt is rebuilt per turn, and compaction context still starts with the system prompt (`docs/compaction.md:70-76`). Add tests and documentation to make this explicit.

## Alternatives Considered

### Alternative A: Modify Pi core skill loading

This would add a new core setting such as `pinnedSkills`. It would be cleaner in the long term but requires core changes and release coordination. The extension approach is faster and fits Pi's philosophy that custom workflows should be built as extensions.

### Alternative B: Automatically send `/skill:name` at startup

This would add full skill text as user-visible messages or prompt expansions. It is noisy, session-history dependent, and less reliable after compaction. System-prompt injection is cleaner.

### Alternative C: Inject pinned skills as custom messages

`before_agent_start` can inject a persistent custom message (`docs/extensions.md:481-487`). This would store pinned content in the session, increasing compaction pressure and making old pinned versions part of history. It is better to append to the system prompt for the current turn only.

### Alternative D: Override compaction summaries

The extension could intercept `session_before_compact` and call `compact()` with custom instructions, as `extensions/compaction-title/index.ts:116-170` does. This is unnecessary for the core requirement. It may be useful later if the user wants compaction summaries to explicitly mention which pinned skills were active.

## File-Level Implementation Plan

1. Create `extensions/pinned-skills/config.ts`.
   - Implement default config, path helpers, safe JSON parsing, normalization, and project config writing.
   - Model after the direct settings read pattern in `extensions/compaction-meter/settings.ts:70-79`.

2. Create `extensions/pinned-skills/prompt.ts`.
   - Implement `renderPinnedSkills(skills, config)` and pure truncation helpers.
   - Add self-tests or vitest tests if the repository has a test harness.

3. Create `extensions/pinned-skills/index.ts`.
   - Register `before_agent_start`, `session_compact`, and `/pinned-skills`.
   - Follow the status pattern from `extensions/compaction-meter/index.ts:24-28`.
   - Follow the command registration pattern from `extensions/compaction-title/index.ts:185-215`.

4. Create `extensions/pinned-skills/README.md`.
   - Document config locations, schema, commands, and token warnings.

5. Optional: create `extensions/pinned-skills/ui.ts`.
   - Implement the checkmark modal only after the MVP is working.

6. Add ticket playbook or smoke script.
   - Capture manual testing commands and expected behavior.

## Validation Strategy

### Unit-level validation

- Bad JSON returns warnings and default config.
- Project config overrides global config.
- Duplicate configured names are de-duplicated.
- Missing configured names are reported but do not throw.
- Disabled skills are skipped unless explicitly allowed.
- Large files are truncated by per-skill and total limits.
- Prompt rendering includes skill name, file path, base directory, and content.

### Manual interactive validation

1. Load extension:

   ```bash
   pi --extension ./extensions/pinned-skills/index.ts
   ```

2. Add skills:

   ```text
   /pinned-skills add docmgr diary
   /pinned-skills
   ```

3. Ask a task that should use a pinned skill without manually invoking `/skill:name`.
4. Trigger compaction:

   ```text
   /compact
   ```

5. Ask another task and confirm status still shows pinned skills.

### Noninteractive smoke validation

Add a command or flag that prints a preview. Then run:

```bash
pi --extension ./extensions/pinned-skills/index.ts -p "/pinned-skills preview" --no-session
```

If command handling in print mode does not execute built-in interactive commands as expected, use an interactive smoke or a small direct Node script that imports `config.ts` and `prompt.ts`.

## Open Questions

1. Should project config replace global pinned skills, or should it merge with global by default? This design chooses replacement to avoid surprise token growth.
2. Should the extension support path-based pinning for two skills with the same name? The MVP should avoid this until a real collision case appears.
3. Should pinned skill content be included in custom compaction instructions? Not required for post-compaction turns, but maybe useful for compaction-summary style consistency.
4. Should the checklist UI be a full custom TUI component or an editor-based list first? The pragmatic path is editor-based first, custom checkmarks second.

## References

- Pi skills locations and progressive disclosure: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md:20-71`.
- Extension lifecycle and `before_agent_start`: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md:470-496`.
- `Skill` type: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/skills.d.ts:9-16`.
- `BuildSystemPromptOptions.skills`: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/system-prompt.d.ts:23-24`.
- `BeforeAgentStartEvent` and result: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:462-473` and `:720-724`.
- Compaction system-prompt context: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md:39-76`.
- Existing compaction customization example: `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts:116-170`.
- Existing status/command patterns: `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-meter/index.ts:24-28` and `/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title/index.ts:185-215`.
