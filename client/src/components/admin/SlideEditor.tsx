/**
 * Visual, block-based editor for `slides` lessons.
 *
 * Authors build each slide from ordered content blocks (heading, rich text,
 * image, video, callout) and attach optional narration — either a recorded
 * audio upload or machine-generated speech via Azure TTS
 * (POST /api/courses/:id/narration/tts). Replaces the raw JSON textarea for
 * slides lessons.
 *
 * Rendering on the learner side is handled by `SlideBlockView` in
 * `pages/CourseDetail.tsx`; both consume the shared slide model in
 * `@shared/slides`, so the editor and player stay in lock-step.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Trash, ChevronUp, ChevronDown, Image as ImageIcon, Video, Type, Heading,
  Lightbulb, Upload, Bold, Italic, List, Link as LinkIcon, Mic, Loader2, Sparkles,
} from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import {
  genId, blankSlide, normalizeSlides, courseMediaUrl,
  type Slide, type SlideBlock, type SlidesContent, type SlideNarrationMode,
} from "@shared/slides";

async function getUploadParameters() {
  const res = await fetch("/api/objects/upload", { method: "POST", credentials: "include" });
  const data = await res.json();
  return { method: "PUT" as const, url: data.uploadURL };
}

/**
 * Resolve the raw URL from a completed Uppy upload, then normalize it to a
 * stable `/objects/...` path. The server finalizes course/lesson media with a
 * *private* ACL; learners read it through the course-aware media proxy
 * (`courseMediaUrl()` → `GET /api/courses/:id/media`). Falls back to the raw
 * URL if finalize fails (still better than nothing).
 */
async function finalizeUploaded(result: any): Promise<string | undefined> {
  const raw = result?.successful?.[0]?.uploadURL;
  if (!raw) return undefined;
  try {
    const res = await fetch("/api/objects/finalize", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: raw }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.url || raw;
    }
  } catch {
    /* fall through to raw */
  }
  return raw;
}

/** Curated Azure neural voices offered in the narration picker. */
const TTS_VOICES: { id: string; label: string }[] = [
  { id: "en-US-JennyNeural", label: "Jenny (US, female)" },
  { id: "en-US-AriaNeural", label: "Aria (US, female)" },
  { id: "en-US-GuyNeural", label: "Guy (US, male)" },
  { id: "en-US-DavisNeural", label: "Davis (US, male)" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK, female)" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK, male)" },
  { id: "en-AU-NatashaNeural", label: "Natasha (AU, female)" },
];
const DEFAULT_VOICE = TTS_VOICES[0].id;

/** Request TTS narration for some text; returns the stored audio URL + voice. */
async function requestTts(courseId: string, text: string, voice?: string): Promise<{ audioUrl: string; voice: string }> {
  const res = await fetch(`/api/courses/${courseId}/narration/tts`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to generate narration");
  return data;
}

/** contentEditable rich-text field with a minimal formatting toolbar. */
function RichTextField({ value, onChange, placeholder }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Initialize once on mount; the caller remounts (via `key`) when switching
  // blocks/slides, so we never fight React over the cursor position.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    // execCommand is deprecated but universally supported; fine for an
    // internal authoring tool. Output is sanitized at render time.
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-1 border-b bg-muted/40 px-1 py-1" role="toolbar" aria-label="Text formatting">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => exec("bold")} title="Bold" aria-label="Bold">
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => exec("italic")} title="Italic" aria-label="Italic">
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => exec("insertUnorderedList")} title="Bulleted list" aria-label="Bulleted list">
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Link" aria-label="Insert link"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) exec("createLink", url);
          }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || "Rich text"}
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        data-placeholder={placeholder || "Type here…"}
        className="prose prose-sm dark:prose-invert max-w-none min-h-[80px] px-3 py-2 text-sm focus:outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

function MediaUrlInput({ label, url, onChange, accept, fileTypes }: {
  label: string;
  url: string;
  onChange: (url: string) => void;
  accept?: string;
  fileTypes: string[];
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Label className="text-xs">{label}</Label>
        <Input value={url} onChange={(e) => onChange(e.target.value)} placeholder="https://… or upload" />
      </div>
      <ObjectUploader
        maxNumberOfFiles={1}
        maxFileSize={524288000 /* 500MB for video/audio */}
        allowedFileTypes={fileTypes}
        onGetUploadParameters={getUploadParameters}
        onComplete={async (r) => { const u = await finalizeUploaded(r); if (u) onChange(u); }}
        buttonVariant="outline"
      >
        <Upload className="h-4 w-4" aria-label="Upload file" />
      </ObjectUploader>
    </div>
  );
}

