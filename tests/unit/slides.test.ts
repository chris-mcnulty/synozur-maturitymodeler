import { describe, expect, it } from 'vitest';
import {
  normalizeSlide,
  normalizeSlides,
  slideToHtml,
  blankSlide,
  extractManagedObjectPaths,
  courseMediaUrl,
  type SlideBlock,
} from '../../shared/slides';

describe('slide model: legacy normalization', () => {
  it('converts a legacy {title, html, imageUrl} slide into blocks', () => {
    const s = normalizeSlide({ title: 'Welcome', imageUrl: 'https://x/y.png', html: '<p>Hi</p>' });
    expect(s.blocks.map((b) => b.type)).toEqual(['heading', 'image', 'text']);
    const heading = s.blocks[0] as Extract<SlideBlock, { type: 'heading' }>;
    expect(heading.text).toBe('Welcome');
    const image = s.blocks[1] as Extract<SlideBlock, { type: 'image' }>;
    expect(image.url).toBe('https://x/y.png');
  });

  it('preserves an explicit v2 block array as-is', () => {
    const blocks: SlideBlock[] = [{ id: 'b1', type: 'text', html: '<p>Body</p>' }];
    const s = normalizeSlide({ id: 's1', blocks });
    expect(s.id).toBe('s1');
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toEqual(blocks[0]);
  });

  it('assigns an id to slides and synthesized blocks that lack one', () => {
    const s = normalizeSlide({ title: 'No id' });
    expect(s.id).toBeTruthy();
    expect(s.blocks[0].id).toBeTruthy();
  });

  it('normalizeSlides handles a missing/empty slides array', () => {
    expect(normalizeSlides(undefined)).toEqual([]);
    expect(normalizeSlides({})).toEqual([]);
    expect(normalizeSlides({ slides: [{ title: 'A' }] })).toHaveLength(1);
  });
});

describe('slide model: HTML rendering', () => {
  it('renders each block type and escapes heading text', () => {
    const slide = {
      id: 's',
      blocks: [
        { id: '1', type: 'heading', level: 2, text: '<script>x</script>' },
        { id: '2', type: 'text', html: '<p>body</p>' },
        { id: '3', type: 'image', url: 'http://x/i.png', alt: 'pic', caption: 'cap' },
        { id: '4', type: 'video', url: 'http://x/v.mp4' },
        { id: '5', type: 'callout', tone: 'tip', html: '<p>note</p>' },
      ] as SlideBlock[],
    };
    const html = slideToHtml(slide);
    expect(html).toContain('<h2>&lt;script&gt;x&lt;/script&gt;</h2>');
    expect(html).toContain('<p>body</p>');
    expect(html).toContain('<img src="http://x/i.png" alt="pic"');
    expect(html).toContain('<figcaption>cap</figcaption>');
    expect(html).toContain('<video controls src="http://x/v.mp4"');
    expect(html).toContain('callout-tip');
  });

  it('omits a video block with no url', () => {
    const html = slideToHtml({ id: 's', blocks: [{ id: '1', type: 'video', url: '' }] });
    expect(html.trim()).toBe('');
  });
});

describe('extractManagedObjectPaths', () => {
  it('collects narration audio and uploaded/imported media under managed prefixes', () => {
    const content = {
      slides: [
        {
          id: 's1',
          blocks: [
            { id: 'b1', type: 'image_slide', url: '/objects/slides/abc.png', alt: '' },
            { id: 'b2', type: 'video', url: '/objects/uploads/vid.mp4' },
          ],
          narration: { mode: 'tts', audioUrl: '/objects/narration/n1.mp3' },
        },
      ],
    };
    const paths = extractManagedObjectPaths(content);
    expect(paths.sort()).toEqual(
      ['/objects/narration/n1.mp3', '/objects/slides/abc.png', '/objects/uploads/vid.mp4'].sort(),
    );
  });

  it('ignores external URLs and unmanaged object paths', () => {
    const content = {
      slides: [{
        id: 's', blocks: [
          { id: 'b1', type: 'video', url: 'https://youtube.com/watch?v=x' },
          { id: 'b2', type: 'image', url: '/objects/certificates/secret.pdf', alt: '' },
        ],
      }],
    };
    expect(extractManagedObjectPaths(content)).toEqual([]);
  });

  it('returns empty for null/garbage content', () => {
    expect(extractManagedObjectPaths(null)).toEqual([]);
    expect(extractManagedObjectPaths(undefined)).toEqual([]);
  });

  it('does not treat /objects paths embedded in author text or HTML as references', () => {
    const content = {
      slides: [{
        id: 's', blocks: [
          { id: 'b1', type: 'text', html: '<p>see /objects/narration/secret.mp3 for details</p>' },
          { id: 'b2', type: 'heading', level: 2, text: 'Visit /objects/slides/other.png' },
        ],
      }],
    };
    expect(extractManagedObjectPaths(content)).toEqual([]);
  });
});

describe('courseMediaUrl', () => {
  it('rewrites managed object paths to the course media proxy', () => {
    expect(courseMediaUrl('c1', '/objects/narration/n.mp3'))
      .toBe('/api/courses/c1/media?path=%2Fobjects%2Fnarration%2Fn.mp3');
    expect(courseMediaUrl('c1', '/objects/slides/s.png'))
      .toBe('/api/courses/c1/media?path=%2Fobjects%2Fslides%2Fs.png');
  });

  it('leaves external URLs and empty values unchanged', () => {
    expect(courseMediaUrl('c1', 'https://youtube.com/x')).toBe('https://youtube.com/x');
    expect(courseMediaUrl('c1', '/objects/certificates/c.pdf')).toBe('/objects/certificates/c.pdf');
    expect(courseMediaUrl('c1', undefined)).toBe('');
  });
});

describe('slide model: blankSlide', () => {
  it('creates a slide with a single heading block and no narration audio', () => {
    const s = blankSlide(2);
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0].type).toBe('heading');
    expect((s.blocks[0] as any).text).toBe('Slide 3');
    expect(s.narration?.mode).toBe('none');
  });
});
