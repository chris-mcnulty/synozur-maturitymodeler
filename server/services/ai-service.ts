import OpenAI from 'openai';
import { z } from 'zod';
import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import type { Assessment, Model, Dimension, User } from '@shared/schema';
import { db } from '../db';
import { aiGeneratedContent } from '@shared/schema';

// Initialize OpenAI client with Replit AI Integrations
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || '',
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

// Types for AI service
export interface GenerateOptions {
  outputFormat?: 'json' | 'text';
  temperature?: number;
  maxTokens?: number;
}

export interface RecommendationContext {
  assessment: Assessment;
  model: Model;
  dimensions: Dimension[];
  user?: User;
  scores: Record<string, number>;
}

export interface GeneratedRecommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedOutcome: string;
  resources: {
    title: string;
    url: string;
    source: 'synozur' | 'external';
  }[];
}

export interface InterpretationRequest {
  modelId: string;
  dimensionId?: string;
  maturityLevel: number;
  industryContext?: string;
  companySize?: string;
}

// Response schemas for structured output
const recommendationSchema = z.object({
  recommendations: z.array(z.object({
    priority: z.enum(['high', 'medium', 'low']),
    title: z.string(),
    description: z.string(),
    expectedOutcome: z.string(),
    resources: z.array(z.object({
      title: z.string(),
      url: z.string(),
      source: z.enum(['synozur', 'external'])
    }))
  }))
});

const interpretationSchema = z.object({
  interpretation: z.string(),
  keyInsights: z.array(z.string()),
  improvementPath: z.string(),
  industryBenchmark: z.string().optional()
});

const resourceSuggestionSchema = z.object({
  resources: z.array(z.object({
    title: z.string(),
    description: z.string(),
    url: z.string(),
    type: z.enum(['article', 'guide', 'video', 'tool', 'whitepaper']),
    relevanceScore: z.number().min(0).max(1),
    source: z.enum(['synozur', 'external'])
  }))
});

class AIService {
  private readonly model = 'gpt-5-mini'; // Using Replit AI Integrations GPT-5 mini model
  private readonly maxRetries = 3;
  private readonly timeout = 30000; // 30 seconds
  private readonly cacheExpirationDays = 90; // Cache AI summaries for 90 days

  // Generate cache key from context
  private generateCacheKey(type: string, context: Record<string, any>): string {
    const contextString = JSON.stringify(context, Object.keys(context).sort());
    return crypto.createHash('sha256')
      .update(`${type}:${contextString}`)
      .digest('hex');
  }

  // Check if cached content exists and is valid
  private async getCachedContent(type: string, context: Record<string, any>): Promise<string | null> {
    try {
      const cacheKey = this.generateCacheKey(type, context);
      const now = new Date();
      
      const cached = await db
        .select()
        .from(aiGeneratedContent)
        .where(
          and(
            eq(aiGeneratedContent.contextHash, cacheKey),
            eq(aiGeneratedContent.type, type),
            gt(aiGeneratedContent.expiresAt, now)
          )
        )
        .limit(1);
      
      if (cached.length > 0 && cached[0].content) {
        console.log(`Cache hit for ${type}:`, cacheKey);
        return (cached[0].content as any).text || null;
      }
      
      console.log(`Cache miss for ${type}:`, cacheKey);
      return null;
    } catch (error) {
      console.error('Error checking cache:', error);
      return null;
    }
  }

