import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { settings } from '@shared/schema';
import type { AIProvider, ProviderConfig, ModelInfo } from './types';
import { AzureFoundryProvider } from './azure-foundry';
import { AnthropicLegacyProvider } from './anthropic-legacy';

export interface ProviderInfo {
  id: string;
  displayName: string;
  isAvailable: boolean;
  models: ModelInfo[];
}

const azureFoundry = new AzureFoundryProvider();
const anthropicLegacy = new AnthropicLegacyProvider();

const ALL_PROVIDERS: AIProvider[] = [azureFoundry, anthropicLegacy];

class ProviderRegistry {
  get(id: string): AIProvider | undefined {
    return ALL_PROVIDERS.find(p => p.id === id);
  }

  getAllProvidersInfo(): ProviderInfo[] {
    return ALL_PROVIDERS.map(p => ({
      id: p.id,
      displayName: p.displayName,
      isAvailable: p.isAvailable(),
      models: p.knownModels,
    }));
  }

  async getActiveConfig(): Promise<ProviderConfig> {
    try {
      const [providerRow] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'aiProvider'))
        .limit(1);
      const [modelRow] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'aiModel'))
        .limit(1);

      const rawProvider = providerRow?.value;
      const rawModel = modelRow?.value;
      const providerId = typeof rawProvider === 'string' ? rawProvider : (rawProvider as any)?.toString?.() ?? '';
      const modelId = typeof rawModel === 'string' ? rawModel : (rawModel as any)?.toString?.() ?? '';

      return {
        providerId: providerId || this.defaultProviderId(),
        modelId: modelId || this.defaultModelId(providerId || this.defaultProviderId()),
      };
    } catch {
      return {
        providerId: this.defaultProviderId(),
        modelId: this.defaultModelId(this.defaultProviderId()),
      };
    }
  }

  private defaultProviderId(): string {
    if (azureFoundry.isAvailable()) return azureFoundry.id;
    if (anthropicLegacy.isAvailable()) return anthropicLegacy.id;
    return azureFoundry.id;
  }

  private defaultModelId(providerId: string): string {
    const provider = this.get(providerId);
    return provider?.knownModels[0]?.id ?? '';
  }

  getFallbackChain(): AIProvider[] {
    return ALL_PROVIDERS.filter(p => p.isAvailable());
  }
}

export const providerRegistry = new ProviderRegistry();
