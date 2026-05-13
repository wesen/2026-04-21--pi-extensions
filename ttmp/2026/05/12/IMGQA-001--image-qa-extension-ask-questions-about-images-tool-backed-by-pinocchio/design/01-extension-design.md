---
Title: Extension Design
Ticket: IMGQA-001
Status: active
Topics:
    - pi-extension
    - vision
    - tools
    - pinocchio
DocType: design
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design for the image-qa Pi extension that exposes an ask_questions_about_images tool backed by pinocchio code professional"
LastUpdated: 2026-05-12T21:36:17.036417502-04:00
WhatFor: "Design reference for implementing the image-qa extension"
WhenToUse: "Read this before implementing or modifying the image-qa extension"
---

# image-qa Extension Design

## Goal

Create a Pi extension (`image-qa`) that registers an LLM-callable tool `ask_questions_about_images`, allowing the agent to ask vision-capable models questions about one or more images. The tool delegates to `pinocchio code professional` under the hood, passing images via `--images` and the question as the query argument.

## Why

The Pi agent currently has no built-in way to ask questions about images. When the agent needs to analyze a screenshot, diagram, or photo, it must fall back to ad-hoc bash calls. A dedicated tool with a clear contract — including the critical constraint that the tool is **stateless** (no memory of past images or conversations) — gives the agent a reliable, well-documented way to perform visual QA.

## Tool Contract

### Tool name

`ask_questions_about_images`

### Parameters (TypeBox schema)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `images` | `array<string>` | **yes** | One or more image file paths (relative to cwd or absolute) to analyze. |
| `question` | `string` | **yes** | The question to ask about the images. **Must include all surrounding context** since the tool is stateless — it does not remember past images, past questions, or any conversation history. Every invocation is a fresh session. |

### Behavior

1. Resolve image paths relative to `ctx.cwd`.
2. Validate that each image file exists (return an error for missing files).
3. Build the pinocchio command:

```bash
pinocchio code professional \
  --profile <profile> \
  --images img1.png,img2.png,img3.png \
  --non-interactive \
  "question text here"
```

4. Execute via `pi.exec("pinocchio", args, options)`.
5. Return the stdout as the tool result text.

### Critical constraint: stateless context

The tool calls `pinocchio code professional --non-interactive`, which creates a **fresh session** each time. The model has **no access** to:

- Previous images from earlier tool calls
- Previous questions or answers
- The current Pi conversation context

Therefore, the `question` parameter **must** contain all necessary context. The tool description will explicitly warn the LLM about this:

> **Important:** This tool is stateless. Each call starts a fresh session with no memory of previous calls. You MUST include all relevant context in the `question` parameter — describe what you already know, what you've already asked, and what you're looking for now. Do not assume the model knows anything from prior turns.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `profile` | `string` | `gpt-5-low` | The pinocchio profile to use (controls model, temperature, etc.) |
| `timeout` | `number` | `120` | Max seconds to wait for pinocchio to respond |

Settings use the **schema** kind (simple fields, no custom UI needed).

## File Layout

```
extensions/image-qa/
  index.ts      # registerPiExtension() + pi.registerTool() + pi.registerCommand()
  README.md     # user-facing extension docs
```

This is a small extension — one tool, two settings, no custom UI. Everything fits in `index.ts`.

## Implementation Sketch

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { registerPiExtension } from "../_shared/registry";
import { existsSync } from "fs";
import { resolve } from "path";

interface State {
  profile: string;
  timeout: number;
}

