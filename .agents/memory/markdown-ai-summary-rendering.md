---
name: AI summary markdown rendering (contrast + duplicate headers)
description: Why MarkdownContent strips preview bullets and uses text-foreground for headings; coupling with the ai-service roadmap prompt.
---

# AI personalized-output rendering (Results page)

The Results page renders AI-generated maturity summaries / recommendation
roadmaps through the custom `MarkdownContent` component (not react-markdown).

## Contrast: never style text with the `secondary`/`muted` *background* tokens
`text-secondary` resolves to `--secondary`, which is a low-lightness
**background** token (~20% L in dark mode) — using it as heading text is
nearly invisible on the dark background. Readable headings must use
`text-foreground`. **Why:** a real contrast bug shipped where AI summary
headings were unreadable. **How to apply:** for any heading/body text, pick a
foreground token (`text-foreground`, `text-muted-foreground` for secondary
text). Treat `--secondary`/`--muted`/`--card`/`--popover` as surfaces, not ink.

## Duplicate headers: prompt + renderer are coupled
The roadmap prompt deliberately tells the model to list each action title as a
preview bullet ("Priority actions to focus on:" + bullets) AND then render the
same title as a `##` section heading right below — so titles appear twice.
- The prompt was updated to stop emitting the preview bullet list.
- `stripPreviewBullets` (client/src/components/markdown-utils.ts, unit-tested)
  defensively removes a bullet only when its contiguous block is immediately
  followed by headings and the bullet text matches a heading appearing after
  the block. This also cleans up the 90-day **cached** summaries that the
  prompt change alone cannot fix.

**Why:** prompt changes don't invalidate cached AI output, so the renderer must
also dedup. **How to apply:** don't delete `stripPreviewBullets` as "dead code"
— without it, cached roadmaps show duplicate headers again. Keep the dedup
scoped to the preview-then-heading pattern so normal bullet lists are untouched.
