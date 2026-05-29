---
Title: Upstream PR Contribution Research
Ticket: UMANS-GLM-COMPACTION
Status: active
Topics:
    - pi
    - compaction
    - pi-extensions
    - settings
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ../../../../../../../2026-05-29--pi-deepseek-reasoning-fix/.github/workflows/pr-gate.yml
      Note: Auto-close workflow for PRs from non-approved contributors
    - Path: ../../../../../../../2026-05-29--pi-deepseek-reasoning-fix/AGENTS.md
      Note: Upstream development rules for checks
    - Path: ../../../../../../../2026-05-29--pi-deepseek-reasoning-fix/CONTRIBUTING.md
      Note: Upstream Pi contribution gate and required pre-PR commands
    - Path: ../../../../../../../2026-05-29--pi-provider-umans-reasoning-fix/README.md
      Note: Provider repository reference for the likely metadata PR
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---


# Upstream PR Contribution Research

## Goal

This reference explains how to prepare a pull request for the upstream Pi repositories without actually opening or pushing one. It focuses on the `@earendil-works/pi-ai` core patch first, then notes the separate `pi-provider-umans` contribution path because the runtime fix depends on both pieces.

## Context

The current local work has two PR-shaped branches:

| Repository | Local path | Branch | Commit | Purpose |
| --- | --- | --- | --- | --- |
| Pi monorepo | `/home/manuel/code/wesen/2026-05-29--pi-deepseek-reasoning-fix` | `fix/deepseek-reasoning-effort` | `1cf2c943d7205e66f739aba90f355a76deee59df` | Backport `pi-ai` DeepSeek request builder guard to the installed `v0.77.0` code line. |
| Umans provider | `/home/manuel/code/wesen/2026-05-29--pi-provider-umans-reasoning-fix` | `fix/reasoning-effort-compat` | `2ec50df66f5ccc6eab8533fb66e540b6e199252e` | Advertise `supportsReasoningEffort: false` for Umans models. |

Important upstream reality: the cloned Pi repository's current `main` already contains the `pi-ai` DeepSeek guard. A PR against `earendil-works/pi:main` for the exact core change may therefore be redundant. The local `pi-ai` branch is still useful as a tested backport against `v0.77.0`, but before opening any upstream PR, compare the branch with current upstream `main` and only submit if there is still a meaningful diff.

## Sources captured with Defuddle

The following source material was extracted with `defuddle parse <url> --md` and saved under this ticket's `sources/` folder:

| File | Source | Why it matters |
| --- | --- | --- |
| `sources/01-earendil-pi-CONTRIBUTING.md` | `https://github.com/earendil-works/pi/blob/main/CONTRIBUTING.md` | Official Pi contribution gate, quality bar, and pre-PR commands. |
| `sources/02-earendil-pi-APPROVED_CONTRIBUTORS.md` | `https://github.com/earendil-works/pi/blob/main/.github/APPROVED_CONTRIBUTORS` | Shows the approval list concept used by the PR gate. |
| `sources/03-earendil-pi-pr-gate-workflow.md` | `https://github.com/earendil-works/pi/blob/main/.github/workflows/pr-gate.yml` | Documents the auto-close workflow for PRs from non-approved contributors. |
| `sources/04-github-creating-pull-request-from-fork.md` | GitHub Docs | General fork-to-upstream PR procedure. |
| `sources/05-github-syncing-a-fork.md` | GitHub Docs | General procedure for keeping a fork up to date before PR work. |
| `sources/06-earendil-pi-AGENTS.md` | `https://github.com/earendil-works/pi/blob/main/AGENTS.md` | Upstream development rules: checks, tests, changelog, git hygiene. |
| `sources/07-earendil-pi-contribution-issue-template.md` | `https://github.com/earendil-works/pi/blob/main/.github/ISSUE_TEMPLATE/contribution.yml` | The required contribution-proposal issue shape for new contributors. |
| `sources/08-umans-pi-provider-repo.md` | `https://github.com/umans-ai/pi-provider-umans` | Provider repository landing page; no separate contribution guide was found locally. |

## Quick Reference: Pi upstream contribution rules

### Contributor gate

The Pi repository has a strict contribution gate:

