/**
 * Text-to-speech narration service.
 *
 * Provider: Azure Cognitive Services Speech (REST) — only supported provider.
 *   Config: DB settings azureSpeechKey + (azureSpeechRegion | azureSpeechEndpoint)
 *   Env fallback: AZURE_SPEECH_KEY + (AZURE_SPEECH_REGION | AZURE_SPEECH_ENDPOINT)
 *
 * Generated audio is stored in object storage at `narration/<uuid>.mp3` and
 * returned as a `/objects/narration/...` path that the slide player loads via
 * the course media proxy.
 *
 * DB settings keys (Admin → AI & Speech settings):
 *   azureSpeechKey      — Azure Speech subscription key
 *   azureSpeechRegion   — region, e.g. "eastus" (auto-builds endpoint if no custom one)
 *   azureSpeechEndpoint — optional full REST endpoint override
 *   azureSpeechVoice    — default voice (e.g. "en-US-Andrew:DragonHDLatestNeural")
 *
 * Env overrides (used if DB setting is absent):
 *   AZURE_SPEECH_KEY / AZURE_SPEECH_REGION / AZURE_SPEECH_ENDPOINT / AZURE_SPEECH_VOICE
 */
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../objectStorage";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { settings as settingsTable } from "@shared/schema";

export const DEFAULT_AZURE_VOICE = "en-US-Andrew:DragonHDLatestNeural";
export const AZURE_MP3_OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3";

// ─── DB-backed config ────────────────────────────────────────────────────────

async function getDbSetting(key: string): Promise<string | undefined> {
  try {
    const [row] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .limit(1);
    const val = row?.value;
    if (typeof val === "string" && val) return val;
    return undefined;
  } catch {
    return undefined;
  }
}

export interface AzureTtsConfig {
  key: string;
  region: string;
  endpoint: string;
  voice: string;
}

/** Reads Azure Speech config from DB settings, falling back to env vars. */
export async function getAzureConfig(): Promise<AzureTtsConfig> {
  const key =
    (await getDbSetting("azureSpeechKey")) ||
    process.env.AZURE_SPEECH_KEY ||
    "";
  const region =
    (await getDbSetting("azureSpeechRegion")) ||
    process.env.AZURE_SPEECH_REGION ||
    "";
  const endpoint =
    (await getDbSetting("azureSpeechEndpoint")) ||
    process.env.AZURE_SPEECH_ENDPOINT ||
    (region ? `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1` : "");
  const voice =
    (await getDbSetting("azureSpeechVoice")) ||
    process.env.AZURE_SPEECH_VOICE ||
    DEFAULT_AZURE_VOICE;
  return { key, region, endpoint, voice };
}

// ─── Azure Speech ────────────────────────────────────────────────────────────

/**
 * Synchronous env-only check for Azure TTS configuration.
 * Returns true when AZURE_SPEECH_KEY and (AZURE_SPEECH_REGION or
 * AZURE_SPEECH_ENDPOINT) are present in the environment.
 * The async synthesizeNarration path also checks DB settings.
 */
export function isAzureTtsConfigured(): boolean {
  const key = process.env.AZURE_SPEECH_KEY || "";
  const region = process.env.AZURE_SPEECH_REGION || "";
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT || "";
  return Boolean(key && (region || endpoint));
}

function ssmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSsml(text: string, voice: string): string {
  const lang = voice.split("-").slice(0, 2).join("-") || "en-US";
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${ssmlEscape(voice)}">${ssmlEscape(text)}</voice></speak>`
  );
}

