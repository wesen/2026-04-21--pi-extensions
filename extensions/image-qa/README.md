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
| `question` | `string`   | The question to ask. **Must include all surrounding context** — the tool is stateless (see below).            |

### ⚠️ VLM interpretation, not perfect ground truth

The images are analyzed by a vision-language model (VLM). Treat its answers as
model interpretations, not guaranteed facts. VLMs can miss small visual details,
misread text, hallucinate objects, or give confident but imperfect comparisons.
For important decisions, verify the visual evidence yourself or ask for focused
checks on specific regions/details.

### ⚠️ Stateless — each call is a fresh session

The tool calls `pinocchio code professional --non-interactive`, which creates a
**fresh session** each time. The underlying model has **no access** to:

- Previous images from earlier tool calls
- Previous questions or answers
- The current Pi conversation context

You **must** include all relevant context in the `question` parameter every time.
Describe what you already know, what you've already asked, and what you're
looking for now.

### Under the hood

```bash
pinocchio code professional \
  --profile <profile> \
  --images img1.png,img2.png \
  --non-interactive \
  "question text"
```

### Before / after example

```json
{
  "images": ["/tmp/before.png", "/tmp/after.png"],
  "question": "These two screenshots show the same UI before and after a CSS change. Compare them and describe the visible layout, spacing, and color differences. Mention whether the after screenshot fixes the original problem. Treat this as a VLM interpretation and call out any uncertainty."
}
```

The same pattern works for comparing two diagrams, multiple screenshots from a
workflow, or several photos of the same object from different angles.

## Settings

| Setting   | Default      | Description                                        |
|-----------|--------------|----------------------------------------------------|
| `profile` | `gpt-5-low` | Pinocchio profile (controls model, temperature, etc.) |
| `timeout` | `120`       | Maximum seconds to wait for a response             |

Access settings via `/px` → select Image QA → `s`.

## Commands

- `/image-qa` — Show current profile and timeout settings
