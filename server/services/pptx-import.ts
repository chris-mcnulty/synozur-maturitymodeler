/**
 * PowerPoint (.pptx) import → Orion slides.
 *
 * Strategy (high fidelity, per product decision):
 *   1) LibreOffice headless converts the .pptx to a PDF.
 *   2) Poppler's `pdftoppm` rasterizes each PDF page to a PNG (one per slide).
 *   3) Each PNG becomes an `image_slide` block — faithful to the original deck.
 *   4) Slide text and speaker notes are extracted from the OOXML (via JSZip +
 *      regex) to seed the image's alt text and the slide's narration script.
 *
 * Required system binaries (present in the deploy image):
 *   - soffice / libreoffice
 *   - pdftoppm (poppler-utils)
 *
 * Falls back to a clear error if a binary is missing or conversion fails.
 */
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { ObjectStorageService } from "../objectStorage";
import { genId, type Slide, type SlideBlock } from "@shared/slides";

const SOFFICE_BIN = process.env.SOFFICE_BIN || "soffice";
const PDFTOPPM_BIN = process.env.PDFTOPPM_BIN || "pdftoppm";

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env });
    let stderr = "";
    const timer = opts.timeoutMs
      ? setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${cmd} timed out`)); }, opts.timeoutMs)
      : null;
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      if ((err as any).code === "ENOENT") {
        reject(new Error(`Required binary "${cmd}" not found. Install libreoffice and poppler-utils.`));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}. ${stderr.slice(0, 300)}`));
    });
  });
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Extract visible text from a slide/notes XML part by collecting <a:t> runs. */
export function extractText(xml: string): string {
  const matches = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
  const lines = matches
    .map((m) => decodeXmlEntities(m.replace(/<\/?a:t>/g, "")).trim())
    .filter((t) => t.length > 0);
  return lines.join("\n");
}

interface SlideTextInfo { title: string; text: string; notes: string; }

/**
 * Strip any relationship that points outside the package (TargetMode="External")
 * from every `.rels` part in the OOXML container, and neutralize any raw
 * `http(s)://` targets that show up unmodified in other XML parts.
 *
 * PPTX files can reference remote resources (linked images, OLE objects,
 * hyperlinks, etc.) via `<Relationship ... TargetMode="External" Target="http://...">`.
 * When LibreOffice renders such a file it will resolve those references,
 * causing the server to make outbound HTTP(S) requests to attacker-chosen
 * hosts (SSRF against internal services / cloud metadata endpoints). Since
 * this import only needs the visual/text content of the deck, we remove all
 * external relationships before the file ever reaches LibreOffice.
 */
const RELS_ATTR_PREFIX = "@_";

const relsXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: RELS_ATTR_PREFIX,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

const relsXmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: RELS_ATTR_PREFIX,
  suppressBooleanAttributes: false,
  format: false,
});

/** Case/whitespace-insensitive lookup of an attribute value on a parsed XML node. */
function getAttr(node: Record<string, any>, attrName: string): string | undefined {
  const target = (RELS_ATTR_PREFIX + attrName).toLowerCase();
  for (const key of Object.keys(node)) {
    if (key.toLowerCase() === target) {
      const value = node[key];
      return typeof value === "string" ? value : String(value);
    }
  }
  return undefined;
}

