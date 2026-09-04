import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AZURE_MP3_OUTPUT_FORMAT,
  buildSsml,
  getTtsProvider,
  isAzureTtsConfigured,
  isTtsConfigured,
  splitTextForTts,
  synthesizeChunkAzure,
  synthesizeVoicePreview,
  TTS_PREVIEW_TEXT,
} from '../../server/services/tts-service';

const AZURE_KEYS = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'AZURE_SPEECH_ENDPOINT'] as const;
const OPENAI_KEYS = ['AI_INTEGRATIONS_OPENAI_BASE_URL', 'AI_INTEGRATIONS_OPENAI_API_KEY'] as const;
const ALL_KEYS = [...AZURE_KEYS, ...OPENAI_KEYS] as const;

const saved: Record<string, string | undefined> = {};
for (const k of ALL_KEYS) saved[k] = process.env[k];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ALL_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('Azure Dragon HD requests', () => {
  const dragonVoice = 'en-US-Andrew:DragonHDLatestNeural';
  const config = {
    key: 'test-key',
    region: 'eastus',
    endpoint: 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1',
    voice: dragonVoice,
  };

  it('preserves the DragonHD identifier in SSML', () => {
    expect(buildSsml('Welcome & learn.', dragonVoice)).toContain(
      `<voice name="${dragonVoice}">Welcome &amp; learn.</voice>`,
    );
  });

  it('sends DragonHD narration at the reviewed 96 kbps MP3 quality', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(synthesizeChunkAzure('Welcome.', dragonVoice, config)).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      config.endpoint,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Microsoft-OutputFormat': AZURE_MP3_OUTPUT_FORMAT,
        }),
        body: expect.stringContaining(`name="${dragonVoice}"`),
      }),
    );
  });

  it('explains that a DragonHD voice may be unavailable in the configured region', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Voice not found', { status: 400 })),
    );

    await expect(synthesizeChunkAzure('Welcome.', dragonVoice, config)).rejects.toThrow(
      /may not be available.*eastus/i,
    );
  });
});

describe('voice previews', () => {
  it('returns temporary audio for the requested voice', async () => {
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'eastus';
    delete process.env.AZURE_SPEECH_ENDPOINT;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([7, 8, 9]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const voice = 'en-US-Ava:DragonHDLatestNeural';
    await expect(synthesizeVoicePreview({ voice })).resolves.toEqual({
      audio: Buffer.from([7, 8, 9]),
      voice,
      provider: 'azure',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('eastus.tts.speech.microsoft.com'),
      expect.objectContaining({
        body: expect.stringContaining(TTS_PREVIEW_TEXT),
      }),
    );
  });

  it('reports an unavailable-region error without storing audio', async () => {
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'westus';
    delete process.env.AZURE_SPEECH_ENDPOINT;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Voice not found', { status: 404 })),
    );

    await expect(
      synthesizeVoicePreview({ voice: 'en-US-Andrew:DragonHDLatestNeural' }),
    ).rejects.toThrow(/may not be available.*westus/i);
  });
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

describe('isTtsConfigured', () => {
  it('is false when Azure is not configured', () => {
    clearAll();
    expect(isTtsConfigured()).toBe(false);
  });

  it('is false when only OpenAI env vars are present (OpenAI is not a TTS provider)', () => {
    clearAll();
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = 'http://localhost:1106/modelfarm/openai';
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = '_DUMMY_';
    expect(isTtsConfigured()).toBe(false);
  });

  it('is true when Azure is configured', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_REGION = 'eastus';
    expect(isTtsConfigured()).toBe(true);
  });

  it('is true when Azure key + endpoint (no region) is configured', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_ENDPOINT = 'https://custom.example.com/cognitiveservices/v1';
    expect(isTtsConfigured()).toBe(true);
  });
});

describe('getTtsProvider', () => {
  it('returns null when nothing configured', () => {
    clearAll();
    expect(getTtsProvider()).toBeNull();
  });

  it('returns null when only OpenAI env vars are present', () => {
    clearAll();
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = 'http://localhost:1106/modelfarm/openai';
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = '_DUMMY_';
    expect(getTtsProvider()).toBeNull();
  });

  it('returns azure when Azure is configured', () => {
    clearAll();
    process.env.AZURE_SPEECH_KEY = 'k';
    process.env.AZURE_SPEECH_REGION = 'eastus';
    expect(getTtsProvider()).toBe('azure');
  });

  it('returns azure even when OpenAI env vars are also present', () => {
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

  it('handles text with only newlines as separators', () => {
    const text = 'Line one\nLine two\nLine three';
    const chunks = splitTextForTts(text, 15);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(15);
  });

  it('preserves all text content across chunks', () => {
    const text = 'Alpha beta. Gamma delta. Epsilon zeta. Eta theta.';
    const chunks = splitTextForTts(text, 20);
    const rejoined = chunks.join(' ').replace(/\s+/g, ' ');
    expect(rejoined).toContain('Alpha');
    expect(rejoined).toContain('Eta theta.');
  });
});
