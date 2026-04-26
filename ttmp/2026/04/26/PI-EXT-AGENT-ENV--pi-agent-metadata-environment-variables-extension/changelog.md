# Changelog

## 2026-04-26

- Initial workspace created


## 2026-04-26

Step 1: Created ticket PI-EXT-AGENT-ENV, researched PI extension APIs (tool_call, user_bash, spawnHook), analyzed three injection approaches, selected tool_call mutation for v1

### Related Files

- /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts — Extension API types


## 2026-04-26

Step 2: Wrote design/01-analysis.md with approach comparison and design/02-design.md with architecture, state spec, and env var schema

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/01-analysis.md — Analysis doc


## 2026-04-26

Checked off tasks: Research PI extension APIs (task 5) and Design agent metadata schema (task 2)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/tasks.md — Task tracking


## 2026-04-26

Step 3: Added independent plan review and revised design; identified unsafe double-quote shell escaping, recommended single-quote quoting, idempotence markers, tool_call type guard, safer user_bash handling, and PI_AGENT_TOOL_CALL_ID.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design-doc/01-plan-review-and-revised-design.md — Authoritative revised design review


## 2026-04-26

Checked task 7: Review prior plan and publish revised design guidance.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/tasks.md — Task tracking


## 2026-04-26

Added vocabulary entries for agent, environment, metadata, and pi-extensions so docmgr doctor validates the ticket topics.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/vocabulary.yaml — Topic vocabulary updates


## 2026-04-26

Uploaded plan review bundle to reMarkable at /ai/2026/04/26/PI-EXT-AGENT-ENV and verified remote listing.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/reference/01-diary.md — Diary updated with upload evidence


## 2026-04-26

Implementation kickoff: added detailed tasks and superseded unsafe double-quote escaping guidance in original analysis/design docs.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/01-analysis.md — Superseded escaping note
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/design/02-design.md — Superseded escaping note
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/tasks.md — Detailed implementation tasks


## 2026-04-26

Implemented agent-env v1 extension: safe env helper module, bash tool_call injection, user_bash injection, status/preview/toggle/self-test commands, and README.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/README.md — User docs
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/env.ts — Env helpers
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/agent-env/index.ts — Extension handlers


## 2026-04-26

Installed agent-env extension symlink under ~/.pi/agent/extensions/agent-env for auto-discovery.

### Related Files

- /home/manuel/.pi/agent/extensions/agent-env — Symlink to source-controlled agent-env extension


## 2026-04-26

Validated agent-env in tmux: /agent-env-self-test passed, LLM bash tool call printed PI_AGENT=1 TRIGGER=tool_call with non-empty tool call ID, and ! user_bash printed PI_AGENT=1 TRIGGER=user_bash.

### Related Files

- /tmp/agent-env-pi.log — tmux PI validation transcript


## 2026-04-26

Completed implementation tasks: v1 extension implemented, README and symlink added, tmux bash/user_bash validation passed, diary updated through Step 5.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/reference/01-diary.md — Implementation and validation diary
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/tasks.md — Task completion


## 2026-04-26

Checked placeholder task after detailed implementation tasks were added and completed.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/04/26/PI-EXT-AGENT-ENV--pi-agent-metadata-environment-variables-extension/tasks.md — All tasks checked