async function sanitizePptxZip(zip: JSZip): Promise<void> {
  const relsPaths = Object.keys(zip.files).filter((p) => p.endsWith(".rels"));
  for (const relsPath of relsPaths) {
    const file = zip.file(relsPath);
    if (!file) continue;
    const xml = await file.async("string");
    let parsed: any;
    try {
      parsed = relsXmlParser.parse(xml);
    } catch {
      // If the relationships part isn't well-formed XML, refuse to trust it
      // rather than silently pass a potentially malicious/ambiguous part
      // through to LibreOffice.
      zip.file(relsPath, "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>");
      continue;
    }

    const root = parsed?.Relationships;
    if (!root || typeof root !== "object") continue;

    const rawRelationships = root.Relationship;
    if (rawRelationships === undefined) continue;
    const list = Array.isArray(rawRelationships) ? rawRelationships : [rawRelationships];

    // Drop any relationship pointing outside the package, however it is
    // expressed (quote style, attribute order, self-closing vs. not, or
    // case variations all normalize away once parsed as real XML).
    const filtered = list.filter((rel) => {
      if (typeof rel !== "object" || rel === null) return true;
      const targetMode = (getAttr(rel, "TargetMode") || "").trim().toLowerCase();
      if (targetMode === "external") return false;
      const target = getAttr(rel, "Target") || "";
      // Belt-and-braces: also drop anything with an absolute http(s)/ftp
      // target even if TargetMode wasn't explicitly declared as External.
      if (/^\s*(https?|ftp):\/\//i.test(target)) return false;
      return true;
    });

    if (filtered.length === list.length) continue; // nothing changed

    if (filtered.length === 0) {
      delete root.Relationship;
    } else {
      root.Relationship = filtered;
    }
    // Drop any parsed XML declaration node so we don't emit it twice — we
    // always prepend a fresh, well-formed declaration below.
    delete parsed["?xml"];
    const rebuilt =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      relsXmlBuilder.build(parsed);
    zip.file(relsPath, rebuilt);
  }
}

/**
 * Read per-slide text + speaker notes from the .pptx, ordered by slide number.
 * Notes are resolved via each slide's relationship part for correctness.
 */
async function extractSlideTexts(zip: JSZip): Promise<SlideTextInfo[]> {
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)![1]);
      const nb = Number(b.match(/slide(\d+)\.xml$/)![1]);
      return na - nb;
    });

  const out: SlideTextInfo[] = [];
  for (const sp of slidePaths) {
    const slideXml = await zip.file(sp)!.async("string");
    const text = extractText(slideXml);
    const title = text.split("\n")[0] || "";

    // Resolve speaker notes via the slide's rels part.
    let notes = "";
    const base = sp.replace(/^ppt\/slides\//, "");
    const relsPath = `ppt/slides/_rels/${base}.rels`;
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      const relsXml = await relsFile.async("string");
      const m = relsXml.match(/Target="([^"]*notesSlide\d+\.xml)"/);
      if (m) {
        const notesPath = path.posix.normalize(`ppt/slides/${m[1]}`).replace(/^ppt\/slides\/\.\.\//, "ppt/");
        const notesFile = zip.file(notesPath) || zip.file(notesPath.replace(/^.*ppt\//, "ppt/"));
        if (notesFile) notes = extractText(await notesFile.async("string"));
      }
    }
    out.push({ title, text, notes });
  }
  return out;
}

/** Convert the .pptx to one PNG buffer per slide via LibreOffice + pdftoppm. */
async function renderSlideImages(buffer: Buffer): Promise<Buffer[]> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "pptx-"));
  try {
    const inputPath = path.join(work, "deck.pptx");
    await fs.writeFile(inputPath, buffer);

    // Isolate the LibreOffice user profile to this run to avoid lock contention.
    // Defense-in-depth: even though external relationships are stripped from the
    // OOXML before we get here, force all HTTP(S) traffic through a bogus proxy
    // so LibreOffice cannot reach the network (internal services, cloud metadata
    // endpoints, etc.) if some other reference sneaks through.
    const env = {
      ...process.env,
      HOME: work,
      http_proxy: "http://127.0.0.1:1",
      https_proxy: "http://127.0.0.1:1",
      HTTP_PROXY: "http://127.0.0.1:1",
      HTTPS_PROXY: "http://127.0.0.1:1",
      no_proxy: "",
      NO_PROXY: "",
    };
    await run(
      SOFFICE_BIN,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=file://${path.join(work, "louser")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        work,
        inputPath,
      ],
      { cwd: work, env, timeoutMs: 120000 },
    );

    const pdfPath = path.join(work, "deck.pdf");
    await fs.access(pdfPath).catch(() => {
      throw new Error("LibreOffice did not produce a PDF from the PowerPoint file.");
    });

    // pdftoppm zero-pads page numbers based on page count: slide-1.png … slide-12.png.
    await run(PDFTOPPM_BIN, ["-png", "-r", "150", pdfPath, path.join(work, "slide")], {
      cwd: work,
      timeoutMs: 120000,
    });

    const files = (await fs.readdir(work))
      .filter((f) => /^slide-?\d+\.png$/.test(f))
      .sort((a, b) => {
        const na = Number(a.match(/(\d+)\.png$/)![1]);
        const nb = Number(b.match(/(\d+)\.png$/)![1]);
        return na - nb;
      });

    if (files.length === 0) throw new Error("No slides were rendered from the PowerPoint file.");
    return Promise.all(files.map((f) => fs.readFile(path.join(work, f))));
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Import a .pptx buffer into an array of Orion slides. Each slide is a
 * full-bleed image of the original, with alt text + narration script seeded
 * from the deck's text and speaker notes.
 */
