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

## Step 4: Smoke test via tmux

Ran a full interactive smoke test in a tmux session. All checks pass: the extension loads, the `/image-qa` command works, `/px` launcher shows Image QA, and the `ask_questions_about_images` tool is registered and functional (identified a red rectangle correctly).

### Prompt Context

**User prompt (verbatim):** "Do the somke test (use tmux) then once you get it all working, write a professional clear and to the point guide about testing in docs/ , so that we don't have to fumble about so much later."

**Assistant interpretation:** Run an interactive smoke test in tmux, then write a reusable testing guide.

**Inferred user intent:** Verify the extension works end-to-end in a live Pi session, then capture the testing workflow so future extensions can be validated without fumbling.

### What I did
- Started pi in a tmux session (`tmux new-session -d -s pi-smoke`)
- Verified `image-qa` appears in the [Extensions] list on startup
- Tested `/px` → search "Image QA" → Enter → shows `image-qa: profile=gpt-5-low timeout=120s`
- Tested `/image-qa` command → shows settings
- Asked the agent to list all tools → `ask_questions_about_images` appears as the only vision tool
- End-to-end test: created `/tmp/test-red-rectangle.png` (200×100 red), asked the agent to use `ask_questions_about_images` → correctly identified as "solid bright red (#FF0000)"
- Cleaned up tmux session

### Why
Need to verify the full round-trip: extension load → tool registration → pinocchio invocation → result return.

### What worked
- `tmux new-session -d -s <name>` + `tmux send-keys` + `tmux capture-pane -p -S -N` is an effective pattern for interactive testing
- The agent correctly categorized `ask_questions_about_images` as a vision tool without any hints
- Pinocchio `--non-interactive` correctly returns a single answer and exits

### What didn't work
- The `/px` search for "image" matched other entries before showing Image QA — needed to type "Image QA" to filter precisely
- Initial `Enter` in the launcher ran the wrong extension (hello-world-thinking) because the search filter hadn't narrowed enough

### What I learned
- tmux-based smoke testing is reliable but requires careful timing (`sleep` between `send-keys` and `capture-pane`)
- The `capture-pane -S -N` flag scrolls back N lines, essential for seeing tool output that scrolls off screen
- `/px` search is case-sensitive and matches on extension name, not just id

### What was tricky to build
- Timing: need enough sleep between `send-keys` and `capture-pane` for Pi to process, but not so much that the test becomes slow. 2-5 seconds for UI actions, 15-30 seconds for LLM responses.
- tmux `Escape` doesn't always close the launcher overlay cleanly — sometimes need `C-c` instead

### What warrants a second pair of eyes
- Nothing for this extension specifically — all tests pass

### What should be done in the future
- Write the testing guide (next step)

### Code review instructions
- No code changes in this step — purely a testing step

### Technical details
- tmux session: `tmux new-session -d -s pi-smoke -x 120 -y 40`
- Send command: `tmux send-keys -t pi-smoke "<text>" Enter`
- Capture output: `tmux capture-pane -t pi-smoke -p -S -50`
- Kill: `tmux send-keys -t pi-smoke C-c && tmux kill-session -t pi-smoke`
