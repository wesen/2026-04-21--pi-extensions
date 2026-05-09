---
Title: Analysis design and implementation guide
Ticket: PI-EXT-DIRENV-BASH
Status: active
Topics:
    - pi-extensions
    - tooling
    - environment
    - direnv
DocType: design
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/direnv-bash/README.md
      Note: User-facing install and command reference
    - Path: extensions/direnv-bash/direnv.ts
      Note: Direnv shell preamble helper and self-tests
    - Path: extensions/direnv-bash/index.ts
      Note: Pi extension entry point with tool_call and user_bash integration
    - Path: ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/01-standalone-direnv-preamble-test.sh
    - Path: ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/02-tmux-pi-direnv-bash-smoke.sh
ExternalSources:
    - /home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
Summary: Design and intern-facing implementation guide for a Pi extension that applies direnv environments to bash commands.
LastUpdated: 2026-04-27T10:00:00-04:00
WhatFor: Use this to understand, maintain, and extend the direnv-bash Pi extension.
WhenToUse: Read before modifying bash interception, direnv loading behavior, commands, or tmux validation scripts.
---


# Pi direnv-bash extension: analysis, design, and implementation guide

## 1. Executive summary

The `direnv-bash` extension makes Pi's shell commands behave like a developer's interactive project shell. When Pi runs a `bash` tool call, or when a human runs a `!` or `!!` command in Pi, the extension asks `direnv` for the environment that applies to the current working directory and evaluates that environment in the same shell process before the requested command runs.

The practical effect is simple:

- if a project has an allowed `.envrc`, Pi's bash commands see the project's variables;
- if a project uses `.envrc` to add tools to `PATH`, Pi can run those tools;
- if `.envrc` is not allowed yet, `direnv` still protects the user and refuses to load it;
- if `direnv` is missing, default mode is best-effort and the command still runs.

The implementation is intentionally small. It does not replace Pi's built-in bash tool. Instead, it uses Pi extension hooks to mutate the command string before Pi executes it. This keeps the standard Pi shell behavior, output capture, timeout handling, cancellation behavior, and TUI rendering intact.

## 2. System context

### 2.1 What is Pi?

Pi is a terminal coding harness. A language model can call tools such as `read`, `write`, `edit`, and `bash`. Extensions are TypeScript modules loaded by Pi at startup. They can:

- listen to events such as `session_start`, `tool_call`, and `user_bash`;
- register slash commands;
- modify tool arguments before execution;
- wrap user shell commands;
- show status in the TUI.

The upstream extension API reference is:

- `/home/manuel/.nvm/versions/node/v22.22.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`

The specific APIs used by this extension are:

| API | File use | Why it matters |
|---|---|---|
| `ExtensionAPI` | `extensions/direnv-bash/index.ts` | Type for the default exported extension factory. |
| `ExtensionContext` | `extensions/direnv-bash/index.ts` | Provides `cwd`, UI, and session context to event handlers. |
| `pi.on("tool_call", handler)` | `extensions/direnv-bash/index.ts` | Intercepts LLM-initiated bash tool calls before execution. |
| `isToolCallEventType("bash", event)` | `extensions/direnv-bash/index.ts` | Safely narrows generic tool events to bash calls. |
| `pi.on("user_bash", handler)` | `extensions/direnv-bash/index.ts` | Wraps human `!` / `!!` commands. |
| `createLocalBashOperations()` | `extensions/direnv-bash/index.ts` | Reuses Pi's built-in local shell backend for user bash commands. |
| `pi.registerCommand(...)` | `extensions/direnv-bash/index.ts` | Adds `/direnv-bash`, `/dbash`, and `/direnv-bash-self-test`. |
| `ctx.ui.setStatus(...)` | `extensions/direnv-bash/index.ts` | Shows compact extension state in the Pi footer. |
| `ctx.ui.notify(...)` | `extensions/direnv-bash/index.ts` | Displays command output for configuration and self-test commands. |

### 2.2 What is direnv?

`direnv` is a shell environment loader. A project can contain a `.envrc` file. When trusted with `direnv allow`, `direnv` evaluates that file in a controlled way and emits environment changes for a target shell.

Important command:

```bash
direnv export bash
```

This prints Bash code, not plain key/value text. Example shape:

```bash
export FOO='bar'
export PATH='/some/project/bin:'"$PATH"
```

To apply it to the current shell process, a shell must evaluate the output:

```bash
eval "$(direnv export bash)"
```

That `eval` must happen in the same shell process as the subsequent command. If we ran `direnv export bash` in a separate process and then launched the user's command in a new shell, the environment would be lost.

## 3. Problem statement

