import { describe, expect, it } from 'vitest';
import {
  decodeXmlEntities,
  extractText,
  isScreenshotPlaceholder,
  filterScreenshotTokens,
  normalizeForComparison,
  jaccardSimilarity,
  wordCount,
  classifySlide,
  defaultIncluded,
  seedNarration,
  inferGroups,
  buildFaithfulBlocks,
  buildEnhancedBlocks,
} from '../../server/services/pptx-import';
import type { ReviewSlide } from '../../server/services/pptx-import';

// ─────────────────────────────────────────────────────────────────────────────
// Existing tests — preserved for compatibility
// ─────────────────────────────────────────────────────────────────────────────

describe('decodeXmlEntities', () => {
  it('decodes named and numeric entities, with &amp; resolved last', () => {
    expect(decodeXmlEntities('a &lt;b&gt; &quot;c&quot; &apos;d&apos;')).toBe('a <b> "c" \'d\'');
    expect(decodeXmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeXmlEntities('&#65;&#x42;')).toBe('AB');
    // A literal "&amp;lt;" should decode to "&lt;", not "<".
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;');
  });
});

describe('extractText', () => {
  it('collects <a:t> runs into newline-separated lines, trimming empties', () => {
    const xml = `
      <p:sld><p:txBody>
        <a:p><a:r><a:t>Title Here</a:t></a:r></a:p>
        <a:p><a:r><a:t>  </a:t></a:r></a:p>
        <a:p><a:r><a:t>Bullet &amp; one</a:t></a:r><a:r><a:t>Bullet two</a:t></a:r></a:p>
      </p:txBody></p:sld>`;
    expect(extractText(xml)).toBe('Title Here\nBullet & one\nBullet two');
  });

  it('returns empty string when there is no text', () => {
    expect(extractText('<p:sld/>')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Screenshot / placeholder helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('isScreenshotPlaceholder', () => {
  it('detects exact placeholder tokens (case-insensitive)', () => {
    expect(isScreenshotPlaceholder('SCREENSHOT')).toBe(true);
    expect(isScreenshotPlaceholder('screenshot')).toBe(true);
    expect(isScreenshotPlaceholder('[SCREENSHOT]')).toBe(true);
    expect(isScreenshotPlaceholder('<<SCREENSHOT>>')).toBe(true);
    expect(isScreenshotPlaceholder('[IMAGE]')).toBe(true);
    expect(isScreenshotPlaceholder('[PLACEHOLDER]')).toBe(true);
    expect(isScreenshotPlaceholder('IMAGE PLACEHOLDER')).toBe(true);
  });

  it('does not flag normal text', () => {
    expect(isScreenshotPlaceholder('This is a real title')).toBe(false);
    expect(isScreenshotPlaceholder('Use Microsoft Copilot to take a screenshot')).toBe(false);
    expect(isScreenshotPlaceholder('')).toBe(false);
  });
});

describe('filterScreenshotTokens', () => {
  it('removes placeholder lines and leaves real content', () => {
    const input = 'Title Line\nSCREENSHOT\nBody text here\n[SCREENSHOT]';
    expect(filterScreenshotTokens(input)).toBe('Title Line\nBody text here');
  });

  it('returns empty string if all lines are placeholders', () => {
    expect(filterScreenshotTokens('SCREENSHOT\n[SCREENSHOT]')).toBe('');
  });

  it('passes through text that merely contains the word screenshot', () => {
    const line = 'Add a screenshot to illustrate your point';
    expect(filterScreenshotTokens(line)).toBe(line);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Text similarity helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeForComparison', () => {
  it('lower-cases and collapses whitespace', () => {
    expect(normalizeForComparison('  Hello   World  ')).toBe('hello world');
    expect(normalizeForComparison('COPILOT\nIN\tACTION')).toBe('copilot in action');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeForComparison('')).toBe('');
    expect(normalizeForComparison('   ')).toBe('');
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(jaccardSimilarity('apple banana', 'cherry date')).toBe(0);
  });

  it('returns 1 for both empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(1);
  });

  it('returns 0 when one is empty', () => {
    expect(jaccardSimilarity('', 'hello')).toBe(0);
    expect(jaccardSimilarity('hello', '')).toBe(0);
  });

  it('returns a high score for near-duplicate text', () => {
    const a = 'microsoft copilot helps you write draft emails quickly';
    const b = 'microsoft copilot helps you write draft emails fast';
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it('returns a lower score for partially overlapping text', () => {
    const a = 'copilot features overview';
    const b = 'getting started with microsoft 365';
    expect(jaccardSimilarity(a, b)).toBeLessThan(0.5);
  });
});

describe('wordCount', () => {
  it('counts words split on whitespace', () => {
    expect(wordCount('hello world')).toBe(2);
    expect(wordCount('  one  two  three  ')).toBe(3);
  });

  it('returns 0 for empty / whitespace-only strings', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classifySlide
// ─────────────────────────────────────────────────────────────────────────────

describe('classifySlide', () => {
  const total = 20;

  it('classifies blank slide (no text)', () => {
    const { recommendation } = classifySlide(5, '', '', total, []);
    expect(recommendation).toBe('blank');
  });

  it('classifies cover — first slide', () => {
    const { recommendation } = classifySlide(0, 'Getting Started with M365', 'Getting Started with M365', total, []);
    expect(recommendation).toBe('cover');
  });

  it('classifies cover — pattern match even if not first', () => {
    const { recommendation } = classifySlide(2, 'Welcome to Copilot', 'Welcome to Copilot', total, []);
    expect(recommendation).toBe('cover');
  });

  it('classifies closing — last slide', () => {
    const { recommendation } = classifySlide(19, 'Some title', 'Some title', total, []);
    expect(recommendation).toBe('closing');
  });

  it('classifies closing — pattern match', () => {
    const { recommendation } = classifySlide(10, 'Thank You', 'Thank You', total, []);
    expect(recommendation).toBe('closing');
  });

  it('classifies exact-duplicate', () => {
    const seen = [normalizeForComparison('Copilot helps teams collaborate')];
    const { recommendation } = classifySlide(5, 'Copilot helps teams collaborate', 'Copilot helps teams collaborate', total, seen);
    expect(recommendation).toBe('exact-duplicate');
  });

  it('classifies near-duplicate (high Jaccard ≥ 0.85)', () => {
    // Base has 20 words; variant changes just 1 word → Jaccard = 19/21 ≈ 0.905 ≥ 0.85
    const base =
      'microsoft copilot helps teams draft emails summarize documents generate reports collaborate faster every single day';
    const seen = [normalizeForComparison(base)];
    const variant =
      'microsoft copilot helps teams draft emails summarize documents generate reports collaborate faster every single week';
    const { recommendation } = classifySlide(5, variant, variant, total, seen);
    expect(recommendation).toBe('near-duplicate');
  });

  it('classifies divider — heading with no body text', () => {
    // Title-only slide: 4 words, no body → divider rule: bodyWords === 0 && words <= 10
    const text = 'Module Two Deep Dive';
    const { recommendation } = classifySlide(5, text, text, total, []);
    // 4 words, no body → should be divider (bodyWords=0, words=4, words<=10)
    expect(recommendation).toBe('divider');
  });

  it('classifies numbered chapter slides and uses the chapter title in review', () => {
    const result = classifySlide(
      2,
      '01\nGenerative AI & Keeping Data Safe\nAbout 4 minutes',
      '01',
      33,
      [],
    );
    expect(result.recommendation).toBe('divider');
  });

  it('classifies low-content slide (sparse body, too many body words for divider but total ≤ 5)', () => {
    // "1" title + "Bullet one two three" body → 5 total words, 4 body words.
    // bodyWords=4 > 3, so divider rules do not fire. words=5 → low-content.
    const text = '1\nBullet one two three';
    const { recommendation } = classifySlide(5, text, '1', total, []);
    expect(recommendation).toBe('low-content');
  });

  it('classifies normal content slide', () => {
    const text =
      'How to use Microsoft Copilot effectively\n' +
      'Copilot can help you draft emails, summarize meetings, and generate reports. ' +
      'It integrates with Word, Excel, PowerPoint, and Teams.';
    const { recommendation } = classifySlide(5, text, text.split('\n')[0], total, []);
    expect(recommendation).toBe('normal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// defaultIncluded
// ─────────────────────────────────────────────────────────────────────────────

describe('defaultIncluded', () => {
  it('excludes blank and duplicate slides by default', () => {
    expect(defaultIncluded('blank')).toBe(false);
    expect(defaultIncluded('exact-duplicate')).toBe(false);
    expect(defaultIncluded('near-duplicate')).toBe(false);
  });

  it('uses structural and closing slides as excluded review recommendations', () => {
    expect(defaultIncluded('cover')).toBe(true);
    expect(defaultIncluded('closing')).toBe(false);
    expect(defaultIncluded('divider')).toBe(false);
    expect(defaultIncluded('low-content')).toBe(true);
    expect(defaultIncluded('normal')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// seedNarration
// ─────────────────────────────────────────────────────────────────────────────

describe('seedNarration', () => {
  const base = {
    title: '',
    text: '',
    notes: '',
    sourceIndex: 0,
  };

  it('prefers speaker notes over everything else', () => {
    const result = seedNarration({
      ...base,
      recommendation: 'normal',
      title: 'Title',
      text: 'Title\nBody',
      notes: 'These are the speaker notes for this slide.',
    });
    expect(result).toBe('These are the speaker notes for this slide.');
  });

  it('filters SCREENSHOT tokens from notes', () => {
    const result = seedNarration({
      ...base,
      recommendation: 'normal',
      title: 'Title',
      text: 'Title',
      notes: 'SCREENSHOT\nReal note text',
    });
    expect(result).toBe('Real note text');
  });

  it('generates visual description for blank slides', () => {
    const result = seedNarration({ ...base, recommendation: 'blank', sourceIndex: 2 });
    expect(result).toContain('primarily visual');
    expect(result).not.toContain('slide 3');
  });

  it('generates visual description for low-content slides', () => {
    const result = seedNarration({
      ...base,
      recommendation: 'low-content',
      title: 'Tips',
      text: 'Tips',
      sourceIndex: 4,
    });
    expect(result).toContain('Tips');
    expect(result).toContain('essential information');
  });

  it('generates welcome text for cover slides', () => {
    const result = seedNarration({
      ...base,
      recommendation: 'cover',
      title: 'Getting Started with M365 Copilot',
      text: 'Getting Started with M365 Copilot',
    });
    expect(result).toContain('Getting Started with M365 Copilot');
    expect(result.toLowerCase()).toContain('welcome');
  });

  it('generates closing text for closing slides', () => {
    const result = seedNarration({
      ...base,
      recommendation: 'closing',
      title: 'Thank You',
      text: 'Thank You',
    });
    expect(result.toLowerCase()).toContain('end of this course');
  });

  it('generates "next up" text for divider slides', () => {
    const result = seedNarration({
      ...base,
      recommendation: 'divider',
      title: 'Module 3: Advanced Features',
      text: 'Module 3: Advanced Features',
    });
    expect(result).toContain('Module 3: Advanced Features');
    expect(result.toLowerCase()).toContain("next up");
  });

  it('builds readable narration for normal slides', () => {
    const result = seedNarration({
      ...base,
      recommendation: 'normal',
      title: 'Key Copilot Features',
      text: 'Key Copilot Features\nDraft emails faster\nSummarize long documents\nGenerate meeting agendas',
    });
    expect(result).toContain('Key Copilot Features');
    expect(result).toContain('Draft emails faster');
  });

  it('filters SCREENSHOT tokens from slide text in narration', () => {
    const result = seedNarration({
      ...base,
      recommendation: 'normal',
      title: 'Demo',
      text: 'Demo\nSCREENSHOT\nSee the output panel on the right.',
    });
    expect(result).not.toContain('SCREENSHOT');
    expect(result).toContain('See the output panel on the right.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inferGroups
// ─────────────────────────────────────────────────────────────────────────────

describe('inferGroups', () => {
  function makeSlide(partial: Partial<ReviewSlide> & { sourceIndex: number }): ReviewSlide {
    return {
      title: '',
      text: '',
      notes: '',
      previewImageUrl: '',
      recommendation: 'normal',
      includedDefault: true,
      rationale: '',
      narrationScript: '',
      ...partial,
    };
  }

  it('creates a group starting at index 0 for the first slide', () => {
    const slides = [
      makeSlide({ sourceIndex: 0, recommendation: 'cover', title: 'Intro' }),
      makeSlide({ sourceIndex: 1, recommendation: 'normal', title: 'Lesson 1' }),
    ];
    const groups = inferGroups(slides);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].startIndex).toBe(0);
    expect(groups[0].suggestedTitle).toBe('Intro');
  });

  it('creates a new group when a divider slide is encountered', () => {
    const slides = [
      makeSlide({ sourceIndex: 0, recommendation: 'cover', title: 'Cover' }),
      makeSlide({ sourceIndex: 1, recommendation: 'normal', title: 'Slide A' }),
      makeSlide({ sourceIndex: 2, recommendation: 'divider', title: 'Section 2' }),
      makeSlide({ sourceIndex: 3, recommendation: 'normal', title: 'Slide B' }),
    ];
    const groups = inferGroups(slides);
    expect(groups.length).toBe(2);
    expect(groups[1].startIndex).toBe(2);
    expect(groups[1].suggestedTitle).toBe('Section 2');
  });

  it('falls back to "Section N" label when divider has no title', () => {
    const slides = [
      makeSlide({ sourceIndex: 0, recommendation: 'normal', title: '' }),
      makeSlide({ sourceIndex: 1, recommendation: 'divider', title: '' }),
    ];
    const groups = inferGroups(slides);
    expect(groups.some((g) => g.suggestedTitle.startsWith('Section'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildFaithfulBlocks
// ─────────────────────────────────────────────────────────────────────────────

describe('buildFaithfulBlocks', () => {
  it('returns a single image_slide block with the provided URL and truncated alt', () => {
    const blocks = buildFaithfulBlocks({
      imageUrl: '/objects/slides/abc.png',
      title: 'My Slide',
      text: 'My Slide\nSome body text',
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('image_slide');
    expect((blocks[0] as any).url).toBe('/objects/slides/abc.png');
    expect((blocks[0] as any).alt).toBe('My Slide');
  });

  it('uses body text as alt when title is empty', () => {
    const blocks = buildFaithfulBlocks({
      imageUrl: '/objects/slides/x.png',
      title: '',
      text: 'Body text here',
    });
    expect((blocks[0] as any).alt).toBe('Body text here');
  });

  it('does NOT include any heading or text blocks', () => {
    const blocks = buildFaithfulBlocks({
      imageUrl: '/objects/slides/y.png',
      title: 'Title',
      text: 'Title\nBullet one\nBullet two',
    });
    expect(blocks.every((b) => b.type === 'image_slide')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildEnhancedBlocks
// ─────────────────────────────────────────────────────────────────────────────

describe('buildEnhancedBlocks', () => {
  it('returns heading + text blocks (no image_slide block)', () => {
    const blocks = buildEnhancedBlocks({
      title: 'Copilot in Action',
      text: 'Copilot in Action\nDraft emails faster\nSummarize documents',
    });
    const types = blocks.map((b) => b.type);
    expect(types).not.toContain('image_slide');
    expect(types).toContain('heading');
    expect(types).toContain('text');
  });

  it('filters SCREENSHOT placeholder from title and body', () => {
    const blocks = buildEnhancedBlocks({
      title: 'SCREENSHOT',
      text: 'SCREENSHOT\nReal body line',
    });
    // If the title is only a placeholder, no heading block
    const headingBlock = blocks.find((b) => b.type === 'heading');
    expect(headingBlock).toBeUndefined();
    const textBlock = blocks.find((b) => b.type === 'text') as any;
    expect(textBlock?.html).toContain('Real body line');
    expect(textBlock?.html).not.toContain('SCREENSHOT');
  });

  it('produces a heading block from the title', () => {
    const blocks = buildEnhancedBlocks({
      title: 'My Title',
      text: 'My Title\nBody content goes here',
    });
    const heading = blocks.find((b) => b.type === 'heading') as any;
    expect(heading?.text).toBe('My Title');
  });

  it('produces HTML paragraphs for body text', () => {
    const blocks = buildEnhancedBlocks({
      title: 'Title',
      text: 'Title\nLine one\nLine two',
    });
    const text = blocks.find((b) => b.type === 'text') as any;
    expect(text?.html).toContain('<p>Line one</p>');
    expect(text?.html).toContain('<p>Line two</p>');
  });

  it('HTML-escapes special characters in body text', () => {
    const blocks = buildEnhancedBlocks({
      title: 'Title',
      text: 'Title\n<script>alert("xss")</script>',
    });
    const text = blocks.find((b) => b.type === 'text') as any;
    expect(text?.html).not.toContain('<script>');
    expect(text?.html).toContain('&lt;script&gt;');
  });

  it('returns empty array for completely empty / placeholder-only content', () => {
    const blocks = buildEnhancedBlocks({ title: 'SCREENSHOT', text: 'SCREENSHOT' });
    expect(blocks).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration-style: classifySlide + seedNarration together
// ─────────────────────────────────────────────────────────────────────────────

describe('classify + narration integration', () => {
  it('blank slide gets visual description narration', () => {
    const { recommendation } = classifySlide(3, '', '', 10, []);
    const narration = seedNarration({ recommendation, title: '', text: '', notes: '', sourceIndex: 3 });
    expect(recommendation).toBe('blank');
    expect(narration).toContain('primarily visual');
    expect(narration).not.toContain('slide 2');
  });

  it('duplicate slide gets fallback narration from its text', () => {
    const text = 'Copilot features overview and summary';
    const seen = [normalizeForComparison(text)];
    const { recommendation } = classifySlide(5, text, text, 10, seen);
    const narration = seedNarration({ recommendation, title: text, text, notes: '', sourceIndex: 5 });
    expect(recommendation).toBe('exact-duplicate');
    expect(narration).toBe(text);
  });
});
