// Seed script to create the "Champion Type Quiz" — a 'type' (archetype) assessment.
// Each of 7 questions has 5 options (A–E); every option votes for one archetype
// via answers.typeKey. The most-voted archetype becomes the respondent's result.
import { db } from '../server/db';
import * as schema from '../shared/schema';
import { eq } from 'drizzle-orm';

const SLUG = 'champion-type-quiz';

const TYPES = [
  {
    key: 'visionary',
    name: 'The Visionary',
    tagline: 'You see the future — and make others want to be part of it.',
    description:
      'You lead through inspiration and storytelling. Where others see tools, you see transformation. Your superpower is painting a compelling picture of what\u2019s possible that motivates teams to move forward with confidence.',
    superpowers: [
      'Future-state thinking',
      'Compelling storytelling',
      'Inspiring action through vision',
      'Connecting technology to purpose',
    ],
    proTip:
      'Partner with a Coach or Builder to translate your big vision into practical first steps that people can act on immediately.',
    order: 0,
  },
  {
    key: 'connector',
    name: 'The Connector',
    tagline: 'You bring the right people together at the right time.',
    description:
      'You build bridges across teams, departments, and hierarchies. You know who\u2019s doing great work and make sure knowledge flows freely. Your superpower is creating communities where people feel safe to learn and experiment.',
    superpowers: [
      'Cross-functional networking',
      'Knowledge sharing',
      'Community building',
      'Facilitating collaboration',
    ],
    proTip:
      'Use your network strategically — pair skeptics with believers, match mentors with learners, and amplify quiet wins across the organization.',
    order: 1,
  },
  {
    key: 'coach',
    name: 'The Coach',
    tagline: 'You meet people where they are — and help them grow.',
    description:
      'You lead with empathy and hands-on support. You create psychologically safe spaces where questions are welcome, mistakes are learning opportunities, and small wins get celebrated. Your superpower is patience and genuine care.',
    superpowers: [
      'Empathetic listening',
      'Hands-on support',
      'Celebrating small wins',
      'Creating safe learning spaces',
    ],
    proTip:
      'Don\u2019t carry the emotional weight alone. Build a peer support network of fellow coaches and establish clear boundaries for sustainable impact.',
    order: 2,
  },
  {
    key: 'builder',
    name: 'The Builder',
    tagline: 'You make adoption tangible — one tool at a time.',
    description:
      'You turn \u201cCopilot can do that?\u201d into \u201chere, try mine.\u201d You create prompt libraries, reusable templates, custom agents, and practical solutions that others adopt naturally. Your superpower is making the abstract concrete.',
    superpowers: [
      'Solution design',
      'Template and prompt creation',
      'Rapid prototyping',
      'Practical problem-solving',
    ],
    proTip:
      'Document and share your creations broadly. What feels obvious to you is often a revelation to others. Pair with a Connector to scale your impact.',
    order: 3,
  },
  {
    key: 'skeptic',
    name: 'The Skeptic-Turned-Believer',
    tagline: 'Your honesty is your credibility — and your greatest asset.',
    description:
      'Having questioned AI yourself, you bring authenticity that no amount of corporate messaging can match. You share your honest journey — the doubts, the experiments, and what finally convinced you. Your superpower is earned trust.',
    superpowers: [
      'Authentic advocacy',
      'Evidence-based persuasion',
      'Addressing real concerns',
      'Building trust through transparency',
    ],
    proTip:
      'Keep sharing your evolving journey openly. Your credibility comes from honesty, not perfection. New skeptics need to see someone who once stood where they stand.',
    order: 4,
  },
];

// Each question: 5 options keyed A–E mapping to the archetypes above (A=visionary,
// B=connector, C=coach, D=builder, E=skeptic).
const OPTION_TYPE_ORDER = ['visionary', 'connector', 'coach', 'builder', 'skeptic'];

