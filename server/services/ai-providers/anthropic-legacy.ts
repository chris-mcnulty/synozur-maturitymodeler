import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AICallOptions } from './types';

const SHORT_SYSTEM = 'You are an expert maturity assessment consultant. CRITICAL RULES: ALL responses must be MAXIMUM 30 words (2 lines). Be specific, actionable, and concise. NEVER generate URLs or links - these will be added manually. Focus on clear improvement actions only.';

const LONG_SYSTEM = "You are an expert transformation consultant from The Synozur Alliance LLC. Provide comprehensive, insightful analysis that helps organizations find their North Star. Be detailed, strategic, and empathetic. NEVER generate URLs or links - these will be added manually.\n\nCRITICAL CONTENT RESTRICTIONS:\n- Write for business leaders, NOT technical implementers\n- Use strategic language, NOT technical jargon\n- ABSOLUTELY FORBIDDEN unless model explicitly mentions GTM/Go-to-Market: GTM terminology, ISV, SI, Microsoft partner programs, Power Platform, Power Automate, connectors, APIs, technical implementation details, partner ecosystems\n- If knowledge base contains technical/GTM content that is irrelevant to the current model, completely ignore it\n- Focus exclusively on strategic business transformation appropriate for the user's role and industry";

export class AnthropicLegacyProvider implements AIProvider {
  readonly id = 'anthropic';
  readonly displayName = 'Anthropic Claude (Replit)';

  private client = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || '',
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });

  private readonly model = 'claude-sonnet-4-5';
  private readonly maxRetries = 3;

  isAvailable(): boolean {
    return !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY);
  }

  async call(prompt: string, options: AICallOptions): Promise<string> {
    const systemMessage = options.enforceShortResponse === false ? LONG_SYSTEM : SHORT_SYSTEM;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const completion = await this.client.messages.create({
          model: this.model,
          max_tokens: options.maxTokens ?? 8192,
          system: options.systemPrompt || systemMessage,
          messages: [{ role: 'user', content: prompt }],
        });

        const content = completion.content[0];
        if (!content || content.type !== 'text') {
          throw new Error('Empty or invalid response from Anthropic API');
        }
        return content.text;
      } catch (error: any) {
        lastError = error;
        console.error(`[AnthropicLegacyProvider] attempt ${attempt} failed:`, {
          type: error?.type,
          message: error?.message,
          status: error?.status,
        });
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`AnthropicLegacyProvider failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }
}
