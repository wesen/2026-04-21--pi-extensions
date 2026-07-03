---
title: Demo greeting
description: Minimal template to smoke-test prompto
fields:
  - name: name
    label: Name to greet
    type: string
    required: true
  - name: language
    label: Language
    type: choice
    choices: [English, Spanish, German]
    default: English
---
Please greet {{name}}.
{{#if language == "Spanish"}}
Answer in Spanish.
{{/if}}
{{#if language == "German"}}
Answer in German.
{{/if}}
