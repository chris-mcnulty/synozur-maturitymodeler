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
}).passthrough();

export const textBlockSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  html: z.string().default(""),
}).passthrough();

export const imageBlockSchema = z.object({
  id: z.string(),
  type: z.literal("image"),
  url: z.string().default(""),
  alt: z.string().default(""),
  caption: z.string().optional(),
}).passthrough();

export const videoBlockSchema = z.object({
  id: z.string(),
  type: z.literal("video"),
  url: z.string().default(""),
  provider: z.enum(["mp4", "youtube", "vimeo"]).optional(),
  poster: z.string().optional(),
  caption: z.string().optional(),
}).passthrough();

export const calloutBlockSchema = z.object({
  id: z.string(),
  type: z.literal("callout"),
  tone: z.enum(["info", "tip", "warning"]).default("info"),
  html: z.string().default(""),
}).passthrough();

/**
 * A full-bleed image of a rendered slide — produced by the PowerPoint
 * importer, which converts each .pptx slide to an image for high fidelity.
 */
export const imageSlideBlockSchema = z.object({
  id: z.string(),
  type: z.literal("image_slide"),
  url: z.string().default(""),
  alt: z.string().default(""),
}).passthrough();

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
  /** True only after an editor has reviewed the script and approved it. */
  approved: z.boolean().optional(),
  /** The exact script used for the current audio, for stale-audio detection. */
  generatedFromText: z.string().optional(),
  /** Ephemeral authoring token that prevents an older TTS response winning a race. */
  generationRequestId: z.string().optional(),
}).passthrough();
export type SlideNarration = z.infer<typeof slideNarrationSchema>;

export const slideSchema = z.object({
  id: z.string(),
  blocks: z.array(slideBlockSchema).default([]),
  narration: slideNarrationSchema.optional(),
  // ----- legacy read-compatibility (pre-v2 slides) -----
  title: z.string().optional(),
  html: z.string().optional(),
  imageUrl: z.string().optional(),
}).passthrough();
export type Slide = z.infer<typeof slideSchema>;

export const slidesContentSchema = z.object({
  slides: z.array(slideSchema).default([]),
}).passthrough();
export type SlidesContent = z.infer<typeof slidesContentSchema>;

/** Generate a short, collision-resistant id for slides/blocks. */
export function genId(prefix = "b"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const SUPPORTED_BLOCK_TYPES = new Set<string>(SLIDE_BLOCK_TYPES);

function textValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textValue(value);
    if (text.trim()) return text;
  }
  return "";
}

function mediaValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    return firstText(candidate.url, candidate.src, candidate.href);
  }
  return "";
}

function normalizeBlock(raw: any): SlideBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const id = textValue(raw.id) || genId();
  switch (raw.type) {
    case "heading":
      return {
        ...raw,
        id,
        type: "heading",
        level: raw.level === 1 || raw.level === 3 ? raw.level : 2,
        text: textValue(raw.text),
      };
    case "text":
      return { ...raw, id, type: "text", html: textValue(raw.html) };
    case "image":
      return {
        ...raw,
        id,
        type: "image",
        url: mediaValue(raw.url),
        alt: textValue(raw.alt),
        ...(raw.caption === undefined ? {} : { caption: textValue(raw.caption) }),
      };
    case "video":
      return {
        ...raw,
        id,
        type: "video",
        url: mediaValue(raw.url),
        ...(raw.provider ? { provider: raw.provider } : {}),
        ...(raw.poster ? { poster: mediaValue(raw.poster) } : {}),
        ...(raw.caption === undefined ? {} : { caption: textValue(raw.caption) }),
      } as SlideBlock;
    case "callout":
      return {
        ...raw,
        id,
        type: "callout",
        tone: raw.tone === "tip" || raw.tone === "warning" ? raw.tone : "info",
        html: textValue(raw.html),
      };
    case "image_slide":
      return {
        ...raw,
        id,
        type: "image_slide",
        url: mediaValue(raw.url),
        alt: textValue(raw.alt),
      };
    default:
      return null;
  }
}

/**
 * Return the slide array only for explicitly supported payload containers.
 * We intentionally do not guess at arbitrary JSON: unknown payloads stay in
 * the source editor rather than being silently rewritten as slides.
 */
export function getSupportedSlideArray(content: any): any[] | null {
  if (Array.isArray(content)) return content;
  if (!content || typeof content !== "object") return null;
  if (Array.isArray(content.slides)) return content.slides;
  if (Array.isArray(content.pages)) return content.pages;
  if (Array.isArray(content.deck?.slides)) return content.deck.slides;
  if (Array.isArray(content.presentation?.slides)) return content.presentation.slides;
  if (Array.isArray(content.data?.slides)) return content.data.slides;
  // A single explicitly slide-like object is useful for old one-slide lessons.
  const keys = ["title", "heading", "html", "content", "body", "imageUrl", "image", "video", "videoUrl", "blocks"];
  if (keys.some((key) => key in content)) return [content];
  return null;
}

export function isSupportedSlidesContent(content: any): boolean {
  const slides = getSupportedSlideArray(content);
  return slides !== null && slides.every((slide) => {
    if (!slide || typeof slide !== "object") return false;
    if (slide.blocks !== undefined && !Array.isArray(slide.blocks)) return false;
    if (Array.isArray(slide.blocks) && slide.blocks.some((block: any) => !block || typeof block !== "object" || !SUPPORTED_BLOCK_TYPES.has(block.type))) {
      return false;
    }
    return true;
  });
}

