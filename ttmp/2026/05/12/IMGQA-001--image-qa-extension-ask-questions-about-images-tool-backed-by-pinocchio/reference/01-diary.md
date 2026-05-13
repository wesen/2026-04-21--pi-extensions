---
Title: Diary
Ticket: IMGQA-001
Status: active
Topics:
    - pi-extension
    - vision
    - tools
    - pinocchio
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/image-qa/README.md
      Note: User-facing docs (commit 2d8a111)
    - Path: extensions/image-qa/index.ts
      Note: Main extension — registerPiExtension + pi.registerTool (commit 2d8a111)
ExternalSources: []
Summary: Implementation diary for image-qa extension
LastUpdated: 2026-05-12T21:36:17.036785841-04:00
WhatFor: Track implementation progress and decisions for the image-qa extension
WhenToUse: Read before resuming work on IMGQA-001
---



# Diary

## Goal

Track the design and implementation of the `image-qa` Pi extension that exposes an `ask_questions_about_images` tool backed by `pinocchio code professional`.

## Step 1: Ticket creation and design doc

Created the docmgr ticket IMGQA-001 and wrote a comprehensive design document covering the tool contract, settings, implementation sketch, and key design decisions.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr to create a new extension that exposes a tool ask_questions_about_images([images...], "question") that under the hood takes a model setting (default gpt-5-low) and then calls `pinocchio code professional --profile XXX --images img1,img2,img3 "question"` . Make it clear that the question should contain surrounding context of the question, as the tool doesn't remember past images or conversations."

**Assistant interpretation:** Create a docmgr ticket for a Pi extension that registers an LLM-callable tool for image QA via pinocchio, with a profile setting defaulting to gpt-5-low, and make the stateless nature of the tool very clear.

**Inferred user intent:** Set up the project infrastructure (ticket, design doc, tasks) so the extension can be implemented in a follow-up turn.

### What I did
- Created docmgr ticket IMGQA-001
- Added design doc (`design/01-extension-design.md`) with full tool contract, settings schema, implementation sketch, and design decisions
- Added 4 tasks: implement index.ts, create README, validate load, smoke test
- Added diary doc
- Related framework guide, ExtensionAPI types, and tool-override example to the ticket

### Why
Need project infrastructure before writing code. The design doc captures the stateless constraint prominently — in the tool description, promptSnippet, and promptGuidelines — so the LLM always includes context in the question.

### What worked
- `pinocchio code professional --help` confirmed `--images` and `--profile` flags exist
- `pinocchio --help` confirmed `--profile` is a top-level flag
- Extension framework guide + types.d.ts gave a clear picture of `registerTool` + `pi.exec`

### What didn't work
- `pinocchio help professional` returned "Unknown help topic" — the help system uses a different namespace than the command hierarchy

### What I learned
- Pinocchio profiles control model, temperature, and system prompt as a bundle — so the setting should be `profile` not `model`
- `pi.exec()` supports signal and timeout — perfect for delegating to pinocchio with abort support
- The tool description should be the primary place to enforce the stateless constraint, since that's what the LLM sees

### What was tricky to build
- Nothing tricky yet — this was the design/planning step

### What warrants a second pair of eyes
- The implementation sketch in the design doc — verify the `pi.exec()` signature matches the actual runtime (it's inferred from types, not tested)
- Whether `--non-interactive` is sufficient to prevent pinocchio from entering chat mode, or if additional flags are needed

### What should be done in the future
- Implement the extension (Task 1)
- Test with real images (Task 3–4)

### Code review instructions
- Read `design/01-extension-design.md` — the implementation sketch is the primary artifact
- Verify the tool description makes the stateless constraint unmissable
- Check that settings schema matches the `state` interface

### Technical details
- Command: `pinocchio code professional --profile <profile> --images img1,img2 --non-interactive "question"`
- `pi.exec("pinocchio", args, { signal, timeout })` is the planned execution path
- `--images` is a `<fileList>` in pinocchio (comma-separated)

## Step 2: Implement the extension

Implemented the full `image-qa` extension in `extensions/image-qa/index.ts` and wrote `extensions/image-qa/README.md`. The extension loads cleanly — `timeout 20 pi --list-models` passes with no errors.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Go ahead and implement the extension from the design doc, commit at appropriate intervals, and keep the diary updated.

**Inferred user intent:** Turn the design into working code, validate it loads, and maintain the docmgr ticket.

**Commit (code):** 2d8a111 — "feat(image-qa): add ask_questions_about_images tool backed by pinocchio"

### What I did
- Created `extensions/image-qa/index.ts` with `registerPiExtension()` + `pi.registerTool()` + `pi.registerCommand()`
- Created `extensions/image-qa/README.md` with user-facing docs
- Validated: `timeout 20 pi --list-models` passes with no errors
- Committed as 2d8a111
- Checked off tasks 1 and 4 in the ticket

### Why
The design doc was complete and approved — time to implement. One commit for the two files since they're a coherent unit.

### What worked
- `pi.exec()` signature confirmed from `exec.d.ts`: `exec(command, args, options?) => Promise<ExecResult>` where `ExecResult.code` (not `exitCode`) is the exit code field. Caught this discrepancy from the design doc sketch and fixed it in the implementation.
- `timeout 20 pi --list-models` is a reliable load-check — it catches extension import errors without needing an interactive session.

### What didn't work
- Nothing — clean implementation, no build/load errors

### What I learned
- `ExecResult` uses `code` not `exitCode` — the design sketch had it wrong. Always verify against actual type definitions.
- The `as const` assertion on `type: "text"` is needed in the return objects to narrow the string literal properly for the content array type.

### What was tricky to build
- The `type: "text" as const` in the content objects — without `as const`, TypeScript widens it to `string` which doesn't satisfy the discriminated union. This is a common pattern with TypeBox-based tool return values.

### What warrants a second pair of eyes
- The `pi.exec()` error handling — verify that `signal.aborted` is reliably true when the abort signal fires, vs. getting a thrown error with a different message.
- Whether pinocchio handles the `--images` comma-separated list correctly on paths that contain commas (unlikely edge case).

### What should be done in the future
- Smoke test with `/reload` + `/px` to verify the tool appears in the launcher (Task 3)
- End-to-end test with a real image file

### Code review instructions
- Start with `extensions/image-qa/index.ts`
- Verify the `execute()` function: path resolution, file existence check, arg construction, `pi.exec()` call, error handling
- Check that `registerPiExtension` and `pi.registerTool` use stable IDs
- Read README.md for user-facing accuracy

### Technical details
- `ExecResult`: `{ stdout: string; stderr: string; code: number; killed: boolean }`
- `pi.exec("pinocchio", ["code", "professional", "--profile", profile, "--images", csv, "--non-interactive", question], { signal, timeout })`
- Settings: `state.profile` (string) and `state.timeout` (number, in seconds)
