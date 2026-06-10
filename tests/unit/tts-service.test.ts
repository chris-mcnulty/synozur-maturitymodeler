import { afterEach, describe, expect, it } from 'vitest';
import { isTtsConfigured, splitTextForTts } from '../../server/services/tts-service';

const KEYS = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'AZURE_SPEECH_ENDPOINT'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isTtsConfigured', () => {
  it('is false without a key', () => {
    delete process.env.AZURE_SPEECH_KEY;
    process.env.AZURE_SPEECH_REGION = 'eastus';
    expect(isTtsConfigured()).toBe(false);
  });

  it('is false with a key but no region or endpoint', () => {
    process.env.AZURE_SPEECH_KEY = 'k';
    delete process.env.AZURE_SPEECH_REGION;
    delete process.env.AZURE_SPEECH_ENDPOINT;
    expect(isTtsConfigured()).toBe(false);
  });

  it('is true with key + region', () => {
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_REGION = 'eastus';
    expect(isTtsConfigured()).toBe(true);
  });

  it('is true with key + explicit endpoint', () => {
    process.env.AZURE_SPEECH_KEY = 'k';
    delete process.env.AZURE_SPEECH_REGION;
    process.env.AZURE_SPEECH_ENDPOINT = 'https://example/cognitiveservices/v1';
    expect(isTtsConfigured()).toBe(true);
  });
});

describe('splitTextForTts', () => {
  it('returns a single chunk when under the limit', () => {
    expect(splitTextForTts('Hello world.', 100)).toEqual(['Hello world.']);
  });

  it('returns nothing for empty/whitespace input', () => {
    expect(splitTextForTts('   ', 100)).toEqual([]);
  });

  it('splits on sentence boundaries and keeps every chunk within the limit', () => {
    const text = 'Sentence one is here. Sentence two is here. Sentence three is here.';
    const chunks = splitTextForTts(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(30);
    // No content lost (modulo whitespace normalization).
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('Sentence three is here.');
  });

  it('hard-splits a single oversized unit with no sentence breaks', () => {
    const word = 'a'.repeat(250);
    const chunks = splitTextForTts(word, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    expect(chunks.join('').length).toBe(250);
  });
});