/**
 * Normalize an arbitrary (possibly legacy) slide object into the v2 shape with
 * a populated `blocks` array. Legacy `title`/`imageUrl`/`html` become heading /
 * image / text blocks respectively.
 */
export function normalizeSlide(raw: any): Slide {
  const s = raw ?? {};
  if (s.blocks !== undefined && !Array.isArray(s.blocks)) {
    throw new Error("Slide blocks must be an array.");
  }
  let blocks: SlideBlock[] = Array.isArray(s.blocks)
    ? s.blocks.map(normalizeBlock).filter((b: SlideBlock | null): b is SlideBlock => Boolean(b))
    : [];

  if (blocks.length === 0) {
    const title = firstText(s.title, s.heading);
    const html = firstText(s.html, s.contentHtml, typeof s.content === "string" ? s.content : "", s.body);
    const image = mediaValue(s.imageUrl || s.image);
    const video = mediaValue(s.videoUrl || s.video);
    if (title) {
      blocks.push({ id: genId(), type: "heading", level: 2, text: title });
    }
    if (image) {
      blocks.push({
        id: genId(),
        type: "image",
        url: image,
        alt: firstText(s.alt, s.image?.alt),
        ...(s.caption ? { caption: textValue(s.caption) } : {}),
      });
    }
    if (video) {
      blocks.push({
        id: genId(),
        type: "video",
        url: video,
        provider: s.provider === "youtube" || s.provider === "vimeo" ? s.provider : "mp4",
      });
    }
    if (html) {
      blocks.push({ id: genId(), type: "text", html });
    }
    if (s.callout && typeof s.callout === "object") {
      blocks.push({
        id: genId(),
        type: "callout",
        tone: s.callout.tone === "tip" || s.callout.tone === "warning" ? s.callout.tone : "info",
        html: firstText(s.callout.html, s.callout.text),
      });
    } else if (s.calloutText) {
      blocks.push({ id: genId(), type: "callout", tone: "info", html: textValue(s.calloutText) });
    }
  }

  return {
    ...s,
    id: s.id || genId("slide"),
    blocks,
    ...(s.narration ? {
      narration: {
        ...s.narration,
        mode: SLIDE_NARRATION_MODES.includes(s.narration.mode) ? s.narration.mode : "none",
        approved: s.narration.approved === true,
      },
    } : {}),
  };
}

/** Normalize a full `slides` content payload into an array of v2 slides. */
export function normalizeSlides(content: any): Slide[] {
  const arr = getSupportedSlideArray(content) ?? [];
  return arr.map(normalizeSlide);
}

/** Normalize slides while retaining deck-level expert/source fields. */
export function normalizeSlidesContent(content: any): SlidesContent {
  const base = Array.isArray(content) ? {} : (content && typeof content === "object" ? content : {});
  return { ...base, slides: normalizeSlides(content) };
}

function stripHtmlForNarration(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function narrationLine(value: unknown): string {
  return stripHtmlForNarration(textValue(value));
}

/**
 * Extract only semantic, visible slide content for a narration draft.
 * IDs, URLs, styling metadata and raw HTML tags are deliberately ignored.
 */
export function extractNarrationText(slide: Slide | any): string {
  const normalized = slide?.blocks ? slide : normalizeSlide(slide);
  const lines: string[] = [];
  for (const block of normalized.blocks ?? []) {
    switch (block.type) {
      case "heading":
        if (narrationLine(block.text)) lines.push(narrationLine(block.text));
        break;
      case "text":
      case "callout": {
        const text = narrationLine(block.html);
        if (text) lines.push(text);
        break;
      }
      case "image":
      case "image_slide": {
        const alt = narrationLine(block.alt);
        const caption = block.type === "image" ? narrationLine(block.caption) : "";
        if (alt) lines.push(`Image: ${alt}${caption ? `. ${caption}` : ""}`);
        else if (caption) lines.push(`Image: ${caption}`);
        break;
      }
      case "video":
        // A URL is not useful narration, but the existence of a visible video is.
        if (narrationLine(block.caption)) lines.push(`Video: ${narrationLine(block.caption)}`);
        else if (block.url) lines.push("Video.");
        break;
    }
  }
  return lines.filter(Boolean).join("\n");
}

/** Alias used by authoring clients that want a clearly named draft operation. */
export const draftNarration = extractNarrationText;

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
        ? `<figure><video controls src="${esc(b.url)}" style="max-width:100%"></video>${
            b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""
          }</figure>`
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
 * its content changes. Traverses the content structurally and only collects
 * values of known media-URL keys (`url`, `audioUrl`, `videoUrl`, `poster`,
 * `src`) that are exactly a managed path (`uploads/`, `narration/`, `slides/`)
 * — so it works for any lesson shape (slides blocks, narration, or top-level
 * video/audio lessons) without being fooled by /objects paths embedded in
 * author text or HTML.
 */
export function extractManagedObjectPaths(content: unknown): string[] {
  const MANAGED = /^\/objects\/(?:uploads|narration|slides)\/[A-Za-z0-9._\-/]+$/;
  // Only treat values of known media-URL keys as object references — never
  // free text/HTML (e.g. a `text`/`html`/`caption` field that happens to
  // mention an /objects path), since these references both gate proxy access
  // and drive object GC.
  const MEDIA_KEYS = new Set(["url", "audioUrl", "videoUrl", "poster", "src"]);
  const out = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string") {
          if (MEDIA_KEYS.has(key) && MANAGED.test(value)) out.add(value);
        } else {
          visit(value);
        }
      }
    }
  };
  visit(content);
  return Array.from(out);
}