export async function importPptx(opts: {
  buffer: Buffer;
  ownerUserId?: string;
}): Promise<{ slides: Slide[] }> {
  const zip = await JSZip.loadAsync(opts.buffer);
  await sanitizePptxZip(zip);
  const sanitizedBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const [texts, images] = await Promise.all([
    extractSlideTexts(zip).catch(() => [] as SlideTextInfo[]),
    renderSlideImages(sanitizedBuffer),
  ]);

  const storage = new ObjectStorageService();
  const slides: Slide[] = [];

  for (let i = 0; i < images.length; i++) {
    const info = texts[i];
    const url = await storage.storeObjectBytes({
      entityId: `slides/${randomUUID()}.png`,
      data: images[i],
      contentType: "image/png",
      // Private: served to learners via the course-aware media proxy.
      acl: { owner: opts.ownerUserId || "system", visibility: "private" },
    });

    const alt = (info?.title || info?.text?.split("\n")[0] || `Slide ${i + 1}`).slice(0, 280);
    // Start with the full-bleed image (visual fidelity) then add editable text blocks.
    const blocks: SlideBlock[] = [{ id: genId(), type: "image_slide", url, alt }];

    // Heading from the slide title.
    if (info?.title) {
      blocks.push({ id: genId(), type: "heading", level: 2, text: info.title });
    }
    // Body text: lines after the title, HTML-escaped into <p> tags so the
    // rich-text editor renders them as editable paragraphs.
    const bodyLines = (info?.text || "")
      .split("\n")
      .slice(info?.title ? 1 : 0)
      .filter((l) => l.trim());
    if (bodyLines.length > 0) {
      const htmlEsc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = bodyLines.map((l) => `<p>${htmlEsc(l)}</p>`).join("");
      blocks.push({ id: genId(), type: "text", html });
    }

    const notes = (info?.notes || "").trim();
    // If there are no speaker notes, fall back to the slide's body text so the
    // narration script is pre-populated without requiring a manual override.
    const narrationText = notes || bodyLines.join("\n");
    slides.push({
      id: genId("slide"),
      blocks,
      narration: narrationText ? { mode: "tts", text: narrationText } : { mode: "none" },
    });
  }

  return { slides };
}

// ─────────────────────────────────────────────────────────────────────────────
// Review engine — pure helpers + reviewPptx()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recommendation for how a slide should be treated during import review.
 * All recommendations are reversible — an author can override any of them.
 */
export type SlideRecommendation =
  | "cover"          // Deck title / opening slide
  | "closing"        // Thank-you / end slide
  | "blank"          // Completely blank (no visible text, no meaningful content)
  | "low-content"    // Very sparse — only 1–2 words or a placeholder token
  | "exact-duplicate" // Identical text to an earlier slide
  | "near-duplicate"  // High text overlap with an earlier slide (≥ 85%)
  | "divider"        // Section-divider / chapter heading with minimal body
  | "normal";        // Regular content slide

/**
 * A single slide entry in the review result.
 */
