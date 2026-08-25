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
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Trash, ChevronUp, ChevronDown, Image as ImageIcon, Video, Type, Heading,
  Lightbulb, Upload, Mic, Loader2, Sparkles, AlertTriangle, Eye, CheckCircle2,
} from "lucide-react";
import DOMPurify from "dompurify";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import {
  RichTextField, MediaUrlInput, getUploadParameters, finalizeUploaded,
  requestTts, TTS_VOICES, DEFAULT_VOICE,
} from "@/components/admin/editor-fields";
import {
  genId, blankSlide, normalizeSlides, courseMediaUrl, extractNarrationText,
  type Slide, type SlideBlock, type SlidesContent, type SlideNarrationMode,
} from "@shared/slides";

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
           <div>
             <Label className="text-xs">Caption (optional)</Label>
             <Input
               value={block.caption || ""}
               onChange={(e) => onChange({ ...block, caption: e.target.value })}
               placeholder="Describe the video for learners"
             />
           </div>
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
    case "video": return { id: genId(), type: "video", url: "", provider: "mp4", caption: "" };
    case "callout": return { id: genId(), type: "callout", tone: "info", html: "" };
    default: return { id: genId(), type: "text", html: "" };
  }
}

/**
 * NarrationPanel — always shows the transcript/script textarea regardless of
 * mode or whether audio has been generated. Supports:
 *   - Editable transcript/script visible at all times
 *   - Azure TTS generate/regenerate with stale-state indicator
 *   - Upload to replace generated or recorded audio
 *   - Same controls for every slide type
 */
