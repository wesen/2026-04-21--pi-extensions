---
title: Create docmgr ticket + analysis plan
description: Scaffold a docmgr ticket and ask for a project analysis plan
submit: editor
fields:
  - name: goal
    label: Ticket goal
    type: text
    required: true
    help: What should this ticket achieve?
  - name: ticketTitle
    label: Ticket title
    type: string
    placeholder: SCREAMING-KEBAB short title
  - name: topics
    label: Topics
    type: multichoice
    choices: [analysis, design, refactor, tui, docs, pi-extensions]
    default: [analysis]
  - name: planDepth
    label: Analysis plan depth
    type: choice
    choices: [full, light]
    default: full
  - name: uploadRemarkable
    label: Upload report to reMarkable when done
    type: boolean
    default: true
prefill:
  fields: [ticketTitle]
  when: after-required
  prompt: |
    Given this ticket goal, propose a short SCREAMING-KEBAB ticket title
    (like FROB-ANALYSIS, at most 3 words). Goal: {{goal}}
---
Create a new docmgr ticket titled "{{ticketTitle}}" with topics {{topics}}.
The goal of the ticket:

{{goal}}

Then write a project analysis plan.
{{#if planDepth == "full"}}
Make the plan exhaustive: architecture map, evidence with file references,
risk register, and a phased implementation outline.
{{/if}}
{{#if planDepth == "light"}}
Keep the plan light: a one-page summary of scope, approach, and risks.
{{/if}}
{{#if uploadRemarkable}}
When the analysis document is complete, upload it to reMarkable.
{{/if}}