function BlockEditor({ block, courseId, onChange }: { block: SlideBlock; courseId: string; onChange: (b: SlideBlock) => void }) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex items-center gap-2">
          <Select value={String(block.level)} onValueChange={(v) => onChange({ ...block, level: Number(v) as 1 | 2 | 3 })}>
            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">H1</SelectItem>
              <SelectItem value="2">H2</SelectItem>
              <SelectItem value="3">H3</SelectItem>
            </SelectContent>
          </Select>
          <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Heading text" />
        </div>
      );
    case "text":
      return <RichTextField key={block.id} value={block.html} onChange={(html) => onChange({ ...block, html })} />;
    case "callout":
      return (
        <div className="space-y-2">
          <Select value={block.tone} onValueChange={(v) => onChange({ ...block, tone: v as any })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="tip">Tip</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
            </SelectContent>
          </Select>
          <RichTextField key={block.id} value={block.html} onChange={(html) => onChange({ ...block, html })} />
        </div>
      );
    case "image":
    case "image_slide":
      return (
        <div className="space-y-2">
          <MediaUrlInput
            label="Image URL"
            url={block.url}
            onChange={(url) => onChange({ ...block, url })}
            fileTypes={["image/jpeg", "image/png", "image/webp", "image/gif"]}
          />
          <div>
            <Label className="text-xs">Alt text (accessibility)</Label>
            <Input value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} placeholder="Describe the image" aria-label="Image alt text" />
            {block.url && !block.alt?.trim() && (
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                Add alt text so screen-reader users can understand this image.
              </p>
            )}
          </div>
          {block.type === "image" && (
            <div>
              <Label className="text-xs">Caption (optional)</Label>
              <Input value={block.caption || ""} onChange={(e) => onChange({ ...block, caption: e.target.value })} />
            </div>
          )}
          {block.url && <img src={courseMediaUrl(courseId, block.url)} alt={block.alt} className="max-h-40 rounded-md border" />}
        </div>
      );
    case "video":
      return (
        <div className="space-y-2">
          <MediaUrlInput
            label="Video URL (MP4) or YouTube/Vimeo link"
            url={block.url}
            onChange={(url) => onChange({ ...block, url })}
            fileTypes={["video/mp4", "video/webm"]}
          />
          <Select
            value={block.provider || "mp4"}
            onValueChange={(v) => onChange({ ...block, provider: v as any })}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4 (hosted)</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="vimeo">Vimeo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    default:
      return null;
  }
}

const BLOCK_LABELS: Record<string, { label: string; icon: any }> = {
  heading: { label: "Heading", icon: Heading },
  text: { label: "Text", icon: Type },
  image: { label: "Image", icon: ImageIcon },
  video: { label: "Video", icon: Video },
  callout: { label: "Callout", icon: Lightbulb },
};

function newBlock(type: string): SlideBlock {
  switch (type) {
    case "heading": return { id: genId(), type: "heading", level: 2, text: "" };
    case "text": return { id: genId(), type: "text", html: "" };
    case "image": return { id: genId(), type: "image", url: "", alt: "" };
    case "video": return { id: genId(), type: "video", url: "", provider: "mp4" };
    case "callout": return { id: genId(), type: "callout", tone: "info", html: "" };
    default: return { id: genId(), type: "text", html: "" };
  }
}