Without this extension, Pi's `bash` tool runs in the repository directory, but it may not have the same environment as the user's interactive shell. Projects often rely on `.envrc` for:

- adding language toolchains to `PATH`;
- exporting local service URLs;
- selecting Python/Node/Go versions;
- loading non-secret development variables;
- configuring build caches or package managers.

This can produce confusing failures:

```text
command not found: my-project-cli
missing DATABASE_URL
wrong node version
wrong go path
```

The goal is to make Pi's shell execution respect direnv with minimal risk and minimal interference with Pi's existing behavior.

## 4. Requirements

### 4.1 Functional requirements

1. LLM `bash` tool calls should load the current directory's allowed direnv environment before executing the requested command.
2. User `!` and `!!` commands should load the same environment.
3. The extension should be installable through Pi's extension auto-discovery path.
4. It should expose status and configuration through slash commands.
5. It should avoid injecting duplicate preambles into already-wrapped commands.
6. It should have an internal self-test and ticket-local test scripts.
7. It should be testable inside `tmux`.

### 4.2 Non-functional requirements

- **Safety:** do not bypass direnv's `direnv allow` trust model.
- **Compatibility:** do not replace the built-in bash tool unless absolutely necessary.
- **Observability:** make status visible with a compact footer entry.
- **Maintainability:** split shell-preamble construction into a helper module with pure tests.
- **Best-effort by default:** if `direnv` is unavailable or export fails, keep the original command running unless strict mode is enabled.

## 5. Design choice: event mutation instead of tool replacement

Pi supports two ways to affect bash execution:

1. override the built-in `bash` tool by registering a new `bash` tool;
2. listen for `tool_call` events and mutate `event.input.command`.

We choose option 2.

Why:

- Pi's built-in bash tool already handles output truncation, cancellation, timeouts, rendering, shell choice, and process cleanup.
- Reimplementing all of that would introduce bugs and maintenance cost.
- The extension only needs to prepend shell code, so command mutation is enough.

The core tool-call pseudocode is:

```text
on every tool_call event:
  if extension is disabled:
    return
  if event is not the built-in bash tool:
    return

  preamble = buildDirenvBashPreamble(options)
  newCommand = injectDirenvBashPreamble(event.input.command, preamble)

  if newCommand changed:
    event.input.command = newCommand
    increment injection counter
    update footer status
```

## 6. Runtime flow diagrams

### 6.1 LLM bash tool call

```text
Assistant decides to call bash
        |
        v
Pi emits tool_execution_start
        |
        v
Pi emits tool_call -------------------------------+
        |                                         |
        | direnv-bash receives event              |
        | - confirm tool is bash                  |
        | - build preamble                        |
        | - prepend preamble to command           |
        | - mutate event.input.command            |
        |                                         |
        +<----------------------------------------+
        |
        v
Pi built-in bash tool executes mutated command
        |
        v
Shell runs:
  # PI_DIRENV_BASH_BEGIN v1
  eval "$(direnv export bash)"
  # PI_DIRENV_BASH_END v1
  original user command
        |
        v
Output returns to model and TUI
```

### 6.2 Human `!` or `!!` command

```text
Human types !make test in Pi
        |
        v
Pi emits user_bash
        |
        v
direnv-bash returns wrapped local bash operations
        |
        v
Pi calls operations.exec(command, cwd, options)
        |
        v
Wrapper prepends direnv preamble
        |
        v
createLocalBashOperations().exec(...) runs the command
```

### 6.3 Shell environment application

```text
shell starts in cwd
        |
        v
command -v direnv?
   | yes                         | no
   v                             v
__pi_direnv_export="$(direnv export bash)"    best-effort no-op
        |
        v
status == 0?
   | yes                         | no
   v                             v
eval "$__pi_direnv_export"       best-effort no-op or strict failure
        |
        v
run original command in same shell process
```

## 7. File map

| File | Purpose |
|---|---|
| `extensions/direnv-bash/index.ts` | Pi extension entry point: event handlers, commands, status, self-test command. |
| `extensions/direnv-bash/direnv.ts` | Pure helper functions for preamble construction, idempotent injection, and internal tests. |
| `extensions/direnv-bash/README.md` | User-facing install and command reference. |
| `ttmp/.../scripts/01-standalone-direnv-preamble-test.sh` | Creates a temporary `.envrc`, allows it, and verifies the generated shell pattern loads an env var. |
| `ttmp/.../scripts/02-tmux-pi-direnv-bash-smoke.sh` | Runs Pi extension loading and a direnv shell check inside tmux. |
| `~/.pi/agent/extensions/direnv-bash` | Symlink for Pi auto-discovery. |

## 8. Implementation walkthrough

### 8.1 Preamble helper: `direnv.ts`