- New contributors' issues and PRs are auto-closed by default.
- Do not open a PR unless a maintainer has already replied `lgtm`.
- `lgtmi` approves future issues only; it does not approve PRs.
- `lgtm` approves future issues and PRs.
- Issues submitted Friday through Sunday are not reviewed; urgent issues should go to Discord.

The PR gate workflow enforces this for pull requests. It reads `.github/APPROVED_CONTRIBUTORS`, checks whether the author has `pr` capability, and closes the PR with a comment if not.

Practical consequence: if Manuel's GitHub account is not already approved with PR capability, open a short contribution issue first. Do not open the PR first and hope it stays open.

### Issue quality bar before PR approval

The contribution proposal should be short and concrete. The issue template asks three things:

1. What do you want to change?
2. Why?
3. How? Optional, but useful when there is already a small tested branch.

For this ticket, a good issue should fit on one screen and say:

- Pi `v0.77.0` can emit both `thinking` and `reasoning_effort` in the OpenAI-completions DeepSeek branch.
- Umans-style DeepSeek-compatible endpoints reject that pair.
- The request builder should honor `compat.supportsReasoningEffort` before emitting `reasoning_effort` in the DeepSeek branch.
- A local regression test proves that `thinking` remains enabled while `reasoning_effort` is omitted when compatibility disables it.

Do not paste the whole investigation diary into the issue. Link to a minimal reproduction or describe the request shape and observed error.

### Required checks before a Pi PR

`CONTRIBUTING.md` says to run:

```bash
npm run check
./test.sh
```

`AGENTS.md` adds nuance:

- After code changes, run `npm run check` from the repo root and fix all errors, warnings, and infos.
- Do not run the full Vitest suite directly.
- For non-e2e tests, run `./test.sh` from the repo root.
- If a specific test was created or modified, run that specific test and iterate until it passes.
- Do not edit `CHANGELOG.md`; maintainers add changelog entries.
- Do not modify `packages/ai/src/models.generated.ts` directly. If generation changes it, keep or revert intentionally; for this patch, generated model churn was unrelated and should stay out.

For the current `pi-ai` branch, the targeted regression test already passed with:

```bash
npm --prefix packages/ai test -- openai-completions-tool-choice.test.ts
```

Before a real PR, the upstream-compliant validation should be re-run from the monorepo root:

```bash
cd /home/manuel/code/wesen/2026-05-29--pi-deepseek-reasoning-fix
npm run check
./test.sh
```

If this is only a backport branch against `v0.77.0`, document that it is not meant to merge into current `main` unless maintainers want a release-branch patch.

## Recommended decision tree

### 1. Re-check upstream main

Before preparing a PR, verify whether the core `pi-ai` fix is already present upstream:

```bash
cd /home/manuel/code/wesen/2026-05-29--pi-deepseek-reasoning-fix
git fetch origin
git show origin/main:packages/ai/src/providers/openai-completions.ts | rg -n "reasoningEffort && compat.supportsReasoningEffort|thinkingFormat === \"deepseek\"" -C 3
```

If `origin/main` already has the guard, do not open a duplicate `pi-ai` PR against `main`. Instead:

- treat `fix/deepseek-reasoning-effort` as a local backport branch for installed `v0.77.0`, or
- ask maintainers whether they want a backport/release-branch PR, if such a branch exists.

### 2. If the core fix is missing in the target branch

Prepare a minimal PR:

- Base: the maintainer-approved target branch, usually `main` unless told otherwise.
- Files:
  - `packages/ai/src/providers/openai-completions.ts`
  - `packages/ai/test/openai-completions-tool-choice.test.ts`
- Do not include:
  - `package-lock.json` install noise
  - generated model catalog churn
  - `CHANGELOG.md`
  - local runtime patch artifacts

Suggested PR title:

```text
fix(ai): respect reasoning_effort compat in DeepSeek requests
```

Suggested PR body:

```markdown
## What

Make the OpenAI-completions DeepSeek request branch honor `compat.supportsReasoningEffort` before sending `reasoning_effort`.

## Why

Some DeepSeek-style OpenAI-compatible endpoints support `thinking` but reject OpenAI's separate `reasoning_effort` field. When both are sent together, these providers return `400 cannot specify both 'thinking' and 'reasoning_effort'`.

## How

The request builder still emits `thinking: { type: "enabled" | "disabled" }` for `thinkingFormat: "deepseek"`, but now emits `reasoning_effort` only when `compat.supportsReasoningEffort` is true.

## Tests

- `npm --prefix packages/ai test -- openai-completions-tool-choice.test.ts`
- `npm run check`
- `./test.sh`
```

