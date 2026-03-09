import type { AIProvider } from './types';
import { AzureFoundryProvider } from './azure-foundry';
import { AnthropicLegacyProvider } from './anthropic-legacy';

const azureFoundry = new AzureFoundryProvider();
const anthropicLegacy = new AnthropicLegacyProvider();

const ALL_PROVIDERS: Map<string, AIProvider> = new Map([
  [azureFoundry.id, azureFoundry],
  [anthropicLegacy.id, anthropicLegacy],
]);

class ProviderRegistry {
  get(id: string): AIProvider | undefined {
    return ALL_PROVIDERS.get(id);
  }

  list(): AIProvider[] {
    return Array.from(ALL_PROVIDERS.values());
  }

  getDefault(): AIProvider {
    if (azureFoundry.isAvailable()) {
      return azureFoundry;
    }
    if (anthropicLegacy.isAvailable()) {
      return anthropicLegacy;
    }
    throw new Error('No AI provider is available. Configure AZURE_AI_FOUNDRY_ENDPOINT + AZURE_AI_FOUNDRY_API_KEY or AI_INTEGRATIONS_ANTHROPIC_API_KEY.');
  }

  getFallbackChain(): AIProvider[] {
    const chain: AIProvider[] = [];
    if (azureFoundry.isAvailable()) chain.push(azureFoundry);
    if (anthropicLegacy.isAvailable()) chain.push(anthropicLegacy);
    return chain;
  }
}

export const providerRegistry = new ProviderRegistry();
