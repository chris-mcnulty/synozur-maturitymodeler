/**
 * Shared authoring fields for course content editors.
 *
 * Extracted from SlideEditor so the lesson editor dialog (rich text, video,
 * audio lessons) and the slide editor use the same rich-text field,
 * upload-backed media inputs, and TTS plumbing.
 */
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bold, Italic, List, Link as LinkIcon, Upload } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";

export async function getUploadParameters() {
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
export async function finalizeUploaded(result: any): Promise<string | undefined> {
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
export const TTS_VOICES: { id: string; label: string }[] = [
  { id: "en-US-JennyNeural", label: "Jenny (US, female)" },
  { id: "en-US-AriaNeural", label: "Aria (US, female)" },
  { id: "en-US-GuyNeural", label: "Guy (US, male)" },
  { id: "en-US-DavisNeural", label: "Davis (US, male)" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK, female)" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK, male)" },
  { id: "en-AU-NatashaNeural", label: "Natasha (AU, female)" },
];
export const DEFAULT_VOICE = TTS_VOICES[0].id;

/** Request TTS narration for some text; returns the stored audio URL + voice. */
export async function requestTts(courseId: string, text: string, voice?: string): Promise<{ audioUrl: string; voice: string }> {
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
export function RichTextField({ value, onChange, placeholder, minHeight }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external `value` changes (e.g. edits made in the Advanced raw-JSON
  // textarea) into the DOM — but never while the field is focused: during
  // typing the DOM is the source of truth, and rewriting innerHTML would
  // clobber the cursor and any keystrokes not yet flushed through React.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

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
        style={minHeight ? { minHeight } : undefined}
        className="prose prose-sm dark:prose-invert max-w-none min-h-[80px] px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

export function MediaUrlInput({ label, url, onChange, fileTypes }: {
  label: string;
  url: string;
  onChange: (url: string) => void;
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
