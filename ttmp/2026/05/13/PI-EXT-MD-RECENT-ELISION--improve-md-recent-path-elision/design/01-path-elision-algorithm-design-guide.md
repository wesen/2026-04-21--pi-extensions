---
Title: Path Elision Algorithm Design Guide
Ticket: PI-EXT-MD-RECENT-ELISION
Status: active
Topics:
    - pi-extensions
    - markdown
    - tui
    - design
DocType: design
Intent: long-term
Owners: []
RelatedFiles:
    - Path: extensions/markdown-recent-viewer/index.ts
      Note: Command and picker entrypoint context for /md-recent
    - Path: extensions/markdown-recent-viewer/ui.ts
      Note: Current picker row rendering and path elision helper that the guide is intended to replace
ExternalSources: []
Summary: Design guide for a systematic, suffix-biased path elision algorithm in markdown-recent-viewer.
LastUpdated: 2026-05-13T08:47:19.122509079-04:00
WhatFor: Use when implementing or reviewing md-recent path rendering in the recent Markdown picker.
WhenToUse: Use before changing path truncation, row layout, or tests for markdown-recent-viewer.
---


# Path Elision Algorithm Design Guide

## Goal

The recent Markdown picker has one narrow row in which it must show time, tool name, and a relative file path. The path is the part of the row that carries project meaning. A useful elision algorithm must preserve the filename, preserve nearby parent folders when possible, and preserve enough of the path beginning to identify the larger area of the repository.

This document designs a systematic replacement for ad hoc path truncation. The proposed approach is to generate all valid middle-elided path candidates, score them with an explicit end bias, and render the highest-scoring candidate that fits the available terminal width.

## The Rendering Problem

The picker currently renders each item as a single terminal row:

```text
> 08:41  edit   extensions/markdown-recent-viewer/ui.ts
```

The row has three conceptual fields.

| Field | Example | Width behavior |
| --- | --- | --- |
| Selection marker | `>` | Fixed. |
| Event metadata | `08:41  edit` | Fixed enough to treat as reserved width. |
| Relative path | `extensions/markdown-recent-viewer/ui.ts` | Variable and often too long. |

Only the path should be elided. If the whole row is truncated at the end, the filename is often lost. If the path is elided only from the front, the user sees the filename but loses the top-level folder. The desired rendering keeps both ends when there is enough space:

```text
extensions/.../markdown-recent-viewer/ui.ts
```

The filename must be treated as the most important segment because it is the target that will be opened. The parent folders immediately before the filename are the next most important segments because they distinguish files with the same name in different feature areas. The beginning of the path is still useful because it identifies the larger repository region, such as `extensions`, `docs`, or `ttmp`.

## Requirements

A good algorithm should satisfy these requirements.

1. The full path is shown unchanged when it fits.
2. The filename is shown in full whenever the filename itself fits.
3. Parent folders near the filename receive more display budget than folders near the beginning.
4. The first path segment is retained when it provides value and still allows useful suffix context.
5. The algorithm uses terminal display width, not JavaScript string length.
6. The implementation is deterministic and easy to test.
7. The fallback path for very narrow widths is explicit.

The third requirement is the main design constraint. The target output is not merely `foo/.../bla.md`; it is often better as:

```text
foo/.../bar/bla.md
foo/.../feature/bar/bla.md
foo/.../viewer/feature/bar/bla.md
```

The algorithm should spend most spare characters on the suffix side before it spends them on additional prefix folders.

## Current Algorithm

The current implementation follows a two-phase greedy procedure.

```text
1. If the full path fits, return it.
2. Try first/.../filename.
3. Add trailing folders before the filename while the result fits.
4. After trailing folders no longer fit, add leading folders while the result fits.
5. Fall back to .../filename, filename, or filename tail.
```

For this path:

```text
foo/one/two/three/four/bar/bla.md
```

it attempts candidates in this order:

