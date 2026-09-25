/**
 * Shared brand tokens and HTML → PNG/PDF rendering for the Synozur annual
 * training courses. Graphics are authored as HTML/CSS so every label stays
 * editable source text in this repository; the rendered PNGs are what Orion
 * stores as managed course media.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const FONT_DIR = path.join(ROOT, "client/src/assets/fonts");
const CHROMIUM = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";

export const BRAND = {
  purple: "#810FFB",
  magenta: "#E60CB3",
  ink: "#1C1530",
  muted: "#5B5470",
  line: "#E4DAF5",
  lilac: "#F5EEFF",
  blush: "#FDEBF7",
  white: "#FFFFFF",
} as const;

/** Official logo files supplied with the project (never redrawn). */
export const LOGO_FILES = {
  horizontal: path.join(ROOT, "attached_assets/SA-Logo-Horizontal-color_1760530252980.png"),
  mark: path.join(ROOT, "attached_assets/SynozurMark_color1400_1760409910692.png"),
} as const;

export async function dataUri(file: string, mime?: string): Promise<string> {
  const buf = await fs.readFile(file);
  const type = mime ?? (file.endsWith(".png") ? "image/png" : file.endsWith(".svg") ? "image/svg+xml" : "image/jpeg");
  return `data:${type};base64,${buf.toString("base64")}`;
}

/**
 * @font-face rules for the licensed Avenir Next LT Pro files shipped with Orion.
 * Several of those files are named differently from the face they contain
 * (checked with fc-scan), so faces are mapped by their embedded style, not
 * their file names.
 */
export function fontFaceCss(): string {
  const faces: Array<[file: string, weight: number, style: "normal" | "italic"]> = [
    ["UltraLight", 300, "normal"], // contains Light
    ["Regular", 400, "normal"],
    ["Medium", 400, "italic"], // contains Italic
    ["Heavy", 600, "normal"], // contains Demi
    ["Bold", 700, "normal"],
    ["Thin", 700, "italic"], // contains Bold Italic
  ];
  return faces
    .map(([file, weight, style]) => `@font-face{font-family:"Avenir Next LT Pro";font-weight:${weight};font-style:${style};src:url("file://${FONT_DIR}/AvenirNextLTPro-${file}.ttf") format("truetype");}`)
    .join("\n");
}

export function baseCss(): string {
  return `${fontFaceCss()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:"Avenir Next LT Pro",Inter,Arial,sans-serif;color:${BRAND.ink};-webkit-font-smoothing:antialiased}
`;
}

export function page(width: number, height: number, css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss()}
html,body{width:${width}px;height:${height}px;overflow:hidden}
${css}</style></head><body>${body}</body></html>`;
}

let browserPromise: Promise<Browser> | null = null;
function browser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ executablePath: CHROMIUM, args: ["--allow-file-access-from-files"] });
  return browserPromise;
}

export async function closeRenderer(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

async function loadHtml(html: string, htmlPath: string, width: number, height: number, scale: number) {
  await fs.mkdir(path.dirname(htmlPath), { recursive: true });
  await fs.writeFile(htmlPath, html, "utf8");
  const b = await browser();
  const context = await b.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const tab = await context.newPage();
  await tab.goto(`file://${htmlPath}`);
  await tab.evaluate(async () => {
    await (document as any).fonts.ready;
  });
  const missing = await tab.evaluate(() =>
    (document as any).fonts.check('600 20px "Avenir Next LT Pro"') ? null : "Avenir Next LT Pro did not load",
  );
  if (missing) throw new Error(missing);
  return { context, tab };
}

/**
 * Render an HTML page to an image (PNG, or JPEG when `out` ends in .jpg for
 * photographic gradients). The HTML source is saved next to the output.
 */
export async function renderPng(opts: { html: string; out: string; width: number; height: number; scale?: number }): Promise<void> {
  const jpeg = /\.jpe?g$/i.test(opts.out);
  const htmlPath = opts.out.replace(/\.(png|jpe?g)$/i, ".source.html");
  const { context, tab } = await loadHtml(opts.html, htmlPath, opts.width, opts.height, opts.scale ?? 1.5);
  await fs.mkdir(path.dirname(opts.out), { recursive: true });
  await tab.screenshot({
    path: opts.out,
    clip: { x: 0, y: 0, width: opts.width, height: opts.height },
    ...(jpeg ? { type: "jpeg" as const, quality: 90 } : {}),
  });
  await context.close();
}

/** Render an HTML document to a Letter-size PDF (for downloadable references). */
export async function renderPdf(opts: { html: string; out: string }): Promise<void> {
  const htmlPath = opts.out.replace(/\.pdf$/, ".source.html");
  const { context, tab } = await loadHtml(opts.html, htmlPath, 816, 1056, 1);
  await fs.mkdir(path.dirname(opts.out), { recursive: true });
  await tab.pdf({ path: opts.out, format: "Letter", printBackground: true, preferCSSPageSize: true, tagged: true });
  await context.close();
}