export interface ReviewSlide {
  /** 0-based index into the source deck. */
  sourceIndex: number;
  /** Extracted slide title (first non-empty text line). */
  title: string;
  /** All extracted slide text (title included), newline-separated. */
  text: string;
  /** Extracted speaker notes. */
  notes: string;
  /**
   * URL to the rasterized preview image stored in object storage.
   * Empty string if rendering was skipped or failed.
   */
  previewImageUrl: string;
  /** Recommended cleanup action. */
  recommendation: SlideRecommendation;
  /** Whether this slide should be included in the import by default. */
  includedDefault: boolean;
  /**
   * Human-readable rationale for the recommendation, explaining what was
   * detected so the author can decide whether to accept or override it.
   */
  rationale: string;
  /**
   * Seeded narration script — meaningful editable description / transcript.
   * For image-heavy, low-text slides this includes a visual description.
   */
  narrationScript: string;
}

/**
 * Suggested group boundary — the first slide of a new lesson/section.
 * Groups are inferred from divider slides and heading-only slides.
 */
export interface ReviewGroup {
  /** 0-based source slide index where this group starts. */
  startIndex: number;
  /** Suggested lesson/section label seeded from the divider/heading text. */
  suggestedTitle: string;
}

export interface ReviewResult {
  slides: ReviewSlide[];
  /** Suggested lesson-group boundaries derived from divider slides. */
  suggestedGroups: ReviewGroup[];
}

// ── Tokens that indicate a screenshot/image placeholder, not real content ───
const SCREENSHOT_TOKENS = [
  "SCREENSHOT",
  "[SCREENSHOT]",
  "<<SCREENSHOT>>",
  "<SCREENSHOT>",
  "IMAGE PLACEHOLDER",
  "[IMAGE]",
  "[PLACEHOLDER]",
];

/**
 * Return true if the text string consists only of placeholder / screenshot
 * tokens that should not appear in generated output.
 */
export function isScreenshotPlaceholder(text: string): boolean {
  const normalized = text.trim().toUpperCase();
  return SCREENSHOT_TOKENS.some((t) => normalized === t || normalized === t.toUpperCase());
}

/**
 * Filter all SCREENSHOT / placeholder tokens from a multi-line text string,
 * returning the remaining meaningful lines.
 */
export function filterScreenshotTokens(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isScreenshotPlaceholder(line))
    .join("\n")
    .trim();
}

/** Normalize text for duplicate comparison: lower-case, collapse whitespace. */
export function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Compute character-level Jaccard similarity between two strings.
 * Returns a value in [0, 1] where 1 = identical.
 */
