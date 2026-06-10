import { afterEach, describe, expect, it } from 'vitest';
import { isTtsConfigured } from '../../server/services/tts-service';

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
