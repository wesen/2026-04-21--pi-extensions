# direnv-bash extension

Loads the nearest allowed `direnv` environment before every Pi `bash` tool call and before user `!` / `!!` shell commands.

## Install

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/direnv-bash ~/.pi/agent/extensions/direnv-bash
```

Reload Pi with `/reload`, or start a new session.

## How it works

The extension listens for Pi's `tool_call` event, narrows to the built-in `bash` tool, and mutates `event.input.command` before Pi executes it. The inserted preamble does this:

```bash
if command -v direnv >/dev/null 2>&1; then
  __pi_direnv_export="$(direnv export bash)"
  __pi_direnv_status=$?
  if [ $__pi_direnv_status -eq 0 ]; then
    eval "$__pi_direnv_export"
  fi
fi
```

`direnv export bash` prints the shell code needed to apply `.envrc` changes for the current working directory. Evaluating that code in the same shell process makes the user's actual command see those variables.

For user `!` / `!!` commands, the extension wraps `createLocalBashOperations()` via the `user_bash` event and prepends the same preamble.

## Commands

| Command | Description |
|---|---|
| `/direnv-bash` | Show current state |
| `/direnv-bash on` | Enable injection |
| `/direnv-bash off` | Disable injection |
| `/direnv-bash toggle` | Toggle injection |
| `/direnv-bash quiet` | Hide `direnv export bash` stderr |
| `/direnv-bash no-quiet` | Show `direnv export bash` stderr |
| `/direnv-bash strict` | Make missing/failing direnv fail the shell command |
| `/direnv-bash no-strict` | Treat missing/failing direnv as best-effort |
| `/dbash ...` | Short alias |
| `/direnv-bash-self-test` | Run internal and shell smoke tests |

## Safety notes

- The extension does not auto-run untrusted `.envrc` files. `direnv` still enforces its normal `direnv allow` trust gate.
- Default mode is best-effort: if `direnv` is missing or `.envrc` is not allowed, the original command still runs.
- Strict mode is available when you want commands to fail unless the direnv environment loaded successfully.
- Idempotence markers prevent double-injection when a command is wrapped more than once.