export function jaccardSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const na = normalizeForComparison(a);
  const nb = normalizeForComparison(b);
  if (na === "" && nb === "") return 1;
  if (na === "" || nb === "") return 0;
  // Build unigram word sets.
  const setA = new Set(na.split(" "));
  const setB = new Set(nb.split(" "));
  let intersection = 0;
  setA.forEach((word) => {
    if (setB.has(word)) intersection++;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/** Word-count of a string (split on whitespace). */
export function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

// Patterns for cover/closing detection (case-insensitive).
const COVER_PATTERNS = [
  /getting\s+started/i,
  /welcome\s+to/i,
  /introduction\s+to/i,
  /overview$/i,
  /\bintro\b/i,
];
const CLOSING_PATTERNS = [
  /thank\s+you/i,
  /thanks!/i,
  /\bthe\s+end\b/i,
  /\bq\s*&\s*a\b/i,
  /questions\?/i,
  /\brecap\b.*done\b/i,
  /see\s+you\s+(next|soon)/i,
  /\bcontact\s+us\b/i,
];

/**
 * Classify a single slide based on its extracted text content.
 *
 * @param slideIndex  0-based index in the deck
 * @param text        All extracted text (title + body)
 * @param title       First extracted line (may equal text if single-line)
 * @param totalSlides Total number of slides in the deck
 * @param seenNormalized  Normalized text of all previously classified slides
 *   (used for duplicate detection); caller must append after classification.
 */
export function classifySlide(
  slideIndex: number,
  text: string,
  title: string,
  totalSlides: number,
  seenNormalized: string[],
): { recommendation: SlideRecommendation; rationale: string } {
  const filtered = filterScreenshotTokens(text);
  const norm = normalizeForComparison(filtered);
  const words = wordCount(filtered);
  const isFirst = slideIndex === 0;
  const isLast = slideIndex === totalSlides - 1;

  // ── Blank / completely empty ──────────────────────────────────────────────
  if (words === 0) {
    return {
      recommendation: "blank",
      rationale: "Slide has no extractable text. It may be blank, image-only, or contain only graphics.",
    };
  }

  // ── Exact duplicate ───────────────────────────────────────────────────────
  if (seenNormalized.includes(norm)) {
    return {
      recommendation: "exact-duplicate",
      rationale: "Slide text is identical to an earlier slide in the deck.",
    };
  }

  // ── Near-duplicate (≥ 85% Jaccard word overlap) ───────────────────────────
  for (const prev of seenNormalized) {
    if (jaccardSimilarity(norm, prev) >= 0.85) {
      return {
        recommendation: "near-duplicate",
        rationale:
          "Slide text is highly similar (≥ 85% word overlap) to an earlier slide.",
      };
    }
  }

  // ── Cover slide ───────────────────────────────────────────────────────────
  const titleLow = title.toLowerCase();
  const contentLines = filtered.split("\n").map((line) => line.trim()).filter(Boolean);
  const hasNumberedDividerMarker = /^(?:0\d|[1-9]\d)$/.test(contentLines[0] ?? "")
    && contentLines.length >= 2
    && contentLines.length <= 4
    && words <= 16;
  if (hasNumberedDividerMarker) {
    return {
      recommendation: "divider",
      rationale: "Slide uses a numbered chapter marker with a short section title — likely a section divider.",
    };
  }
  if (isFirst || COVER_PATTERNS.some((p) => p.test(titleLow))) {
    return {
      recommendation: "cover",
      rationale: isFirst
        ? "First slide of the deck — likely the cover/title page."
        : "Slide title matches common cover-page patterns.",
    };
  }

  // ── Closing slide ─────────────────────────────────────────────────────────
  if (isLast || CLOSING_PATTERNS.some((p) => p.test(titleLow))) {
    return {
      recommendation: "closing",
      rationale: isLast
        ? "Last slide of the deck — likely the closing/thank-you page."
        : "Slide title matches common closing-page patterns.",
    };
  }

  // ── Section divider — title-only or very short, no substantive body ───────
  // Check divider before low-content so structural slides (chapter headings with
  // just a title or subtitle) are labelled correctly rather than as sparse content.
  const bodyText = filtered.split("\n").slice(1).join(" ").trim();
  const bodyWords = wordCount(bodyText);
  if (bodyWords === 0 && words <= 10) {
    return {
      recommendation: "divider",
      rationale: "Slide has a heading but no body text — likely a section-divider or chapter title.",
    };
  }
  if (bodyWords <= 3 && words <= 12) {
    return {
      recommendation: "divider",
      rationale: "Slide has a heading with very little body text — likely a section-divider.",
    };
  }

  // ── Low-content / placeholder ─────────────────────────────────────────────
  if (words <= 5) {
    return {
      recommendation: "low-content",
      rationale: `Slide contains very little text (${words} word${words === 1 ? "" : "s"}).`,
    };
  }

  // ── Normal content slide ──────────────────────────────────────────────────
  return { recommendation: "normal", rationale: "Regular content slide." };
}

/**
 * Determine whether a slide should be included in the import by default,
 * given its recommendation.
 */
export function defaultIncluded(rec: SlideRecommendation): boolean {
  // Exclude slides that are clearly redundant or structural by default.
  // Divider titles still seed review groups, and every excluded source slide
  // remains visible and can be restored by the author.
  // Authors can always re-include them.
  switch (rec) {
    case "blank":
    case "exact-duplicate":
    case "near-duplicate":
    case "divider":
    case "closing":
      return false;
    // Covers can become a concise introduction; sparse slides remain visible
    // because they may contain an important diagram that text extraction missed.
    default:
      return true;
  }
}

/**
 * Seed a meaningful narration script for a slide.
 *
 * Rules:
 *  - Speaker notes are used verbatim when present.
 *  - For image-heavy / low-text slides (blank, low-content), generate a visual
 *    description placeholder that prompts the author to describe what's shown.
 *  - SCREENSHOT placeholder tokens are filtered from the final output.
 *  - For normal slides, combine title + body into a readable sentence.
 */
export function seedNarration(opts: {
  recommendation: SlideRecommendation;
  title: string;
  text: string;
  notes: string;
  sourceIndex: number;
}): string {
  const { recommendation, title, text, notes, sourceIndex } = opts;

  // Notes always win.
  const cleanNotes = filterScreenshotTokens(notes).trim();
  if (cleanNotes) return cleanNotes;

  const cleanText = filterScreenshotTokens(text).trim();
  const cleanTitle = filterScreenshotTokens(title).trim();

  switch (recommendation) {
    case "blank":
      return (
        `This slide is primarily visual. Before publishing, replace this draft transcript with a concise description ` +
        `of the visual's essential information and how it supports the lesson.`
      );

    case "low-content":
      if (!cleanTitle && !cleanText) {
        return (
          `This slide is primarily visual. Before publishing, describe the key visual elements and explain ` +
          `how they support the lesson.`
        );
      }
      return (
        `${cleanTitle || cleanText}\n\n` +
        `This slide is primarily visual. Before publishing, add the essential information conveyed by its diagram, chart, or image.`
      );

    case "cover":
      return cleanTitle
        ? `Welcome to this course on "${cleanTitle}". ` +
          `In this session you will explore key concepts and build practical skills.`
        : `Welcome. In this session you will explore key concepts and build practical skills.`;

    case "closing":
      return cleanTitle
        ? `${cleanTitle} — That brings us to the end of this course. ` +
          `Thank you for your time and engagement. Good luck applying what you have learned.`
        : `That brings us to the end of this course. ` +
          `Thank you for your time and engagement.`;

    case "divider":
      return cleanTitle
        ? `Next up: ${cleanTitle}. Let's dive in.`
        : `Moving on to the next section.`;

    case "exact-duplicate":
    case "near-duplicate":
      return cleanText || cleanTitle || `[Duplicate of an earlier slide — review before including.]`;

    default: {
      // Normal slide: combine title + body as a readable narration.
      const lines = cleanText.split("\n").filter(Boolean);
      if (lines.length === 0) {
        return `Before publishing, add a concise transcript that explains the key point and any essential visual information.`;
      }
      if (lines.length === 1) return lines[0];
      // Intro sentence from title, then remaining lines.
      const [first, ...rest] = lines;
      return `${first}.\n\n${rest.join("\n")}`;
    }
  }
}

/**
 * Infer suggested lesson/section group boundaries from the reviewed slides.
 * A divider slide marks the start of a new group. The very first slide also
 * starts an implicit group (the intro).
 */
export function inferGroups(slides: ReviewSlide[]): ReviewGroup[] {
  const groups: ReviewGroup[] = [];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (i === 0 || s.recommendation === "divider" || s.recommendation === "cover") {
      const label = s.title || `Section ${groups.length + 1}`;
      // If it's a divider (not the first slide), the content starts on the NEXT slide —
      // but we still record this slide as the group boundary so the author can see it.
      groups.push({ startIndex: s.sourceIndex, suggestedTitle: label });
    }
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output treatment builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build Orion slide blocks for *faithful* treatment:
 * - Image only (the rasterized slide PNG).
 * - No repeated extracted text below the image.
 * - Alt text seeded from title/text.
 */
export function buildFaithfulBlocks(opts: {
  imageUrl: string;
  title: string;
  text: string;
}): SlideBlock[] {
  const alt = (opts.title || opts.text.split("\n")[0] || "Slide image").slice(0, 280);
  return [{ id: genId(), type: "image_slide", url: opts.imageUrl, alt }];
}

/**
 * Build Orion slide blocks for *enhanced* treatment:
 * - No source image (site-styled heading/text instead).
 * - SCREENSHOT placeholder tokens are filtered from all text.
 * - Heading from the slide title, body text as HTML paragraphs.
 */
export function buildEnhancedBlocks(opts: {
  title: string;
  text: string;
}): SlideBlock[] {
  const cleanTitle = filterScreenshotTokens(opts.title).trim();
  const bodyLines = filterScreenshotTokens(opts.text)
    .split("\n")
    .slice(cleanTitle ? 1 : 0)
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks: SlideBlock[] = [];

  if (cleanTitle) {
    blocks.push({ id: genId(), type: "heading", level: 2, text: cleanTitle });
  }

  if (bodyLines.length > 0) {
    const htmlEsc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = bodyLines.map((l) => `<p>${htmlEsc(l)}</p>`).join("");
    blocks.push({ id: genId(), type: "text", html });
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main review function
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewPptxOptions {
  buffer: Buffer;
  ownerUserId?: string;
  /**
   * If true, rasterize slides and upload preview images to object storage.
   * Set to false in unit tests / dry runs where rendering is unavailable.
   * Default: true.
   */
  renderPreviews?: boolean;
}

/**
 * Analyze a .pptx buffer and return a full per-slide review with
 * classification, narration seeds, group boundaries, and preview URLs.
 *
 * Does NOT create any Orion course/lesson — it returns raw review data so
 * the author can inspect and override every decision before committing.
 */
export async function reviewPptx(opts: ReviewPptxOptions): Promise<ReviewResult> {
  const { buffer, ownerUserId, renderPreviews = true } = opts;

  const zip = await JSZip.loadAsync(buffer);
  await sanitizePptxZip(zip);

  // Extract texts first (no rendering needed).
  const texts = await extractSlideTexts(zip).catch(() => [] as SlideTextInfo[]);

  // Optionally render preview images.
  let previewUrls: string[] = [];
  if (renderPreviews) {
    try {
      const sanitizedBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const images = await renderSlideImages(sanitizedBuffer);
      const storage = new ObjectStorageService();
      previewUrls = await Promise.all(
        images.map((img) =>
          storage.storeObjectBytes({
            entityId: `slides/preview/${randomUUID()}.png`,
            data: img,
            contentType: "image/png",
            acl: { owner: ownerUserId || "system", visibility: "private" },
          }),
        ),
      );
    } catch {
      // Preview rendering is best-effort; proceed without images.
      previewUrls = [];
    }
  }

  const totalSlides = Math.max(texts.length, previewUrls.length);
  const reviewSlides: ReviewSlide[] = [];
  const seenNormalized: string[] = [];

  for (let i = 0; i < totalSlides; i++) {
    const info = texts[i] ?? { title: "", text: "", notes: "" };
    const previewImageUrl = previewUrls[i] ?? "";

    const { recommendation, rationale } = classifySlide(
      i,
      info.text,
      info.title,
      totalSlides,
      seenNormalized,
    );

    // Record the normalized text so subsequent slides can detect duplicates.
    const norm = normalizeForComparison(filterScreenshotTokens(info.text));
    seenNormalized.push(norm);

    const narrationScript = seedNarration({
      recommendation,
      title: info.title,
      text: info.text,
      notes: info.notes,
      sourceIndex: i,
    });

    const cleanLines = filterScreenshotTokens(info.text).split("\n").map((line) => line.trim()).filter(Boolean);
    const reviewTitle = recommendation === "divider" && /^(?:0\d|[1-9]\d)$/.test(info.title.trim())
      ? (cleanLines[1] || info.title)
      : info.title;
    reviewSlides.push({
      sourceIndex: i,
      title: reviewTitle,
      text: info.text,
      notes: info.notes,
      previewImageUrl,
      recommendation,
      includedDefault: defaultIncluded(recommendation),
      rationale,
      narrationScript,
    });
  }

  const suggestedGroups = inferGroups(reviewSlides);

  return { slides: reviewSlides, suggestedGroups };
}
