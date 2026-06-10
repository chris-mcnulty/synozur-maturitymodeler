/**
 * Slide content model (v2) for `slides` lessons.
 *
 * A slide is a list of ordered content *blocks* plus an optional narration
 * track. This replaces the original `{ title?, html?, imageUrl? }` slide shape
 * with a structured, block-based model that powers the visual slide editor,
 * inline video, and per-slide narration.
 *
 * Backward compatibility: legacy slides (with `title`/`html`/`imageUrl` and no
 * `blocks`) are normalized into blocks on read via `normalizeSlide`, so old
 * content keeps rendering without a data migration. `lessons.content` is a
 * freeform JSONB column, so there is no DB migration for this change.
 *
 * This module is framework-agnostic (no React/DOM) so it can be shared by the
 * client renderer/editor, the server SCORM exporter, and the PowerPoint
 * importer.
 */
import { z } from "zod";

export const SLIDE_BLOCK_TYPES = [
  "heading",
  "text",
  "image",
  "video",
  "callout",
  "image_slide",
] as const;
export type SlideBlockType = (typeof SLIDE_BLOCK_TYPES)[number];

export const headingBlockSchema = z.object({
  id: z.string(),
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  text: z.string().default(""),
});

export const textBlockSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  html: z.string().default(""),
});

export const imageBlockSchema = z.object({
  id: z.string(),
  type: z.literal("image"),
  url: z.string().default(""),
  alt: z.string().default(""),
  caption: z.string().optional(),
});

export const videoBlockSchema = z.object({
  id: z.string(),
  type: z.literal("video"),
  url: z.string().default(""),
  provider: z.enum(["mp4", "youtube", "vimeo"]).optional(),
  poster: z.string().optional(),
});

export const calloutBlockSchema = z.object({
  id: z.string(),
  type: z.literal("callout"),
  tone: z.enum(["info", "tip", "warning"]).default("info"),
  html: z.string().default(""),
});

/**
 * A full-bleed image of a rendered slide — produced by the PowerPoint
 * importer, which converts each .pptx slide to an image for high fidelity.
 */
export const imageSlideBlockSchema = z.object({
  id: z.string(),
  type: z.literal("image_slide"),
  url: z.string().default(""),
  alt: z.string().default(""),
});

export const slideBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  textBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
  calloutBlockSchema,
  imageSlideBlockSchema,
]);
export type SlideBlock = z.infer<typeof slideBlockSchema>;

export const SLIDE_NARRATION_MODES = ["none", "tts", "recorded"] as const;
export type SlideNarrationMode = (typeof SLIDE_NARRATION_MODES)[number];

export const slideNarrationSchema = z.object({
  mode: z.enum(SLIDE_NARRATION_MODES).default("none"),
  /** Source text for TTS generation; also usable as a transcript. */
  text: z.string().optional(),
  /** Generated (TTS) or uploaded (recorded) MP3 URL in object storage. */
  audioUrl: z.string().optional(),
  /** TTS voice id (provider-specific) used to generate `audioUrl`. */
  voice: z.string().optional(),
  status: z.enum(["ready", "pending", "failed"]).optional(),
});
export type SlideNarration = z.infer<typeof slideNarrationSchema>;

export const slideSchema = z.object({
  id: z.string(),
  blocks: z.array(slideBlockSchema).default([]),
  narration: slideNarrationSchema.optional(),
  // ----- legacy read-compatibility (pre-v2 slides) -----
  title: z.string().optional(),
  html: z.string().optional(),
  imageUrl: z.string().optional(),
});
export type Slide = z.infer<typeof slideSchema>;

export const slidesContentSchema = z.object({
  slides: z.array(slideSchema).default([]),
});
export type SlidesContent = z.infer<typeof slidesContentSchema>;