```text
foo/.../bla.md
foo/.../bar/bla.md
foo/.../four/bar/bla.md
foo/.../three/four/bar/bla.md
foo/.../two/three/four/bar/bla.md
foo/one/.../three/four/bar/bla.md
```

This is already biased toward the suffix, but it has two weaknesses.

First, the bias is expressed by control flow rather than by a single policy. A reviewer must read loops and fallback branches to understand the priority. Second, once suffix growth stops, the algorithm still spends spare width on the prefix side, even when a different combination might show more useful suffix characters overall.

The main improvement is to make the policy explicit and let a single candidate-selection step enforce it.

## Recommended Approach: Enumerate and Score Valid Candidates

The clean design is to describe every possible middle-elided path as a candidate, discard candidates that do not fit, and choose the candidate with the best score.

A candidate has this shape:

```text
<prefix segments>/.../<suffix segments>
```

The prefix is a contiguous slice from the beginning of the path. The suffix is a contiguous slice from the end of the path. The suffix always includes the filename. The prefix and suffix never overlap. Either side can have zero directory segments, although the suffix must contain the filename when the filename fits.

For example, the path:

```text
foo/one/two/three/four/bar/bla.md
```

can produce candidates such as:

```text
.../bla.md
.../bar/bla.md
foo/.../bla.md
foo/.../bar/bla.md
foo/.../four/bar/bla.md
foo/one/.../bar/bla.md
foo/one/two/.../bla.md
```

A candidate is valid if its visible terminal width is less than or equal to the path field width. The algorithm then scores all valid candidates and selects the highest-scoring one.

### Why enumeration is acceptable

A relative path rarely has many segments. Even a deep generated path with 15 segments produces a small search space. The number of prefix/suffix combinations is bounded by `O(n²)`, where `n` is the number of path segments. For picker rows, this is negligible compared with rendering the overlay and filtering items.

The benefit is that the implementation becomes predictable. Every possible complete-segment rendering is considered. The score decides which rendering expresses the product preference.

## Scoring Policy

The score should encode the display priorities directly.

The recommended default policy is:

```text
score = 4 * suffixChars
      + 1 * prefixChars
      + 8 * suffixSegmentCount
      + 2 * prefixSegmentCount
      + 12 if prefixSegmentCount > 0 else 0
```

This policy has four properties.

1. Suffix characters are worth four times as much as prefix characters.
2. Complete suffix segments receive an additional bonus because whole folder names are more readable than merely more characters.
3. Complete prefix segments receive a smaller bonus because the beginning is useful but secondary.
4. A single prefix-presence bonus keeps the first folder visible when it is cheap, without forcing it when it would crowd out important suffix context.

The constants are intentionally simple. The exact values can be adjusted, but the relationship should remain stable: suffix characters dominate prefix characters, and segment completeness matters enough to break ties.

### Candidate comparison example

Assume these candidates all fit:

| Candidate | Prefix chars | Suffix chars | Prefix segments | Suffix segments | Score |
| --- | ---: | ---: | ---: | ---: | ---: |
| `.../four/bar/bla.md` | 0 | 15 | 0 | 3 | `4*15 + 8*3 = 84` |
| `foo/.../bar/bla.md` | 3 | 10 | 1 | 2 | `4*10 + 3 + 8*2 + 2 + 12 = 73` |
| `foo/.../four/bar/bla.md` | 3 | 15 | 1 | 3 | `4*15 + 3 + 8*3 + 2 + 12 = 101` |
| `foo/one/.../bla.md` | 6 | 6 | 2 | 1 | `4*6 + 6 + 8 + 4 + 12 = 54` |

The winner is `foo/.../four/bar/bla.md`. It keeps the beginning, but it does not let additional beginning folders displace suffix context.

## Pseudocode

The pseudocode below is written to match the TypeScript implementation style in `extensions/markdown-recent-viewer/ui.ts`.

