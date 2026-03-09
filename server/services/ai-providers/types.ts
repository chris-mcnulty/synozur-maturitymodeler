export interface AICallOptions {
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
  enforceShortResponse?: boolean;
}

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  call(prompt: string, options: AICallOptions): Promise<string>;
  isAvailable(): boolean;
}
