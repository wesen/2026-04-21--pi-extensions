---
Title: Investigation diary
Ticket: PI-EXT-PINNED-SKILLS
Status: active
Topics:
    - pi
    - extensions
    - skills
    - compaction
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../../../.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts
      Note: Type-level API evidence recorded in the diary
    - Path: ttmp/2026/05/09/PI-EXT-PINNED-SKILLS--pi-extension-for-pinned-skills-in-context/design-doc/01-pinned-skills-extension-analysis-design-and-implementation-guide.md
      Note: Primary design output produced during this investigation
ExternalSources: []
Summary: Chronological diary for the pinned-skills Pi extension design ticket.
LastUpdated: 2026-05-09T16:55:00-04:00
WhatFor: Use to resume or review how the pinned-skills extension design was researched and documented.
WhenToUse: When continuing this ticket, reviewing evidence, or implementing the proposed extension.
---


# Diary

## Goal

This diary records the research and documentation work for designing a Pi extension that keeps selected skills fully loaded in context on every turn, including after compaction.

## Step 1: Create ticket and collect Pi extension evidence

I created a new docmgr ticket for the requested feature and added a primary design document plus this investigation diary. The goal was not to implement the extension yet, but to produce an intern-ready implementation guide grounded in Pi's actual extension, skill, settings, and compaction APIs.

I then read Pi's installed documentation and type declarations to verify the design path. The key finding is that Pi already exposes loaded skills through `before_agent_start` via `event.systemPromptOptions.skills`, so the extension can inject selected full skill files into the system prompt without modifying Pi core.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to create a pi extension that can be configured (through config file, or through a modal which a checkmark list of the scanned skills) of skills to be immediately loaded on start / after compaction, so that they are always in context.

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Keep a diary as you work."

**Assistant interpretation:** Create a docmgr ticket with a detailed design and implementation guide for a Pi extension that pins selected skills into context, maintain a chronological diary, validate the ticket, and upload the bundle to reMarkable.

**Inferred user intent:** The user wants a high-quality research/design package that an intern can follow to implement the extension safely without rediscovering Pi's skill and extension APIs.

**Commit (code):** N/A — documentation-only work in `ttmp/`.

### What I did

- Loaded the `ticket-research-docmgr-remarkable`, `docmgr`, `diary`, and `remarkable-upload` workflows.
- Ran `docmgr status --summary-only` to confirm the docs root and current ticket state.
- Created ticket `PI-EXT-PINNED-SKILLS` with topics `pi,extensions,skills,compaction`.
- Added a design document: `ttmp/2026/05/09/PI-EXT-PINNED-SKILLS--pi-extension-for-pinned-skills-in-context/design-doc/01-pinned-skills-extension-analysis-design-and-implementation-guide.md`.
- Added this diary: `ttmp/2026/05/09/PI-EXT-PINNED-SKILLS--pi-extension-for-pinned-skills-in-context/reference/01-investigation-diary.md`.
- Read these Pi docs and type declarations:
  - `README.md`
  - `docs/extensions.md`
  - `docs/skills.md`
  - `docs/settings.md`
  - `docs/compaction.md`
  - `docs/packages.md`
  - `dist/core/extensions/types.d.ts`
  - `dist/core/system-prompt.d.ts`
  - `dist/core/skills.d.ts`
- Inspected existing repository extensions for implementation patterns:
  - `extensions/compaction-title/index.ts`
  - `extensions/compaction-meter/index.ts`
  - `extensions/compaction-meter/settings.ts`
  - `extensions/session-summary/index.ts`

### Why

- The feature is a Pi extension topic, so the installed Pi docs and examples are the authoritative source.
- The requested behavior intersects skills, prompt building, commands/UI, and compaction; each subsystem needed explicit evidence before writing design recommendations.
- Existing repository extensions show local style and practical patterns for status, commands, state, and `before_agent_start` prompt injection.

### What worked

- `docmgr ticket create-ticket --ticket PI-EXT-PINNED-SKILLS --title "Pi extension for pinned skills in context" --topics pi,extensions,skills,compaction` created the workspace successfully.
- `docmgr doc add --ticket PI-EXT-PINNED-SKILLS --doc-type design-doc --title "Pinned skills extension analysis design and implementation guide"` created the primary design document.
- `docmgr doc add --ticket PI-EXT-PINNED-SKILLS --doc-type reference --title "Investigation diary"` created the diary document.
- The installed type declarations confirmed that `BuildSystemPromptOptions` includes `skills?: Skill[]` and that `BeforeAgentStartEvent` includes `systemPromptOptions` and can return a replacement `systemPrompt`.