The helper module exports constants and pure functions:

```typescript
export const DIRENV_BASH_MARKER_BEGIN = "# PI_DIRENV_BASH_BEGIN v1";
export const DIRENV_BASH_MARKER_END = "# PI_DIRENV_BASH_END v1";
```

The markers are comments inserted into the shell command. They solve idempotence. If a command already contains both markers, `injectDirenvBashPreamble()` returns it unchanged.

The core preamble builder is:

```typescript
buildDirenvBashPreamble({ quiet, strict })
```

Options:

- `quiet`: redirect `direnv export bash` stderr to `/dev/null`.
- `strict`: fail the entire command when `direnv` is missing or export fails.

Default mode is equivalent to:

```bash
# PI_DIRENV_BASH_BEGIN v1
if command -v direnv >/dev/null 2>&1; then
  __pi_direnv_export="$(direnv export bash)"
  __pi_direnv_status=$?
  if [ $__pi_direnv_status -eq 0 ]; then
    eval "$__pi_direnv_export"
  else
    :
  fi
  unset __pi_direnv_export __pi_direnv_status
else
  :
fi
# PI_DIRENV_BASH_END v1
```

The generated code deliberately uses a temporary variable instead of a one-liner:

```bash
__pi_direnv_export="$(direnv export bash)"
__pi_direnv_status=$?
if [ $__pi_direnv_status -eq 0 ]; then
  eval "$__pi_direnv_export"
fi
```

This lets us observe whether `direnv export bash` succeeded before evaluating output. It also lets strict mode produce useful failure messages.

### 8.2 Tool-call interception: `index.ts`

The extension default export is:

```typescript
export default function direnvBashExtension(pi: ExtensionAPI): void {
  ...
}
```

Pi calls this function when loading the extension.

The tool-call handler is:

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (!state.enabled) return;
  if (!isToolCallEventType("bash", event)) return;

  const preamble = buildDirenvBashPreamble(toOptions(state));
  const nextCommand = injectDirenvBashPreamble(event.input.command, preamble);

  if (nextCommand !== event.input.command) {
    event.input.command = nextCommand;
    recordInjection(ctx, state, event.toolCallId);
  }
});
```

Important details for interns:

- `event.input` is mutable by design in Pi's extension API.
- The mutation must happen before the built-in tool runs.
- `isToolCallEventType("bash", event)` is the safe way to narrow the event, so TypeScript knows `event.input.command` exists.
- We do not return a replacement result; we only change the command.

### 8.3 User bash wrapping: `index.ts`

Human shell commands in Pi use the `user_bash` event, not the `bash` tool. The extension wraps those with local bash operations:

```typescript
pi.on("user_bash", async (_event, ctx) => {
  if (!state.enabled) return;
  const ops = createLocalBashOperations();
  return {
    operations: {
      exec: (command, cwd, options) => {
        const nextCommand = injectDirenvBashPreamble(command, buildDirenvBashPreamble(toOptions(state)));
        return ops.exec(nextCommand, cwd, options);
      },
    },
  };
});
```

This is a wrapper, not a full reimplementation. It reuses Pi's local process backend and changes only the command string.

### 8.4 State and UI

State is deliberately in-memory because the extension's settings are lightweight session preferences:

```typescript
interface DirenvBashState {
  enabled: boolean;
  quiet: boolean;
  strict: boolean;
  injectionCount: number;
  lastInjectionAt: string | undefined;
  lastToolCallId: string | undefined;
}
```

Footer status is updated by:

```typescript
ctx.ui.setStatus("direnv-bash", "direnv:on n=3")
```

Examples:

- `direnv:on n=0`
- `direnv:on(quiet) n=4`
- `direnv:off n=4`
- `direnv:on(quiet,strict) n=12`

### 8.5 Slash commands

The extension registers:

| Command | Purpose |
|---|---|
| `/direnv-bash` | Show current state. |
| `/direnv-bash on` | Enable wrapping. |
| `/direnv-bash off` | Disable wrapping. |
| `/direnv-bash toggle` | Toggle wrapping. |
| `/direnv-bash quiet` | Hide `direnv` stderr. |
| `/direnv-bash no-quiet` | Show `direnv` stderr. |
| `/direnv-bash strict` | Fail if direnv cannot load. |
| `/direnv-bash no-strict` | Return to best-effort behavior. |
| `/dbash` | Short alias for `/direnv-bash`. |
| `/direnv-bash-self-test` | Run internal tests and one shell execution smoke test. |

Command parsing accepts several synonyms:

```text
on enable enabled
off disable disabled
toggle
quiet no-quiet verbose
strict no-strict best-effort
```

## 9. Security and safety analysis

### 9.1 This does not bypass `direnv allow`

The extension calls `direnv export bash`. It does not source `.envrc` directly. That means direnv still enforces its normal trust rules. If `.envrc` changed and is no longer allowed, direnv refuses to export the environment.

This is important. A tempting but unsafe alternative would be:

```bash
source .envrc
```

That would bypass direnv's allow gate and execute arbitrary project shell code directly. The extension does **not** do that.

### 9.2 Environment variables can affect command behavior

Loading direnv changes the environment. That is the goal, but it also means commands can behave differently. Examples:

- `PATH` may point to project-local binaries;
- `GIT_*` variables could affect Git commands;
- language-specific variables could change dependency resolution.

Intern rule: if debugging a strange bash behavior, run `/direnv-bash off` and compare.

### 9.3 Strict vs best-effort behavior

Default mode is best-effort because developer convenience is the normal use case. The original command still runs if `direnv` is missing or refuses to export.

Strict mode is useful in projects where missing direnv should be considered a hard failure:

```text
/direnv-bash strict
```

## 10. Installation

The source-controlled extension lives at:

```text
/home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash
```

It is installed for auto-discovery via symlink:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash ~/.pi/agent/extensions/direnv-bash
```

