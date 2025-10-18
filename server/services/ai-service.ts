import OpenAI from 'openai';
import { z } from 'zod';
import crypto from 'crypto';
import { eq, and, gt, or, isNull } from 'drizzle-orm';
import type { Assessment, Model, Dimension, User } from '@shared/schema';
import { db } from '../db';
import * as schema from '@shared/schema';
import { aiGeneratedContent, knowledgeDocuments } from '@shared/schema';
import { DocumentExtractionService } from './document-extraction';

// Initialize OpenAI client with Replit AI Integrations
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || '',
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

// AI Playbook grounding for AI Maturity Assessment model
const AI_PLAYBOOK_GROUNDING = `
SYNOZUR AI MATURITY INSIGHTS - Leading AI Playbooks Analysis

Key Strategic Themes from 16 Leading AI Playbooks:

1. HOLISTIC AI MATURITY DRIVES PERFORMANCE
- Only 12% of companies achieve high AI maturity ("AI Achievers")
- AI Achievers enjoy 50% higher revenue growth than peers
- Success requires integration across strategy, tech, talent, and culture
- Embed AI broadly and intentionally for outsized gains

2. PEOPLE AND CULTURE ARE PIVOTAL
- 70% of AI success depends on people and processes, not algorithms
- Foster AI-ready culture through training, upskilling, agile teams
- Strong executive sponsorship is critical
- Treat AI as human capital transformation, not just technology deployment

3. CLOUD & SCALE AS AI ENABLERS
- Robust cloud infrastructure and security are essential for AI at scale
- 8-step journey: strategy → skills, grounded in cloud adoption
- Invest in scalable platforms and cyber defense as foundations

4. RESPONSIBLE AI AND RISK MANAGEMENT
- Responsible/secure AI is non-negotiable across all playbooks
- Address data poisoning, model theft, ethical governance
- Build trust and resilience through ethical AI practices

COMPANY-SPECIFIC INSIGHTS:

ACCENTURE - The Art of AI Maturity:
- AI Achievers (12%) use AI as strategic lever for transformation
- Holistic approach: technology + strategy + C-suite sponsorship + culture
- Nearly double the AI maturity scores and significantly higher revenue growth

AMAZON - AI/ML/GenAI Cloud Adoption:
- Work backward from business outcomes
- Build foundations: data governance, flexible cloud, mature MLOps
- Treat AI as long-term capability, not disconnected pilots

BAIN - Winning with AI:
- AI as foundational innovation platform, not standalone tool
- Integrate humans "in the loop" with AI
- Focus on few core initiatives delivering real business value

BCG - Leader's Guide to Transformation:
- Only 1 in 4 companies realizes real AI value at scale
- 10/20/70 rule: 10% algorithms, 20% tech/data, 70% people/culture
- Leaders report 50% higher revenue growth, 60% greater shareholder return

BOOZ ALLEN - Securing AI:
- AI security must be embedded throughout lifecycle
- Critical risks: data poisoning, model manipulation, adversarial attacks
- Secure AI deployment emerging as key market differentiator

DELOITTE - AI Transformation:
- ~80% of organizations plan to boost AI spending
- AI needs to be "built in, not bolted on"
- Focus on "agentic AI" - autonomous, reasoning systems

GOOGLE - AI Adoption Framework:
- Six themes: Learn, Lead, Access, Scale, Secure, Automate
- Move from tactical experiments to strategic transformation
- Methodically strengthen each dimension for acceleration

IBM - CEO's Guide to GenAI:
- GenAI is "game-changer" requiring CEO-level strategy
- Drive application modernization and workforce training
- Ensure trustworthy AI with fairness and transparency

MCKINSEY - Executive's AI Playbook:
- Three parts: Value & Assess, Execute, Beware
- Quantify and prioritize opportunities
- Avoid top 10 failure signs

MICROSOFT - CIO's Guide:
- CIOs shifting from IT enabler to strategic AI leader
- 83% expect GenAI budget growth
- Become ethical stewards and change agents

PWC - Agentic AI:
- Multi-agent systems for complex workflow automation
- 73% of Middle East CEOs expect GenAI to reshape value creation
- Early adopters seeing dramatic cost reduction and agility

AI MATURITY MODEL (5 Levels):

1. FOUNDATIONAL (Maturity 20-30):
- Pilot AI projects, limited business impact
- Focus: Basic infrastructure, data quality, education

2. DEVELOPING (Maturity 30-40):
- Targeted AI applications in 1-2 functions
- Focus: Skills development, cross-functional alignment

3. PROFICIENT (Maturity 40-50):
- AI embedded in core operations
- Focus: Scaling capabilities, change management

4. ADVANCED (Maturity 50-60):
- AI drives major decisions and innovation
- Focus: Enterprise platforms, responsible AI

5. FRONTIER (Maturity 60+):
- AI-first culture, business model reinvention
- Focus: Human-AI orchestration, ecosystem leadership

TRANSFORMATION ROADMAP PRIORITIES:
- Start with clear vision and business outcomes
- Build foundations: data, cloud, security
- Scale use cases with governance
- Empower talent and foster culture
- Continuously learn and adapt
`;

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

  // Generate a hash representing the current knowledge base version for cache invalidation
  private async getKnowledgeVersionHash(modelId?: string): Promise<string> {
    try {
      // Fetch document metadata (id + updatedAt) for version fingerprint
      let documentsQuery = db.select({
        id: knowledgeDocuments.id,
        updatedAt: knowledgeDocuments.updatedAt
      }).from(knowledgeDocuments);
      
      if (modelId) {
        // Get both company-wide and model-specific documents
        documentsQuery = documentsQuery.where(
          or(
            eq(knowledgeDocuments.scope, 'company-wide'),
            and(
              eq(knowledgeDocuments.scope, 'model-specific'),
              eq(knowledgeDocuments.modelId, modelId)
            )
          )
        ) as any;
      } else {
        // Only get company-wide documents
        documentsQuery = documentsQuery.where(
          eq(knowledgeDocuments.scope, 'company-wide')
        ) as any;
      }
      
      const docs = await documentsQuery;
      
      // Create a stable fingerprint from document IDs and timestamps
      const fingerprint = docs
        .sort((a, b) => a.id.localeCompare(b.id)) // Ensure stable ordering
        .map(doc => `${doc.id}:${doc.updatedAt.toISOString()}`)
        .join('|');
      
      // Return hash of fingerprint
      return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16);
    } catch (error) {
      console.error('Error generating knowledge version hash:', error);
      return 'default'; // Fallback to ensure caching still works
    }
  }

  // Fetch and extract knowledge documents for grounding AI responses
  private async getKnowledgeContext(modelId?: string): Promise<string> {
    try {
      const documentExtractor = new DocumentExtractionService();
      
      // Fetch relevant knowledge documents
      let documentsQuery = db.select().from(knowledgeDocuments);
      
      if (modelId) {
        // Get both company-wide and model-specific documents
        documentsQuery = documentsQuery.where(
          or(
            eq(knowledgeDocuments.scope, 'company-wide'),
            and(
              eq(knowledgeDocuments.scope, 'model-specific'),
              eq(knowledgeDocuments.modelId, modelId)
            )
          )
        ) as any;
      } else {
        // Only get company-wide documents
        documentsQuery = documentsQuery.where(
          eq(knowledgeDocuments.scope, 'company-wide')
        ) as any;
      }
      
      const docs = await documentsQuery;
      
      if (docs.length === 0) {
        return AI_PLAYBOOK_GROUNDING; // Fallback to hard-coded grounding
      }
      
      // Extract text from all documents
      const extractedTexts = await Promise.all(
        docs.map(async (doc) => {
          try {
            const text = await documentExtractor.extractTextFromDocument(doc.fileUrl, doc.fileType);
            return `## ${doc.name}\n${text}\n`;
          } catch (error) {
            console.error(`Failed to extract text from ${doc.name}:`, error);
            return `## ${doc.name}\n[Text extraction failed]\n`;
          }
        })
      );
      
      // Combine extracted knowledge with hard-coded grounding
      const knowledgeContext = `# KNOWLEDGE BASE\n\n${extractedTexts.join('\n')}\n\n${AI_PLAYBOOK_GROUNDING}`;
      
      return knowledgeContext;
    } catch (error) {
      console.error('Error fetching knowledge context:', error);
      return AI_PLAYBOOK_GROUNDING; // Fallback to hard-coded grounding
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
    // Get model ID to fetch knowledge version
    let modelId: string | undefined;
    try {
      const models = await db.select().from(schema.models).where(eq(schema.models.name, modelName)).limit(1);
      modelId = models[0]?.id;
    } catch (error) {
      console.error('Error fetching modelId for knowledge context:', error);
    }

    // Get knowledge version hash for cache invalidation
    const knowledgeVersion = await this.getKnowledgeVersionHash(modelId);

    // Create cache context including knowledge version
    const cacheContext = {
      overallScore,
      dimensionScores,
      modelName,
      userContext: userContext || {},
      knowledgeVersion
    };
    
    // Check cache first
    const cached = await this.getCachedContent('maturity_summary', cacheContext);
    if (cached) {
      return cached;
    }
    
    try {
      // Sort dimensions by score for highlighting strengths and opportunities
      // Filter out any dimensions with missing labels to prevent "undefined" in summaries
      const validDimensions = Object.entries(dimensionScores)
        .filter(([, dim]) => dim && dim.label && dim.label.trim() !== '')
        .sort(([, a], [, b]) => b.score - a.score);
      
      // Ensure we have at least 2 dimensions to work with
      if (validDimensions.length < 2) {
        console.warn('Insufficient dimension data for AI summary:', { dimensionScores, validCount: validDimensions.length });
        // Return a generic summary if we don't have enough dimension data
        return `Your organization demonstrates ${overallScore >= 400 ? 'advanced' : overallScore >= 300 ? 'developing' : 'emerging'} maturity at ${overallScore}/500.

Your assessment shows areas of strength and opportunities for growth. The Synozur Alliance LLC is here to help you find your North Star and make the desirable achievable.`;
      }
      
      const topStrengths = validDimensions.slice(0, 2)
        .map(([, dim]) => `${dim.label} (${dim.score}/500)`);
      
      const opportunities = validDimensions.slice(-2)
        .map(([, dim]) => `${dim.label} (${dim.score}/500)`);

      // Fetch knowledge context from uploaded documents (modelId already retrieved above)
      const knowledgeContext = await this.getKnowledgeContext(modelId);

      const prompt = `You are a transformation expert from The Synozur Alliance LLC. Write a comprehensive executive summary with clear structure:

${knowledgeContext}

Assessment: ${modelName}
Overall Score: ${overallScore}/500
${userContext ? `Context: ${userContext.jobTitle || 'Leader'} in ${userContext.industry || 'Industry'}, ${userContext.companySize || 'Company'}` : ''}

Write a structured executive summary with 3-4 paragraphs:

PARAGRAPH 1 (3-4 sentences):
Acknowledge their current position with empathy and understanding. Reference the overall score and what it means for their journey. Recognize the unique challenges and opportunities in their context. Use insights from the knowledge base above to provide context and perspective.

PARAGRAPH 2 (use bullet points and full context):
Your key strengths:
• ${topStrengths[0]}
• ${topStrengths[1]}

Priority growth areas:
• ${opportunities[0]}
• ${opportunities[1]}

PARAGRAPH 3 (3-4 sentences):
Provide strategic insights about what these strengths and opportunities mean for their transformation. Connect to industry best practices from the knowledge base and potential outcomes. Reference specific success patterns and the strategic value of improvement.

PARAGRAPH 4 (2-3 sentences):
Inspiring close about finding their North Star and how Synozur's expertise can help make the desirable achievable. Emphasize partnership and transformation potential.

FORMATTING RULES:
- Use clear paragraph breaks between sections
- Include bullet points for strengths and growth areas
- Be comprehensive yet readable
- ${userContext ? `Personalize deeply for ${userContext.jobTitle} perspective in ${userContext.industry}` : 'Maintain strategic focus'}
- Draw insights from the knowledge base to provide specific, actionable guidance
- Write naturally without word count constraints`;

      const completion = await this.callOpenAI(prompt, undefined, false); // Bypass word limit for comprehensive summary
      
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
    // Get model ID to fetch knowledge version
    let modelId: string | undefined;
    try {
      const models = await db.select().from(schema.models).where(eq(schema.models.name, modelName)).limit(1);
      modelId = models[0]?.id;
    } catch (error) {
      console.error('Error fetching modelId for knowledge context:', error);
    }

    // Get knowledge version hash for cache invalidation
    const knowledgeVersion = await this.getKnowledgeVersionHash(modelId);

    // Create cache context including knowledge version
    const cacheContext = {
      recommendations,
      modelName,
      userContext: userContext || {},
      knowledgeVersion
    };
    
    // Check cache first
    const cached = await this.getCachedContent('recommendations_summary', cacheContext);
    if (cached) {
      return cached;
    }
    
    try {
      // Take top 3 recommendations for the summary
      const topRecs = recommendations.slice(0, 3);

      // Fetch knowledge context from uploaded documents (modelId already retrieved above)
      const knowledgeContext = await this.getKnowledgeContext(modelId);

      const prompt = `You are a transformation expert from The Synozur Alliance LLC. Write a comprehensive transformation roadmap with clear structure:

${knowledgeContext}

Model: ${modelName}
${userContext ? `Context: ${userContext.jobTitle || 'Leader'} in ${userContext.industry || 'Industry'}` : ''}

Write 2-3 detailed paragraphs:

PARAGRAPH 1 (4-5 sentences):
Frame their unique transformation journey and what it means for their organization. Explain the strategic context and importance of the following priority actions. Use insights from the knowledge base to provide specific guidance:

Priority actions to focus on:
• ${topRecs[0]?.title || 'Priority action 1'}
• ${topRecs[1]?.title || 'Priority action 2'}
• ${topRecs[2]?.title || 'Priority action 3'}

PARAGRAPH 2 (3-4 sentences):
Connect these actions to tangible business outcomes and expected transformation results. Explain how implementing these priorities will drive value. Reference strategic value and ROI patterns from the knowledge base above.

PARAGRAPH 3 (2-3 sentences):
Describe how Synozur's expertise and partnership approach will accelerate their journey. End with an inspiring call to action: "Let's find your North Star together."

FORMATTING RULES:
- Use clear paragraph breaks
- Include bullet points for the priority actions
- Be comprehensive and strategic
- Write naturally without word count constraints
- Keep language clear and actionable
- ${userContext ? `Personalize for ${userContext.jobTitle} in ${userContext.industry}` : 'Keep strategic'}
- Draw specific insights from the knowledge base to provide actionable guidance
- End with partnership invitation`;

      const completion = await this.callOpenAI(prompt, undefined, false); // Bypass word limit for comprehensive roadmap
      
      if (!completion) {
        throw new Error('Failed to generate recommendations summary');
      }

      const summary = completion.trim();
      
      // Save to cache
      await this.saveToCache('recommendations_summary', cacheContext, summary);
      
      return summary;
    } catch (error) {
      console.error('Error generating recommendations summary:', error);
      // Return a fallback summary
      return `Your transformation roadmap focuses on:
• Strengthening foundational capabilities
• Building strategic advantages
• Accelerating growth initiatives

The Synozur Alliance LLC will help you navigate this journey with expertise and partnership. Let's find your North Star together.`;
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

STRICT RULES:
- MAXIMUM 30 words (2 lines)
- Be specific to the question
- Maintain maturity level (${this.getMaturityLevel(score * 5)})
- Clear and actionable
- No generic statements

Return ONLY the rewritten answer text (30 words MAX).`;

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
    } catch (error: any) {
      console.error('Error in generateText:', error);
      // Re-throw with original error message for better debugging
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
  private async callOpenAI(prompt: string, responseFormat?: z.ZodSchema, enforceShortResponse: boolean = true): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // For comprehensive summaries and roadmaps, use a different system message
        const systemMessage = enforceShortResponse
          ? 'You are an expert maturity assessment consultant. CRITICAL RULES: ALL responses must be MAXIMUM 30 words (2 lines). Be specific, actionable, and concise. NEVER generate URLs or links - these will be added manually. Focus on clear improvement actions only.'
          : 'You are an expert transformation consultant from The Synozur Alliance LLC. Provide comprehensive, insightful analysis that helps organizations find their North Star. Be detailed, strategic, and empathetic. NEVER generate URLs or links - these will be added manually.';
        
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          {
            role: 'system',
            content: systemMessage
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

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response from AI API');
        }
        
        return content;
      } catch (error: any) {
        lastError = error;
        
        // Extract meaningful error message from OpenAI error
        const errorMessage = error?.message || error?.error?.message || 'Unknown error';
        const errorType = error?.type || error?.error?.type || 'api_error';
        
        console.error(`OpenAI API attempt ${attempt} failed:`, {
          type: errorType,
          message: errorMessage,
          status: error?.status,
        });
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    // Throw the actual error with details instead of returning null
    const errorMessage = (lastError as any)?.message || (lastError as any)?.error?.message || 'Unknown AI API error';
    const fullError = new Error(`AI generation failed after ${this.maxRetries} attempts: ${errorMessage}`);
    console.error('All OpenAI API attempts failed:', lastError);
    throw fullError;
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

    // Include AI Playbook grounding for AI Maturity Assessment model
    const isAIModel = model.name?.toLowerCase().includes('ai maturity');
    const grounding = isAIModel ? `
STRATEGIC GROUNDING:
${AI_PLAYBOOK_GROUNDING}

Use the above insights from leading AI playbooks to inform your recommendations.
Reference specific playbook insights when relevant.
Align recommendations with the maturity model levels and transformation priorities.
` : '';

    return `Generate personalized recommendations for this maturity assessment:

Model: ${model.name}
${model.description || ''}

Assessment Scores:
${dimensionScores}

User Context:
${userContext}

${grounding}

Generate 3-5 specific, actionable recommendations in JSON format.
Prioritize by impact (high/medium/low).
Each recommendation should include:
- Clear title
- Detailed description of what to do
- Expected outcome if implemented
- 2-3 relevant resources (prefer Synozur.com content when applicable)

Focus on the lowest-scoring dimensions first.
Make recommendations specific to the industry and company size when possible.
${isAIModel ? 'Ground recommendations in the AI playbook insights and cite specific companies or frameworks when relevant.' : ''}

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