  // Save content to cache
  private async saveToCache(type: string, context: Record<string, any>, content: string): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(type, context);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.cacheExpirationDays);
      
      await db.insert(aiGeneratedContent).values({
        type,
        contextHash: cacheKey,
        content: { text: content },
        metadata: { context, generatedAt: new Date().toISOString() },
        expiresAt
      }).onConflictDoNothing();
      
      console.log(`Saved to cache ${type}:`, cacheKey);
    } catch (error) {
      console.error('Error saving to cache:', error);
      // Non-critical error, continue without caching
    }
  }

  // Generate personalized recommendations based on assessment results
  
  // Generate a comprehensive maturity summary across dimensions
  async generateMaturitySummary(
    overallScore: number,
    dimensionScores: Record<string, { score: number; label: string }>,
    modelName: string,
    userContext?: { industry?: string; companySize?: string; jobTitle?: string }
  ): Promise<string> {
    // Create cache context
    const cacheContext = {
      overallScore,
      dimensionScores,
      modelName,
      userContext: userContext || {}
    };
    
    // Check cache first
    const cached = await this.getCachedContent('maturity_summary', cacheContext);
    if (cached) {
      return cached;
    }
    
    try {
      // Sort dimensions by score for highlighting strengths and opportunities
      const sortedDimensions = Object.entries(dimensionScores)
        .sort(([, a], [, b]) => b.score - a.score);
      
      const topStrengths = sortedDimensions.slice(0, 2)
        .map(([, dim]) => `${dim.label} (${dim.score}/500)`);
      
      const opportunities = sortedDimensions.slice(-2)
        .map(([, dim]) => `${dim.label} (${dim.score}/500)`);

      const prompt = `You are a transformation expert from The Synozur Alliance LLC. Write a BRIEF executive summary (MAX 150 words total) with clear structure:

Assessment: ${modelName}
Overall Score: ${overallScore}/500
${userContext ? `Context: ${userContext.jobTitle || 'Leader'} in ${userContext.industry || 'Industry'}, ${userContext.companySize || 'Company'}` : ''}

Write EXACTLY 3 short paragraphs:

PARAGRAPH 1 (2 sentences):
Acknowledge their current position with empathy. Reference the overall score and journey uniqueness.

PARAGRAPH 2 (use bullet points):
Your key strengths:
• ${topStrengths[0]}
• ${topStrengths[1]}

Priority growth areas:
• ${opportunities[0]}
• ${opportunities[1]}

PARAGRAPH 3 (2 sentences):
Inspiring close about finding their North Star and Synozur partnership making the desirable achievable.

CRITICAL RULES:
- Total output MUST be under 150 words
- Use bullet points ONLY in paragraph 2 for listing items
- Keep sentences concise and impactful
- ${userContext ? `Personalize for ${userContext.jobTitle} perspective` : 'Keep strategic focus'}`;

      const completion = await this.callOpenAI(prompt);
      
      if (!completion) {
        throw new Error('Failed to generate maturity summary');
      }

      const summary = completion.trim();
      
      // Save to cache
      await this.saveToCache('maturity_summary', cacheContext, summary);
      
      return summary;
    } catch (error) {
      console.error('Error generating maturity summary:', error);
      // Return a fallback summary
      return `Your organization demonstrates ${overallScore >= 400 ? 'advanced' : overallScore >= 300 ? 'developing' : 'emerging'} maturity at ${overallScore}/500.

Key strengths provide solid foundations. Priority areas offer clear transformation paths.

The Synozur Alliance LLC is here to help you find your North Star and make the desirable achievable.`;
    }
  }

  // Generate a summary of personalized recommendations
  async generateRecommendationsSummary(
    recommendations: Array<{ title: string; description: string; priority?: string }>,
    modelName: string,
    userContext?: { industry?: string; companySize?: string; jobTitle?: string }
  ): Promise<string> {
    try {
      const recList = recommendations
        .map(r => `- ${r.title}: ${r.description}`)
        .join('\n');

      const prompt = `You are a transformation expert from The Synozur Alliance LLC (Synozur - the transformation company). Your role is to be a "navigator of change" who helps organizations find their North Star.

Generate a strategic recommendations summary based on these assessment recommendations:

Model: ${modelName}
${userContext ? `
User Context:
- Industry: ${userContext.industry || 'Not specified'}
- Company Size: ${userContext.companySize || 'Not specified'}
- Role: ${userContext.jobTitle || 'Not specified'}` : ''}

Recommendations:
${recList}

Write a 1-2 paragraph transformation roadmap following Synozur's brand voice:
1. Frame this as a unique journey tailored to their specific needs - "Your transformation is unique"
2. Synthesize recommendations into a clear, achievable path forward
3. ${userContext ? `Personalize for a ${userContext.jobTitle || 'leader'} navigating transformation in ${userContext.industry || 'your industry'} with ${userContext.companySize || 'your organization size'}` : 'Provide strategic guidance'}
4. Emphasize partnership: "We'll help you plot a new course" and "navigate complexities with ease"
5. Connect to tangible business outcomes (efficiency, ROI, market success, adoption)
6. Close with an invitation to partnership: how Synozur's expertise makes the desirable achievable

Brand Voice Reminders:
- Empathetic acknowledgment of their challenges
- Tailored, custom approach - never generic
- Clear, conversational language (12th-grade level)
- Positive yet grounded - confident without overselling
- Focus on partnership and collaboration ("we" language)
- Frame as navigating toward their North Star

Tagline integration: "With Synozur, we'll help you find your North Star and make the desirable achievable."`;

      const completion = await this.callOpenAI(prompt);
      
      if (!completion) {
        throw new Error('Failed to generate recommendations summary');
      }

      return completion.trim();
    } catch (error) {
      console.error('Error generating recommendations summary:', error);
      // Return a fallback summary
      return 'Based on your assessment results, we recommend focusing on your highest-priority improvement areas while building on existing strengths. The Synozur Alliance can help you create a detailed transformation roadmap tailored to your specific needs.';
    }
  }

  // Rewrite an answer option to be more contextual to the specific question
  async rewriteAnswer(question: string, answer: string, score: number, modelContext?: string): Promise<string> {
    try {
      const prompt = `You are an expert in maturity assessments. Rewrite the following answer option to be more specific and contextual to the question while maintaining the same maturity level.

Question: ${question}
Current Answer: ${answer}
Score Level: ${score}/100 (${this.getMaturityLevel(score * 5)})
${modelContext ? `Model Context: ${modelContext}` : ''}

Rewrite the answer to:
1. Be specifically relevant to the question asked
2. Maintain the same maturity level (${this.getMaturityLevel(score * 5)})
3. Be clear and actionable
4. Avoid generic statements
5. Focus on practical, real-world scenarios

Return only the rewritten answer text, no explanations or additional formatting.`;

      const completion = await this.callOpenAI(prompt);
      
      if (!completion) {
        throw new Error('Failed to rewrite answer');
      }

      return completion.trim();
    } catch (error) {
      console.error('Error rewriting answer:', error);
      throw error;
    }
  }

  // Public method for generating text (for compatibility with admin endpoints)
  async generateText(prompt: string, options?: GenerateOptions): Promise<any> {
    try {
      // If outputFormat is 'json', we need to provide a basic schema
      const responseFormat = options?.outputFormat === 'json' ? z.object({}).passthrough() : undefined;
      
      const completion = await this.callOpenAI(prompt, responseFormat);
      
      if (!completion) {
        throw new Error('Failed to generate text');
      }

      // If JSON format was requested, parse and return the object
      if (options?.outputFormat === 'json') {
        try {
          return JSON.parse(completion);
        } catch (e) {
          console.error('Failed to parse JSON response:', e);
          throw new Error('Invalid JSON response from AI');
        }
      }

      return completion;
    } catch (error) {
      console.error('Error in generateText:', error);
      throw error;
    }
  }

  async generateRecommendations(context: RecommendationContext): Promise<GeneratedRecommendation[]> {
    try {
      const prompt = this.buildRecommendationPrompt(context);
      
      const completion = await this.callOpenAI(prompt, recommendationSchema);
      
      if (!completion) {
        return this.getFallbackRecommendations(context);
      }

      const parsed = recommendationSchema.safeParse(JSON.parse(completion));
      if (!parsed.success) {
        console.error('Failed to parse recommendations:', parsed.error);
        return this.getFallbackRecommendations(context);
      }

      return parsed.data.recommendations;
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return this.getFallbackRecommendations(context);
    }
  }

  // Generate interpretation for assessment results
  async generateInterpretation(request: InterpretationRequest) {
    try {
      const prompt = this.buildInterpretationPrompt(request);
      
      const completion = await this.callOpenAI(prompt, interpretationSchema);
      
      if (!completion) {
        return null;
      }

      const parsed = interpretationSchema.safeParse(JSON.parse(completion));
      if (!parsed.success) {
        console.error('Failed to parse interpretation:', parsed.error);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('Error generating interpretation:', error);
      return null;
    }
  }

  // Suggest resources for a specific dimension or model
  async suggestResources(
    topic: string, 
    context: { industry?: string; companySize?: string; currentScore?: number }
  ) {
    try {
      const prompt = this.buildResourcePrompt(topic, context);
      
      const completion = await this.callOpenAI(prompt, resourceSuggestionSchema);
      
      if (!completion) {
        return [];
      }

      const parsed = resourceSuggestionSchema.safeParse(JSON.parse(completion));
      if (!parsed.success) {
        console.error('Failed to parse resources:', parsed.error);
        return [];
      }

      return parsed.data.resources.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch (error) {
      console.error('Error suggesting resources:', error);
      return [];
    }
  }

  // Core OpenAI API call with retry logic
  private async callOpenAI(prompt: string, responseFormat?: z.ZodSchema): Promise<string | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          {
            role: 'system',
            content: 'You are an expert maturity assessment consultant specializing in organizational transformation. Always provide actionable, specific recommendations based on the context provided. Prefer Synozur resources and content when available.'
          },
          {
            role: 'user',
            content: prompt
          }
        ];

        const completion = await openai.chat.completions.create({
          model: this.model,
          messages,
          max_completion_tokens: 2000,
          response_format: responseFormat ? { type: 'json_object' } : undefined,
        });

        return completion.choices[0]?.message?.content || null;
      } catch (error) {
        lastError = error as Error;
        console.error(`OpenAI API attempt ${attempt} failed:`, error);
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    console.error('All OpenAI API attempts failed:', lastError);
    return null;
  }

  // Build recommendation prompt
  private buildRecommendationPrompt(context: RecommendationContext): string {
    const { assessment, model, dimensions, user, scores } = context;
    
    const dimensionScores = dimensions.map(d => {
      const score = scores[d.id] || 0;
      return `- ${d.label}: ${score}/500 (${this.getMaturityLevel(score)})`;
    }).join('\n');

    const userContext = user ? `
Industry: ${user.industry || 'Not specified'}
Company Size: ${user.companySize || 'Not specified'}
Role: ${user.jobTitle || 'Not specified'}
Country: ${user.country || 'Not specified'}` : 'User context not available';

    return `Generate personalized recommendations for this maturity assessment:

Model: ${model.name}
${model.description || ''}

Assessment Scores:
${dimensionScores}

User Context:
${userContext}

Generate 3-5 specific, actionable recommendations in JSON format.
Prioritize by impact (high/medium/low).
Each recommendation should include:
- Clear title
- Detailed description of what to do
- Expected outcome if implemented
- 2-3 relevant resources (prefer Synozur.com content when applicable)

Focus on the lowest-scoring dimensions first.
Make recommendations specific to the industry and company size when possible.

Return as JSON with structure:
{
  "recommendations": [{
    "priority": "high|medium|low",
    "title": "string",
    "description": "string", 
    "expectedOutcome": "string",
    "resources": [{
      "title": "string",
      "url": "string",
      "source": "synozur|external"
    }]
  }]
}`;
  }

  // Build interpretation prompt
  private buildInterpretationPrompt(request: InterpretationRequest): string {
    const maturityName = this.getMaturityLevel(request.maturityLevel * 100);
    
    return `Generate an interpretation for this maturity assessment result:

Maturity Level: ${maturityName} (${request.maturityLevel}/5)
${request.industryContext ? `Industry: ${request.industryContext}` : ''}
${request.companySize ? `Company Size: ${request.companySize}` : ''}

Provide:
1. A comprehensive interpretation of what this maturity level means (2-3 paragraphs)
2. 3-4 key insights about organizations at this level
3. A clear improvement path to reach the next level
4. Industry benchmark comparison (if industry context provided)

Return as JSON with structure:
{
  "interpretation": "string",
  "keyInsights": ["string"],
  "improvementPath": "string",
  "industryBenchmark": "string" (optional)
}`;
  }

  // Build resource suggestion prompt
  private buildResourcePrompt(topic: string, context: any): string {
    return `Suggest relevant resources for improving in this area:

Topic: ${topic}
${context.industry ? `Industry: ${context.industry}` : ''}
${context.companySize ? `Company Size: ${context.companySize}` : ''}
${context.currentScore !== undefined ? `Current Maturity: ${this.getMaturityLevel(context.currentScore)}` : ''}

Provide 5-7 highly relevant resources.
Prioritize content from Synozur.com when available.
Include a mix of content types (articles, guides, tools, etc.).

Return as JSON with structure:
{
  "resources": [{
    "title": "string",
    "description": "string",
    "url": "string",
    "type": "article|guide|video|tool|whitepaper",
    "relevanceScore": 0.0-1.0,
    "source": "synozur|external"
  }]
}`;
  }

  // Get maturity level name from score
  private getMaturityLevel(score: number): string {
    if (score >= 400) return 'Optimizing';
    if (score >= 300) return 'Managed';
    if (score >= 200) return 'Developing';
    if (score >= 100) return 'Initial';
    return 'Ad Hoc';
  }

  // Fallback recommendations when AI is unavailable
  private getFallbackRecommendations(context: RecommendationContext): GeneratedRecommendation[] {
    const { dimensions, scores } = context;
    
    // Find lowest scoring dimensions
    const sortedDimensions = dimensions
      .map(d => ({ dimension: d, score: scores[d.id] || 0 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);

    return sortedDimensions.map((item, index) => ({
      priority: index === 0 ? 'high' as const : 'medium' as const,
      title: `Improve ${item.dimension.label}`,
      description: `Focus on enhancing capabilities in ${item.dimension.label}. Current score indicates significant room for improvement.`,
      expectedOutcome: `Increased maturity in ${item.dimension.label} leading to better overall organizational performance.`,
      resources: [
        {
          title: `${item.dimension.label} Best Practices`,
          url: 'https://www.synozur.com/resources',
          source: 'synozur' as const
        }
      ]
    }));
  }
}

// Export singleton instance
export const aiService = new AIService();

// Export types
export type { AIService };