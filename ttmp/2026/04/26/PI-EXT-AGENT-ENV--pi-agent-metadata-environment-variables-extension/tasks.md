# Tasks

## TODO

- [ ] Add tasks here

- [x] Design agent metadata schema (which vars to expose)
- [ ] Test extension with sample bash commands and verify env vars
- [ ] Document extension in ticket and create symlink to ~/.pi/agent/extensions/
- [x] Research PI extension APIs for tool call interception and env injection
- [ ] Implement v1 extension using tool_call event mutation
- [x] Review prior plan and publish revised design guidance
- [x] Supersede unsafe double-quote escaping guidance in original design docs with reference to revised review
- [x] Create extensions/agent-env env helpers with single-quote shell quoting, truncation, idempotent preamble markers, and env snapshot builder
- [x] Create extensions/agent-env index extension handlers for session/turn/model state, bash tool_call injection, user_bash injection, status, and commands
- [x] Add README with installation, variables, safety notes, and testing commands
- [ ] Run local shell/self-test checks for shell quoting and preamble idempotence
- [ ] Install or update symlink under ~/.pi/agent/extensions/agent-env
- [ ] Run PI in tmux with agent-env extension and verify PI_AGENT_* variables in a bash tool call
- [ ] Record implementation/testing diary entries and commit docs/code at reviewable intervals
