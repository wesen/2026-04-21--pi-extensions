---
Title: Investigation diary
Ticket: PI-FRAMEWORK-PUBLIC-001
Status: active
Topics:
    - pi-extensions
    - tooling
    - documentation
    - tui
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://.pi/settings.json
      Note: Current explicit project extension loading
    - Path: repo://extensions/_shared/ui/command-palette.ts
      Note: Search activation ordering and root grouping
    - Path: repo://extensions/_shared/ui/palette-keys.ts
      Note: Key exhaustion and collision probe target
    - Path: repo://extensions/agent-env/index.ts
      Note: Representative action schema and widget contribution
    - Path: repo://extensions/pinned-skills/index.ts
      Note: Representative custom settings and direct UI service consumer
    - Path: repo://ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/scripts/01-contract-probes.mjs
      Note: Reproducible current-contract probes
    - Path: repo://ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/sources/01-contract-probe-results.txt
      Note: Five passing assertions and Node module warning
    - Path: repo://ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/sources/02-upload-dry-run.txt
      Note: Validated bundle inputs and destination
    - Path: repo://ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/sources/03-upload-receipt.txt
      Note: Successful PDF upload evidence
ExternalSources: []
Summary: Evidence-first investigation and delivery diary for the public framework package design.
LastUpdated: 2026-09-05T17:15:00-04:00
WhatFor: Preserve source findings, experiments, design rationale, and validation evidence.
WhenToUse: Reviewing or continuing the public framework extraction ticket.
---



# Diary

## Goal

Record the analysis and documentation needed to extract the workspace's Pi extension framework into public reusable packages, without confusing a design deliverable with a completed implementation or npm release.

## Step 1: Map the framework, test current contracts, and specify extraction

I created a new ticket and traced the registry, all shared views/dashboard modules, both host entrypoints, project load configuration, and representative consumers. The main finding is that a package extraction cannot be a directory move: important orchestration is outside `_shared`, docs use working-directory-relative reads, and the exposed types exceed the implemented settings/dashboard behavior.

I wrote a detailed intern guide that separates observed code from proposed APIs. It recommends a library plus optional shell, lifecycle-aware registration, portable doc helpers, a bounded initial public contract, and packed-artifact tests outside the repository. Small executable probes verify current same-realm registry sharing and several edge cases; real Pi runtime scoping remains an explicit future gate.

### Prompt Context

**User prompt (verbatim):**

> Create a new docmgr ticket to create a public package for the pi extension framework we use, so we can easily reuse it across extensions and not jus tin this workspace. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
> [REMINDER] Output a <summary>...</summary> block at the VERY END of your response. This is mandatory.

**Assistant interpretation:** Create an evidence-backed design ticket and technical onboarding/implementation guide, then deliver it to reMarkable; do not implement or publish the package yet.

**Inferred user intent:** Make the existing framework reusable across independent extension projects and give a new intern enough context to implement that extraction safely.

### What I did

- Ran `docmgr status --summary-only`, `docmgr vocab list`, and created `PI-FRAMEWORK-PUBLIC-001` with design and diary documents.
- Read `docs/pi-shared-extension-framework-guide.md`, `docs/pi-tui-ui-authoring-guide.md`, and the current source contracts and implementations.
- Read installed Pi 0.85.0 extension/package/TUI/keybinding docs and relevant settings/manifest examples. Inspected loader alias lines to explain old versus new package names.
- Recorded baseline revision `9c3c1f3c9eb210bd8a74eb0c2218845d49feee26` and Node `v24.18.0`.
- Searched `_shared` imports: nineteen consumer TypeScript files reference shared modules.
- Added `scripts/01-contract-probes.mjs` and captured stdout/stderr in `sources/01-contract-probe-results.txt`.
- Wrote the comprehensive design guide and ticket overview/tasks. Production extension code and user settings were not changed.

### Why

- Separate the contribution library from the shell so a dependency import cannot multiply commands and terminal listeners.
- Document existing gaps before turning private types into public promises.
- Require artifact and real-loader checks because local aliases and workspace paths can hide packaging defects.

### What worked

The probe command completed successfully:

```bash
node ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/scripts/01-contract-probes.mjs
```

It confirmed five assertions:

1. Two physical registry module copies share the current global store in the same realm.
2. Duplicate extension IDs silently replace previous registrations.
3. Unrestricted dot-separated widget IDs collide.
4. Current palette key assignment omits a 37th unkeyable item.
5. Duplicate explicit keys throw case-insensitively.

These are observations, not all desirable invariants. The future test suite must change defect-confirming assertions into regression expectations for corrected behavior.

### What didn't work

No assertion failed. Node emitted this warning when importing the current palette helper directly (full stderr is preserved in the results artifact):

```text
[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/_shared/ui/palette-keys.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/manuel/code/wesen/2026-04-21--pi-extensions/package.json.
```

I did not change the root manifest to suppress a research-only warning. The proposed package explicitly declares ESM. The source review also found unsupported settings fields, ignored dashboard options, and unsafe context casts; these were documented rather than fixed during the design task.

### What I learned

