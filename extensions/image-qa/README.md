# Image QA

Ask vision-capable models questions about images via pinocchio.

## Tool: `ask_questions_about_images`

This extension registers an LLM-callable tool that allows the agent to ask
questions about one or more images. You can provide multiple images in one call,
for example to compare before/after screenshots, two versions of a diagram, or
several related photos. It delegates to `pinocchio code professional` under the
hood, where the images are interpreted by a vision-language model (VLM).

### Parameters

| Parameter  | Type       | Description                                                                                                   |
|------------|------------|---------------------------------------------------------------------------------------------------------------|
| `images`   | `string[]` | One or more image file paths (relative to cwd or absolute). Provide multiple images for comparisons such as before/after screenshots. |
| `context`  | `string`   | Detailed establishing context for this stateless call: what the images show, why they matter, what changed, prior related observations/questions, image ordering, comparison baseline, acceptance criteria, and constraints. The vision QA agent has no project or conversation knowledge unless you include it here. |
| `question` | `string`   | The specific question to ask about the images. Keep this focused; put background information and referent definitions in `context`.     |

### ⚠️ VLM interpretation, not perfect ground truth

The images are analyzed by a vision-language model (VLM). Treat its answers as
model interpretations, not guaranteed facts. VLMs can miss small visual details,
misread text, hallucinate objects, or give confident but imperfect comparisons.
For important decisions, verify the visual evidence yourself or ask for focused
checks on specific regions/details.

### ⚠️ Stateless — each call is a fresh session

The tool calls `pinocchio code professional --non-interactive`, which creates a
**fresh session** each time. Treat the underlying model as a separate QA person
who has **no access** to:

- This repository or project goals
- Files, source code, tickets, tasks, or implementation history
- Previous images from earlier tool calls
- Previous questions or answers
- The current Pi conversation context
- What `this`, `that`, `the previous one`, `the bug`, or `better` refers to

You **must** include all relevant establishing context in the `context` parameter
every time. Explain what the images show, why they matter, what changed, what
problem you are investigating, how images are ordered, what the comparison
baseline is, and what would count as success or failure. Keep `question` focused
on the concrete answer you want from the vision model.

Bad context-dependent question:

```json
{
  "context": "Screenshot attached.",
  "question": "Is this better?"
}
```

Better version:

```json
{
  "context": "This screenshot shows the settings modal after changing the CSS grid gap from 8px to 16px. The previous problem was that labels overlapped input fields on narrow terminals. Please compare against that described baseline; only this after screenshot is attached, so call out any uncertainty.",
  "question": "Does the visible layout appear to resolve the label/input overlap problem, and are there any remaining spacing or alignment issues?"
}
```

The tool-call display renders both `context` and `question`, so you can inspect
what surrounding context the agent chose to send before the VLM answer appears.
While `pinocchio` is running, stdout/stderr updates are streamed back into the
Pi tool result when `pinocchio` flushes incremental output.

### Under the hood

```bash
pinocchio code professional \
  --profile <profile> \
  --images img1.png,img2.png \
  --non-interactive \
  $'Context:\n<context text>\n\nQuestion:\n<question text>'
```

### Before / after example

```json
{
  "images": ["/tmp/before.png", "/tmp/after.png"],
  "context": "These two screenshots show the same UI before and after a CSS change in this project. The first image is before; the second image is after. The intended fix was to stop the sidebar buttons from wrapping and to keep the main content aligned with the header. Treat the answer as a VLM interpretation and call out any uncertainty.",
  "question": "Compare the screenshots and describe the visible layout, spacing, and color differences. Does the after screenshot appear to fix the original problem?"
}
```

The same pattern works for comparing two diagrams, multiple screenshots from a
workflow, or several photos of the same object from different angles.

## Settings

Access settings via `/px` → select Image QA → press `s`.

### Profile

A dropdown of vision-capable pinocchio profiles, in order:

| Profile | Label | Description |
|---------|-------|-------------|
| `gpt-5-nano-low` | GPT-5 Nano Low | GPT-5 Nano, low reasoning effort (fastest, cheapest) |
| `gpt-5-low` | GPT-5 Low | GPT-5, low reasoning effort |
| `gpt-5-mini-low` | GPT-5 Mini Low | GPT-5 Mini, low reasoning effort |
| `gpt-5-mini` | GPT-5 Mini | GPT-5 Mini |
| `gpt-5-nano` | GPT-5 Nano | GPT-5 Nano |
| `haiku` | Claude Haiku 4.5 | Anthropic Claude Haiku 4.5 |
| `sonnet` | Claude Sonnet | Anthropic Claude Sonnet 4.6 |
| `sonnet-low` | Claude Sonnet Low | Anthropic Claude Sonnet 4.6, low reasoning |

Non-curated pinocchio profiles with a chat engine also appear after the curated
list. Select **Custom...** and type any profile name to use a profile not in the
list. The extension validates that the profile exists in pinocchio before
applying.

On startup, the extension reads pinocchio's selected/default profile. If
pinocchio is unavailable, it falls back to `gpt-5-low`.

### Timeout

| Setting | Default | Description |
|---------|---------|-------------|
| `timeout` | `120` | Maximum seconds to wait for a pinocchio response (10–600, step 10) |

## Commands

- `/image-qa` — Show current profile and timeout settings
