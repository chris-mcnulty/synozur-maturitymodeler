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
const MAX_TEXT_LENGTH = 8000;

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

/**
 * Synthesize narration audio and persist it. Returns the stored object URL and
 * the voice used. Throws a descriptive error if TTS is not configured or the
 * Azure call fails.
 */
export async function synthesizeNarration(opts: {
  text: string;
  voice?: string;
  ownerUserId?: string;
}): Promise<{ audioUrl: string; voice: string }> {
  if (!isTtsConfigured()) {
    throw new Error(
      "Azure Speech is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.",
    );
  }
  const text = (opts.text || "").trim();
  if (!text) throw new Error("Narration text is empty.");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Narration text is too long (max ${MAX_TEXT_LENGTH} characters).`);
  }

  const voice = opts.voice || DEFAULT_VOICE;
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

  const buf = Buffer.from(await resp.arrayBuffer());
  const storage = new ObjectStorageService();
  const audioUrl = await storage.storeObjectBytes({
    entityId: `narration/${randomUUID()}.mp3`,
    data: buf,
    contentType: "audio/mpeg",
    acl: { owner: opts.ownerUserId || "system", visibility: "public" },
  });

  return { audioUrl, voice };
}