function NarrationPanel({ slide, courseId, onChange, onGenerationResult, onGeneratingChange }: {
  slide: Slide;
  courseId: string;
  onChange: (n: Slide["narration"]) => void;
  onGenerationResult: (
    generationRequestId: string,
    expectedText: string,
    expectedVoice: string,
    patch: Partial<NonNullable<Slide["narration"]>>,
  ) => boolean;
  onGeneratingChange: (generating: boolean) => void;
}) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const narration: NonNullable<Slide["narration"]> =
    slide.narration ?? { mode: "none" as SlideNarrationMode };

  // Track whether the script changed after audio was last generated.
  // We store the text that was used to generate the current audioUrl in
  // narration.generatedFromText (written by generateTts below). If the
  // current text differs, flag as stale.
  const scriptText = (narration.text || "").trim();
  const hasAudio = Boolean(narration.audioUrl);
  const isStale = hasAudio && narration.mode === "tts" &&
    ((narration as any).generatedFromText ?? null) !== null &&
    (narration as any).generatedFromText !== scriptText;

  const generateTts = async () => {
    if (!scriptText) {
      toast({ title: "Add a narration script first", variant: "destructive" });
      return;
    }
    if (narration.approved !== true) {
      toast({ title: "Approve the narration script first", variant: "destructive" });
      return;
    }
    const requestVoice = narration.voice || DEFAULT_VOICE;
    const generationRequestId = genId("tts");
    setGenerating(true);
    onGeneratingChange(true);
    const pendingNarration = {
      ...narration,
      mode: "tts" as const,
      voice: requestVoice,
      status: "pending" as const,
      generationRequestId,
    };
    onChange(pendingNarration);
    try {
      const data = await requestTts(courseId, scriptText, requestVoice);
      const applied = onGenerationResult(generationRequestId, scriptText, requestVoice, {
        mode: "tts",
        audioUrl: data.audioUrl,
        voice: data.voice,
        status: "ready",
        generatedFromText: scriptText,
        generationRequestId: undefined,
      });
      if (!applied) {
        toast({
          title: "Narration changed while audio was generating",
          description: "The older audio was not attached. Review the current script and generate it again.",
        });
        return;
      }
      toast({ title: "Narration generated" });
    } catch (err: any) {
      onGenerationResult(generationRequestId, scriptText, requestVoice, {
        mode: "tts",
        status: "failed",
        generationRequestId: undefined,
      });
      toast({ title: "TTS failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
      onGeneratingChange(false);
    }
  };

  const handleScriptChange = (text: string) => {
    onChange({
      ...narration,
      text,
      approved: false,
      status: undefined,
      generationRequestId: undefined,
    });
  };

  const handleUploadComplete = async (r: any) => {
    const u = await finalizeUploaded(r);
    if (u) {
      onChange({
        ...narration,
        mode: "recorded",
        audioUrl: u,
        status: "ready",
        generationRequestId: undefined,
        // Clear generatedFromText so the stale indicator resets after upload.
        generatedFromText: undefined,
      });
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Narration</Label>
      </div>

      <Select
        value={narration.mode}
        onValueChange={(v) => onChange({
          ...narration,
          mode: v as SlideNarrationMode,
          status: undefined,
          generationRequestId: undefined,
        })}
      >
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="recorded">Recorded / uploaded audio</SelectItem>
          <SelectItem value="tts">Machine voice (Azure TTS)</SelectItem>
        </SelectContent>
      </Select>

      {/* Transcript / script — always visible regardless of mode or audio state */}
      <div className="space-y-1">
        <Label className="text-xs">
          {narration.mode === "tts"
            ? "Narration script (spoken by Azure TTS; also shown to learners as transcript)"
            : "Transcript (accessibility — shown to learners alongside audio)"}
        </Label>
        <Textarea
          rows={3}
          value={narration.text || ""}
          onChange={(e) => handleScriptChange(e.target.value)}
          placeholder={
            narration.mode === "tts"
              ? "Type the words to be narrated by Azure TTS…"
              : "Optional: type a transcript to show learners alongside the audio"
          }
          aria-label="Narration transcript or script"
        />
        {narration.mode === "tts" && (
          <p className="text-xs text-muted-foreground">
            The script is also shown to learners as the narration transcript.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => {
              const draft = extractNarrationText(slide);
              if (!draft) {
                toast({
                  title: "No visible text to draft",
                  description: "Add headings, text, captions, or accessibility text first.",
                });
                return;
              }
              onChange({
                ...narration,
                text: draft,
                approved: false,
                status: undefined,
                generationRequestId: undefined,
              });
            }}
            data-testid="button-draft-narration"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Draft from slide content
          </Button>
          {narration.text?.trim() && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={narration.approved === true}
                onCheckedChange={(checked) => onChange({
                  ...narration,
                  approved: checked === true,
                  status: undefined,
                  generationRequestId: undefined,
                })}
                data-testid="checkbox-approve-narration"
              />
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Script reviewed and approved
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Audio controls — shown when mode is tts or recorded */}
      {narration.mode !== "none" && (
        <div className="space-y-2">
          {/* Stale indicator */}
          {isStale && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Script changed — regenerate to update the audio.
            </div>
          )}
           {narration.status === "pending" && !generating && (
             <p className="text-xs text-muted-foreground">Narration is queued for generation.</p>
           )}
           {narration.status === "failed" && (
             <p className="text-xs text-destructive">Narration generation failed. Review the script and try again.</p>
           )}
           {narration.mode === "tts" && scriptText && narration.approved !== true && (
             <p className="text-xs text-muted-foreground">Review and approve the script before generating audio.</p>
           )}

          {/* Audio URL input + upload button (for recorded mode or to replace TTS audio) */}
          {narration.mode === "recorded" && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">Audio URL</Label>
                <Input
                  value={narration.audioUrl || ""}
                  onChange={(e) => onChange({
                    ...narration,
                    audioUrl: e.target.value,
                    status: "ready",
                    generatedFromText: undefined,
                    generationRequestId: undefined,
                  })}
                  placeholder="https://… or upload below"
                />
              </div>
            </div>
          )}

          {/* Voice selector for TTS mode */}
          {narration.mode === "tts" && (
            <div className="flex items-center gap-2">
              <Label className="text-xs">Voice</Label>
              <Select
                value={narration.voice || DEFAULT_VOICE}
                onValueChange={(v) => onChange({
                  ...narration,
                  voice: v,
                  status: undefined,
                  generationRequestId: undefined,
                })}
              >
                <SelectTrigger className="w-56" data-testid="select-tts-voice"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TTS_VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Generate / Regenerate Azure TTS button */}
          {narration.mode === "tts" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generateTts}
              disabled={generating || !scriptText || narration.approved !== true}
              data-testid="button-generate-tts"
            >
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {hasAudio ? "Regenerate narration (Azure TTS)" : "Generate narration (Azure TTS)"}
            </Button>
          )}

          {/* Upload button — available for both modes to replace audio with a recording */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {narration.mode === "tts" ? "Or replace with an uploaded recording:" : "Upload audio:"}
            </span>
            <ObjectUploader
              maxNumberOfFiles={1}
              maxFileSize={104857600 /* 100 MB */}
              allowedFileTypes={["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/m4a", "audio/mp4"]}
              onGetUploadParameters={getUploadParameters}
              onComplete={handleUploadComplete}
              buttonVariant="outline"
            >
              <Upload className="h-4 w-4 mr-1" aria-hidden="true" />
              Upload audio
            </ObjectUploader>
          </div>

          {/* Audio player */}
          {narration.audioUrl && (
            <audio
              src={courseMediaUrl(courseId, narration.audioUrl)}
              controls
              className="w-full"
              aria-label="Narration audio preview"
            />
          )}
        </div>
      )}
    </div>
  );
}

export function SlideEditor({ value, courseId, onChange, onGenerationStateChange, initialActiveIdx }: {
  value: SlidesContent;
  courseId: string;
  onChange: (v: SlidesContent) => void;
  onGenerationStateChange?: (generating: boolean) => void;
  /** Jump to this slide index when first rendered (e.g. after a PPTX import). */
  initialActiveIdx?: number;
}) {
  const { toast } = useToast();
  const slides: Slide[] = normalizeSlides(value);
  const latestValueRef = useRef(value);
  latestValueRef.current = value;
  const [activeIdx, setActiveIdx] = useState(initialActiveIdx ?? 0);
  const [bulkVoice, setBulkVoice] = useState(DEFAULT_VOICE);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const inFlightGenerationCount = useRef(0);
  const resolvedActiveIdx = Math.min(activeIdx, Math.max(0, slides.length - 1));
  const active = slides[resolvedActiveIdx];

  const reportGenerationState = (started: boolean) => {
    inFlightGenerationCount.current = Math.max(
      0,
      inFlightGenerationCount.current + (started ? 1 : -1),
    );
    onGenerationStateChange?.(inFlightGenerationCount.current > 0);
  };

  const currentSlides = () => normalizeSlides(latestValueRef.current);
  const commit = (next: Slide[]) => {
    const nextValue = { ...latestValueRef.current, slides: next };
    latestValueRef.current = nextValue;
    onChange(nextValue);
  };

  const updateSlide = (idx: number, patch: Partial<Slide>) => {
    const current = currentSlides();
    commit(current.map((slide, i) => (i === idx ? { ...slide, ...patch } : slide)));
  };

  const updateSlideById = (
    slideId: string,
    updater: (slide: Slide) => Slide | null,
  ): boolean => {
    const current = currentSlides();
    const idx = current.findIndex((slide) => slide.id === slideId);
    if (idx < 0) return false;
    const updated = updater(current[idx]);
    if (!updated) return false;
    const next = [...current];
    next[idx] = updated;
    commit(next);
    return true;
  };

  // Slides that have a narration script but no generated/uploaded audio yet.
  const pendingNarration = slides.filter(
    (s) =>
      (s.narration?.text || "").trim() &&
      s.narration?.approved === true &&
      !s.narration?.audioUrl,
  );

  const generateAllNarration = async () => {
    const targets = slides
      .filter((slide) =>
        (slide.narration?.text || "").trim() &&
        slide.narration?.approved === true &&
        !slide.narration?.audioUrl,
      )
      .map((slide) => ({
        slideId: slide.id,
        scriptText: (slide.narration?.text || "").trim(),
        voice: slide.narration?.voice || bulkVoice,
      }));
    if (targets.length === 0) return;
    setBulkProgress({ done: 0, total: targets.length });
    reportGenerationState(true);
    let failures = 0;
    let stale = 0;
    let firstFailureMessage = "";
    for (let k = 0; k < targets.length; k++) {
      const { slideId, scriptText, voice } = targets[k];
      const generationRequestId = genId("tts");
      const stillCurrent = updateSlideById(slideId, (slide) => {
        const currentNarration = slide.narration;
        if (
          (currentNarration?.text || "").trim() !== scriptText ||
          currentNarration?.approved !== true ||
          currentNarration?.audioUrl
        ) return null;
        return {
          ...slide,
          narration: {
            ...currentNarration,
            mode: "tts",
            voice,
            status: "pending",
            generationRequestId,
          },
        };
      });
      if (!stillCurrent) {
        stale++;
        setBulkProgress({ done: k + 1, total: targets.length });
        continue;
      }
      try {
        const data = await requestTts(courseId, scriptText, voice);
        const applied = updateSlideById(slideId, (slide) => {
          const currentNarration = slide.narration;
          if (
            (currentNarration?.text || "").trim() !== scriptText ||
            currentNarration?.voice !== voice ||
            currentNarration?.status !== "pending" ||
            currentNarration?.generationRequestId !== generationRequestId ||
            currentNarration?.approved !== true
          ) {
            return null;
          }
          return {
            ...slide,
            narration: {
              ...currentNarration,
              mode: "tts",
              audioUrl: data.audioUrl,
              voice: data.voice,
              status: "ready",
              generatedFromText: scriptText,
              generationRequestId: undefined,
            },
          };
        });
        if (!applied) stale++;
      } catch (error: any) {
        updateSlideById(slideId, (slide) => {
          const currentNarration = slide.narration;
          if (
            (currentNarration?.text || "").trim() !== scriptText ||
            currentNarration?.voice !== voice ||
            currentNarration?.status !== "pending" ||
            currentNarration?.generationRequestId !== generationRequestId ||
            currentNarration?.approved !== true
          ) {
            return null;
          }
          return {
            ...slide,
            narration: {
              ...currentNarration,
            mode: "tts",
              status: "failed",
              generationRequestId: undefined,
            },
          };
        });
        failures++;
        const message = error?.message || "Azure Speech generation failed.";
        if (!firstFailureMessage) firstFailureMessage = message;
        if (/Azure Speech is not configured/i.test(message)) {
          setBulkProgress(null);
          reportGenerationState(false);
          toast({
            title: "Azure Speech is not configured",
            description: message,
            variant: "destructive",
          });
          return;
        }
      }
      setBulkProgress({ done: k + 1, total: targets.length });
    }
    setBulkProgress(null);
    reportGenerationState(false);
    toast(
      failures
        ? {
            title: `Generated ${targets.length - failures - stale}/${targets.length}`,
            description: firstFailureMessage || `${failures} slide(s) failed`,
            variant: "destructive",
          }
        : stale
          ? {
              title: `Generated ${targets.length - stale}/${targets.length}`,
              description: `${stale} slide(s) changed during generation and were skipped.`,
            }
          : { title: `Generated narration for ${targets.length} slide(s)` },
    );
  };

  const updateBlock = (slideIdx: number, blockIdx: number, b: SlideBlock) => {
    const s = currentSlides()[slideIdx];
    if (!s) return;
    const blocks = s.blocks.map((x, i) => (i === blockIdx ? b : x));
    updateSlide(slideIdx, { blocks });
  };
  const addBlock = (type: string) => {
    updateSlide(resolvedActiveIdx, { blocks: [...active.blocks, newBlock(type)] });
  };
  const removeBlock = (blockIdx: number) => {
    updateSlide(resolvedActiveIdx, { blocks: active.blocks.filter((_, i) => i !== blockIdx) });
  };
  const moveBlock = (blockIdx: number, dir: -1 | 1) => {
    const target = blockIdx + dir;
    if (target < 0 || target >= active.blocks.length) return;
    const blocks = [...active.blocks];
    [blocks[blockIdx], blocks[target]] = [blocks[target], blocks[blockIdx]];
    updateSlide(resolvedActiveIdx, { blocks });
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
              : <><Sparkles className="h-4 w-4 mr-2" /> Generate all narration (Azure TTS)</>}
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
                className={`w-full text-left rounded-md border px-2 py-1.5 text-xs truncate ${i === resolvedActiveIdx ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
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
          <span className="text-sm font-medium">Slide {resolvedActiveIdx + 1} of {slides.length}</span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveSlide(resolvedActiveIdx, -1)} disabled={resolvedActiveIdx === 0} title="Move slide up" aria-label="Move slide up">
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveSlide(resolvedActiveIdx, 1)} disabled={resolvedActiveIdx >= slides.length - 1} title="Move slide down" aria-label="Move slide down">
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeSlide(resolvedActiveIdx)} disabled={slides.length <= 1} title="Delete slide" aria-label="Delete slide">
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
                <BlockEditor block={b} courseId={courseId} onChange={(nb) => updateBlock(resolvedActiveIdx, bi, nb)} />
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

        <NarrationPanel
          key={active.id}
          slide={active}
          courseId={courseId}
          onChange={(n) => updateSlideById(active.id, (slide) => ({ ...slide, narration: n }))}
          onGenerationResult={(generationRequestId, expectedText, expectedVoice, patch) =>
            updateSlideById(active.id, (slide) => {
              const latest = slide.narration;
              if (
                (latest?.text || "").trim() !== expectedText ||
                latest?.voice !== expectedVoice ||
                latest?.status !== "pending" ||
                latest?.generationRequestId !== generationRequestId ||
                latest?.approved !== true
              ) return null;
              return { ...slide, narration: { ...latest, ...patch } };
            })
          }
          onGeneratingChange={reportGenerationState}
        />
        <SlidePreview slide={active} courseId={courseId} />
      </div>
      </div>
    </div>
  );
}

function SlidePreview({ slide, courseId }: { slide: Slide; courseId: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3" data-testid="slide-preview">
      <div className="flex items-center gap-2 mb-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Live preview</span>
      </div>
      <div className="rounded-md bg-background border p-4 min-h-[120px]">
        {slide.blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a block to preview this slide.</p>
        ) : slide.blocks.map((block) => {
          switch (block.type) {
            case "heading":
              return <div key={block.id} className="font-semibold text-lg mb-3">{block.text || "Untitled heading"}</div>;
            case "text":
              return (
                <div
                  key={block.id}
                  className="prose prose-sm dark:prose-invert max-w-none mb-3"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.html || "") }}
                />
              );
            case "callout":
              return (
                <div
                  key={block.id}
                  className="rounded border-l-4 border-primary bg-primary/10 p-3 mb-3"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.html || "") }}
                />
              );
            case "image":
            case "image_slide":
              return block.url ? (
                <figure key={block.id} className="mb-3">
                  <img
                    src={courseMediaUrl(courseId, block.url)}
                    alt={block.alt || ""}
                    className="rounded max-w-full max-h-64 object-contain"
                  />
                  {block.type === "image" && block.caption && (
                    <figcaption className="text-xs text-muted-foreground mt-1">{block.caption}</figcaption>
                  )}
                </figure>
              ) : null;
            case "video":
              return block.url ? (
                <div key={block.id} className="mb-3">
                  <video
                    src={courseMediaUrl(courseId, block.url)}
                    poster={courseMediaUrl(courseId, block.poster)}
                    controls
                    className="w-full rounded"
                  />
                  {block.caption && <p className="text-xs text-muted-foreground mt-1">{block.caption}</p>}
                </div>
              ) : null;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
