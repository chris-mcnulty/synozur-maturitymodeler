/**
 * Writes the administrator-only package for an annual training course:
 * inventory, source mapping, answer/rationale sheet, approval checklist,
 * video placeholder, narration scripts, media attribution, and limitations.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { CourseSpec, LessonSpec, QuestionSpec } from "./spec";

export interface AdminSpec {
  courseId: string;
  sourceVersion: string;
  sourceSlides: Array<{ n: number; title: string; treatment: string }>;
  frameworkMapping: string[];
  approvals: Array<{ item: string; where: string; owner: string; blocker: boolean }>;
  recordingGuidance: string[];
  courseSpecificLimitations: string[];
}

export interface MediaRecord {
  key: string;
  file: string;
  kind: "graphic" | "photo" | "pdf";
  usedIn: string[];
  alt?: string;
  textEquivalent?: string;
  credit: string;
  rights: string;
}

export interface BuildInfo {
  devCourseId: string | null;
  tenantName: string;
  tenantId: string;
  previewUrl: string | null;
  exportPath: string | null;
  pendingMarkers: Array<{ lesson: string; marker: string }>;
  media: MediaRecord[];
  wordsPerMinute: number;
}

export const NARRATION_VOICE = "en-US-Andrew:DragonHDLatestNeural";

const md = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const stripHtml = (html: string) =>
  html.replace(/<li>/g, "• ").replace(/<\/(p|li|h\d|tr)>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export function lessonLabel(moduleIndex: number, lesson: LessonSpec) {
  return `${lesson.key} ${lesson.title}`;
}

function lessonType(lesson: LessonSpec): string {
  if (lesson.kind === "slides") return lesson.activityType === "video" ? "Slides (video placeholder)" : "Slides";
  if (lesson.kind === "quiz") return lesson.practice ? "Quiz (practice)" : "Quiz (graded)";
  if (lesson.kind === "rich_text") return lesson.resources?.length ? "Rich text + PDF resource" : "Rich text";
  return "Attestation (typed name)";
}

function countWords(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

function allLessons(spec: CourseSpec) {
  return spec.modules.flatMap((m, mi) => m.lessons.map(l => ({ module: m, mi, lesson: l })));
}

function readme(spec: CourseSpec, admin: AdminSpec, info: BuildInfo): string {
  const rows = allLessons(spec).map(({ lesson }) =>
    `| ${lesson.key} | ${md(lesson.title)} | ${lessonType(lesson)} | ${lesson.required ? "Yes" : "No"} | ${lesson.minutes} |`,
  );
  const narrationMinutes = Math.round(
    allLessons(spec).reduce((sum, { lesson }) => sum + (lesson.kind === "slides" ? lesson.slides.reduce((a, s) => a + countWords(s.narration ?? ""), 0) : 0), 0) / info.wordsPerMinute,
  );
  return `# Administrator package

**Course:** ${spec.title}

> **Administrator only.** This folder contains answer keys and release instructions. Don’t share it with learners. The \`.orion-course.json\` export also contains answer keys, because Orion needs them to grade.

| | |
|---|---|
| Status | Draft, tenant-private, development only. Not published; no enrollments or communications. |
| Tenant | ${info.tenantName} (\`${info.tenantId}\`), resolved from the synozur.com tenant domain |
| Intended production tenant | Synozur.com (confirmed by course owner; import only after release approvals, as a new private draft) |
| Development course ID | ${info.devCourseId ? `\`${info.devCourseId}\`` : "not imported in this run"} |
| Preview (admin sign-in required) | ${info.previewUrl ?? "not available"} |
| Slug | \`${spec.slug}\` |
| Export | ${info.exportPath ? `\`${info.exportPath}\`` : "not exported in this run"} |
| Source deck | \`${spec.sourceDeck}\`. Course ID ${admin.courseId}; version ${admin.sourceVersion}. |
| Source prompt | \`${spec.sourcePrompt}\` |
| Estimated time | ${spec.estimatedMinutes} minutes (lesson estimates include about ${narrationMinutes} minutes of narration).${spec.estimatedMinutes > 20 ? " This is above the 15–20 minute default and needs owner approval." : ""} |
| Completion rule | All required lessons, the final knowledge check at ${spec.passingScore}%, and each learner's own signed attestation. All learners are expected to sign; unsigned attestations remain incomplete. Certificates are disabled. |

## Module and lesson inventory

${spec.modules.map((m, i) => `${i + 1}. **${m.title}**: ${m.description}`).join("\n")}

| # | Lesson | Type | Required | Minutes |
|---|---|---|---|---|
${rows.join("\n")}

## Files in this package

- \`source-to-lesson-mapping.md\`: where every deck slide went and how it changed.
- \`quiz-answer-key.md\`: answers, per-choice feedback, rationale, and remediation for all quizzes.
- \`approval-checklist.md\`: release blockers and approvals still needed.
- \`welcome-video.md\`: the video placeholder, Chris’s script, and recording guidance.
- \`narration-scripts.md\`: per-slide narration for review and later audio generation.
- \`media-attribution.md\`: sources, rights, alt text, and text equivalents for every image and file.
- \`limitations-and-product-changes.md\`: unsupported requests, workarounds, and proposed Orion changes.

Media sources (editable HTML for graphics, original photo files, and the PDF source) are in \`courseware/annual-training/\`. Rebuild with \`npx tsx scripts/build-annual-training-course.ts <course> --render --replace\`.
`;
}

function mapping(spec: CourseSpec, admin: AdminSpec): string {
  const bySlide = new Map<number, string[]>();
  for (const { lesson } of allLessons(spec)) {
    if (lesson.kind !== "slides") continue;
    for (const slide of lesson.slides) {
      const heading = slide.blocks.find(b => b.type === "heading" && b.level === 2) ?? slide.blocks.find(b => b.type === "heading");
      for (const n of slide.source) {
        const list = bySlide.get(n) ?? [];
        const label = `${lesson.key} ${lesson.title}${heading && heading.type === "heading" && heading.text !== lesson.title ? ` › ${heading.text}` : ""}`;
        if (!list.includes(label)) list.push(label);
        bySlide.set(n, list);
      }
    }
  }
  const other = allLessons(spec)
    .filter(({ lesson }) => lesson.kind !== "slides")
    .map(({ lesson }) => `| ${lesson.key} ${md(lesson.title)} | ${md((lesson as { source: string }).source)} |`);
  return `# Source-to-lesson mapping (administrator only)

Source: \`${spec.sourceDeck}\`. The deck structure matched the brief: slides 1–2 introduction and objectives, 3–10 instruction, 11 practice, 12–16 review questions, 17 acknowledgement, 18–20 administrator guidance, mapping, and references. The original file is unchanged and is not offered to learners.

| Slide | Source content | Course location | Treatment |
|---|---|---|---|
${admin.sourceSlides.map(s => `| ${s.n} | ${md(s.title)} | ${md((bySlide.get(s.n) ?? []).join("; ") || "See lesson table below")} | ${md(s.treatment)} |`).join("\n")}

## Non-slide lessons

| Lesson | Source |
|---|---|
${other.join("\n")}

## Framework mapping (from slide 19, for administrators)

${admin.frameworkMapping.map(f => `- ${f}`).join("\n")}

## Orion capabilities verified (replaces the deck’s “unverified” notes)

The deck’s administrator notes said Orion’s course import and attestation behavior were unverified. In the current build (checked September 24, 2026):

- Courses are built from native modules and lessons: slides with narration, rich text, video, quizzes, and typed-name attestations.
- Quizzes are graded on the server. Learner course data has answer keys and explanations removed; after submission, learners see only whether each answer was right and the explanation.
- Lessons unlock in order once earlier required lessons are complete. Optional lessons don’t count toward completion.
- A signed attestation stores the statement text, typed name, user, tenant, enrollment, lesson, timestamp, IP address, and browser user agent. Changing the course later doesn’t rewrite earlier signed statements.
- Courses export and import as \`.orion-course.json\` with embedded media. Exports don’t include enrollments, progress, or attestations, and they aren’t SCORM packages.

The separate caveats about policy approval and NIST assessment scope still apply; see the approval checklist.
`;
}

function questionBlock(q: QuestionSpec, index: number): string {
  const correct = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);
  const letters = q.answers.map((_, i) => String.fromCharCode(65 + i));
  return `### ${index + 1}. ${q.text}

${Array.isArray(q.correct) && !/select all/i.test(q.text) ? "_Select all that apply._\n\n" : ""}| | Choice | Feedback |
|---|---|---|
${q.answers.map((a, i) => `| ${letters[i]}${correct.has(a.id) ? " ✓" : ""} | ${md(a.text)} | ${md(a.feedback)} |`).join("\n")}

- **Correct:** ${q.answers.map((a, i) => (correct.has(a.id) ? letters[i] : null)).filter(Boolean).join(", ")}
- **Learner sees after submitting:** ${q.explanation}
- **Revisit after an incorrect response:** ${q.revisit}
- **Source:** ${q.source}
`;
}

function answerKey(spec: CourseSpec): string {
  const quizzes = allLessons(spec).filter(({ lesson }) => lesson.kind === "quiz");
  return `# Quiz answer and rationale sheet (administrator only)

Orion stores one explanation per question and shows it after each submission, whether the answer was right or wrong. It doesn’t show per-choice feedback. The per-choice feedback below is for facilitators and reviewers; learners see the “Learner sees after submitting” text. Answer keys and explanations are removed from learner course data and graded on the server.

${quizzes
  .map(({ lesson }) => {
    if (lesson.kind !== "quiz") return "";
    return `## ${lesson.key} ${lesson.title}

${lesson.practice ? "Practice, not graded (passing score 0)." : `Graded. Passing score ${lesson.passingScore}%; unlimited retries.`}

${lesson.questions.map(questionBlock).join("\n")}`;
  })
  .join("\n")}`;
}

function checklist(spec: CourseSpec, admin: AdminSpec, info: BuildInfo): string {
  const box = (a: AdminSpec["approvals"][number]) => `- [ ] ${a.blocker ? "**Release blocker:** " : ""}${a.item} _(where: ${a.where}; owner: ${a.owner})_`;
  return `# Approval checklist (administrator only)

Nothing here has been approved. The course is a draft and must stay unpublished until every release blocker is resolved.

## Release blockers

${admin.approvals.filter(a => a.blocker).map(box).join("\n")}

## Other approvals and decisions

${admin.approvals.filter(a => !a.blocker).map(box).join("\n")}

## Placeholders visible in learner content

${info.pendingMarkers.length ? info.pendingMarkers.map(p => `- ${p.lesson}: \`${p.marker}\``).join("\n") : "- None found."}

## Before release

- [ ] Re-export after approvals and import into the Synozur.com production tenant as a new private draft (never overwrite a course).
- [ ] Publish only after the release blockers above are cleared. Enrollment cycles, reminders, and communications are managed separately; Orion doesn’t renew this course automatically.
`;
}

function welcomeVideo(spec: CourseSpec, admin: AdminSpec, script: string[]): string {
  return `# Welcome video placeholder (administrator only)

**Lesson:** 1.1 Welcome from Chris McNulty (optional until the recording exists).

## What learners see now

- A branded poster reading “Introduction video coming soon” (\`welcome-poster.png\`).
- A callout saying the video will appear there and pointing to the draft transcript.
- The draft transcript below.
- An empty video block with the poster set. It shows nothing to learners until a video URL is added, so there’s no broken player or invented link.
- Learners can mark the optional lesson complete; it doesn’t count toward course completion.

## Script (verbatim from the course prompt)

${script.map(p => `> ${p}`).join("\n>\n")}

## Recording guidance

${admin.recordingGuidance.map(g => `- ${g}`).join("\n")}

## Slots to fill

| Item | Status |
|---|---|
| Recorded video (MP4) | Pending |
| Corrected captions | Pending (see limitations: no caption track support) |
| Final transcript | Pending; draft transcript is in place |
| Owner approval of transcript-only launch (if chosen) | Pending |
`;
}

function narration(spec: CourseSpec, info: BuildInfo): string {
  const sections = allLessons(spec)
    .filter(({ lesson }) => lesson.kind === "slides")
    .map(({ lesson }) => {
      if (lesson.kind !== "slides") return "";
      const slides = lesson.slides.filter(s => s.narration);
      if (!slides.length) return `## ${lesson.key} ${lesson.title}\n\nNo narration (${lesson.activityType === "video" ? "Chris’s script is not synthesized" : "none"}).\n`;
      return `## ${lesson.key} ${lesson.title}\n\n${slides
        .map((s, i) => {
          const h = s.blocks.find(b => b.type === "heading" && b.level === 2) ?? s.blocks.find(b => b.type === "heading");
          const words = countWords(s.narration!);
          return `### Slide ${i + 1}: ${h && h.type === "heading" ? h.text : s.id}\n\n${s.narration}\n\n_${words} words, about ${Math.round((words / info.wordsPerMinute) * 60)} seconds._\n`;
        })
        .join("\n")}`;
    });
  return `# Narration scripts (administrator only)

- Voice: \`${NARRATION_VOICE}\` (Orion’s default Azure Speech voice).
- Status: scripts are stored on each slide as text-to-speech narration, **not approved**, with **no audio generated**. Learners see each script as the slide transcript until audio exists.
- Scripts add explanation rather than reading slide text, and never reveal quiz answers.
- To generate audio: approve each script in the course editor, then generate narration with Azure Speech configured for the environment. Existing audio isn’t replaced without confirmation.

${sections.join("\n")}`;
}

function attribution(info: BuildInfo): string {
  return `# Media attribution and rights record (administrator only)

All media is stored as managed Orion course media (uploaded object storage), not external links. Graphics were authored for this course as HTML/CSS with editable text and rendered to PNG; sources sit next to each PNG as \`.source.html\`. They use the official Synozur logo file unmodified and the licensed Avenir Next LT Pro fonts shipped with Orion. No AI image generation was used, and no confidential source material was sent to an outside service.

| File | Type | Used in | Credit / source | Rights | Alt text | Text equivalent |
|---|---|---|---|---|---|---|
${info.media
  .map(m => `| \`${m.file}\` | ${m.kind} | ${md(m.usedIn.join("; "))} | ${md(m.credit)} | ${md(m.rights)} | ${md(m.alt ?? "(decorative or n/a)")} | ${md(m.textEquivalent ?? "n/a")} |`)
  .join("\n")}
`;
}

export const SHARED_LIMITATIONS = [
  {
    request: "Opening video with poster, captions, and transcript",
    status: "Partly supported",
    workaround: "Slides lesson with a poster image, an empty video block (poster set), a placeholder callout, and the draft transcript. Lesson-level videos have no poster, transcript, or caption fields, and video blocks have no caption track.",
    proposal: "Add a video poster, a transcript field, WebVTT caption upload, and an explicit “coming soon” placeholder state to video lessons and blocks.",
  },
  {
    request: "Per-choice feedback",
    status: "Not supported",
    workaround: "One explanation per question that addresses the tempting wrong choices; per-choice feedback kept in the answer sheet.",
    proposal: "Optional per-answer feedback, returned only for the choices a learner selected (never the key).",
  },
  {
    request: "Remediation before retry; equivalent retry questions",
    status: "Not supported",
    workaround: "Explanations name the lesson to revisit; retries are unlimited and immediate.",
    proposal: "Retry rules (review linked lessons before retrying) and question pools for equivalent questions.",
  },
  {
    request: "Feedback only after a genuine attempt",
    status: "Not supported",
    workaround: "Answer keys are never sent to learners, but Orion returns every question’s explanation after any submission, including one with unanswered questions. A learner can therefore read all explanations before trying seriously; each course's configured passing threshold still applies.",
    proposal: "Require an answer to every question before grading, and optionally withhold explanations for questions the learner didn’t answer.",
  },
  {
    request: "Enforced order of required lessons, quiz, and attestation",
    status: "Supported",
    workaround: "Required lessons unlock in order; the attestation is last and only unlocks after the quiz is passed.",
    proposal: "None.",
  },
  {
    request: "“I need clarification” option on the attestation",
    status: "Not supported",
    workaround: "A “Before you sign” lesson tells learners not to sign and whom to ask (placeholder until verified). Unsigned attestations stay incomplete.",
    proposal: "An attestation “request clarification” response that notifies the owner and records the request.",
  },
  {
    request: "Course version captured in the attestation record",
    status: "Not supported",
    workaround: "The signed statement text is stored with each record.",
    proposal: "Store the course version or content hash with each signature.",
  },
  {
    request: "Ungraded practice",
    status: "Partly supported",
    workaround: "Practice quizzes with a passing score of 0; introductions say “not graded.” The result still reads “Passed!” with a score line such as “Score: 33 / 100 · Passing: 0.” Incorrect answers are labeled “Review the answer.”",
    proposal: "A practice quiz mode with feedback but no pass/fail banner.",
  },
  {
    request: "Placeholder lessons that can’t be completed",
    status: "Not supported",
    workaround: "The video placeholder is optional, so it never affects completion, but learners can still mark it complete.",
    proposal: "Hide “Mark complete” until required media exists.",
  },
  {
    request: "Learner-role testing of a draft",
    status: "Limited",
    workaround: "Drafts are hidden from learners, so learner behavior was tested on a throwaway copy imported from the export into an isolated development QA tenant with test accounts, then deleted. The real draft was never published or enrolled.",
    proposal: "A “preview as learner” mode for draft courses.",
  },
  {
    request: "Annual renewal",
    status: "Out of scope",
    workaround: "Course cycles, enrollments, and communications are managed operationally. The course doesn’t renew automatically.",
    proposal: "None in this task.",
  },
];

function limitations(admin: AdminSpec): string {
  return `# Limitations and proposed product changes (administrator only)

These are gaps between the requested design and Orion’s current course features. Each was handled with an existing pattern; nothing new was added to Orion.

| Request | Status | What the course does | Proposed product change |
|---|---|---|---|
${SHARED_LIMITATIONS.map(l => `| ${md(l.request)} | ${l.status} | ${md(l.workaround)} | ${md(l.proposal)} |`).join("\n")}

## Specific to this course

${admin.courseSpecificLimitations.map(l => `- ${l}`).join("\n")}
`;
}

export async function writeAdminPackage(opts: {
  outDir: string;
  spec: CourseSpec;
  admin: AdminSpec;
  info: BuildInfo;
  welcomeScript: string[];
}): Promise<string[]> {
  const { outDir, spec, admin, info } = opts;
  await fs.mkdir(outDir, { recursive: true });
  const files: Record<string, string> = {
    "README.md": readme(spec, admin, info),
    "source-to-lesson-mapping.md": mapping(spec, admin),
    "quiz-answer-key.md": answerKey(spec),
    "approval-checklist.md": checklist(spec, admin, info),
    "welcome-video.md": welcomeVideo(spec, admin, opts.welcomeScript),
    "narration-scripts.md": narration(spec, info),
    "media-attribution.md": attribution(info),
    "limitations-and-product-changes.md": limitations(admin),
  };
  const written: string[] = [];
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(outDir, name);
    await fs.writeFile(file, body.trimEnd() + "\n", "utf8");
    written.push(file);
  }
  return written;
}

export { stripHtml };