- `_shared` is not the entire framework: launcher owns important service behavior.
- Relative documentation paths are not automatically package-relative.
- Installed Pi aliases old package names, but a public library should not assume native Node resolution has those aliases.
- A global symbol addresses module duplication, not runtime lifecycle or multi-session isolation.
- Existing testing documentation has stale search/key instructions; source is the authoritative behavior reference.

### What was tricky to build

The hardest design issue was balancing independently installed copies with lifecycle isolation. A module-local singleton would split discovery, while the current process-global map can retain stale callbacks. The guide proposes a versioned shared store keyed by runtime identity, but explicitly blocks implementation on verifying `pi.events` object identity in the real loader. The same-realm probe is deliberately not presented as that verification.

A second issue was scope: supporting every declared schema and refresh field would turn extraction into a large rewrite. The guide defines a truthful v0.1 subset and a consumer audit, retaining custom settings as the extension point for richer editors.

### What warrants a second pair of eyes

- Runtime identity and reload ordering assumptions in proposed registration lifecycle.
- Whether existing actions require command-only session methods when invoked from shortcuts.
- License/scope ownership and the supported Pi baseline.
- Whether the reduced initial settings/dashboard surface covers actual consumers after a complete migration audit.

### What should be done in the future

Follow Phases 0-7 of the guide. Do not publish before the ownership, compatibility, artifact, and real-loader gates pass. Implement and test runtime-scoped registration before migrating every consumer.

### Code review instructions

Start with `design-doc/01-public-framework-architecture-and-intern-implementation-guide.md` sections 3, 6, and 9. Compare source anchors against the baseline revision, then rerun the probe. Read the captured stderr to distinguish its module-format warning from assertion failures. No production implementation tests are claimed for this documentation-only change.

### Technical details

- Proposed npm names: `@wesen/pi-extension-framework`, `@wesen/pi-extension-shell`; not reserved or published.
- Proposed store protocol: `wesen.pi.extension-framework.registry.v2`; no coexistence shim with the local v1 map.
- Current docs: callback > inline Markdown > filesystem path.
- Current dashboard config precedence: defaults < global < project, merging items by widget key.
- Current public release status: none; implementation tasks remain unchecked.

## Step 2: Validate and deliver the document bundle

The delivery step checks ticket structure and renders the guide and investigation diary into one reMarkable bundle. The bundle is a research handoff; successful delivery does not close the implementation ticket or imply the proposed npm packages exist.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Validate the created documentation and upload it to reMarkable.

**Inferred user intent:** Read and review the implementation specification on the device.

### What I did

- Prepared file relations, a task split between research and implementation, and a changelog.
- Ran `docmgr doctor --ticket PI-FRAMEWORK-PUBLIC-001 --stale-after 30`: all checks passed.
- Ran a dry-run bundle upload before real upload; it selected the intended guide/diary inputs and ticket-specific remote directory. Output is preserved in `sources/02-upload-dry-run.txt`.

### Why

Metadata validation catches broken ticket bookkeeping. A dry-run checks inputs and destination before the expensive PDF/upload operation.

### What worked

Ticket validation and upload dry-run passed. The primary guide is approximately 8,000 words and includes current architecture, proposed API contracts, diagrams, pseudocode, migration phases, test/release gates, and source references. The real bundle upload succeeded. Receipt preserved in `sources/03-upload-receipt.txt`:

```text
OK: uploaded PI-FRAMEWORK-PUBLIC-001 Public Framework Guide.pdf -> /ai/2026/09/05/PI-FRAMEWORK-PUBLIC-001
```

This success response is the upload confirmation; no redundant cloud listing was performed. The uploaded diary contains the pre-upload record; this local receipt was appended afterward.

### What didn't work

No delivery failures. Both the dry-run and actual PDF upload succeeded. A post-delivery Python hygiene assertion (`assert '<!--' not in t`) was too broad and failed with `AssertionError: ttmp/2026/09/05/PI-FRAMEWORK-PUBLIC-001--publish-reusable-pi-extension-framework/tasks.md`: docmgr legitimately stores task IDs in comments such as `<!-- t:apqf -->`. I preserved those IDs and corrected the check to exclude task metadata; this was a check defect, not a document or upload defect.

### What I learned

The specialized upload skill says to trust `OK: uploaded` as confirmation and avoid redundant status/account/list calls. The workflow retains a dry-run while following that more specific upload guidance.

### What was tricky to build

The uploaded diary necessarily precedes the upload result itself. Final delivery evidence is recorded locally after success; do not overwrite the uploaded PDF just to append its own receipt.

### What warrants a second pair of eyes

Check that the report clearly labels all API sketches as proposed and that the ticket remains active for actual implementation.

### What should be done in the future

Use Phase 0 as the next implementation task. Research and delivery are complete; package implementation and publication remain future work.

### Code review instructions

Run docmgr doctor, inspect the upload receipt, and review `tasks.md` for the research/implementation distinction.

### Technical details

Target remote directory: `/ai/2026/09/05/PI-FRAMEWORK-PUBLIC-001`.
Bundle name: `PI-FRAMEWORK-PUBLIC-001 Public Framework Guide`.
Inputs: primary design guide followed by this diary; table-of-contents depth 2.
