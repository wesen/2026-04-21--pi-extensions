# Selective Compaction

Selective Compaction creates a new Pi session where a selected middle range of the current conversation is replaced by a dedicated summary and a linkage message.

Use it when an old part of the conversation is no longer needed verbatim, but later messages still matter and should remain intact.

## Shape

```text
Input:
  system prompt + A + [compact start] + B + [compact end] + C

Output in a new session:
  system prompt + A + B' + B'' + C
```

Where:

- `A` is copied before-context.
- `B` is the selected middle range.
- `B'` is a selective compaction summary.
- `B''` is a linkage message that bridges into the preserved following context.
- `C` is copied after-context.

## Commands

- `/selective-compact` — open the guided flow.
- `/scompact` — alias.

The extension is also registered with the shared `/px` launcher as **Selective Compaction**.

## MVP safety rule

The first implementation selects whole turns rather than arbitrary individual messages. This avoids splitting assistant tool calls from their tool results, which can create invalid provider context after the middle range is removed.

## Prompt intent

The summary uses a dedicated prompt inspired by Pi's compaction template. It is optimized to answer:

- What happened in the selected range?
- What remains relevant going forward?
- Which decisions, files, commands, errors, and artifacts matter?
- What is safe to forget?
- How should later preserved messages be understood after the middle range is compacted?

## Safety

The current session is not modified. The extension creates a new session with `parentSession` pointing at the source session. You can return to the original session if the generated summary is not good enough.
