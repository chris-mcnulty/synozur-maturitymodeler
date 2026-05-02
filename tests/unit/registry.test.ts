import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The registry imports ../../db at module load. Stub the database before the
// SUT is imported so no Postgres connection is attempted during unit tests.
vi.mock('../../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [] }),
      }),
    }),
  },
}));

const ENV_KEYS = [
  'AZURE_AI_FOUNDRY_ENDPOINT',
  'AZURE_AI_FOUNDRY_API_KEY',
  'AZURE_AI_FOUNDRY_MODEL',
  'AI_INTEGRATIONS_ANTHROPIC_API_KEY',
  'AI_INTEGRATIONS_ANTHROPIC_BASE_URL',
];

let savedEnv: Record<string, string | undefined> = {};

function clearAllProviderEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  clearAllProviderEnv();
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  vi.resetModules();
});

async function loadRegistry() {
  return await import('../../server/services/ai-providers/registry');
}

describe('providerRegistry - basic lookups', () => {
  it('exposes both providers and reports availability based on env', async () => {
    process.env.AZURE_AI_FOUNDRY_ENDPOINT = 'https://example.openai.azure.com';
    process.env.AZURE_AI_FOUNDRY_API_KEY = 'test-key';

    const { providerRegistry } = await loadRegistry();
    const info = providerRegistry.getAllProvidersInfo();

    const ids = info.map(p => p.id).sort();
    expect(ids).toEqual(['anthropic', 'azure-foundry']);

    const azure = info.find(p => p.id === 'azure-foundry')!;
    const anthropic = info.find(p => p.id === 'anthropic')!;
    expect(azure.isAvailable).toBe(true);
    expect(anthropic.isAvailable).toBe(false);
    expect(azure.models.length).toBeGreaterThan(0);
  });

  it('returns the requested provider via get()', async () => {
    const { providerRegistry } = await loadRegistry();
    expect(providerRegistry.get('azure-foundry')?.id).toBe('azure-foundry');
    expect(providerRegistry.get('anthropic')?.id).toBe('anthropic');
    expect(providerRegistry.get('unknown')).toBeUndefined();
  });
});

describe('providerRegistry - default selection (no settings rows)', () => {
  it('prefers Azure when only Azure credentials are present', async () => {
    process.env.AZURE_AI_FOUNDRY_ENDPOINT = 'https://example.openai.azure.com';
    process.env.AZURE_AI_FOUNDRY_API_KEY = 'test-key';

    const { providerRegistry } = await loadRegistry();
    const config = await providerRegistry.getActiveConfig();

    expect(config.providerId).toBe('azure-foundry');
    // Default model should resolve to the first known Azure model.
    expect(config.modelId).toBe('gpt-5.4');
  });

  it('falls back to Anthropic when only Anthropic credentials are present', async () => {
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = 'sk-test';

    const { providerRegistry } = await loadRegistry();
    const config = await providerRegistry.getActiveConfig();

    expect(config.providerId).toBe('anthropic');
    expect(config.modelId).toBe('claude-sonnet-4-5');
  });

  it('still resolves a default provider when nothing is configured', async () => {
    const { providerRegistry } = await loadRegistry();
    const config = await providerRegistry.getActiveConfig();

    // Azure is the seed default per the registry implementation.
    expect(config.providerId).toBe('azure-foundry');
    expect(config.modelId).toBe('gpt-5.4');
  });
});

describe('providerRegistry - DB-backed configuration', () => {
  it('honours explicit aiProvider / aiModel settings rows', async () => {
    vi.resetModules();
    // The registry calls db.select().from().where().limit() twice — once for
    // 'aiProvider' and once for 'aiModel'. We return them in registration order.
    const responses = [
      [{ key: 'aiProvider', value: 'anthropic' }],
      [{ key: 'aiModel', value: 'claude-sonnet-4-5' }],
    ];
    vi.doMock('../../server/db', () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => responses.shift() ?? [],
            }),
          }),
        }),
      },
    }));
    process.env.AZURE_AI_FOUNDRY_ENDPOINT = 'https://example.openai.azure.com';
    process.env.AZURE_AI_FOUNDRY_API_KEY = 'test-key';

    const { providerRegistry } = await import('../../server/services/ai-providers/registry');
    const config = await providerRegistry.getActiveConfig();

    expect(config.providerId).toBe('anthropic');
    expect(config.modelId).toBe('claude-sonnet-4-5');
  });

  it('falls back to defaults when DB query throws', async () => {
    vi.resetModules();
    vi.doMock('../../server/db', () => ({
      db: {
        select: () => {
          throw new Error('connection refused');
        },
      },
    }));
    process.env.AZURE_AI_FOUNDRY_ENDPOINT = 'https://example.openai.azure.com';
    process.env.AZURE_AI_FOUNDRY_API_KEY = 'test-key';

    const { providerRegistry } = await import('../../server/services/ai-providers/registry');
    const config = await providerRegistry.getActiveConfig();

    expect(config.providerId).toBe('azure-foundry');
    expect(config.modelId).toBe('gpt-5.4');
  });
});

describe('providerRegistry - fallback chain', () => {
  it('returns only available providers, in registration order', async () => {
    process.env.AZURE_AI_FOUNDRY_ENDPOINT = 'https://example.openai.azure.com';
    process.env.AZURE_AI_FOUNDRY_API_KEY = 'test-key';
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = 'sk-test';

    const { providerRegistry } = await loadRegistry();
    const chain = providerRegistry.getFallbackChain();

    expect(chain.map(p => p.id)).toEqual(['azure-foundry', 'anthropic']);
  });

  it('omits providers whose env is missing', async () => {
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = 'sk-test';

    const { providerRegistry } = await loadRegistry();
    const chain = providerRegistry.getFallbackChain();

    expect(chain.map(p => p.id)).toEqual(['anthropic']);
  });

  it('returns an empty chain when no provider is configured', async () => {
    const { providerRegistry } = await loadRegistry();
    const chain = providerRegistry.getFallbackChain();
    expect(chain).toEqual([]);
  });
});