### What didn't work

- A quick attempt to resolve `@mariozechner/pi-coding-agent/package.json` from the repository with Node failed because the package was globally installed, not locally resolvable from this project:

```text
node:internal/modules/cjs/loader:1386
  throw err;
  ^

Error: Cannot find module '@mariozechner/pi-coding-agent/package.json'
Require stack:
- /home/manuel/code/wesen/2026-04-21--pi-extensions/[eval]
```

I used the known global install path from the Pi documentation instructions instead: `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/`.

### What I learned

- Pi skill discovery is progressive disclosure: only skill descriptions are always present; full `SKILL.md` files are loaded by the model with `read` when needed.
- The extension does not need to rescan the filesystem because Pi exposes loaded skill metadata in `event.systemPromptOptions.skills`.
- `before_agent_start` is the correct injection point because it is per-turn and survives compaction naturally.
- The extension should use a separate config file such as `.pi/pinned-skills.json` rather than storing selected skill names only in session entries.

### What was tricky to build

The main design trap was compaction. One possible interpretation is that the extension must modify compaction summaries. The evidence shows that compaction replaces old messages with a summary, but the next LLM context still begins with the system prompt. Therefore, if pinned skills are appended to the system prompt every turn, the extension does not need to store pinned skill text in session history or custom compaction entries. This is simpler and avoids increasing compaction pressure.

A second tricky point is command-time access to scanned skills. `before_agent_start` provides `systemPromptOptions.skills`, but command handlers do not receive that event object. The design handles this by caching the most recent skill snapshot in memory and using `pi.getCommands()` only as a fallback for listing skill command names.

### What warrants a second pair of eyes

- Whether project `.pi/pinned-skills.json` should replace or merge global `~/.pi/agent/pinned-skills.json` skill lists.
- Whether `disable-model-invocation` should always block pinning or allow explicit override. The design currently chooses explicit override.
- Whether a true checkmark modal should be part of the first implementation phase or deferred after config and command UX.

### What should be done in the future

- Implement `extensions/pinned-skills/` using the design document.
- Add pure helper tests for config normalization and prompt rendering.
- Add an interactive smoke playbook for `/pinned-skills add`, `/pinned-skills`, and `/compact`.

### Code review instructions

- Start with the design document's "Proposed Architecture" and "Implementation Guide" sections.
- Verify API references against:
  - `dist/core/extensions/types.d.ts`
  - `dist/core/system-prompt.d.ts`
  - `dist/core/skills.d.ts`
  - `docs/extensions.md`
  - `docs/skills.md`
  - `docs/compaction.md`
- Validate the ticket with `docmgr doctor --ticket PI-EXT-PINNED-SKILLS --stale-after 30` after bookkeeping is complete.

### Technical details

Important evidence anchors used in the design:

- Skill progressive disclosure: `docs/skills.md:64-71`.
- Skill metadata fields: `dist/core/skills.d.ts:9-16`.
- System prompt options include skills: `dist/core/system-prompt.d.ts:23-24`.
- `before_agent_start` event shape: `dist/core/extensions/types.d.ts:462-473`.
- `before_agent_start` result can replace system prompt: `dist/core/extensions/types.d.ts:720-724`.
- Compaction context still begins with system prompt: `docs/compaction.md:70-76`.
- Existing prompt injection pattern: `extensions/session-summary/index.ts:198-202`.
- Existing status pattern: `extensions/compaction-meter/index.ts:24-28`.

## Step 2: Validate ticket and upload to reMarkable

After the design document and diary were written, I completed docmgr bookkeeping, fixed the only vocabulary warning, and uploaded the ticket bundle to reMarkable. This step turned the ticket from a draft analysis into a validated handoff package.

The reMarkable upload succeeded as a single bundled PDF with the ticket index, design guide, diary, tasks, and changelog. The uploaded path is `/ai/2026/05/09/PI-EXT-PINNED-SKILLS`.

### Prompt Context

**User prompt (verbatim):** (same as Step 1)

