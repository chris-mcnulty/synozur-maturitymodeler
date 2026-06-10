/**
 * Text-to-speech narration via Azure Cognitive Services Speech.
 *
 * Uses the Speech REST endpoint directly (no SDK) — a single POST with an SSML
 * body and the subscription key returns MP3 bytes, which we store in object
 * storage and expose as a `/objects/...` URL for the slide narration player.
 *
 * Configuration (environment):
 *   AZURE_SPEECH_KEY       — Cognitive Services Speech resource key (required)
 *   AZURE_SPEECH_REGION    — e.g. "eastus" (required unless AZURE_SPEECH_ENDPOINT set)
 *   AZURE_SPEECH_ENDPOINT  — full TTS endpoint override (optional)
 *   AZURE_SPEECH_VOICE     — default voice, e.g. "en-US-JennyNeural" (optional)
 */
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../objectStorage";

const DEFAULT_VOICE = process.env.AZURE_SPEECH_VOICE || "en-US-JennyNeural";
// Azure caps a single synthesis request; we chunk below this and concatenate
// the resulting MP3s. Total input is bounded by MAX_TEXT_LENGTH.
const CHUNK_CHAR_LIMIT = 3500;
const MAX_TEXT_LENGTH = 50000;

/**
 * Split text into chunks under `limit` characters, preferring sentence then
 * whitespace boundaries so we never cut mid-word. Exported for testing.
 */
export function splitTextForTts(text: string, limit = CHUNK_CHAR_LIMIT): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return clean ? [clean] : [];

  // Break into sentence-ish units, then greedily pack them into chunks.
  const units = clean.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [clean];
  const chunks: string[] = [];
  let cur = "";
  const pushCur = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };

  for (let unit of units) {
    // A single oversized unit (no sentence breaks) is hard-split on whitespace.
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

export function isTtsConfigured(): boolean {
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
  // Derive the BCP-47 language tag from the voice name (e.g. en-US-JennyNeural).
  const lang = voice.split("-").slice(0, 2).join("-") || "en-US";
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${ssmlEscape(voice)}">${ssmlEscape(text)}</voice></speak>`
  );
}

/** Synthesize a single (already size-bounded) chunk → MP3 bytes. */
async function synthesizeChunk(text: string, voice: string): Promise<Buffer> {
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

/**
 * Synthesize narration audio and persist it. Returns the stored object URL and
 * the voice used. Long scripts are split into multiple TTS calls and the audio
 * concatenated. Throws a descriptive error if TTS is not configured or a call
 * fails.
 */
export async function synthesizeNarration(opts: {
  text: string;
  voice?: string;
  ownerUserId?: string;
}): Promise<{ audioUrl: string; voice: string }> {
  if (!isTtsConfigured()) {
    throw new Error(
      "Azure Speech is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (or AZURE_SPEECH_ENDPOINT).",
    );
  }
  const text = (opts.text || "").trim();
  if (!text) throw new Error("Narration text is empty.");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Narration text is too long (max ${MAX_TEXT_LENGTH} characters).`);
  }

  const voice = opts.voice || DEFAULT_VOICE;

  // Synthesize each chunk and concatenate the MP3 streams (MP3 frames are
  // self-delimiting, so byte concatenation yields a valid continuous file).
  const chunks = splitTextForTts(text);
  const parts: Buffer[] = [];
  for (const chunk of chunks) {
    parts.push(await synthesizeChunk(chunk, voice));
  }
  const buf = Buffer.concat(parts);
  const storage = new ObjectStorageService();
  const audioUrl = await storage.storeObjectBytes({
    entityId: `narration/${randomUUID()}.mp3`,
    data: buf,
    contentType: "audio/mpeg",
    acl: { owner: opts.ownerUserId || "system", visibility: "private" },
  });

  return { audioUrl, voice };
}
