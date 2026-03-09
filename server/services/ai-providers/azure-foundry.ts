import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import type { AIProvider, AICallOptions } from './types';

const SHORT_SYSTEM = 'You are an expert maturity assessment consultant. CRITICAL RULES: ALL responses must be MAXIMUM 30 words (2 lines). Be specific, actionable, and concise. NEVER generate URLs or links - these will be added manually. Focus on clear improvement actions only.';

const LONG_SYSTEM = "You are an expert transformation consultant from The Synozur Alliance LLC. Provide comprehensive, insightful analysis that helps organizations find their North Star. Be detailed, strategic, and empathetic. NEVER generate URLs or links - these will be added manually.\n\nCRITICAL CONTENT RESTRICTIONS:\n- Write for business leaders, NOT technical implementers\n- Use strategic language, NOT technical jargon\n- ABSOLUTELY FORBIDDEN unless model explicitly mentions GTM/Go-to-Market: GTM terminology, ISV, SI, Microsoft partner programs, Power Platform, Power Automate, connectors, APIs, technical implementation details, partner ecosystems\n- If knowledge base contains technical/GTM content that is irrelevant to the current model, completely ignore it\n- Focus exclusively on strategic business transformation appropriate for the user's role and industry";

export class AzureFoundryProvider implements AIProvider {
  readonly id = 'azure-foundry';
  readonly displayName = 'Azure AI Foundry';

  private readonly maxRetries = 3;

  private get endpoint(): string {
    return process.env.AZURE_AI_FOUNDRY_ENDPOINT || '';
  }

  private get apiKey(): string {
    return process.env.AZURE_AI_FOUNDRY_API_KEY || '';
  }

  private get modelName(): string {
    return process.env.AZURE_AI_FOUNDRY_MODEL || 'gpt-4.5-preview';
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

    let lastError: Error | null = null;
    const client = ModelClient(this.endpoint, new AzureKeyCredential(this.apiKey));

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await client.path('/chat/completions').post({
          body: {
            model: this.modelName,
            messages: [
              { role: 'system', content: effectiveSystem },
              { role: 'user', content: prompt },
            ],
            max_tokens: options.maxTokens ?? 8192,
            temperature: options.temperature ?? 1.0,
          },
        });

        if (isUnexpected(response)) {
          throw new Error(`Azure AI Foundry error: ${response.body.error?.message ?? 'Unknown error'}`);
        }

        const text = response.body.choices[0]?.message?.content;
        if (!text) {
          throw new Error('Empty response from Azure AI Foundry');
        }
        return text;
      } catch (error: any) {
        lastError = error;
        console.error(`[AzureFoundryProvider] attempt ${attempt} failed:`, {
          message: error?.message,
          status: error?.status,
        });
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`AzureFoundryProvider failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }
}
