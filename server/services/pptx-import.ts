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

function decodeXmlEntities(s: string): string {
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
function extractText(xml: string): string {
  const matches = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
  const lines = matches
    .map((m) => decodeXmlEntities(m.replace(/<\/?a:t>/g, "")).trim())
    .filter((t) => t.length > 0);
  return lines.join("\n");
}

interface SlideTextInfo { title: string; text: string; notes: string; }

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
    const env = { ...process.env, HOME: work };
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
  const [texts, images] = await Promise.all([
    extractSlideTexts(zip).catch(() => [] as SlideTextInfo[]),
    renderSlideImages(opts.buffer),
  ]);

  const storage = new ObjectStorageService();
  const slides: Slide[] = [];

  for (let i = 0; i < images.length; i++) {
    const info = texts[i];
    const url = await storage.storeObjectBytes({
      entityId: `slides/${randomUUID()}.png`,
      data: images[i],
      contentType: "image/png",
      acl: { owner: opts.ownerUserId || "system", visibility: "public" },
    });

    const alt = (info?.title || info?.text?.split("\n")[0] || `Slide ${i + 1}`).slice(0, 280);
    const block: SlideBlock = { id: genId(), type: "image_slide", url, alt };

    const notes = (info?.notes || "").trim();
    slides.push({
      id: genId("slide"),
      blocks: [block],
      narration: notes ? { mode: "tts", text: notes } : { mode: "none" },
    });
  }

  return { slides };
}
