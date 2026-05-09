# compaction-title extension

Generates a useful Pi session title during compaction while preserving Pi's built-in compaction behavior.

## How it works

The extension handles `session_before_compact`, calls Pi's exported `compact()` helper with the original `CompactionPreparation`, and appends a small extra instruction asking the built-in compaction prompt to include:

```markdown
## Session Title
Short 4-10 word noun phrase
```

After `compact()` returns, the extension parses that section, stores it with `pi.setSessionName(title)`, strips the section from the stored compaction summary by default, and returns the compaction result to Pi.

If anything fails, the extension returns `undefined` so Pi falls back to default compaction.

## Install

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/compaction-title ~/.pi/agent/extensions/compaction-title
```

Reload Pi:

```text
/reload
```

## Commands

| Command | Description |
|---|---|
| `/compaction-title` | Show current state |
| `/compaction-title on` | Enable title generation |
| `/compaction-title off` | Disable title generation |
| `/compaction-title strip` | Strip `## Session Title` from stored compaction summaries after parsing |
| `/compaction-title keep` | Keep `## Session Title` in stored compaction summaries |
| `/ctitle ...` | Alias |
| `/compaction-title-self-test` | Run parser self-tests |

## Validation

```bash
pi --no-session --no-extensions -e ./extensions/compaction-title --list-models no-such-model
```

Expected: exit 0 and `No models matching "no-such-model"`.
