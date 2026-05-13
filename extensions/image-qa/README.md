# Image QA

Ask vision-capable models questions about images via pinocchio.

## Tool: `ask_questions_about_images`

This extension registers an LLM-callable tool that allows the agent to ask
questions about one or more images. It delegates to
`pinocchio code professional` under the hood.

### Parameters

| Parameter  | Type       | Description                                                                                                   |
|------------|------------|---------------------------------------------------------------------------------------------------------------|
| `images`   | `string[]` | One or more image file paths (relative to cwd or absolute).                                                    |
| `question` | `string`   | The question to ask. **Must include all surrounding context** — the tool is stateless (see below).            |

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

## Settings

| Setting   | Default      | Description                                        |
|-----------|--------------|----------------------------------------------------|
| `profile` | `gpt-5-low` | Pinocchio profile (controls model, temperature, etc.) |
| `timeout` | `120`       | Maximum seconds to wait for a response             |

Access settings via `/px` → select Image QA → `s`.

## Commands

- `/image-qa` — Show current profile and timeout settings