function NarrationPanel({ slide, courseId, onChange }: {
  slide: Slide;
  courseId: string;
  onChange: (n: Slide["narration"]) => void;
}) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const narration = slide.narration ?? { mode: "none" as SlideNarrationMode };

  const generateTts = async () => {
    const text = (narration.text || "").trim();
    if (!text) {
      toast({ title: "Add a narration script first", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const data = await requestTts(courseId, text, narration.voice || DEFAULT_VOICE);
      onChange({ ...narration, mode: "tts", audioUrl: data.audioUrl, voice: data.voice, status: "ready" });
      toast({ title: "Narration generated" });
    } catch (err: any) {
      toast({ title: "TTS failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Narration</Label>
      </div>
      <Select
        value={narration.mode}
        onValueChange={(v) => onChange({ ...narration, mode: v as SlideNarrationMode })}
      >
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="recorded">Recorded / uploaded audio</SelectItem>
          <SelectItem value="tts">Machine voice (TTS)</SelectItem>
        </SelectContent>
      </Select>

      {narration.mode === "recorded" && (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Audio URL</Label>
              <Input
                value={narration.audioUrl || ""}
                onChange={(e) => onChange({ ...narration, audioUrl: e.target.value, status: "ready" })}
                placeholder="https://… or upload"
              />
            </div>
            <ObjectUploader
              maxNumberOfFiles={1}
              maxFileSize={104857600 /* 100MB */}
              allowedFileTypes={["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/m4a", "audio/mp4"]}
              onGetUploadParameters={getUploadParameters}
              onComplete={async (r) => { const u = await finalizeUploaded(r); if (u) onChange({ ...narration, audioUrl: u, status: "ready" }); }}
              buttonVariant="outline"
            >
              <Upload className="h-4 w-4" aria-label="Upload narration audio" />
            </ObjectUploader>
          </div>
          {narration.audioUrl && <audio src={courseMediaUrl(courseId, narration.audioUrl)} controls className="w-full" />}
        </div>
      )}

      {narration.mode === "tts" && (
        <div className="space-y-2">
          <Label className="text-xs">Narration script (read aloud by the machine voice)</Label>
          <Textarea
            rows={3}
            value={narration.text || ""}
            onChange={(e) => onChange({ ...narration, text: e.target.value })}
            placeholder="Type the words to be narrated…"
          />
          <p className="text-xs text-muted-foreground">
            The script is also shown to learners as the narration transcript.
          </p>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Voice</Label>
            <Select value={narration.voice || DEFAULT_VOICE} onValueChange={(v) => onChange({ ...narration, voice: v })}>
              <SelectTrigger className="w-56" data-testid="select-tts-voice"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TTS_VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={generateTts} disabled={generating} data-testid="button-generate-tts">
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate narration (Azure TTS)
          </Button>
          {narration.audioUrl && <audio src={courseMediaUrl(courseId, narration.audioUrl)} controls className="w-full" />}
        </div>
      )}

      {narration.mode === "recorded" && (
        <div>
          <Label className="text-xs">Transcript (accessibility, optional)</Label>
          <Textarea
            rows={2}
            value={narration.text || ""}
            onChange={(e) => onChange({ ...narration, text: e.target.value })}
            placeholder="Shown to learners as a transcript"
          />
        </div>
      )}
    </div>
  );
}

export function SlideEditor({ value, courseId, onChange, initialActiveIdx }: {
  value: SlidesContent;
  courseId: string;
  onChange: (v: SlidesContent) => void;
  /** Jump to this slide index when first rendered (e.g. after a PPTX import). */
  initialActiveIdx?: number;
}) {
  const { toast } = useToast();
  const slides: Slide[] = normalizeSlides(value);
  const [activeIdx, setActiveIdx] = useState(initialActiveIdx ?? 0);
  const [bulkVoice, setBulkVoice] = useState(DEFAULT_VOICE);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const active = slides[Math.min(activeIdx, Math.max(0, slides.length - 1))];

  const commit = (next: Slide[]) => onChange({ slides: next });

  // Slides that have a narration script but no generated/uploaded audio yet.
  const pendingNarration = slides.filter(
    (s) => (s.narration?.text || "").trim() && !s.narration?.audioUrl,
  );

  const generateAllNarration = async () => {
    const targets = slides
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (s.narration?.text || "").trim() && !s.narration?.audioUrl);
    if (targets.length === 0) return;
    setBulkProgress({ done: 0, total: targets.length });
    const next = [...slides];
    let failures = 0;
    for (let k = 0; k < targets.length; k++) {
      const { s, i } = targets[k];
      try {
        const data = await requestTts(courseId, (s.narration!.text || "").trim(), s.narration?.voice || bulkVoice);
        next[i] = { ...next[i], narration: { ...next[i].narration!, mode: "tts", audioUrl: data.audioUrl, voice: data.voice, status: "ready" } };
        commit([...next]);
      } catch {
        failures++;
      }
      setBulkProgress({ done: k + 1, total: targets.length });
    }
    setBulkProgress(null);
    toast(
      failures
        ? { title: `Generated ${targets.length - failures}/${targets.length}`, description: `${failures} slide(s) failed`, variant: "destructive" }
        : { title: `Generated narration for ${targets.length} slide(s)` },
    );
  };

  const updateSlide = (idx: number, patch: Partial<Slide>) => {
    commit(slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const updateBlock = (slideIdx: number, blockIdx: number, b: SlideBlock) => {
    const s = slides[slideIdx];
    const blocks = s.blocks.map((x, i) => (i === blockIdx ? b : x));
    updateSlide(slideIdx, { blocks });
  };
  const addBlock = (type: string) => {
    updateSlide(activeIdx, { blocks: [...active.blocks, newBlock(type)] });
  };
  const removeBlock = (blockIdx: number) => {
    updateSlide(activeIdx, { blocks: active.blocks.filter((_, i) => i !== blockIdx) });
  };
  const moveBlock = (blockIdx: number, dir: -1 | 1) => {
    const target = blockIdx + dir;
    if (target < 0 || target >= active.blocks.length) return;
    const blocks = [...active.blocks];
    [blocks[blockIdx], blocks[target]] = [blocks[target], blocks[blockIdx]];
    updateSlide(activeIdx, { blocks });
  };
  const addSlide = () => {
    const next = [...slides, blankSlide(slides.length)];
    commit(next);
    setActiveIdx(next.length - 1);
  };
  const removeSlide = (idx: number) => {
    if (slides.length <= 1) return;
    const next = slides.filter((_, i) => i !== idx);
    commit(next);
    setActiveIdx(Math.max(0, idx - 1));
  };
  const moveSlide = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
    setActiveIdx(target);
  };

  if (slides.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">No slides yet.</p>
        <Button type="button" onClick={addSlide} data-testid="button-add-first-slide">
          <Plus className="h-4 w-4 mr-2" /> Add slide
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="slide-editor">
      {/* Deck-level narration toolbar */}
      {pendingNarration.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {pendingNarration.length} slide(s) have a script but no audio.
          </span>
          <Select value={bulkVoice} onValueChange={setBulkVoice}>
            <SelectTrigger className="w-52 h-8" data-testid="select-bulk-voice"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TTS_VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            type="button" variant="outline" size="sm"
            onClick={generateAllNarration}
            disabled={!!bulkProgress}
            data-testid="button-generate-all-narration"
          >
            {bulkProgress
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {bulkProgress.done}/{bulkProgress.total}</>
              : <><Sparkles className="h-4 w-4 mr-2" /> Generate all narration</>}
          </Button>
          <span className="text-xs text-muted-foreground">(voice applies to slides without their own)</span>
        </div>
      )}

      <div className="grid grid-cols-[180px_1fr] gap-3">
      {/* Slide list */}
      <div className="space-y-2">
        <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
          {slides.map((s, i) => {
            const heading = s.blocks.find((b) => b.type === "heading") as any;
            const label = heading?.text || `Slide ${i + 1}`;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`w-full text-left rounded-md border px-2 py-1.5 text-xs truncate ${i === activeIdx ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
                data-testid={`slide-tab-${i}`}
              >
                <span className="text-muted-foreground mr-1">{i + 1}.</span>{label}
              </button>
            );
          })}
        </div>
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addSlide} data-testid="button-add-slide">
          <Plus className="h-4 w-4 mr-1" /> Slide
        </Button>
      </div>

      {/* Active slide */}
      <div className="space-y-3 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Slide {activeIdx + 1} of {slides.length}</span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveSlide(activeIdx, -1)} disabled={activeIdx === 0} title="Move slide up" aria-label="Move slide up">
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveSlide(activeIdx, 1)} disabled={activeIdx >= slides.length - 1} title="Move slide down" aria-label="Move slide down">
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeSlide(activeIdx)} disabled={slides.length <= 1} title="Delete slide" aria-label="Delete slide">
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Blocks */}
        <div className="space-y-2">
          {active.blocks.map((b, bi) => {
            const meta = BLOCK_LABELS[b.type] || BLOCK_LABELS.text;
            const Icon = meta.icon;
            return (
              <div key={b.id} className="rounded-md border p-2 space-y-2" data-testid={`block-${bi}`}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {meta.label}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveBlock(bi, -1)} disabled={bi === 0} title="Move up" aria-label="Move block up">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveBlock(bi, 1)} disabled={bi >= active.blocks.length - 1} title="Move down" aria-label="Move block down">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeBlock(bi)} title="Delete block" aria-label="Delete block">
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <BlockEditor block={b} courseId={courseId} onChange={(nb) => updateBlock(activeIdx, bi, nb)} />
              </div>
            );
          })}
        </div>

        {/* Add block */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" data-testid="button-add-block">
              <Plus className="h-4 w-4 mr-1" /> Add block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.entries(BLOCK_LABELS).map(([type, meta]) => {
              const Icon = meta.icon;
              return (
                <DropdownMenuItem key={type} onClick={() => addBlock(type)}>
                  <Icon className="h-4 w-4 mr-2" /> {meta.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <NarrationPanel slide={active} courseId={courseId} onChange={(n) => updateSlide(activeIdx, { narration: n })} />
      </div>
      </div>
    </div>
  );
}