const QUESTIONS: Array<{ text: string; options: string[] }> = [
  {
    text: 'A new AI tool is announced for your organization. What\u2019s your first instinct?',
    options: [
      'Imagine how it could transform workflows a year from now',
      'Think about who across the org should know about this',
      'Wonder how the team is feeling and whether they\u2019ll need support',
      'Start exploring it to build something useful right away',
      'Ask tough questions first — then share your honest findings',
    ],
  },
  {
    text: 'You hear a colleague say \u201cI don\u2019t see the point of Copilot.\u201d How do you respond?',
    options: [
      'Paint a picture of what their work could look like with it',
      'Connect them with someone who\u2019s already having success',
      'Sit with them to understand their concerns and offer to walk through it together',
      'Show them a prompt or template you built that solves a real pain point',
      'Share that you felt the same way once — then explain what changed your mind',
    ],
  },
  {
    text: 'Your team is asked to pilot a new Copilot feature. What role do you naturally play?',
    options: [
      'Rally the group around a compelling vision of what success looks like',
      'Coordinate across teams so learnings get shared widely',
      'Check in with each person to make sure nobody feels left behind',
      'Build templates, guides, or sample prompts the team can use immediately',
      'Test it rigorously and share a candid review — pros and cons',
    ],
  },
  {
    text: 'What kind of recognition energizes you most?',
    options: [
      'Being known as someone who sees the future before others do',
      'Hearing that you helped two teams discover a shared opportunity',
      'A quiet \u201cthank you\u201d from someone you helped get unstuck',
      'Seeing others adopt a solution or tool you created',
      'Earning trust because people know you\u2019ll always give them the real story',
    ],
  },
  {
    text: 'How do you typically prepare for a big change initiative?',
    options: [
      'Craft a narrative that makes the destination feel exciting and achievable',
      'Map the stakeholders and figure out who needs to be in the room',
      'Anticipate who will struggle most and plan how to support them',
      'Create practical resources — checklists, quick-start guides, or demos',
      'Research thoroughly so you can address objections with facts, not hype',
    ],
  },
  {
    text: 'A senior leader asks you: \u201cWhy should we invest more in AI adoption?\u201d What do you lead with?',
    options: [
      'A future-state story showing what the org looks like when AI is fully embedded',
      'Examples of cross-functional wins and the community momentum building',
      'Employee feedback showing how supported teams outperform unsupported ones',
      'A live demo of a custom agent or workflow you built that saves hours per week',
      'A before-and-after of your own journey — from skeptic to advocate — backed by data',
    ],
  },
  {
    text: 'When adoption starts to stall in your organization, what\u2019s your instinct?',
    options: [
      'Reconnect people to the bigger vision — remind them why this matters',
      'Bring champions together to share what\u2019s working and re-energize the network',
      'Go back to basics — offer refresher sessions and one-on-one coaching',
      'Ship something new — a fresh prompt library or workflow that reignites interest',
      'Surface the real blockers honestly and propose targeted fixes',
    ],
  },
];

async function seedChampionTypeQuiz() {
  console.log('Starting Champion Type Quiz seed...');

  const existing = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.slug, SLUG))
    .limit(1);

  if (existing.length > 0) {
    console.log('Champion Type Quiz already exists, skipping...');
    return;
  }

  const [model] = await db
    .insert(schema.models)
    .values({
      slug: SLUG,
      name: 'Champion Type Quiz',
      description:
        'Answer 7 quick questions to discover your natural leadership style for driving AI adoption. Go with your gut — there are no wrong answers.',
      version: '1.0.0',
      estimatedTime: 5,
      status: 'published',
      assessmentMode: 'type',
      featured: true,
    })
    .returning();

  console.log('Created model:', model.id);

  for (const t of TYPES) {
    await db.insert(schema.modelTypes).values({
      modelId: model.id,
      key: t.key,
      name: t.name,
      tagline: t.tagline,
      description: t.description,
      superpowers: t.superpowers,
      proTip: t.proTip,
      order: t.order,
    });
  }
  console.log(`Created ${TYPES.length} archetypes`);

  for (let qi = 0; qi < QUESTIONS.length; qi++) {
    const q = QUESTIONS[qi];
    const [question] = await db
      .insert(schema.questions)
      .values({
        modelId: model.id,
        text: q.text,
        type: 'multiple_choice',
        order: qi + 1,
      })
      .returning();

    for (let oi = 0; oi < q.options.length; oi++) {
      await db.insert(schema.answers).values({
        questionId: question.id,
        text: q.options[oi],
        score: 0,
        order: oi + 1,
        typeKey: OPTION_TYPE_ORDER[oi],
      });
    }
  }
  console.log(`Created ${QUESTIONS.length} questions with options`);
  console.log('Champion Type Quiz seed complete.');
}

seedChampionTypeQuiz()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