Only include commands actually run before submitting.

### 3. If opening the provider PR instead

The provider repository did not show a local `CONTRIBUTING.md` or PR gate in the clone. The usual fork-and-PR flow should be enough, but check GitHub before pushing in case repository settings or branch protections add requirements.

Provider PR files:

- `index.ts`
- `README.md`

Suggested provider PR title:

```text
fix: disable reasoning_effort for Umans models
```

Suggested provider PR body:

```markdown
## What

Register Umans fallback and dynamically discovered models with `compat.supportsReasoningEffort: false`.

## Why

Umans models use DeepSeek-style `thinking` controls and reject OpenAI's separate `reasoning_effort` parameter when it is sent alongside `thinking`.

## How

The provider metadata now advertises that `reasoning_effort` is unsupported. The existing `before_provider_request` hook still strips the field defensively for older Pi AI versions.

## Tests

- `npm run check`
- `npm run build`
- `pi --no-session --no-extensions -e /home/manuel/code/wesen/2026-05-29--pi-provider-umans-reasoning-fix --list-models umans-glm-5.1`
```

## Fork-and-branch workflow without pushing yet

When ready to prepare the PR branch, use a fork remote rather than pushing to upstream directly.

```bash
cd /home/manuel/code/wesen/2026-05-29--pi-deepseek-reasoning-fix

git remote -v
# origin should be upstream read-only/source, or add an explicit upstream remote if origin is your fork.

git fetch origin

git switch fix/deepseek-reasoning-effort

git status --short
```

If using the GitHub CLI and a fork already exists:

```bash
gh repo fork earendil-works/pi --remote=false
# or add your fork manually:
git remote add fork git@github.com:<your-user>/pi.git
```

Before pushing, sync the base and decide whether to rebase/cherry-pick:

```bash
git fetch origin
# If targeting main and the fix is not already present:
git rebase origin/main
```

For this specific case, because upstream `main` already appears to contain the core fix, do not blindly rebase and push. The branch is based on `v0.77.0` for local backport validation.

## PR risk checklist

Before any PR is opened:

- [ ] Confirm the GitHub account has Pi `lgtm` approval for PRs, or open a concise contribution issue first.
- [ ] Confirm the target branch actually needs the `pi-ai` change.
- [ ] Keep the `pi-ai` PR to two files: source and regression test.
- [ ] Keep generated model catalogs out unless intentionally regenerated.
- [ ] Do not edit Pi `CHANGELOG.md`.
- [ ] Run and record `npm run check` and `./test.sh` for Pi, if submitting to Pi.
- [ ] Run and record provider smoke checks, if submitting to `pi-provider-umans`.
- [ ] Write the PR body in the same concise technical tone as `CONTRIBUTING.md` asks for.

## Usage examples

### Minimal contribution issue draft for Pi core

```markdown
### What do you want to change?

Make the OpenAI-completions DeepSeek request branch honor `compat.supportsReasoningEffort` before emitting `reasoning_effort`.

### Why?

Some DeepSeek-style OpenAI-compatible endpoints support `thinking` but reject `reasoning_effort` when both fields are sent. The current behavior can produce `400 cannot specify both 'thinking' and 'reasoning_effort'` during compaction with Umans GLM-style models.

### How? (optional)

Keep emitting `thinking` for `thinkingFormat: "deepseek"`, but guard `reasoning_effort` with `compat.supportsReasoningEffort`. Add a regression test that verifies `thinking` is enabled and `reasoning_effort` is omitted when compat disables it.
```

### Minimal provider PR draft

```markdown
## What

Set `compat.supportsReasoningEffort: false` for Umans fallback and dynamically discovered models.

## Why

Umans models use DeepSeek-style `thinking` controls and reject OpenAI `reasoning_effort` when it is sent alongside `thinking`.

## Tests

- `npm run check`
- `npm run build`
- `pi --no-session --no-extensions -e /home/manuel/code/wesen/2026-05-29--pi-provider-umans-reasoning-fix --list-models umans-glm-5.1`
```
