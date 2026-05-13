# Testing Pi Extensions

A practical guide to validating Pi extensions — from quick load checks to full interactive smoke tests in tmux.

## Quick Load Check (30 seconds)

After any change to an extension, verify it loads without import or registration errors:

```bash
timeout 20 pi --list-models
```

This does **not** start an interactive session. It loads all extensions, resolves their imports, runs `registerPiExtension()` and `pi.registerTool()`, and exits. If there are TypeScript import errors, missing dependencies, or registration crashes, you'll see them in stderr or the process will hang (hence the `timeout 20`).

**What it catches:**
- Import/require failures
- Missing `@mariozechner/*` dependencies
- Exceptions thrown during extension initialization
- Circular dependency issues

**What it does NOT catch:**
- Tool execute() runtime errors (only runs registration, not invocation)
- Incorrect tool parameter schemas that pass TS compilation but fail at runtime
- UI rendering bugs
- Launcher/action/doc wiring issues

## Automated Checks (optional)

If your extension has logic that can be unit-tested independently of Pi (e.g., argument builders, path resolvers, state machines), write a simple test script:

```bash
# Example: test that the image path resolver works
npx tsx extensions/image-qa/test-resolver.ts
```

For most extensions, the quick load check + interactive smoke test is sufficient. Don't add a test framework unless the extension has complex isolated logic.

## Interactive Smoke Test via tmux

For full validation — tool registration, launcher appearance, command execution, settings UI — use a tmux session so you can send keystrokes and capture output programmatically.

### 1. Start a tmux session

```bash
SESSION="pi-smoke"
tmux new-session -d -s "$SESSION" -x 120 -y 40
tmux send-keys -t "$SESSION" "pi" Enter
sleep 5  # wait for Pi to start and load extensions
```

Adjust the sleep based on your machine. 3-5 seconds is usually enough.

### 2. Verify the extension loaded

Capture the startup screen and check the `[Extensions]` section:

```bash
tmux capture-pane -t "$SESSION" -p -S -50 | grep "your-extension-id"
```

### 3. Test the slash command

```bash
tmux send-keys -t "$SESSION" "/your-command" Enter
sleep 2
tmux capture-pane -t "$SESSION" -p -S -10 | tail -10
```

You should see the command's output (e.g., a status notification).

### 4. Test the launcher

Open the launcher, search for your extension, and run its default action:

```bash
tmux send-keys -t "$SESSION" "/px"          # open launcher (don't press Enter yet)
sleep 1
tmux send-keys -t "$SESSION" "/"            # enter search mode
sleep 1
tmux send-keys -t "$SESSION" "Your Ext Name"  # type extension name
sleep 2
tmux send-keys -t "$SESSION" Enter          # run default action
sleep 2
tmux capture-pane -t "$SESSION" -p -S -10 | tail -10
```

**Tip:** The launcher search matches on the extension `name` field (human-readable), not just `id`. Use the exact name for reliable filtering.

### 5. Test tool registration

Ask the agent to list its tools:

```bash
tmux send-keys -t "$SESSION" "List all available tool names." Enter
sleep 15  # wait for LLM response
tmux capture-pane -t "$SESSION" -p -S -30 | tail -30
```

Verify your tool appears in the list.

### 6. Test tool execution (end-to-end)

For tools that invoke external commands (e.g., `pi.exec()`), do a real invocation:

```bash
# Example for image-qa: create a test image and ask about it
convert -size 200x100 xc:red /tmp/test-red-rectangle.png  # or use PIL

tmux send-keys -t "$SESSION" \
  "Use the ask_questions_about_images tool to ask: What color is this image? Image: /tmp/test-red-rectangle.png" \
  Enter
sleep 30  # wait for tool + pinocchio + LLM response
tmux capture-pane -t "$SESSION" -p -S -30 | tail -30
```

Look for:
- Tool call header (e.g., `ask_questions_about_images`)
- Tool output (the answer from pinocchio)
- The agent's summary of the result

### 7. Test settings

Open the launcher, select your extension, press `s`:

```bash
tmux send-keys -t "$SESSION" "/px"
sleep 1
tmux send-keys -t "$SESSION" "/"
sleep 1
tmux send-keys -t "$SESSION" "Your Ext Name"
sleep 2
tmux send-keys -t "$SESSION" "s"  # open settings
sleep 2
tmux capture-pane -t "$SESSION" -p -S -10 | tail -10
```

For schema settings, you should see the fields list. For custom settings, you should see your TUI component.

### 8. Clean up

```bash
tmux send-keys -t "$SESSION" C-c      # interrupt any running operation
sleep 1
tmux send-keys -t "$SESSION" C-d      # exit Pi
sleep 2
tmux kill-session -t "$SESSION" 2>/dev/null
```

## tmux Capture Cheatsheet

| Command | What it does |
|---------|-------------|
| `tmux capture-pane -t NAME -p` | Capture current visible pane |
| `tmux capture-pane -t NAME -p -S -50` | Capture last 50 lines of scrollback |
| `tmux capture-pane -t NAME -p \| tail -20` | Last 20 lines of the capture |
| `tmux capture-pane -t NAME -p \| grep "pattern"` | Search for a pattern in the output |

## Timing Guidelines

| Action | Sleep before capture |
|--------|-------------------|
| Pi startup | 3–5s |
| Slash command response | 1–3s |
| Launcher open | 1–2s |
| LLM short response | 10–15s |
| LLM + tool execution | 20–40s |
| Settings UI open | 1–2s |

These are conservative. If you're iterating quickly, reduce them and increase on failure.

## Common Pitfalls

### Launcher search doesn't find your extension

The search matches on the `name` field, not `id`. If your extension is registered with `name: "Image QA"`, searching for `image-qa` (the id) may not match. Search for the display name instead.

### Enter runs the wrong extension

If the launcher search hasn't narrowed the list enough, pressing Enter may select the first result (which could be a different extension). Type enough of the name to get a unique match, or use `j`/`k` to navigate to the right entry before pressing Enter.

### tmux capture shows stale content

`capture-pane` reads the terminal buffer. If Pi is still rendering, you may capture a partial frame. Add more sleep, or capture multiple times and compare.

### C-c doesn't interrupt

In some states (launcher overlay, settings UI), `C-c` may not propagate. Try `Escape` first, then `C-c`. As a last resort, `tmux kill-session` and start fresh.

### Tool doesn't appear in the agent's tool list

Check that:
1. `pi.registerTool()` is called in the extension's default export function
2. The extension loads without errors (`timeout 20 pi --list-models`)
3. The extension is symlinked in `~/.pi/agent/extensions/` (for local extensions)
4. No other extension overrides the tool name

## Full Checklist

After building an extension, run through this list:

- [ ] `timeout 20 pi --list-models` passes (no errors)
- [ ] Extension appears in startup `[Extensions]` list
- [ ] `/your-command` works
- [ ] `/px` → search for extension name → Enter → default action works
- [ ] `/px` → `a` → action picker shows expected actions
- [ ] `/px` → `?` → docs open correctly
- [ ] `/px` → `s` → settings load and apply correctly (if extension has settings)
- [ ] Tool name appears when agent lists available tools
- [ ] Tool `execute()` works end-to-end (real invocation, not just registration)
- [ ] Error paths work (missing file, bad input, timeout)
