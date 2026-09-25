/**
 * Authoring model for the Synozur annual training courses. A spec compiles to
 * Orion's native lesson content (see scripts/build-annual-training-course.ts).
 * Fields marked "admin only" are written to the administrator package and are
 * never copied into lesson content, because learner redaction only strips the
 * grading keys Orion knows about.
 */

export type MediaKey = string;

export type BlockSpec =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "text"; html: string }
  | { type: "callout"; tone: "info" | "tip" | "warning"; html: string }
  | { type: "image"; media: MediaKey; alt: string; caption?: string; textEquivalent?: string }
  /** Empty slot for a future recording; renders nothing for learners until a URL is set. */
  | { type: "video-slot"; posterMedia: MediaKey; caption: string };

export interface SlideSpec {
  id: string;
  /** Deck slide numbers this slide draws on (admin only). */
  source: number[];
  blocks: BlockSpec[];
  /** Narration script. Adds explanation; never reads answer keys. */
  narration?: string;
}

export interface AnswerSpec {
  id: string;
  text: string;
  /** Per-choice feedback (admin only; Orion supports one explanation per question). */
  feedback: string;
}

export interface QuestionSpec {
  id: string;
  text: string;
  answers: AnswerSpec[];
  correct: string | string[];
  /** Shown to the learner after submitting, whether right or wrong. */
  explanation: string;
  /** Lesson to revisit after an incorrect response (admin only; also named in the explanation). */
  revisit: string;
  /** Deck slide or prompt origin (admin only). */
  source: string;
}

interface LessonBase {
  key: string;
  title: string;
  minutes: number;
  required: boolean;
}

export interface SlidesLessonSpec extends LessonBase {
  kind: "slides";
  activityType?: "video" | "reading";
  slides: SlideSpec[];
}

export interface QuizLessonSpec extends LessonBase {
  kind: "quiz";
  practice: boolean;
  passingScore: number;
  introHtml: string;
  questions: QuestionSpec[];
  source: string;
}

export interface ResourceSpec {
  id: string;
  title: string;
  description: string;
  filename: string;
  mediaFile: string;
  mimeType: string;
}

export interface RichTextLessonSpec extends LessonBase {
  kind: "rich_text";
  html: string;
  resources?: ResourceSpec[];
  source: string;
}

export interface AttestationLessonSpec extends LessonBase {
  kind: "attestation";
  statement: string;
  source: string;
}

export type LessonSpec = SlidesLessonSpec | QuizLessonSpec | RichTextLessonSpec | AttestationLessonSpec;

export interface ModuleSpec {
  title: string;
  description: string;
  lessons: LessonSpec[];
}

export interface PhotoSpec {
  key: MediaKey;
  file: string;
  title: string;
  creator: string;
  source: string;
  landingUrl: string;
  downloadedFrom: string;
  license: string;
  licenseUrl: string;
  retrieved: string;
  notes: string;
}

export interface CourseSpec {
  slug: string;
  title: string;
  summary: string;
  description: string;
  tags: string[];
  estimatedMinutes: number;
  passingScore: number;
  heroMedia: MediaKey;
  sourceDeck: string;
  sourcePrompt: string;
  modules: ModuleSpec[];
  photos: PhotoSpec[];
}
