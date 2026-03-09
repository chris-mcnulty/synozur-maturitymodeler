export interface ModelInfo {
  id: string;
  displayName: string;
}

export interface AICallOptions {
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
  enforceShortResponse?: boolean;
  modelOverride?: string;
}

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  readonly knownModels: ModelInfo[];
  call(prompt: string, options: AICallOptions): Promise<string>;
  isAvailable(): boolean;
}

export interface ProviderConfig {
  providerId: string;
  modelId: string;
}
