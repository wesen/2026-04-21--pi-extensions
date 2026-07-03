---
title: Implement task-by-task with diary and commits
description: Break work into tasks, implement incrementally, commit at sensible intervals, and maintain a detailed diary
submit: editor
fields:
  - name: task
    label: Task to implement
    type: text
    required: true
    help: Paste the feature request, bug, ticket goal, or implementation plan.
  - name: ticketId
    label: Docmgr ticket ID
    type: string
    placeholder: Optional; leave blank if there is no ticket yet
  - name: taskSource
    label: Task source
    type: choice
    choices: [infer-from-request, use-docmgr-tasks, use-existing-plan]
    default: infer-from-request
  - name: commitFrequency
    label: Commit frequency
    type: choice
    choices: [after-coherent-milestones, after-each-completed-task, ask-before-each-commit]
    default: after-coherent-milestones
  - name: diaryTarget
    label: Diary target
    type: choice
    choices: [docmgr-diary, repository-diary, ask-if-missing]
    default: docmgr-diary
  - name: validationCommand
    label: Validation command
    type: string
    placeholder: e.g. go test ./... -count=1 or npm test
  - name: pushWhenDone
    label: Push commits when done
    type: boolean
    default: false
  - name: commitDocsSeparately
    label: Commit diary/docs separately when practical
    type: boolean
    default: true
---
Implement the following task incrementally, task by task:

{{task}}

Use or load the relevant skills before doing the work. In particular, consider `diary`, `docmgr`, and `git-commit-instructions`; also load any language/framework-specific skill that matches the repository and task.

{{#if ticketId}}
Use docmgr ticket `{{ticketId}}` for task tracking, diary updates, file relations, and changelog updates.
{{/if}}
{{#if taskSource == "infer-from-request"}}
Infer a concrete task list from the request before editing. Present the plan briefly, then proceed unless a missing decision would materially change the implementation.
{{/if}}
{{#if taskSource == "use-docmgr-tasks"}}
Read the docmgr ticket tasks first and implement them in order unless dependencies require a different order. Update task status as each task completes.
{{/if}}
{{#if taskSource == "use-existing-plan"}}
Find and follow the existing plan in the repository or ticket docs. If multiple plans conflict, stop and ask which one is authoritative.
{{/if}}

Working rules:

1. Inspect the repository and relevant docs before editing. Preserve unrelated user changes.
2. Build a small, ordered task list with validation checkpoints.
3. Implement one task or coherent milestone at a time.
4. Run formatting and targeted validation after each meaningful change.
{{#if validationCommand}}
5. Use this validation command when applicable: `{{validationCommand}}`.
{{/if}}
6. Record failures immediately in the diary with exact commands and error output.
7. Before every commit, inspect `git status --porcelain`, `git diff --stat`, and staged changes.
8. Stage intentionally; do not use broad staging if unrelated files are present.

{{#if commitFrequency == "after-coherent-milestones"}}
Commit after coherent milestones that leave the repository in a reviewable and validated state. Avoid tiny commits for mechanical substeps unless they clarify review.
{{/if}}
{{#if commitFrequency == "after-each-completed-task"}}
Commit after each completed task when the code is formatted and validated.
{{/if}}
{{#if commitFrequency == "ask-before-each-commit"}}
Ask before creating each commit, but still prepare focused staged changes and a proposed commit message.
{{/if}}

{{#if diaryTarget == "docmgr-diary"}}
Maintain a docmgr diary using the standard diary skill format. If no diary exists for the ticket, create one. Relate modified and decision-shaping files with absolute paths, and update the changelog after completed milestones.
{{/if}}
{{#if diaryTarget == "repository-diary"}}
Maintain or create a repository-local Markdown diary if the project already uses one. Follow the standard diary skill structure as closely as practical.
{{/if}}
{{#if diaryTarget == "ask-if-missing"}}
If no diary exists, ask where to create it before writing long-form diary content.
{{/if}}

The diary must include prompt context, what changed, why, exact commands and failures, what worked, what did not work, what was tricky, what warrants a second pair of eyes, future follow-ups, code review instructions, and validation commands.

{{#if commitDocsSeparately}}
When practical, keep implementation commits separate from diary/docmgr bookkeeping commits. If splitting would create confusing history, make a single focused commit and explain why.
{{/if}}
{{#if pushWhenDone}}
Push the resulting commits after final validation, unless the remote or branch state makes that unsafe. Report the push result.
{{/if}}

Final response should list completed tasks, commits created, validation results, diary/doc paths updated, unresolved issues, and next steps.
