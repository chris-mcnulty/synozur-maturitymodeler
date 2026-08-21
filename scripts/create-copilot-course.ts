/**
 * Create the private development draft used for the PowerPoint intake handoff.
 *
 * The course copy is intentionally concise and web-native. Microsoft Foundry
 * generates a visual specification for the abstract SVG illustrations; this
 * script fails rather than falling back to a different AI provider.
 *
 * Run with:
 *   npx tsx scripts/create-copilot-course.ts
 */
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { AzureFoundryProvider } from "../server/services/ai-providers/azure-foundry";
import { ObjectStorageService } from "../server/objectStorage";
import { db } from "../server/db";
import { courses } from "../shared/schema";
import { exportCourse, importCourse, type CourseExportDoc } from "../server/services/course-import-export";
import { genId, type Slide } from "../shared/slides";

const COURSE_TITLE = "Getting Started with Microsoft 365 Copilot";
const COURSE_SLUG = "getting-started-with-microsoft-365-copilot";
const HANDOFF_PATH = path.resolve("handoff/getting-started-microsoft-365-copilot.orion-course.json");

interface VisualSpec {
  key: string;
  title: string;
  alt: string;
  motif: "orbit" | "path" | "layers" | "constellation" | "blocks" | "compass";
}

const requestedVisuals = [
  ["hero", "Getting started with Microsoft 365 Copilot", "compass"],
  ["intro", "Responsible generative AI", "layers"],
  ["app", "Copilot app and effective prompting", "path"],
  ["agents", "Researcher and Analyst", "constellation"],
  ["custom", "Custom agents grounded in trusted content", "blocks"],
  ["cowork", "Copilot Cowork and reusable skills", "orbit"],
  ["recap", "A practical next-step learning path", "compass"],
] as const;

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