/** Generate a short, collision-resistant id for slides/blocks. */
export function genId(prefix = "b"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalize an arbitrary (possibly legacy) slide object into the v2 shape with
 * a populated `blocks` array. Legacy `title`/`imageUrl`/`html` become heading /
 * image / text blocks respectively.
 */
export function normalizeSlide(raw: any): Slide {
  const s = raw ?? {};
  let blocks: SlideBlock[] = Array.isArray(s.blocks)
    ? (s.blocks.filter(Boolean) as SlideBlock[])
    : [];

  if (blocks.length === 0) {
    if (s.title) {
      blocks.push({ id: genId(), type: "heading", level: 2, text: String(s.title) });
    }
    if (s.imageUrl) {
      blocks.push({ id: genId(), type: "image", url: String(s.imageUrl), alt: "" });
    }
    if (s.html) {
      blocks.push({ id: genId(), type: "text", html: String(s.html) });
    }
  }

  return {
    id: s.id || genId("slide"),
    blocks,
    narration: s.narration,
    title: s.title,
    html: s.html,
    imageUrl: s.imageUrl,
  };
}

/** Normalize a full `slides` content payload into an array of v2 slides. */
export function normalizeSlides(content: any): Slide[] {
  const arr = Array.isArray(content?.slides) ? content.slides : [];
  return arr.map(normalizeSlide);
}

/** Create a blank slide with a single heading block. */
export function blankSlide(index = 0): Slide {
  return {
    id: genId("slide"),
    blocks: [{ id: genId(), type: "heading", level: 2, text: `Slide ${index + 1}` }],
    narration: { mode: "none" },
  };
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a single block to HTML. Author-provided HTML (text/callout) is passed
 * through verbatim — callers that render to a browser must sanitize (DOMPurify).
 * The SCORM exporter packages this for offline LMS playback.
 */
export function blockToHtml(b: SlideBlock): string {
  switch (b.type) {
    case "heading":
      return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
    case "text":
      return b.html || "";
    case "callout":
      return `<aside class="callout callout-${esc(b.tone)}">${b.html || ""}</aside>`;
    case "image":
      return `<figure><img src="${esc(b.url)}" alt="${esc(b.alt)}" style="max-width:100%"/>${
        b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""
      }</figure>`;
    case "image_slide":
      return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" style="max-width:100%"/>`;
    case "video":
      return b.url
        ? `<video controls src="${esc(b.url)}" style="max-width:100%"></video>`
        : "";
    default:
      return "";
  }
}

/** Render a slide's blocks to a single HTML fragment. */
export function slideToHtml(slide: Slide): string {
  return slide.blocks.map(blockToHtml).join("\n");
}

/**
 * Rewrite a managed object path (`/objects/uploads|narration|slides/...`) to the
 * course-aware media proxy, which gates private course media by course access.
 * External URLs, data URIs and non-managed paths are returned unchanged.
 */
export function courseMediaUrl(courseId: string, url: string | null | undefined): string {
  if (!url) return "";
  if (/^\/objects\/(?:uploads|narration|slides)\//.test(url)) {
    return `/api/courses/${courseId}/media?path=${encodeURIComponent(url)}`;
  }
  return url;
}

/**
 * Object-storage entity paths (under our managed prefixes) referenced anywhere
 * in a lesson's content — narration audio, uploaded images/video, imported
 * slide images. Used to garbage-collect objects when a lesson is deleted or
 * its content changes. Scans the serialized content so it works for any lesson
 * shape (slides blocks, narration, or top-level video/audio lessons), and only
 * returns paths we created (`uploads/`, `narration/`, `slides/`).
 */
export function extractManagedObjectPaths(content: unknown): string[] {
  if (content == null) return [];
  let json: string;
  try {
    json = JSON.stringify(content);
  } catch {
    return [];
  }
  const re = /\/objects\/(?:uploads|narration|slides)\/[A-Za-z0-9._\-/]+/g;
  return Array.from(new Set(json.match(re) ?? []));
}
