import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import crypto from 'crypto';
import { eq, and, gt, or, isNull } from 'drizzle-orm';
import type { Assessment, Model, Dimension, User } from '@shared/schema';
import { db } from '../db';
import * as schema from '@shared/schema';
import { aiGeneratedContent, knowledgeDocuments } from '@shared/schema';
import { DocumentExtractionService } from './document-extraction';

// Initialize Anthropic client with Replit AI Integrations
const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || '',
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

// AI Playbook grounding for AI Maturity Assessment model
// REMOVED: Baked-in grounding content - now using only user-uploaded knowledge base documents
const AI_PLAYBOOK_GROUNDING = ``; // Empty - knowledge base documents only

/* HISTORICAL REFERENCE - REMOVED BAKED-IN CONTENT:
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
*/

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
  private readonly model = 'claude-sonnet-4-5'; // Using Replit AI Integrations Claude Sonnet 4.5
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
      // Fetch document metadata (id + uploadedAt) for version fingerprint
      let documentsQuery = db.select({
        id: knowledgeDocuments.id,
        uploadedAt: knowledgeDocuments.uploadedAt
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
        .map(doc => `${doc.id}:${doc.uploadedAt.toISOString()}`)
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
        return ''; // No knowledge documents available - AI will respond without grounding
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
      
      // Use only user-uploaded knowledge documents (no baked-in grounding)
      const knowledgeContext = `# KNOWLEDGE BASE\n\n${extractedTexts.join('\n')}`;
      
      return knowledgeContext;
    } catch (error) {
      console.error('Error fetching knowledge context:', error);
      return ''; // Return empty on error - AI will respond without grounding
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

      const prompt = `You are a transformation expert from The Synozur Alliance LLC. Write a comprehensive executive summary.

${knowledgeContext}

Assessment: ${modelName}
Overall Score: ${overallScore}/500
${userContext ? `Context: ${userContext.jobTitle || 'Leader'} in ${userContext.industry || 'Industry'}, ${userContext.companySize || 'Company'}` : ''}

STRUCTURE (DO NOT include these labels in your output - they are instructions only):

First paragraph (3-4 sentences):
Acknowledge their current position with empathy and understanding. Reference the overall score and what it means for their journey. Recognize the unique challenges and opportunities in their context. Use insights from the knowledge base above to provide context and perspective.

Second section (with bullet points):
Describe their key strengths:
• ${topStrengths[0]}
• ${topStrengths[1]}

Then describe priority growth areas:
• ${opportunities[0]}
• ${opportunities[1]}

Third paragraph (3-4 sentences):
Provide strategic insights about what these strengths and opportunities mean for their transformation. Connect to industry best practices from the knowledge base and potential outcomes. Reference specific success patterns and the strategic value of improvement.

Final paragraph (2-3 sentences):
Inspiring close about finding their North Star and how Synozur's expertise can help make the desirable achievable. Emphasize partnership and transformation potential.

CRITICAL: Write smooth, flowing paragraphs. Do NOT include labels like "Paragraph 1", "Paragraph 2", etc. in your output. Use section headings only where natural (e.g., "Your key strengths:", "Priority growth areas:"). ${userContext ? `Personalize deeply for ${userContext.jobTitle} perspective in ${userContext.industry}.` : 'Maintain strategic focus.'} Draw insights from the knowledge base to provide specific, actionable guidance.`;

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
    // Log the user context for debugging
    console.log('[AI Service] Generating roadmap for:', {
      modelName,
      userContext: userContext || 'No context provided',
      recommendationTitles: recommendations.slice(0, 3).map(r => r.title)
    });
    
    // Get model ID to fetch knowledge version
    let modelId: string | undefined;
    let modelSlug: string | undefined;
    try {
      const models = await db.select().from(schema.models).where(eq(schema.models.name, modelName)).limit(1);
      modelId = models[0]?.id;
      modelSlug = models[0]?.slug;
    } catch (error) {
      console.error('Error fetching modelId for knowledge context:', error);
    }

    // Get knowledge version hash for cache invalidation
    const knowledgeVersion = await this.getKnowledgeVersionHash(modelId);

    // Create a stable, detailed cache context
    // Include a stable string representation of userContext to ensure proper cache separation
    const userContextKey = userContext ? JSON.stringify({
      jobTitle: userContext.jobTitle || '',
      industry: userContext.industry || '',
      companySize: userContext.companySize || ''
    }) : 'no-context';
    
    const cacheContext = {
      recommendations: recommendations.slice(0, 3).map(r => ({ title: r.title, desc: r.description.substring(0, 100) })),
      modelName,
      userContextKey, // Use stable string instead of object
      knowledgeVersion
    };
    
    // Check cache first
    const cached = await this.getCachedContent('recommendations_summary', cacheContext);
    if (cached) {
      console.log('[AI Service] Using cached roadmap content');
      return cached;
    }
    
    console.log('[AI Service] Generating new roadmap content (cache miss)');
    
    try {
      // Take up to 3 recommendations that actually exist
      const topRecs = recommendations.filter(r => r && r.title).slice(0, 3);
      
      // Don't generate roadmap if there are no recommendations
      if (topRecs.length === 0) {
        return `Your transformation journey is ready to begin. The Synozur Alliance LLC will help you navigate this path with expertise and partnership. Let's find your North Star together.`;
      }

      // Fetch knowledge context from uploaded documents (modelId already retrieved above)
      const knowledgeContext = await this.getKnowledgeContext(modelId);

      // Build dynamic bullet list
      const bulletList = topRecs.map(r => `• ${r.title}`).join('\n');
      
      // Build dynamic section instructions
      const sectionInstructions = topRecs.map((rec, idx) => {
        const ordinal = idx === 0 ? 'First' : idx === 1 ? 'Second' : 'Third';
        return `Paragraph ${idx + 2} - ${ordinal} Priority Action (3-4 sentences):
Start with ONLY the title "${rec.title}" - DO NOT add "Priority Action ${idx + 1}" or any numbering. Explain what this action means in practical terms, what specific steps it involves, ${idx === 0 ? 'and why it\'s critical for their transformation' : idx === topRecs.length - 1 ? 'and how it completes the transformation framework' : 'and how it builds on the previous action'}. Draw from the knowledge base for specific, actionable guidance.`;
      }).join('\n\n[BLANK LINE]\n\n');

      const prompt = `You are a transformation expert from The Synozur Alliance LLC. Write a comprehensive transformation roadmap.

${knowledgeContext}

CRITICAL CONTEXT - YOU MUST USE THIS EXACT INFORMATION:
Model: ${modelName}${modelSlug ? ` (${modelSlug})` : ''}
${userContext ? `User Profile: ${userContext.jobTitle || 'Leader'} role in ${userContext.industry || 'their industry'} sector${userContext.companySize ? `, ${userContext.companySize} company` : ''}` : 'General professional context'}

ABSOLUTELY CRITICAL PERSONALIZATION RULES - VIOLATION WILL RESULT IN REJECTION:
1. You MUST write for a ${userContext?.jobTitle || 'Leader'} in ${userContext?.industry || 'the industry'} - DO NOT use any other role or industry
2. Only use knowledge base content that is directly relevant to "${modelName}" - IGNORE all other content
3. STRICTLY FORBIDDEN unless model name contains "GTM" or "Go-to-Market":
   - GTM (go-to-market) terminology
   - ISV (Independent Software Vendor) or SI (Systems Integrator) references
   - Microsoft partner program language
   - Partner development, partner ecosystems, or partner enablement
   - Technical implementation details like "Power Platform", "Power Automate", "connectors", or "APIs"
   - Solution provider or reseller guidance
4. Focus EXCLUSIVELY on strategic transformation guidance for ${userContext?.jobTitle || 'Leader'} in ${userContext?.industry || 'the industry'}
5. Keep language business-focused and role-appropriate, NOT technical or implementation-focused
6. If knowledge base contains GTM/partner/technical content, COMPLETELY IGNORE IT - use only strategic guidance

PRIORITY ACTION TITLES YOU MUST USE EXACTLY (${topRecs.length} actions):
${topRecs.map((r, i) => `${i + 1}. "${r.title}"`).join('\n')}

STRUCTURE:

Paragraph 1 - Opening (3-4 sentences):
Frame their unique transformation journey and what it means for their organization. Explain the strategic context and why focusing on these priority actions matters. Use insights from the knowledge base to provide specific guidance. End with "Priority actions to focus on:" followed by EXACTLY these ${topRecs.length} bulleted items:
${bulletList}

[BLANK LINE]

${sectionInstructions}

[BLANK LINE]

Paragraph ${topRecs.length + 2} - Business Outcomes (3-4 sentences):
Connect ${topRecs.length === 1 ? 'this priority action' : `all ${topRecs.length} priority actions`} to tangible business outcomes and expected transformation results. Explain the ROI, measurable improvements, and value they'll see. Reference strategic value patterns from the knowledge base.

[BLANK LINE]

Paragraph ${topRecs.length + 3} - Closing (2-3 sentences):
Describe how Synozur's expertise and partnership approach will accelerate their journey. MUST end with EXACTLY this phrase: "Let's find your North Star together."

ABSOLUTELY CRITICAL FORMATTING RULES - FAILURE TO FOLLOW WILL RESULT IN REJECTION:
1. NEVER use generic labels like "Priority Action 1", "Second priority action", "Third priority action", "Strategy Action 1", etc.
2. ALWAYS use the EXACT titles provided above for each section heading
3. Each paragraph MUST be separated by a blank line (double newline: \\n\\n)
4. The opening bulleted list must have EXACTLY ${topRecs.length} items
5. Write in a smooth, flowing narrative style
6. End with the EXACT phrase: "Let's find your North Star together."
${userContext ? `7. Personalize for ${userContext.jobTitle} in ${userContext.industry}` : '7. Keep strategic and professional'}
8. Draw specific insights from the knowledge base to provide actionable guidance
9. ONLY generate sections for the ${topRecs.length} priority actions provided - DO NOT invent additional actions

OUTPUT FORMAT EXAMPLE (structure only, not actual content):
[Opening paragraph text here...]

Priority actions to focus on:
${bulletList}

${topRecs.map(r => `${r.title}\n[explanation paragraph...]`).join('\n\n')}

[Business outcomes paragraph...]

[Closing paragraph...] Let's find your North Star together.`;

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
      const maturityLevel = this.getMaturityLevel(score);
      
      // Define what each maturity level means in concrete terms
      const levelGuidance: Record<string, string> = {
        'Ad Hoc': 'Describes MINIMAL or NO formal processes - activities are reactive, informal, and unstructured. Focus on basic awareness or initial exploration.',
        'Initial': 'Describes BASIC processes that are just beginning to be established - still inconsistent and dependent on individuals. Focus on early-stage implementation.',
        'Developing': 'Describes DEFINED processes that are documented and becoming standardized - not yet optimized. Focus on systematic implementation.',
        'Managed': 'Describes MEASURED processes that are actively monitored and controlled - well-established practices. Focus on quantitative management.',
        'Optimizing': 'Describes CONTINUOUS IMPROVEMENT processes - innovation-focused, predictive, and adaptive. Focus on industry-leading practices.'
      };
      
      const prompt = `You are an expert in maturity assessments. Rewrite this answer option to be more specific to the question while accurately reflecting the ${maturityLevel} maturity level.

Question: ${question}
Current Answer: ${answer}
Score: ${score}/100 
Maturity Level: ${maturityLevel}
${modelContext ? `Model Context: ${modelContext}` : ''}

CRITICAL LEVEL GUIDANCE for ${maturityLevel}:
${levelGuidance[maturityLevel]}

STRICT RULES:
1. MAXIMUM 20 words (keep it concise!)
2. Describe CURRENT state capabilities, NOT future aspirations or recommendations
3. ${maturityLevel === 'Ad Hoc' || maturityLevel === 'Initial' ? 'Use language like: "limited", "informal", "ad hoc", "beginning to", "minimal"' : maturityLevel === 'Developing' ? 'Use language like: "defined", "documented", "standardized", "systematic"' : maturityLevel === 'Managed' ? 'Use language like: "measured", "controlled", "optimized", "data-driven"' : 'Use language like: "continuous", "innovative", "predictive", "industry-leading"'}
4. Be specific to the question context
5. Do NOT include recommendations, next steps, or improvement suggestions
6. Do NOT describe capabilities from higher maturity levels

Return ONLY the rewritten answer text (20 words maximum, no preamble).`;

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

  // Core Anthropic API call with retry logic
  private async callOpenAI(prompt: string, responseFormat?: z.ZodSchema, enforceShortResponse: boolean = true): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // For comprehensive summaries and roadmaps, use a different system message
        const systemMessage = enforceShortResponse
          ? 'You are an expert maturity assessment consultant. CRITICAL RULES: ALL responses must be MAXIMUM 30 words (2 lines). Be specific, actionable, and concise. NEVER generate URLs or links - these will be added manually. Focus on clear improvement actions only.'
          : 'You are an expert transformation consultant from The Synozur Alliance LLC. Provide comprehensive, insightful analysis that helps organizations find their North Star. Be detailed, strategic, and empathetic. NEVER generate URLs or links - these will be added manually.\n\nCRITICAL CONTENT RESTRICTIONS:\n- Write for business leaders, NOT technical implementers\n- Use strategic language, NOT technical jargon\n- ABSOLUTELY FORBIDDEN unless model explicitly mentions GTM/Go-to-Market: GTM terminology, ISV, SI, Microsoft partner programs, Power Platform, Power Automate, connectors, APIs, technical implementation details, partner ecosystems\n- If knowledge base contains technical/GTM content that is irrelevant to the current model, completely ignore it\n- Focus exclusively on strategic business transformation appropriate for the user\'s role and industry';

        const completion = await anthropic.messages.create({
          model: this.model,
          max_tokens: 8192,
          system: systemMessage,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        });

        const content = completion.content[0];
        if (!content || content.type !== 'text') {
          throw new Error('Empty or invalid response from AI API');
        }
        
        return content.text;
      } catch (error: any) {
        lastError = error;
        
        // Extract meaningful error message from Anthropic error
        const errorMessage = error?.message || error?.error?.message || 'Unknown error';
        const errorType = error?.type || error?.error?.type || 'api_error';
        
        console.error(`Anthropic API attempt ${attempt} failed:`, {
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

    // No baked-in grounding - using only knowledge base documents uploaded by users
    const grounding = '';

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