async function generateVisualSpecs(): Promise<VisualSpec[]> {
  const foundry = new AzureFoundryProvider();
  if (!foundry.isAvailable()) {
    throw new Error("Microsoft Foundry is not configured; refusing to generate course visuals with a fallback provider.");
  }
  const response = await foundry.call(
    `Create accessible visual specifications for seven restrained, abstract course illustrations.
Return ONLY a JSON array. Each object must contain key, title, alt, and motif.
Use these exact keys/titles/motifs: ${JSON.stringify(requestedVisuals)}.
The alt text must meaningfully describe the concept and essential spatial relationships in 18-35 words.
Do not depict or describe product screens, interface controls, logos, people, or text inside the artwork.`,
    {
      systemPrompt: "You are an accessibility-focused editorial art director. Return valid JSON only and follow the requested schema exactly.",
      enforceShortResponse: false,
      maxTokens: 2500,
      temperature: 0.4,
    },
  );
  const parsed = JSON.parse(stripCodeFence(response));
  if (!Array.isArray(parsed) || parsed.length !== requestedVisuals.length) {
    throw new Error("Microsoft Foundry returned an invalid illustration specification.");
  }
  return requestedVisuals.map(([key, title, motif], index) => {
    const candidate = parsed[index] as Partial<VisualSpec>;
    if (candidate.key !== key || typeof candidate.alt !== "string" || candidate.alt.trim().length < 20) {
      throw new Error(`Microsoft Foundry returned an invalid visual specification for ${key}.`);
    }
    return { key, title, motif, alt: candidate.alt.trim().slice(0, 320) };
  });
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function motifSvg(spec: VisualSpec, index: number): string {
  const rotate = index * 11;
  const motifs: Record<VisualSpec["motif"], string> = {
    orbit: `<g transform="translate(800 450) rotate(${rotate})"><ellipse rx="330" ry="165" fill="none" stroke="#E60CB3" stroke-width="14" opacity=".7"/><ellipse rx="240" ry="300" fill="none" stroke="#810FFB" stroke-width="10" opacity=".55"/><circle cx="330" cy="0" r="38" fill="#FFC24A"/><circle cx="-120" cy="-260" r="28" fill="#EDEDF2"/></g>`,
    path: `<path d="M220 690 C420 210 720 760 980 310 S1320 170 1420 260" fill="none" stroke="url(#accent)" stroke-width="34" stroke-linecap="round"/><circle cx="220" cy="690" r="34" fill="#EDEDF2"/><circle cx="1420" cy="260" r="46" fill="#FFC24A"/>`,
    layers: `<g transform="translate(800 450) rotate(-8)"><rect x="-360" y="-230" width="720" height="260" rx="54" fill="#810FFB" opacity=".64"/><rect x="-300" y="-70" width="720" height="260" rx="54" fill="#E60CB3" opacity=".56"/><rect x="-240" y="90" width="720" height="260" rx="54" fill="#EDEDF2" opacity=".22"/></g>`,
    constellation: `<g stroke="#B5B7C2" stroke-width="7" opacity=".62"><path d="M290 600 560 250 820 520 1110 220 1330 600"/><path d="M560 250 1110 220M820 520 1330 600"/></g><g fill="#E60CB3"><circle cx="290" cy="600" r="34"/><circle cx="560" cy="250" r="48"/><circle cx="820" cy="520" r="56"/><circle cx="1110" cy="220" r="42"/><circle cx="1330" cy="600" r="36"/></g>`,
    blocks: `<g transform="translate(800 450)"><rect x="-390" y="-240" width="240" height="240" rx="44" fill="#810FFB"/><rect x="-110" y="-240" width="500" height="240" rx="44" fill="#E60CB3" opacity=".8"/><rect x="-390" y="40" width="500" height="240" rx="44" fill="#EDEDF2" opacity=".18"/><rect x="150" y="40" width="240" height="240" rx="44" fill="#FFC24A" opacity=".88"/></g>`,
    compass: `<g transform="translate(800 450) rotate(${rotate})"><circle r="292" fill="none" stroke="url(#accent)" stroke-width="26" opacity=".72"/><path d="M0-245 92 0 0 245-92 0Z" fill="#EDEDF2" opacity=".9"/><path d="M0-245 92 0 0 0Z" fill="#E60CB3"/><circle r="38" fill="#0B0B10"/></g>`,
  };
  return motifs[spec.motif];
}

function renderSvg(spec: VisualSpec, index: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(spec.title)}</title>
  <desc id="desc">${escapeXml(spec.alt)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0B0B10"/><stop offset="1" stop-color="#21132F"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#810FFB"/><stop offset="1" stop-color="#E60CB3"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="#810FFB" stop-opacity=".32"/><stop offset="1" stop-color="#810FFB" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1600" height="900" rx="32" fill="url(#bg)"/>
  <circle cx="320" cy="190" r="430" fill="url(#glow)"/>
  <circle cx="1330" cy="760" r="360" fill="url(#glow)" opacity=".62"/>
  ${motifSvg(spec, index)}
</svg>`;
  return Buffer.from(svg);
}

async function storeVisuals(specs: VisualSpec[]): Promise<Record<string, { url: string; alt: string }>> {
  const storage = new ObjectStorageService();
  const result: Record<string, { url: string; alt: string }> = {};
  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index];
    const url = await storage.storeObjectBytes({
      entityId: `slides/copilot-${spec.key}-${randomUUID()}.svg`,
      data: renderSvg(spec, index),
      contentType: "image/svg+xml",
      acl: { owner: "system", visibility: spec.key === "hero" ? "public" : "private" },
    });
    result[spec.key] = { url, alt: spec.alt };
  }
  return result;
}

function richSlide(title: string, paragraphs: string[], narration: string, image?: { url: string; alt: string }): Slide {
  return {
    id: genId("slide"),
    blocks: [
      { id: genId(), type: "heading", level: 2, text: title },
      ...(image ? [{ id: genId(), type: "image" as const, url: image.url, alt: image.alt }] : []),
      {
        id: genId(),
        type: "text",
        html: paragraphs.map((p) => `<p>${p}</p>`).join(""),
      },
    ],
    narration: { mode: "none", text: narration },
  };
}

function slidesLesson(title: string, estimatedMinutes: number, slides: Slide[]) {
  return { title, type: "slides", order: 0, estimatedMinutes, required: true, content: { slides } };
}

function quizLesson(title: string, order: number, questions: any[]) {
  return {
    title,
    type: "quiz",
    order,
    estimatedMinutes: 1,
    required: true,
    content: { passingScore: 67, questions },
  };
}

function question(id: string, text: string, answers: string[], correct: number, explanation: string) {
  return {
    id,
    text,
    type: "single",
    options: answers.map((answer, index) => ({ id: `${id}-${index + 1}`, text: answer })),
    correctIds: [`${id}-${correct + 1}`],
    explanation,
  };
}

function buildCourse(media: Record<string, { url: string; alt: string }>): CourseExportDoc {
  const modules = [
    {
      title: "Introduction",
      description: "Understand what Copilot is, how generative AI works, and the guardrails that protect work data.",
      order: 0,
      lessons: [
        slidesLesson("Start safely with Copilot", 3, [
          richSlide("Your Copilot starting point", [
            "Microsoft 365 Copilot is a thinking and drafting partner grounded in the work you can already access.",
            "Use it to move from a blank page to a useful first draft—then apply your judgment before sharing or acting.",
          ], "This opening illustration uses a compass surrounded by a purple-to-pink field to represent a guided first step. Copilot helps you find direction, but you remain responsible for the destination.", media.intro),
          richSlide("Generative AI creates; it does not verify", [
            "Generative AI predicts useful language and patterns. It can summarize, draft, compare, and brainstorm.",
            "<strong>Always review the result.</strong> Check important facts, dates, calculations, sources, and tone.",
          ], "Generative AI is a capable drafting partner, not an authority. Review important claims and confirm that the output fits the purpose."),
          richSlide("Keep work data safe", [
            "Use your organization’s approved Copilot experience for work. Do not paste confidential work into consumer AI tools.",
            "Copilot respects the permissions already applied to Microsoft 365 content; it does not grant access to information you could not otherwise open.",
          ], "Three overlapping layers represent approved tools, existing access permissions, and human review. Together they form the safe boundary for using Copilot at work."),
        ]),
      ],
    },
    {
      title: "Copilot app and prompting",
      description: "Find the core experiences, write stronger prompts, choose work or web grounding, and reuse useful results.",
      order: 1,
      lessons: [
        slidesLesson("Work effectively in the Copilot app", 5, [
          richSlide("One app, several ways to work", [
            "The Copilot app brings together chat, content creation, agents, pages, and connected Microsoft 365 apps.",
            "Availability and labels can vary by license and administrator settings, so focus on the task rather than memorizing a screen.",
          ], "An abstract pathway branches into several connected destinations. It represents chat, creation, agents, pages, and apps without recreating a product interface.", media.app),
          richSlide("Build prompts with G-C-S-E", [
            "<strong>Goal:</strong> what you need. <strong>Context:</strong> why and for whom. <strong>Source:</strong> the files, messages, or web information to use. <strong>Expectations:</strong> format, tone, and constraints.",
            "Example: “Draft a five-bullet briefing for the leadership team using the attached project update. Highlight decisions, risks, and owners.”",
          ], "A strong prompt names the goal, context, source, and expectations. Specific instructions give Copilot a clearer target."),
          richSlide("Use two prompting habits", [
            "Be specific enough to establish the first direction, then iterate: ask Copilot to shorten, compare, challenge, reformat, or explain.",
            "Reference trusted context when available. Use the app’s file, person, email, or agent references instead of copying large amounts of content.",
          ], "Start with a clear first request, then refine the result through short follow-up prompts. Reference trusted work content instead of pasting it repeatedly."),
          richSlide("Choose the right grounding", [
            "Use work grounding when the answer should reflect your organization’s files, messages, meetings, and people.",
            "Use web grounding for current public information. Treat both as starting points and verify material decisions.",
          ], "Two converging paths represent work content and public web information. The destination is a reviewed answer shaped by the learner’s judgment."),
          richSlide("Keep and reuse useful results", [
            "Turn longer responses into a page when you want to refine and share them. Export only when the target format helps the next step.",
            "Conversation history can preserve continuity. Settings and custom instructions can improve consistency, subject to your organization’s policies.",
          ], "Useful results move from conversation into a reusable working document, an export, or a later conversation. The learner chooses the form that supports the next action."),
        ]),
        quizLesson("Knowledge check: prompting", 1, [
          question("prompt-grounding", "Which prompt gives Copilot the clearest direction?", [
            "Tell me about this project.",
            "Write something professional.",
            "Draft a five-bullet leadership briefing from the attached update, highlighting decisions, risks, and owners.",
          ], 2, "The third prompt supplies a goal, audience context, source, and clear output expectations."),
        ]),
      ],
    },
    {
      title: "Researcher and Analyst",
      description: "Choose the right first-party agent for evidence-rich research or data analysis.",
      order: 2,
      lessons: [
        slidesLesson("Go deeper with first-party agents", 3, [
          richSlide("Agents specialize the work", [
            "First-party agents extend Copilot with focused reasoning patterns and tools. Researcher supports evidence-rich inquiry; Analyst supports structured data exploration.",
            "Start with a clear question, provide the right sources, and review the result before using it.",
          ], "A constellation connects two larger nodes to a shared center. The nodes represent specialized research and analysis capabilities working from trusted context.", media.agents),
          richSlide("Use Researcher for a sourced brief", [
            "Ask Researcher to investigate a question across permitted work content and relevant public sources, then synthesize themes and cite evidence.",
            "Use it for market scans, issue briefs, options analysis, and topics that need depth rather than a quick answer.",
          ], "Researcher follows multiple evidence paths and brings them together into a sourced brief. Check that each important conclusion is supported."),
          richSlide("Use Analyst to understand data", [
            "Give Analyst a clear business question and a well-structured spreadsheet or CSV. Ask it to identify patterns, exceptions, comparisons, and useful visual summaries.",
            "Confirm definitions, filters, and calculations—especially when the result will influence a decision.",
          ], "Analyst organizes data into patterns and exceptions. The essential accessibility message is to confirm the inputs, definitions, filters, and calculations."),
        ]),
        quizLesson("Knowledge check: specialized agents", 1, [
          question("agent-choice", "Which agent is the better starting point for finding patterns in a structured spreadsheet?", [
            "Researcher",
            "Analyst",
            "A custom communications agent",
          ], 1, "Analyst is designed to reason over structured data and help surface patterns, comparisons, and exceptions."),
        ]),
      ],
    },
    {
      title: "Custom agents",
      description: "Build a reusable specialist grounded in instructions and trusted knowledge.",
      order: 3,
      lessons: [
        slidesLesson("Create a focused custom agent", 3, [
          richSlide("A reusable expert for a repeated job", [
            "A custom agent combines a clear purpose, durable instructions, and selected knowledge so people do not have to rebuild the same prompt every time.",
            "Good candidates are frequent, bounded tasks with trusted source material and an identifiable owner.",
          ], "Four interlocking blocks represent purpose, instructions, trusted knowledge, and ownership. Together they create a bounded reusable specialist.", media.custom),
          richSlide("Build in five deliberate steps", [
            "1. Name the job and audience. 2. Define what success looks like. 3. Add trusted knowledge. 4. Write boundaries and response instructions. 5. Test realistic questions.",
            "Improve the agent when it fails a test; do not hide ambiguity behind a longer description.",
          ], "The five-step sequence moves from job definition through success criteria, knowledge, boundaries, and realistic testing."),
          richSlide("Ground the agent in maintained content", [
            "An agent built on policy, product, or process content is only as reliable as those sources.",
            "Assign an owner, remove obsolete material, and retest when the underlying content or business process changes.",
          ], "A central source connects to a reusable agent and several outputs. Ownership and maintenance keep every output tied to current trusted content."),
        ]),
        quizLesson("Knowledge check: custom agents", 1, [
          question("agent-maintenance", "What makes a custom agent dependable over time?", [
            "A very long name and description",
            "More source files, whether current or not",
            "A clear purpose, trusted maintained knowledge, boundaries, an owner, and realistic testing",
          ], 2, "Dependability comes from bounded purpose, maintained sources, clear instructions, ownership, and testing—not volume."),
        ]),
      ],
    },
    {
      title: "Copilot Cowork and skills",
      description: "Delegate larger outcomes and package instructions into reusable skills.",
      order: 4,
      lessons: [
        slidesLesson("Move from prompts to delegated work", 3, [
          richSlide("Delegate a larger outcome with Cowork", [
            "Copilot Cowork is designed for work that needs planning and multiple coordinated steps rather than one response.",
            "Define the desired outcome, available context, checkpoints, and boundaries. Review the plan and the resulting work before it moves forward.",
          ], "Several orbiting work elements move around a clearly bounded center. The image represents coordinated steps, checkpoints, and human oversight without showing software screens.", media.cowork),
          richSlide("Turn reliable instructions into skills", [
            "A skill is a reusable block of instructions for a task you expect to repeat. It can capture sequence, quality criteria, format, and guardrails.",
            "Keep skills narrow enough to test. Update them when the process, source material, or expected output changes.",
          ], "A reusable instruction block feeds several consistent outputs. The visual emphasizes repeatability, quality criteria, and guardrails."),
        ]),
        quizLesson("Knowledge check: delegated work", 1, [
          question("cowork-skill", "When should you prefer a reusable skill over an ad hoc prompt?", [
            "When a bounded task repeats and the same sequence, quality criteria, and guardrails should apply",
            "Whenever the task contains more than one sentence",
            "Only when no source material exists",
          ], 0, "A skill is valuable when a repeatable task benefits from consistent instructions, criteria, and boundaries."),
        ]),
      ],
    },
    {
      title: "Recap and next steps",
      description: "Consolidate the core habits and choose one safe, useful task to try next.",
      order: 5,
      lessons: [
        slidesLesson("Put Copilot to work", 1, [
          richSlide("Five habits to carry forward", [
            "Use approved tools and protect confidential data. Give Copilot a clear goal and trusted context. Choose the right agent for the work. Review important outputs. Turn effective instructions into a reusable practice.",
            "Your next step: choose one low-risk task this week, define what a good result looks like, and compare the time and quality with your current approach.",
          ], "A compass points along a short path with five milestones, representing safe use, clear prompts, the right capability, human review, and repeatable practice.", media.recap),
          richSlide("Keep learning in context", [
            "Use Microsoft Learn, the Microsoft Adoption site, and your organization’s enablement resources to stay current.",
            "Product availability and labels change. Treat current documentation and your administrator’s guidance as the source of truth.",
          ], "A simple learning path continues beyond the course. Current documentation and organizational guidance remain the source of truth as Copilot evolves."),
        ]),
        quizLesson("Final recap", 1, [
          question("recap-safe", "What is the best first step before using work information with generative AI?", [
            "Paste it into any available chatbot",
            "Confirm that you are using your organization’s approved Copilot experience",
            "Remove the document title and proceed",
          ], 1, "Approved work tools apply the organization’s protections and policies. Removing a title does not make confidential content safe for consumer tools."),
          question("recap-research", "You need an evidence-rich brief across work content and public sources. Where should you start?", [
            "Researcher",
            "Analyst",
            "A spreadsheet formula",
          ], 0, "Researcher is the appropriate starting point for deeper, sourced inquiry across permitted work and public information."),
          question("recap-review", "Who remains accountable for checking a Copilot output before it is used?", [
            "The person using and sharing the result",
            "The language model",
            "The source document owner only",
          ], 0, "Copilot accelerates the work, but the user remains responsible for checking accuracy, context, permissions, and suitability."),
        ]),
      ],
    },
  ];

  return {
    format: "orion-course",
    version: "1",
    exportedAt: new Date().toISOString(),
    course: {
      title: COURSE_TITLE,
      slug: COURSE_SLUG,
      description: "A concise, practical introduction to Microsoft 365 Copilot. Learn how to use approved AI safely, write effective prompts, work with Researcher and Analyst, create focused custom agents, and apply Copilot Cowork and reusable skills.",
      summary: "Build safe, effective Copilot habits—from a strong first prompt to specialized agents and delegated work.",
      imageUrl: media.hero.url,
      estimatedMinutes: 20,
      status: "draft",
      visibility: "private",
      passingScore: 67,
      certificateEnabled: false,
      tags: ["Microsoft 365 Copilot", "AI productivity", "foundations"],
      modules,
    },
  } as CourseExportDoc;
}

async function main() {
  const [existing] = await db.select().from(courses).where(eq(courses.slug, COURSE_SLUG)).limit(1);
  if (existing) {
    throw new Error(`A course with slug "${COURSE_SLUG}" already exists. Archive or rename it before rerunning this one-time handoff script.`);
  }

  const specs = await generateVisualSpecs();
  const media = await storeVisuals(specs);
  const result = await importCourse(buildCourse(media), {
    ownerTenantId: null,
    visibility: "private",
  });
  const handoff = await exportCourse(result.course.id);
  if (!handoff) throw new Error("The created course could not be exported.");
  await fs.mkdir(path.dirname(HANDOFF_PATH), { recursive: true });
  await fs.writeFile(HANDOFF_PATH, JSON.stringify(handoff, null, 2));
  console.log(`Created private draft: ${result.course.title}`);
  console.log(`Course id: ${result.course.id}`);
  console.log(`Modules: ${result.moduleCount}; lessons: ${result.lessonCount}`);
  console.log(`Production handoff: ${path.relative(process.cwd(), HANDOFF_PATH)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});