export async function synthesizeChunkAzure(
  text: string,
  voice: string,
  config: AzureTtsConfig,
): Promise<Buffer> {
  const resp = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": AZURE_MP3_OUTPUT_FORMAT,
      "User-Agent": "orion-courses",
    },
    body: buildSsml(text, voice),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    const dragonHint =
      voice.includes(":DragonHD") && [400, 404].includes(resp.status)
        ? ` Voice "${voice}" may not be available in Azure Speech region "${config.region || "for this endpoint"}"; choose another region or voice.`
        : "";
    throw new Error(
      `Azure TTS request failed (${resp.status}).${dragonHint}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const audio = Buffer.from(await resp.arrayBuffer());
  if (audio.length === 0) {
    throw new Error(`Azure TTS returned empty audio for voice "${voice}".`);
  }
  return audio;
}

// ─── Shared chunker ──────────────────────────────────────────────────────────

export function splitTextForTts(text: string, limit: number): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return clean ? [clean] : [];

  const units = clean.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [clean];
  const chunks: string[] = [];
  let cur = "";
  const pushCur = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };

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
export const TTS_PREVIEW_TEXT =
  "Hello! This is a preview of your selected narration voice.";

/**
 * Returns true when Azure TTS is available via env vars.
 * Synchronous; can be awaited by callers that expect a Promise.
 */
export function isTtsConfigured(): boolean {
  return isAzureTtsConfigured();
}

/**
 * Returns "azure" when Azure TTS is configured via env vars, otherwise null.
 * Synchronous; can be awaited by callers that expect a Promise.
 * OpenAI is no longer a supported narration provider.
 */
export function getTtsProvider(): "azure" | null {
  if (isAzureTtsConfigured()) return "azure";
  return null;
}

/**
 * Synthesizes a short, temporary sample without writing it to object storage.
 * The caller is responsible for returning or discarding the bytes.
 */
export async function synthesizeVoicePreview(opts: {
  voice: string;
}): Promise<{ audio: Buffer; voice: string; provider: "azure" }> {
  const azureConfig = await getAzureConfig();
  const azureAvailable = Boolean(azureConfig.key && azureConfig.endpoint);

  if (!azureAvailable) {
    throw new Error(
      "Azure Speech is not configured. Add your Azure Speech Key and Region before previewing a voice.",
    );
  }

  const voice = (opts.voice || "").trim();
  if (!voice) throw new Error("A narration voice is required.");

  const audio = await synthesizeChunkAzure(TTS_PREVIEW_TEXT, voice, azureConfig);
  return { audio, voice, provider: "azure" };
}

/**
 * Synthesize narration using Azure Cognitive Services Speech.
 * Throws a clear error when Azure is not configured — there is no OpenAI
 * fallback. Configure Azure via Admin → AI & Speech settings or the
 * AZURE_SPEECH_KEY / AZURE_SPEECH_REGION env vars.
 */
export async function synthesizeNarration(opts: {
  text: string;
  voice?: string;
  ownerUserId?: string;
}): Promise<{ audioUrl: string; voice: string; provider: string }> {
  // Read full config (env + DB) to check if Azure is available.
  const azureConfig = await getAzureConfig();
  const azureAvailable = Boolean(azureConfig.key && (azureConfig.region || azureConfig.endpoint));

  if (!azureAvailable) {
    throw new Error(
      "Azure Speech is not configured. " +
        "Add your Azure Speech Key and Region in Admin → AI & Speech settings, " +
        "or set the AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables.",
    );
  }

  const text = (opts.text || "").trim();
  if (!text) throw new Error("Narration text is empty.");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Narration text is too long (max ${MAX_TEXT_LENGTH} characters).`);
  }

  const resolvedVoice = opts.voice || azureConfig.voice;
  const chunkLimit = 3500;

  const chunks = splitTextForTts(text, chunkLimit);
  const parts: Buffer[] = [];
  for (const chunk of chunks) {
    parts.push(await synthesizeChunkAzure(chunk, resolvedVoice, azureConfig));
  }
  const buf = Buffer.concat(parts);

  const storage = new ObjectStorageService();
  const audioUrl = await storage.storeObjectBytes({
    entityId: `narration/${randomUUID()}.mp3`,
    data: buf,
    contentType: "audio/mpeg",
    acl: { owner: opts.ownerUserId || "system", visibility: "private" },
  });

  return { audioUrl, voice: resolvedVoice, provider: "azure" };
}