```ts
function elidePathForWidth(path: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(path) <= width) return path;

  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const filename = segments.at(-1) ?? path;

  if (visibleWidth(filename) > width) {
    return elideFilenameTail(filename, width);
  }

  if (segments.length <= 1) {
    return filename;
  }

  let best = filename;
  let bestScore = scoreCandidate({ prefix: [], suffix: [filename] });

  for (let prefixCount = 0; prefixCount < segments.length; prefixCount++) {
    for (let suffixCount = 1; suffixCount <= segments.length - prefixCount; suffixCount++) {
      const prefix = segments.slice(0, prefixCount);
      const suffix = segments.slice(segments.length - suffixCount);

      // Do not duplicate the complete path here. It was handled at the top.
      if (prefixCount + suffixCount >= segments.length) continue;

      const rendered = renderCandidate(prefix, suffix);
      if (visibleWidth(rendered) > width) continue;

      const score = scoreCandidate({ prefix, suffix });
      if (score > bestScore || (score === bestScore && tieBreak(rendered, best))) {
        best = rendered;
        bestScore = score;
      }
    }
  }

  return best;
}
```

Candidate rendering is mechanical.

```ts
function renderCandidate(prefix: string[], suffix: string[]): string {
  if (prefix.length === 0) return `.../${suffix.join("/")}`;
  return `${prefix.join("/")}/.../${suffix.join("/")}`;
}
```

Scoring is also mechanical.

```ts
function segmentChars(parts: string[]): number {
  return parts.reduce((sum, part) => sum + visibleWidth(part), 0);
}

function scoreCandidate(candidate: { prefix: string[]; suffix: string[] }): number {
  const prefixChars = segmentChars(candidate.prefix);
  const suffixChars = segmentChars(candidate.suffix);
  const prefixSegments = candidate.prefix.length;
  const suffixSegments = candidate.suffix.length;

  return 4 * suffixChars
    + 1 * prefixChars
    + 8 * suffixSegments
    + 2 * prefixSegments
    + (prefixSegments > 0 ? 12 : 0);
}
```

Tie-breaking should be stable and unsurprising.

```ts
function tieBreak(candidate: string, currentBest: string): boolean {
  // Prefer the rendering that shows more complete suffix path.
  // If still tied, prefer the shorter rendering to leave visual slack.
  // If still tied, prefer lexical order for deterministic output.
}
```

The tie-breaker can use structured candidate data instead of strings if the implementation wants stricter control.

## Fallback Behavior

Fallbacks should be reached only after full-segment candidates fail.

| Condition | Output |
| --- | --- |
| Full path fits | Full path. |
| Filename fits and at least one candidate fits | Highest-scoring candidate. |
| Filename fits but no candidate with marker fits | Filename. |
| Filename does not fit | Leading ellipsis plus the filename tail. |
| Width cannot fit ellipsis | Truncated ellipsis or empty string. |

The fallback for an overlong filename should preserve the file extension when possible because the extension communicates file type. A simple tail-preserving helper is sufficient:

```ts
function elideFilenameTail(filename: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(filename) <= width) return filename;
  if (width <= visibleWidth("…")) return truncateToWidth("…", width, "");
  return `…${takeTailToWidth(filename, width - visibleWidth("…"))}`;
}
```

## Brainstormed Alternatives

### Alternative 1: Suffix-first greedy growth

This is close to the current implementation. It starts with `first/.../filename`, adds suffix folders until the result no longer fits, and then optionally adds prefix folders.

| Strength | Weakness |
| --- | --- |
| Easy to understand locally. | The product policy is hidden in loop order. |
| Fast. | It may miss a better global candidate. |
| Produces acceptable results for common paths. | Changing bias requires editing control flow. |

This approach is good enough for small UI work, but it is less suitable when the desired behavior is being refined interactively.

### Alternative 2: Fixed character quotas