export default function imageQaExtension(pi: ExtensionAPI): void {
  const state: State = { profile: "gpt-5-low", timeout: 120 };

  registerPiExtension({
    id: "image-qa",
    name: "Image QA",
    description: "Ask vision-capable models questions about images via pinocchio.",
    commands: ["image-qa"],
    tags: ["vision", "tools"],

    actions: [
      {
        id: "ask",
        title: "Ask about images",
        description: "Test the image QA tool with a sample invocation.",
        default: true,
        run: async (ctx) => {
          ctx.ui.notify("image-qa tool is available to the agent.", "info");
        },
      },
    ],

    docs: [
      {
        id: "overview",
        title: "Image QA overview",
        markdown: `# Image QA

Ask vision-capable models questions about images via pinocchio.

**Important:** The \`ask_questions_about_images\` tool is stateless. Each call starts a fresh session with no memory of previous calls. You must include all relevant context in the question parameter.

## Settings
- **profile**: pinocchio profile (default: gpt-5-low)
- **timeout**: max seconds to wait (default: 120)
      `,
      },
    ],

    settings: {
      kind: "schema",
      schema: {
        version: 1,
        title: "Image QA Settings",
        description: "Configure the pinocchio profile and timeout for image QA calls.",
        sections: [
          {
            id: "main",
            title: "Main",
            fields: [
              {
                id: "profile",
                label: "Profile",
                type: "string",
                description: "Pinocchio profile to use (e.g. gpt-5-low, claude-sonnet).",
              },
              {
                id: "timeout",
                label: "Timeout (seconds)",
                type: "number",
                description: "Maximum seconds to wait for a pinocchio response.",
              },
            ],
          },
        ],
      },
      load: () => ({ profile: state.profile, timeout: state.timeout }),
      onApply: (values, ctx) => {
        if (values.profile) state.profile = String(values.profile);
        if (values.timeout) state.timeout = Number(values.timeout);
        ctx.ui.notify(`image-qa: profile=${state.profile} timeout=${state.timeout}s`, "info");
      },
    },
  });

  // Register the LLM-callable tool
  pi.registerTool({
    name: "ask_questions_about_images",
    label: "Ask questions about images",
    description:
      "Ask a vision-capable model questions about one or more images. " +
      "IMPORTANT: This tool is stateless — each call starts a fresh session with no memory of " +
      "previous calls. You MUST include all relevant context in the question parameter: describe " +
      "what you already know, what you've already asked about these or related images, and what " +
      "you're looking for now. Do not assume the model knows anything from prior turns or the " +
      "current conversation.",
    promptSnippet: "ask_questions_about_images(images, question) — ask a vision model about images (stateless: include all context in question)",
    promptGuidelines: [
      "When using ask_questions_about_images, include all relevant context in the question — the tool has no memory of past calls.",
    ],
    parameters: Type.Object({
      images: Type.Array(Type.String(), {
        description:
          "One or more image file paths (relative to cwd or absolute) to analyze.",
      }),
      question: Type.String({
        description:
          "The question to ask about the images. MUST include all surrounding context " +
          "because the tool is stateless — it does not remember past images, past questions, " +
          "or any conversation history. Every invocation is a fresh session.",
      }),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { images, question } = params;

      // Resolve and validate image paths
      const resolved = images.map((p) => resolve(ctx.cwd, p));
      const missing = resolved.filter((p) => !existsSync(p));
      if (missing.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Image file(s) not found: ${missing.join(", ")}`,
            },
          ],
          details: { error: true },
        };
      }

      // Build pinocchio args
      const imagesFlag = resolved.join(",");
      const args = [
        "code",
        "professional",
        "--profile",
        state.profile,
        "--images",
        imagesFlag,
        "--non-interactive",
        question,
      ];

      try {
        const result = await pi.exec("pinocchio", args, {
          signal,
          timeout: state.timeout * 1000,
        });

        if (result.exitCode !== 0) {
          return {
            content: [
              {
                type: "text",
                text: `pinocchio exited with code ${result.exitCode}:\n${result.stderr}\n${result.stdout}`,
              },
            ],
            details: { error: true, exitCode: result.exitCode },
          };
        }

        return {
          content: [{ type: "text", text: result.stdout }],
          details: { model: state.profile },
        };
      } catch (err: any) {
        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "Image QA call aborted." }],
            details: { error: true, aborted: true },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Error running pinocchio: ${err.message}`,
            },
          ],
          details: { error: true },
        };
      }
    },
  });

  // Compatibility slash command
  pi.registerCommand("image-qa", {
    description: "Show image-qa extension status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        `image-qa: profile=${state.profile} timeout=${state.timeout}s`,
        "info",
      );
    },
  });
}
```

## Key Design Decisions

1. **Stateless by design** — `--non-interactive` ensures each call is a fresh session. The tool description, promptSnippet, and promptGuidelines all reinforce that the LLM must include context in the question.

2. **`pi.exec()` instead of raw `bash`** — Uses the extension API's `exec` for proper signal handling and timeout support.

3. **Schema settings (not custom UI)** — Only two fields (profile + timeout), no need for a custom TUI component.

4. **No dashboard widget** — This is a tool, not an ambient status extension. A widget would add noise.

5. **File existence check before calling pinocchio** — Fail fast with a clear error rather than letting pinocchio produce a confusing error.

6. **profile setting (not model)** — Pinocchio uses profiles (which bundle model + temperature + system prompt), so the setting maps directly to `--profile`, not a raw model name.

## Future Considerations

- Could add `--interactive` mode as a separate action for multi-turn image chat.
- Could add `--additional-system` passthrough for custom system prompts.
- Could cache repeated queries on the same images (unlikely to be worth the complexity).
