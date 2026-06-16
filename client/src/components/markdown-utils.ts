/**
 * Remove redundant "preview" bullets from AI-generated markdown summaries.
 *
 * AI roadmap/summary output frequently lists each action title as a bullet
 * (e.g. "• Building Momentum") AND then renders that same title as a section
 * heading immediately below ("## Building Momentum"), producing a visible
 * duplicate-header effect.
 *
 * This strips ONLY the redundant preview bullets — a bullet is removed when:
 *   1. it belongs to a contiguous bullet block,
 *   2. that block is immediately followed (ignoring blank lines) by a heading,
 *   3. and the bullet's text matches a heading that appears AFTER the block.
 *
 * Normal bullet lists that are not followed by matching headings are left
 * untouched. Runs on every render, so it also cleans up already-cached
 * summaries without needing to regenerate them.
 */
export function stripPreviewBullets(markdown: string): string {
  if (!markdown) return markdown;

  const lines = markdown.split('\n');

  const normalize = (s: string) =>
    s.replace(/\*\*/g, '').replace(/[:：]\s*$/, '').trim().toLowerCase();

  const isBullet = (t: string) => t.startsWith('• ') || /^-\s/.test(t);

  const headingText = (t: string): string | null => {
    if (t.startsWith('# ')) return normalize(t.substring(2));
    if (t.startsWith('## ')) return normalize(t.substring(3));
    if (/^\*\*[^*]+\*\*$/.test(t)) return normalize(t);
    return null;
  };

  // All heading texts with their line index (for "appears after the block").
  const headings = lines
    .map((l, idx) => ({ idx, text: headingText(l.trim()) }))
    .filter((h): h is { idx: number; text: string } => h.text !== null);

  const drop = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (!isBullet(lines[i].trim())) continue;

    // Extend to the full contiguous bullet block [i..j].
    let j = i;
    while (j + 1 < lines.length && isBullet(lines[j + 1].trim())) j++;

    // Find the next non-blank line after the block.
    let k = j + 1;
    while (k < lines.length && lines[k].trim() === '') k++;

    const nextIsHeading = k < lines.length && headingText(lines[k].trim()) !== null;

    if (nextIsHeading) {
      const followingHeadings = new Set(
        headings.filter((h) => h.idx > j).map((h) => h.text),
      );
      for (let b = i; b <= j; b++) {
        const bulletBody = normalize(lines[b].trim().substring(2));
        if (followingHeadings.has(bulletBody)) drop.add(b);
      }
    }

    i = j; // skip past the block we just processed
  }

  if (drop.size === 0) return markdown;
  return lines.filter((_, idx) => !drop.has(idx)).join('\n');
}