Pi discovers extension directories with an `index.ts` file under `~/.pi/agent/extensions/`.

Reload an existing Pi session with:

```text
/reload
```

Or start a new Pi session.

## 11. Validation strategy

Validation has three layers.

### 11.1 Pure helper validation

`runInternalSelfTests()` verifies:

- markers exist;
- generated preamble contains `direnv export bash`;
- injection is idempotent;
- quiet mode changes stderr handling;
- strict mode emits failure exits.

### 11.2 Standalone shell validation

Script:

```text
ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/01-standalone-direnv-preamble-test.sh
```

It creates a temporary project, writes `.envrc`, runs `direnv allow`, evaluates the preamble pattern, and checks that the variable is visible.

### 11.3 Tmux validation

Script:

```text
ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/02-tmux-pi-direnv-bash-smoke.sh
```

It starts a tmux session and verifies two things:

1. Pi can load `extensions/direnv-bash` through `-e` without startup errors.
2. The direnv export/eval shell pattern loads a value inside the tmux pane.

Observed successful output:

```text
No models matching "no-such-model"
direnv: loading /tmp/.../.envrc
direnv: export +PI_DIRENV_BASH_TEST_VALUE
TMUX_DIRENV_VALUE=loaded-inside-tmux

EXIT=0
PASS: pi loaded extensions/direnv-bash and direnv exported env inside tmux
```

## 12. Common troubleshooting

### 12.1 `direnv` output appears in command results

If the model sees noisy `direnv: loading ...` output, enable quiet mode:

```text
/direnv-bash quiet
```

### 12.2 Variables are missing

Check these in order:

```bash
command -v direnv
pwd
ls -la .envrc
direnv status
direnv allow .
direnv export bash
```

Then run in Pi:

```text
/direnv-bash
```

Make sure it says enabled.

### 12.3 Commands should fail if direnv fails

Use strict mode:

```text
/direnv-bash strict
```

### 12.4 Need to compare with raw shell behavior

Temporarily disable:

```text
/direnv-bash off
```

Run the command again, then re-enable:

```text
/direnv-bash on
```

## 13. Future improvements

Potential next steps:

- Persist settings across reloads using `pi.appendEntry()` or a settings file.
- Add a command to show the exact generated preamble.
- Add a command to run `direnv status` in the current `ctx.cwd`.
- Add an optional allowlist/denylist for directories.
- Add a custom message renderer for self-test results.
- Add a direct integration test that asks a model to run a bash tool in a temporary direnv project, if a cheap local model is configured.

## 14. Intern checklist for changes

Before modifying the extension:

- read `extensions/direnv-bash/index.ts` and `extensions/direnv-bash/direnv.ts`;
- read the Pi `tool_call` and `user_bash` sections in `docs/extensions.md`;
- run the two ticket scripts;
- keep command mutation minimal;
- do not directly `source .envrc`;
- preserve idempotence markers;
- update this guide and the playbook if behavior changes.

After modifying:

```bash
pi --no-session --no-extensions -e ./extensions/direnv-bash --list-models no-such-model
./ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/01-standalone-direnv-preamble-test.sh
./ttmp/2026/04/27/PI-EXT-DIRENV-BASH--pi-extension-to-load-direnv-for-bash-commands/scripts/02-tmux-pi-direnv-bash-smoke.sh
```

Success means:

- Pi exits 0 when loading the extension;
- standalone preamble test prints `PASS`;
- tmux smoke test prints `PASS`.
