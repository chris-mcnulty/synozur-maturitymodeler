import type { AIProvider, AICallOptions, ModelInfo } from './types';

const SHORT_SYSTEM = 'You are an expert maturity assessment consultant. CRITICAL RULES: ALL responses must be MAXIMUM 30 words (2 lines). Be specific, actionable, and concise. NEVER generate URLs or links - these will be added manually. Focus on clear improvement actions only.';

const LONG_SYSTEM = "You are an expert transformation consultant from The Synozur Alliance LLC. Provide comprehensive, insightful analysis that helps organizations find their North Star. Be detailed, strategic, and empathetic. NEVER generate URLs or links - these will be added manually.\n\nCRITICAL CONTENT RESTRICTIONS:\n- Write for business leaders, NOT technical implementers\n- Use strategic language, NOT technical jargon\n- ABSOLUTELY FORBIDDEN unless model explicitly mentions GTM/Go-to-Market: GTM terminology, ISV, SI, Microsoft partner programs, Power Platform, Power Automate, connectors, APIs, technical implementation details, partner ecosystems\n- If knowledge base contains technical/GTM content that is irrelevant to the current model, completely ignore it\n- Focus exclusively on strategic business transformation appropriate for the user's role and industry";

export class AzureFoundryProvider implements AIProvider {
  readonly id = 'azure-foundry';
  readonly displayName = 'Azure AI Foundry';

  readonly knownModels: ModelInfo[] = [
    { id: 'gpt-5.4', displayName: 'GPT-5.4' },
    { id: 'gpt-5.2', displayName: 'GPT-5.2' },
    { id: 'gpt-4o', displayName: 'GPT-4o' },
  ];

  private readonly maxRetries = 3;
  private readonly apiVersion = '2024-10-21';

  private get baseUrl(): string {
    let raw = (process.env.AZURE_AI_FOUNDRY_ENDPOINT || '').trim();
    if (raw && !raw.startsWith('http')) {
      raw = 'https://' + raw;
    }
    try {
      const url = new URL(raw);
      return url.origin;
    } catch {
      return raw.replace(/\/+$/, '');
    }
  }

  private get apiKey(): string {
    return process.env.AZURE_AI_FOUNDRY_API_KEY || '';
  }

  private get defaultModel(): string {
    return process.env.AZURE_AI_FOUNDRY_MODEL || 'gpt-5.4';
  }

  isAvailable(): boolean {
    return !!(process.env.AZURE_AI_FOUNDRY_ENDPOINT && process.env.AZURE_AI_FOUNDRY_API_KEY);
  }

  async call(prompt: string, options: AICallOptions): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('AzureFoundryProvider: AZURE_AI_FOUNDRY_ENDPOINT and AZURE_AI_FOUNDRY_API_KEY must be set');
    }

    const systemMessage = options.enforceShortResponse === false ? LONG_SYSTEM : SHORT_SYSTEM;
    const effectiveSystem = options.systemPrompt || systemMessage;
    const modelName = options.modelOverride || this.defaultModel;

    let lastError: Error | null = null;
    const url = `${this.baseUrl}/openai/deployments/${modelName}/chat/completions?api-version=${this.apiVersion}`;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: effectiveSystem },
              { role: 'user', content: prompt },
            ],
            ...(modelName.startsWith('gpt-5') || modelName.startsWith('o1') || modelName.startsWith('o3')
              ? { max_completion_tokens: options.maxTokens ?? 8192 }
              : { max_tokens: options.maxTokens ?? 8192 }),
            temperature: options.temperature ?? 1.0,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
          throw new Error(`Azure AI Foundry error: ${errorBody.error?.message ?? `HTTP ${response.status}`}`);
        }

        const data = await response.json() as any;
        const text = data.choices?.[0]?.message?.content;
        if (!text) {
          throw new Error('Empty response from Azure AI Foundry');
        }
        return text;
      } catch (error: any) {
        lastError = error;
        console.error(`[AzureFoundryProvider] attempt ${attempt} failed:`, {
          model: modelName,
          message: error?.message,
        });
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`AzureFoundryProvider failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }
}