**Assistant interpretation:** Finish the ticket workflow by relating files, validating docmgr hygiene, recording the work, and delivering the docs to reMarkable.

**Inferred user intent:** The user wants the documentation package to be available both in the structured ticket workspace and on the reMarkable device/cloud.

**Commit (code):** N/A — documentation-only work in `ttmp/`.

### What I did

- Related the design document to Pi documentation and local extension examples with `docmgr doc relate`.
- Related the diary to the design document and Pi extension type declarations.
- Updated the ticket changelog for the design/diary creation.
- Checked tasks 1 and 2.
- Ran `docmgr doctor --ticket PI-EXT-PINNED-SKILLS --stale-after 30`.
- Fixed the doctor vocabulary warning by adding topic `skills`:

```bash
docmgr vocab add --category topics --slug skills --description "Pi/agent skills, Agent Skills standard packages, and skill discovery/loading behavior"
```

- Re-ran doctor and got a passing report.
- Uploaded the bundle:

```bash
remarquee upload bundle \
  ttmp/2026/05/09/PI-EXT-PINNED-SKILLS--pi-extension-for-pinned-skills-in-context/index.md \
  ttmp/2026/05/09/PI-EXT-PINNED-SKILLS--pi-extension-for-pinned-skills-in-context/design-doc/01-pinned-skills-extension-analysis-design-and-implementation-guide.md \
  ttmp/2026/05/09/PI-EXT-PINNED-SKILLS--pi-extension-for-pinned-skills-in-context/reference/01-investigation-diary.md \
  ttmp/2026/05/09/PI-EXT-PINNED-SKILLS--pi-extension-for-pinned-skills-in-context/tasks.md \
  ttmp/2026/05/09/PI-EXT-PINNED-SKILLS--pi-extension-for-pinned-skills-in-context/changelog.md \
  --name "PI EXT PINNED SKILLS" \
  --remote-dir "/ai/2026/05/09/PI-EXT-PINNED-SKILLS" \
  --toc-depth 2 \
  --non-interactive 2>&1
```

- Checked task 3 and added a changelog entry for validation/upload.

### Why

Docmgr validation catches stale metadata and unknown vocabulary before the docs are handed off. The reMarkable upload gives the user a readable PDF bundle with table of contents rather than separate markdown files.

### What worked

- `docmgr doctor --ticket PI-EXT-PINNED-SKILLS --stale-after 30` passed after adding the `skills` vocabulary topic.
- The reMarkable upload returned:

```text
OK: uploaded PI_EXT_PINNED_SKILLS.pdf -> /ai/2026/05/09/PI-EXT-PINNED-SKILLS
```

### What didn't work

- The first doctor run found one warning:

```text
Unknown vocabulary value for Topics
Value: "skills"
```

This was expected because `skills` was not yet in the local docmgr topic vocabulary. Adding it resolved the warning.

### What I learned

- The local docmgr vocabulary already had `pi`, `extensions`, and `compaction`, but not `skills`.
- The current `remarkable-upload` skill guidance prefers a direct upload command without separate status/account/list calls when upload succeeds.

### What was tricky to build

The only tricky part was aligning two upload workflows: the ticket research workflow mentions dry-run and post-upload listing, while the current `remarkable-upload` skill explicitly asks to minimize expensive calls and treat `OK: uploaded ...` as sufficient verification. I followed the more specific upload skill and recorded the upload output.

### What warrants a second pair of eyes

- Confirm that the remote directory naming convention `/ai/2026/05/09/PI-EXT-PINNED-SKILLS` is the desired destination for this ticket.
- Confirm whether future ticket workflows should use the minimized reMarkable upload pattern consistently.

### What should be done in the future

- If this design is implemented, create a follow-up implementation diary in the same ticket or a child ticket.

### Code review instructions

- Start with `design-doc/01-pinned-skills-extension-analysis-design-and-implementation-guide.md`.
- Review the task and changelog files to confirm the ticket is complete.
- Run `docmgr doctor --ticket PI-EXT-PINNED-SKILLS --stale-after 30` to validate.

### Technical details

Final validation command:

```bash
docmgr doctor --ticket PI-EXT-PINNED-SKILLS --stale-after 30
```

Final validation result:

```text
## Doctor Report (1 findings)

### PI-EXT-PINNED-SKILLS

- ✅ All checks passed
```
