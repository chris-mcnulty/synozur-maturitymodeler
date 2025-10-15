// Seed script to create AI Maturity model with sample data
import { db } from '../server/db';
import * as schema from '../shared/schema';

async function seedAIMaturityModel() {
  try {
    console.log('Starting AI Maturity model seed...');
    
    // Check if the model already exists
    const existingModels = await db.select().from(schema.models).where({
      slug: 'ai-maturity'
    } as any).limit(1);
    
    if (existingModels.length > 0) {
      console.log('AI Maturity model already exists, skipping...');
      return;
    }
    
    // Create AI Maturity Model
    const [model] = await db.insert(schema.models).values({
      slug: 'ai-maturity',
      name: 'AI Maturity Assessment',
      description: 'Evaluate your organization\'s AI readiness and maturity across key dimensions',
      version: '1.0.0',
      estimatedTime: 15,
      isPublished: true,
      status: 'published',
      isFeatured: true,
      imageUrl: null,
      aiPlaybook: `You are an AI transformation expert evaluating an organization's AI maturity.

# AI Maturity Assessment Playbook

## Core Framework
This assessment evaluates AI maturity across five key dimensions:
1. Strategy & Governance: Vision, roadmapping, and responsible AI policies
2. People & Culture: Talent, skills, and organizational readiness
3. Data Foundation: Data quality, governance, and infrastructure
4. Technology & Infrastructure: AI/ML platforms and tooling
5. Business Impact: Use case deployment and value realization

## Maturity Levels (100-500 scale)
- **Nascent (100-199)**: Beginning AI journey, ad-hoc experimentation
- **Experimental (200-299)**: Piloting AI, building initial capabilities
- **Operational (300-399)**: Scaling successful pilots, establishing processes
- **Strategic (400-449)**: AI as competitive differentiator, mature practices
- **Leading (450-500)**: Industry-leading AI transformation

## Key Insights from Industry Playbooks
Based on analysis of 16 leading AI maturity frameworks including Microsoft, Google Cloud, AWS, Accenture, McKinsey, BCG, Deloitte, and others:

1. **Common Success Factors**:
   - Executive sponsorship and clear AI strategy aligned to business goals
   - Investment in data foundation before scaling AI initiatives
   - Focus on responsible AI and governance from the start
   - Building internal AI literacy across all levels
   - Starting with high-value, low-risk use cases

2. **Typical Maturity Journey**:
   - Phase 1: Awareness building and initial experiments
   - Phase 2: Pilot projects in specific departments
   - Phase 3: Scaling successful pilots enterprise-wide
   - Phase 4: AI-driven transformation and innovation
   - Phase 5: AI as core competitive advantage

3. **Common Pitfalls to Avoid**:
   - Pursuing AI for technology's sake without clear business value
   - Underinvesting in data quality and governance
   - Neglecting change management and cultural transformation
   - Lacking ethical AI guidelines and risk management
   - Operating in silos without cross-functional collaboration

When providing recommendations, emphasize practical next steps that move organizations from their current maturity level to the next, always grounding advice in business value and transformation impact.`
    }).returning();
    
    console.log('Created AI Maturity model:', model.id);
    
    // Create dimensions
    const dimensionData = [
      { key: 'strategy', label: 'Strategy & Governance', order: 1 },
      { key: 'people', label: 'People & Culture', order: 2 },
      { key: 'data', label: 'Data Foundation', order: 3 },
      { key: 'technology', label: 'Technology & Infrastructure', order: 4 },
      { key: 'impact', label: 'Business Impact', order: 5 }
    ];
    
    const dimensions: any[] = [];
    for (const dim of dimensionData) {
      const [dimension] = await db.insert(schema.dimensions).values({
        modelId: model.id,
        key: dim.key,
        label: dim.label,
        order: dim.order
      }).returning();
      dimensions.push(dimension);
      console.log(`Created dimension: ${dim.label}`);
    }
    
    // Create sample questions (3 per dimension for testing)
    const questionsByDimension = {
      'strategy': [
        {
          text: 'How well-defined is your organization\'s AI strategy?',
          type: 'multipleChoice' as const,
          order: 1
        },
        {
          text: 'Do you have responsible AI policies in place?',
          type: 'trueFalse' as const,
          order: 2
        },
        {
          text: 'How many AI use cases are in your roadmap?',
          type: 'numeric' as const,
          order: 3
        }
      ],
      'people': [
        {
          text: 'What percentage of your workforce has AI/ML skills?',
          type: 'numeric' as const,
          order: 4
        },
        {
          text: 'How would you describe your organization\'s AI culture?',
          type: 'multipleChoice' as const,
          order: 5
        },
        {
          text: 'Do you have a dedicated AI/ML team?',
          type: 'trueFalse' as const,
          order: 6
        }
      ],
      'data': [
        {
          text: 'How mature is your data governance framework?',
          type: 'multipleChoice' as const,
          order: 7
        },
        {
          text: 'What percentage of your data is AI-ready?',
          type: 'numeric' as const,
          order: 8
        },
        {
          text: 'Do you have a centralized data platform?',
          type: 'trueFalse' as const,
          order: 9
        }
      ],
      'technology': [
        {
          text: 'What AI/ML platforms do you currently use?',
          type: 'multiSelect' as const,
          order: 10
        },
        {
          text: 'How would you rate your AI infrastructure?',
          type: 'multipleChoice' as const,
          order: 11
        },
        {
          text: 'Do you have MLOps capabilities?',
          type: 'trueFalse' as const,
          order: 12
        }
      ],
      'impact': [
        {
          text: 'How many AI use cases are in production?',
          type: 'numeric' as const,
          order: 13
        },
        {
          text: 'What is the business impact of your AI initiatives?',
          type: 'multipleChoice' as const,
          order: 14
        },
        {
          text: 'How do you measure AI ROI?',
          type: 'text' as const,
          order: 15
        }
      ]
    };
    
    // Create questions and answer options
    for (const dimension of dimensions) {
      const dimKey = dimensionData.find(d => d.key === dimension.key)?.key;
      const questions = questionsByDimension[dimKey as keyof typeof questionsByDimension] || [];
      
      for (const questionData of questions) {
        const [question] = await db.insert(schema.questions).values({
          modelId: model.id,
          dimensionId: dimension.id,
          text: questionData.text,
          type: questionData.type,
          order: questionData.order,
          weight: 1,
          isRequired: true
        }).returning();
        
        console.log(`Created question: ${questionData.text}`);
        
        // Add answer options for multiple choice questions
        if (questionData.type === 'multipleChoice') {
          const options = [
            { label: 'Not Started', value: 'not_started', score: 100 },
            { label: 'Early Stage', value: 'early', score: 200 },
            { label: 'Developing', value: 'developing', score: 300 },
            { label: 'Advanced', value: 'advanced', score: 400 },
            { label: 'Leading', value: 'leading', score: 500 }
          ];
          
          for (let i = 0; i < options.length; i++) {
            await db.insert(schema.answerOptions).values({
              questionId: question.id,
              label: options[i].label,
              value: options[i].value,
              score: options[i].score,
              order: i + 1
            });
          }
        }
        
        // Add answer options for multi-select questions
        if (questionData.type === 'multiSelect') {
          const platforms = [
            { label: 'TensorFlow', value: 'tensorflow', score: 100 },
            { label: 'PyTorch', value: 'pytorch', score: 100 },
            { label: 'Azure ML', value: 'azure_ml', score: 100 },
            { label: 'AWS SageMaker', value: 'sagemaker', score: 100 },
            { label: 'Google Vertex AI', value: 'vertex_ai', score: 100 }
          ];
          
          for (let i = 0; i < platforms.length; i++) {
            await db.insert(schema.answerOptions).values({
              questionId: question.id,
              label: platforms[i].label,
              value: platforms[i].value,
              score: platforms[i].score,
              order: i + 1
            });
          }
        }
      }
    }
    
    console.log('AI Maturity model seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding AI Maturity model:', error);
    process.exit(1);
  }
}

seedAIMaturityModel();