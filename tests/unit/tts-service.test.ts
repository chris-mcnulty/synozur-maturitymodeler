import { afterEach, describe, expect, it } from 'vitest';
import { isTtsConfigured, isAzureTtsConfigured, isOpenAITtsConfigured, getTtsProvider, splitTextForTts } from '../../server/services/tts-service';

const AZURE_KEYS = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'AZURE_SPEECH_ENDPOINT'] as const;
const OPENAI_KEYS = ['AI_INTEGRATIONS_OPENAI_BASE_URL', 'AI_INTEGRATIONS_OPENAI_API_KEY'] as const;
const ALL_KEYS = [...AZURE_KEYS, ...OPENAI_KEYS] as const;

const saved: Record<string, string | undefined> = {};
for (const k of ALL_KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of ALL_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function clearAll() {
  for (const k of ALL_KEYS) delete process.env[k];
}

describe('isAzureTtsConfigured', () => {
  it('is false without a key', () => {
    clearAll();
    process.env.AZURE_SPEECH_REGION = 'eastus';
    expect(isAzureTtsConfigured()).toBe(false);
  });

  it('is false with key but no region or endpoint', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    expect(isAzureTtsConfigured()).toBe(false);
  });

  it('is true with key + region', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_REGION = 'eastus';
    expect(isAzureTtsConfigured()).toBe(true);
  });

  it('is true with key + explicit endpoint', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_ENDPOINT = 'https://example/cognitiveservices/v1';
    expect(isAzureTtsConfigured()).toBe(true);
  });
});

describe('isOpenAITtsConfigured', () => {
  it('is false without any openai vars', () => {
    clearAll();
    expect(isOpenAITtsConfigured()).toBe(false);
  });

  it('is false with only base url', () => {
    clearAll();
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = 'http://localhost:1106/modelfarm/openai';
    expect(isOpenAITtsConfigured()).toBe(false);
  });

  it('is true with base url + api key', () => {
    clearAll();
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = 'http://localhost:1106/modelfarm/openai';
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = '_DUMMY_';
    expect(isOpenAITtsConfigured()).toBe(true);
  });
});

describe('isTtsConfigured', () => {
  it('is false when neither provider is configured', () => {
    clearAll();
    expect(isTtsConfigured()).toBe(false);
  });

  it('is true when only Azure is configured', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_REGION = 'eastus';
    expect(isTtsConfigured()).toBe(true);
  });

  it('is true when only OpenAI is configured', () => {
    clearAll();
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = 'http://localhost:1106/modelfarm/openai';
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = '_DUMMY_';
    expect(isTtsConfigured()).toBe(true);
  });
});

describe('getTtsProvider', () => {
  it('returns null when nothing configured', () => {
    clearAll();
    expect(getTtsProvider()).toBeNull();
  });

  it('returns azure when Azure is configured', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_REGION = 'eastus';
    expect(getTtsProvider()).toBe('azure');
  });

  it('returns openai when only OpenAI is configured', () => {
    clearAll();
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = 'http://localhost:1106/modelfarm/openai';
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = '_DUMMY_';
    expect(getTtsProvider()).toBe('openai');
  });

  it('prefers azure over openai when both configured', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_REGION = 'eastus';
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = 'http://localhost:1106/modelfarm/openai';
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = '_DUMMY_';
    expect(getTtsProvider()).toBe('azure');
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