This approach gives a percentage of path width to the prefix and the rest to the suffix. For example, 25% of the available path field goes to the beginning and 75% goes to the end.

| Strength | Weakness |
| --- | --- |
| The bias is visible in one number. | It tends to cut folder names mid-segment. |
| Easy to tune. | It needs extra rules to preserve complete segments. |
| Good for raw strings. | Paths are structured data, so string slicing discards useful structure. |

Quotas are useful as a mental model, but they are not the best implementation for path segments.

### Alternative 3: Candidate enumeration with scoring

This approach treats the path as structured data and chooses the best complete-segment rendering that fits.

| Strength | Weakness |
| --- | --- |
| The policy is explicit. | It is slightly more code than greedy growth. |
| It considers all complete-segment options. | The score constants need review. |
| It is easy to test with examples. | Very narrow widths still need fallback helpers. |
| It can express suffix bias directly. | The scoring function must stay simple. |

This is the recommended approach because it separates mechanics from policy. Candidate generation answers “what can be shown?” Scoring answers “what should be preferred?”

## Test Cases

The implementation should be tested as a pure function. These cases cover the important behavior.

| Path | Width intent | Expected property |
| --- | --- | --- |
| `extensions/markdown-recent-viewer/ui.ts` | Full path width | Returns the full path. |
| `foo/one/two/three/four/bar/bla.md` | Medium width | Returns a middle-elided path with `bla.md` in full. |
| `foo/one/two/three/four/bar/bla.md` | Medium-large width | Shows more suffix folders before adding extra prefix folders. |
| `foo/one/two/three/four/bar/bla.md` | Width for `foo/.../bar/bla.md` | Keeps both `foo` and `bar/bla.md`. |
| `foo/one/two/three/four/bar/bla.md` | Width too small for `foo/.../bla.md` | Falls back to `.../bla.md` or `bla.md`. |
| `very-long-filename-with-important-ending.markdown` | Narrow width | Shows `…ending.markdown` or the maximum possible tail. |
| `docs/README.md` | Slightly narrow width | Keeps `README.md` in full. |
| `a/b/c/d/e/f.md` | Several narrow widths | Never returns a string wider than the budget. |
| `src\\windows\\path\\file.md` | Medium width | Normalizes separators for display. |

The tests should assert display width rather than string length:

```ts
expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
```

## Implementation Notes for `markdown-recent-viewer`

The row renderer already computes a path budget:

```ts
const fixedPrefix = `${prefix} ${formatItemTime(item)}  ${tool}  `;
const pathWidth = Math.max(0, width - visibleWidth(fixedPrefix));
const line = `${fixedPrefix}${elidePathForWidth(item.relativePath, pathWidth)}`;
```

That boundary is correct. The elision function should remain a pure helper that receives only `relativePath` and `width`. It should not know about time, tool names, selection styling, or frame borders.

The helper should avoid ANSI styling. Styling belongs outside the path algorithm because ANSI escape sequences complicate width accounting and are already handled at the row level.

## Recommended Implementation Plan

1. Replace the current greedy `elidePathForWidth()` with the candidate enumeration algorithm.
2. Keep `takeTailToWidth()` for the overlong filename fallback.
3. Add small pure helpers: `renderCandidate()`, `segmentChars()`, `scoreCandidate()`, and perhaps `candidateVisibleWidth()`.
4. Add unit-level examples if this repository has a lightweight test harness for extensions. If not, add a small script under the ticket workspace first and later convert it into tests when a harness exists.
5. Manually smoke-test `/md-recent` at a normal terminal width and a narrow terminal width.

## Key Points

- The filename is mandatory when it can fit because it is the file that the user will open.
- Parent folders near the filename should receive most spare characters because they disambiguate files with common names.
- The first path segment is useful but should not consume width that would otherwise show more suffix context.
- Candidate enumeration is simpler to reason about than a growing set of special cases.
- A scoring function makes the product preference explicit and reviewable.
