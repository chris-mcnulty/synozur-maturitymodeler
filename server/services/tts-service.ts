/**
 * Text-to-speech narration service.
 *
 * Provider priority:
 *   1. Azure Cognitive Services Speech (REST) — primary
 *      Config: DB settings azureSpeechKey + (azureSpeechRegion | azureSpeechEndpoint)
 *      Env fallback: AZURE_SPEECH_KEY + (AZURE_SPEECH_REGION | AZURE_SPEECH_ENDPOINT)
 *   2. OpenAI TTS — fallback when Azure is not configured
 *      Uses the Replit AI integration proxy:
 *        AI_INTEGRATIONS_OPENAI_BASE_URL / AI_INTEGRATIONS_OPENAI_API_KEY
 *
 * Generated audio is stored in object storage at `narration/<uuid>.mp3` and
 * returned as a `/objects/narration/...` path that the slide player loads via
 * the course media proxy.
 *
 * DB settings keys (Admin → AI & Speech settings):
 *   azureSpeechKey      — Azure Speech subscription key
 *   azureSpeechRegion   — region, e.g. "eastus" (auto-builds endpoint if no custom one)
 *   azureSpeechEndpoint — optional full REST endpoint override
 *   azureSpeechVoice    — default voice (e.g. "en-US-JennyNeural")
 *
 * Env overrides (used if DB setting is absent):
 *   AZURE_SPEECH_KEY / AZURE_SPEECH_REGION / AZURE_SPEECH_ENDPOINT / AZURE_SPEECH_VOICE
 *   OPENAI_TTS_VOICE / OPENAI_TTS_MODEL
 */
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../objectStorage";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { settings as settingsTable } from "@shared/schema";

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
    "en-US-JennyNeural";
  return { key, region, endpoint, voice };
}

// ─── Azure Speech ────────────────────────────────────────────────────────────

export async function isAzureTtsConfigured(): Promise<boolean> {
  const { key, region, endpoint } = await getAzureConfig();
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

function buildSsml(text: string, voice: string): string {
  const lang = voice.split("-").slice(0, 2).join("-") || "en-US";
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${ssmlEscape(voice)}">${ssmlEscape(text)}</voice></speak>`
  );
}

async function synthesizeChunkAzure(
  text: string,
  voice: string,
  config: AzureTtsConfig,
): Promise<Buffer> {
  const resp = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "orion-courses",
    },
    body: buildSsml(text, voice),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(
      `Azure TTS request failed (${resp.status}). ${detail.slice(0, 200)}`,
    );
  }
  return Buffer.from(await resp.arrayBuffer());
}

// ─── OpenAI TTS ──────────────────────────────────────────────────────────────

const OPENAI_TTS_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const OPENAI_DEFAULT_VOICE = process.env.OPENAI_TTS_VOICE || "nova";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "tts-1";
const OPENAI_CHUNK_LIMIT = 4000;

export function isOpenAITtsConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  );
}

function toOpenAIVoice(voice: string | undefined): string {
  if (!voice) return OPENAI_DEFAULT_VOICE;
  const lower = voice.toLowerCase();
  if (OPENAI_TTS_VOICES.has(lower)) return lower;
  if (/jenny|aria|ana|emma|michelle|elizabeth|clara|jane|sara/i.test(lower))
    return "nova";
  if (/guy|davis|tony|andrew|brandon/i.test(lower)) return "onyx";
  return OPENAI_DEFAULT_VOICE;
}

async function synthesizeChunkOpenAI(
  text: string,
  voice: string,
): Promise<Buffer> {
  const baseUrl = (
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL as string
  ).replace(/\/$/, "");
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
    throw new Error(
      `OpenAI TTS request failed (${resp.status}). ${detail.slice(0, 200)}`,
    );
  }
  return Buffer.from(await resp.arrayBuffer());
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

export async function isTtsConfigured(): Promise<boolean> {
  return (await isAzureTtsConfigured()) || isOpenAITtsConfigured();
}

export async function getTtsProvider(): Promise<"azure" | "openai" | null> {
  if (await isAzureTtsConfigured()) return "azure";
  if (isOpenAITtsConfigured()) return "openai";
  return null;
}

export async function synthesizeNarration(opts: {
  text: string;
  voice?: string;
  ownerUserId?: string;
}): Promise<{ audioUrl: string; voice: string; provider: string }> {
  const provider = await getTtsProvider();
  if (!provider) {
    throw new Error(
      "No TTS provider is configured. " +
        "Add your Azure Speech Key and Region in Admin → AI & Speech settings, " +
        "or ensure the OpenAI AI integration is active.",
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
    const azureConfig = await getAzureConfig();
    resolvedVoice = opts.voice || azureConfig.voice;
    chunkLimit = 3500;
    synthesizeChunk = (chunk, voice) =>
      synthesizeChunkAzure(chunk, voice, azureConfig);
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
