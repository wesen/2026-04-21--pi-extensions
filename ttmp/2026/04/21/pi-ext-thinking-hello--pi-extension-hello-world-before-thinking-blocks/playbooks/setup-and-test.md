---
ticket: pi-ext-thinking-hello
title: "Playbook: Scaffold, Run, and Debug the Extension"
doc-type: playbook
topics:
  - pi
  - extensions
  - testing
created: 2026-04-21
author: manuel
related_files:
  - "~/.pi/agent/extensions/hello-world-thinking.ts:The extension file"
---

# Playbook: Scaffold, Run, and Debug the Extension

## Step 1: Verify Pi Installation

```bash
pi --version
# Expected: prints version number
```

If not installed, follow the Pi installation guide at https://github.com/badlogic/pi-mono.

## Step 2: Verify Thinking-Capable Model

```bash
pi --list-models | grep -i "claude\|o1\|deepseek"
```

Ensure you have at least one model configured that emits thinking blocks. Claude 3.7 Sonnet is recommended.

## Step 3: Create the Extension File

```bash
mkdir -p ~/.pi/agent/extensions
cat > ~/.pi/agent/extensions/hello-world-thinking.ts << 'EOF'
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const WIDGET_KEY = "hello-world-thinking";

export default function (pi: ExtensionAPI) {
  let active = false;

  pi.on("message_update", async (event, ctx) => {
    const e = event.assistantMessageEvent;
    if (e.type === "thinking_start") {
      active = true;
      ctx.ui.setWidget(WIDGET_KEY, ["🌍 Hello World"], { placement: "aboveEditor" });
    }
    if (e.type === "thinking_end" && active) {
      active = false;
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
    if (e.type === "error") {
      active = false;
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    active = false;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });
}
EOF
```

## Step 4: Test with `--extension`

```bash
pi -e ~/.pi/agent/extensions/hello-world-thinking.ts
```

At the Pi prompt, ask:

```
Solve step by step: what is 47 * 83?
```

## Step 5: Test Auto-Discovery

Exit Pi (`Ctrl+C`), then restart normally:

```bash
pi
```

The extension should load automatically.

## Step 6: Enable Debug Logging

Add temporary logging to trace events:

```typescript
pi.on("message_update", async (event) => {
  console.log("[debug]", event.assistantMessageEvent.type);
});
```

Reload with `/reload` and watch the terminal output.

## Step 7: Clean Up Debug Code

Remove all `console.log()` statements before considering the extension complete.

## Troubleshooting

| Problem | Check |
|---------|-------|
| Extension not loading | File path: `~/.pi/agent/extensions/*.ts` |
| Widget never appears | Model emits thinking? Check with `console.log` |
| Widget persists | Add `agent_end` and `message_end` handlers |
| Type errors | Use `import type` for Pi packages |
