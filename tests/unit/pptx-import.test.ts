import { describe, expect, it } from 'vitest';
import { decodeXmlEntities, extractText } from '../../server/services/pptx-import';

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
