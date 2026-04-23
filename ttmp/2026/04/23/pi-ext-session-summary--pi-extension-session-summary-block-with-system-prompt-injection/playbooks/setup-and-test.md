---
ticket: pi-ext-session-summary
title: "Playbook: Scaffold, Run, and Test the Session Summary Extension"
doc-type: playbook
topics:
  - pi
  - extensions
  - testing
created: 2026-04-23
author: manuel
related_files:
  - "~/.pi/agent/extensions/session-summary.ts:The extension file"
---

# Playbook: Scaffold, Run, and Test the Session Summary Extension

## Step 1: Verify Pi Installation

```bash
pi --version
```

## Step 2: Create the Extension File

```bash
mkdir -p ~/.pi/agent/extensions
cat > ~/.pi/agent/extensions/session-summary.ts << 'EOF'
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const WIDGET_KEY = "session-summary";

const SYSTEM_PROMPT_INSTRUCTION = `
At the end of every turn, before you finish responding, you MUST output a
<summary>...</summary> block that recaps:

1. What work you did THIS TURN
2. What work has been done in the ENTIRE SESSION so far
3. Any ISSUES or BLOCKERS you encountered
4. What the NEXT STEPS should be

The summary must be the LAST thing in your response.
`;

const USER_PROMPT_REMINDER = "\n\nDon't forget to add the <summary>...</summary> block at the end of your response.";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    return { systemPrompt: event.systemPrompt + "\n\n" + SYSTEM_PROMPT_INSTRUCTION };
  });

  pi.on("input", async (event) => {
    if (event.source !== "user") return;
    if (event.prompt.includes(USER_PROMPT_REMINDER.trim())) return;
    return { prompt: event.prompt + USER_PROMPT_REMINDER };
  });

  pi.on("turn_end", async (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;

    const fullText = message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const match = fullText.match(/<summary>([\s\S]*?)<\/summary>/);

    if (match && match[1].trim()) {
      ctx.ui.setWidget(WIDGET_KEY, ["📋 Summary", "", ...match[1].trim().split("\n").slice(0, 10)], { placement: "aboveEditor" });
    } else {
      ctx.ui.setWidget(WIDGET_KEY, ["⚠️ No summary detected"], { placement: "aboveEditor" });
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });
}
EOF
```

## Step 3: Test with `--extension`

```bash
pi -e ~/.pi/agent/extensions/session-summary.ts
```

At the Pi prompt, ask:

```
Read the package.json and tell me what the project is about.
Show your work.
```

## Step 4: Verify System Prompt Injection

Add temporary logging to `before_agent_start`:

```typescript
pi.on("before_agent_start", async (event) => {
  console.log("[session-summary] Modifying system prompt");
  return { systemPrompt: event.systemPrompt + "\n\n" + SYSTEM_PROMPT_INSTRUCTION };
});
```

`/reload` and check terminal output.

## Step 5: Verify Prompt Injection

Add temporary logging to `input`:

```typescript
pi.on("input", async (event) => {
  if (event.source !== "user") return;
  const modified = event.prompt + USER_PROMPT_REMINDER;
  console.log("[session-summary] Prompt ends with:", modified.slice(-80));
  return { prompt: modified };
});
```

`/reload` and send a prompt. Check terminal output.

## Step 6: Verify Summary Detection

Add temporary logging to `turn_end`:

```typescript
pi.on("turn_end", async (event) => {
  const fullText = event.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const hasSummary = fullText.includes("<summary>");
  console.log("[session-summary] Turn", event.turnIndex, "has summary:", hasSummary);
});
```

## Step 7: Test Auto-Discovery

Exit Pi, then restart normally:

```bash
pi
```

The extension should load automatically.

## Troubleshooting

| Problem | Check |
|---------|-------|
| Extension not loading | File path: `~/.pi/agent/extensions/*.ts` |
| No summaries produced | Check system prompt injection with logging |
| Reminder not appended | Check `input` handler with logging |
| Widget never shows | Check `turn_end` handler with logging |
| Widget persists | Verify `agent_end` cleanup handler |
| Type errors | Use `import type` for Pi packages |
