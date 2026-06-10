/**
 * Text-to-speech narration service.
 *
 * Provider priority:
 *   1. Azure Cognitive Services Speech (REST) — primary
 *      Requires: AZURE_SPEECH_KEY + (AZURE_SPEECH_REGION | AZURE_SPEECH_ENDPOINT)
 *   2. OpenAI TTS — fallback when Azure is not configured
 *      Uses the Replit AI integration proxy:
 *        AI_INTEGRATIONS_OPENAI_BASE_URL / AI_INTEGRATIONS_OPENAI_API_KEY
 *
 * Generated audio is stored in object storage at `narration/<uuid>.mp3` and
 * returned as a `/objects/narration/...` path that the slide player loads via
 * the course media proxy.
 *
 * Optional env overrides:
 *   AZURE_SPEECH_VOICE  — default Azure voice  (e.g. "en-US-JennyNeural")
 *   OPENAI_TTS_VOICE    — default OpenAI voice (e.g. "nova"; one of alloy/echo/fable/onyx/nova/shimmer)
 *   OPENAI_TTS_MODEL    — OpenAI model          (default "tts-1")
 */
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../objectStorage";

// ─── Azure Speech ───────────────────────────────────────────────────────────

const AZURE_DEFAULT_VOICE = process.env.AZURE_SPEECH_VOICE || "en-US-JennyNeural";

export function isAzureTtsConfigured(): boolean {
  return Boolean(
    process.env.AZURE_SPEECH_KEY &&
      (process.env.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_ENDPOINT),
  );
}

function ssmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSsml(text: string, voice: string): string {
  const lang = voice.split("-").slice(0, 2).join("-") || "en-US";
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${ssmlEscape(voice)}">${ssmlEscape(text)}</voice></speak>`
  );
}

async function synthesizeChunkAzure(text: string, voice: string): Promise<Buffer> {
  const region = process.env.AZURE_SPEECH_REGION;
  const endpoint =
    process.env.AZURE_SPEECH_ENDPOINT ||
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY as string,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "orion-courses",
    },
    body: buildSsml(text, voice),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Azure TTS request failed (${resp.status}). ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// ─── OpenAI TTS ──────────────────────────────────────────────────────────────

const OPENAI_TTS_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const OPENAI_DEFAULT_VOICE = process.env.OPENAI_TTS_VOICE || "nova";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "tts-1";
// OpenAI TTS caps at 4096 chars per request.
const OPENAI_CHUNK_LIMIT = 4000;

export function isOpenAITtsConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  );
}

/**
 * Map an Azure Neural voice name (e.g. "en-US-JennyNeural") to the closest
 * OpenAI voice. If the caller already passed a valid OpenAI voice name it is
 * returned unchanged.
 */
function toOpenAIVoice(voice: string | undefined): string {
  if (!voice) return OPENAI_DEFAULT_VOICE;
  const lower = voice.toLowerCase();
  if (OPENAI_TTS_VOICES.has(lower)) return lower;
  // Rough gender/style mapping based on common Azure voice names.
  if (/jenny|aria|ana|emma|michelle|elizabeth|clara|jane|sara/i.test(lower)) return "nova";
  if (/guy|davis|tony|davis|andrew|brandon/i.test(lower)) return "onyx";
  return OPENAI_DEFAULT_VOICE;
}

async function synthesizeChunkOpenAI(text: string, voice: string): Promise<Buffer> {
  const baseUrl = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL as string).replace(/\/$/, "");
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY as string;

  const resp = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice, input: text }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenAI TTS request failed (${resp.status}). ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// ─── Shared chunker ──────────────────────────────────────────────────────────

/**
 * Split text into chunks under `limit` characters, preferring sentence then
 * whitespace boundaries so we never cut mid-word. Exported for unit tests.
 */
export function splitTextForTts(text: string, limit: number): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return clean ? [clean] : [];

  const units = clean.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [clean];
  const chunks: string[] = [];
  let cur = "";
  const pushCur = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };

  for (let unit of units) {
    while (unit.length > limit) {
      const slice = unit.slice(0, limit);
      const cut = slice.lastIndexOf(" ");
      const head = cut > limit * 0.5 ? slice.slice(0, cut) : slice;
      if (cur) pushCur();
      chunks.push(head.trim());
      unit = unit.slice(head.length);
    }
    if (cur.length + unit.length > limit) pushCur();
    cur += unit;
  }
  pushCur();
  return chunks;
}

// ─── Public API ──────────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 50000;

/** Returns whether any TTS provider is configured. */
export function isTtsConfigured(): boolean {
  return isAzureTtsConfigured() || isOpenAITtsConfigured();
}

/** Returns the active provider id, or null if none is configured. */
export function getTtsProvider(): "azure" | "openai" | null {
  if (isAzureTtsConfigured()) return "azure";
  if (isOpenAITtsConfigured()) return "openai";
  return null;
}

/**
 * Synthesize narration audio and persist it. Returns the stored object URL
 * and the voice used. Long scripts are split into multiple calls and the
 * resulting MP3s concatenated (MP3 frames are self-delimiting so byte
 * concatenation yields a valid continuous file).
 *
 * Provider selection: Azure if configured, otherwise OpenAI TTS via the
 * Replit AI integration proxy. Throws a descriptive error if neither is
 * available.
 */
export async function synthesizeNarration(opts: {
  text: string;
  voice?: string;
  ownerUserId?: string;
}): Promise<{ audioUrl: string; voice: string; provider: string }> {
  const provider = getTtsProvider();
  if (!provider) {
    throw new Error(
      "No TTS provider is configured. " +
        "Set AZURE_SPEECH_KEY + AZURE_SPEECH_REGION for Azure Speech, " +
        "or ensure the OpenAI AI integration is active for OpenAI TTS.",
    );
  }

  const text = (opts.text || "").trim();
  if (!text) throw new Error("Narration text is empty.");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Narration text is too long (max ${MAX_TEXT_LENGTH} characters).`);
  }

  let resolvedVoice: string;
  let chunkLimit: number;
  let synthesizeChunk: (chunk: string, voice: string) => Promise<Buffer>;

  if (provider === "azure") {
    resolvedVoice = opts.voice || AZURE_DEFAULT_VOICE;
    chunkLimit = 3500;
    synthesizeChunk = synthesizeChunkAzure;
  } else {
    resolvedVoice = toOpenAIVoice(opts.voice);
    chunkLimit = OPENAI_CHUNK_LIMIT;
    synthesizeChunk = synthesizeChunkOpenAI;
  }

  const chunks = splitTextForTts(text, chunkLimit);
  const parts: Buffer[] = [];
  for (const chunk of chunks) {
    parts.push(await synthesizeChunk(chunk, resolvedVoice));
  }
  const buf = Buffer.concat(parts);

  const storage = new ObjectStorageService();
  const audioUrl = await storage.storeObjectBytes({
    entityId: `narration/${randomUUID()}.mp3`,
    data: buf,
    contentType: "audio/mpeg",
    acl: { owner: opts.ownerUserId || "system", visibility: "private" },
  });

  return { audioUrl, voice: resolvedVoice, provider };
}
