import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Edit, Trash, Users, ChevronLeft, FileText, Save, Loader2, Upload, Download, X, ChevronDown, Share2, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ObjectUploader } from "@/components/ObjectUploader";
import { SlideEditor } from "@/components/admin/SlideEditor";
import { RichTextField, MediaUrlInput, requestTts, TTS_VOICES, DEFAULT_VOICE } from "@/components/admin/editor-fields";
import { useAuth } from "@/hooks/use-auth";
import type { Course, CourseModule, Lesson, CourseTag, LessonType, CourseEnrollment } from "@shared/schema";
import { genId, normalizeSlides, courseMediaUrl, type Slide, type SlidesContent } from "@shared/slides";

interface TenantShareRow {
  id: string;
  tenantId: string;
  tenantName: string;
  createdAt: string;
}

interface TenantOption {
  id: string;
  name: string;
}

interface CourseListItem extends Course {
  moduleCount: number;
  lessonCount: number;
  enrollmentCount: number;
  tags: CourseTag[];
}

interface CourseFull extends Course {
  modules: (CourseModule & { lessons: Lesson[] })[];
  tags: CourseTag[];
}

const LESSON_TYPE_OPTIONS: { value: LessonType; label: string }[] = [
  { value: "rich_text", label: "Rich text" },
  { value: "slides", label: "Slides" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "quiz", label: "Quiz" },
  { value: "attestation", label: "Attestation" },
  { value: "scorm", label: "SCORM package" },
];

export function CourseManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const listUrl = showArchived
    ? "/api/courses?manageable=true&includeArchived=true"
    : "/api/courses?manageable=true";
  const { data: courses, isLoading } = useQuery<CourseListItem[]>({
    queryKey: [listUrl],
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/courses/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses?manageable=true&includeArchived=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({ title: "Course archived", description: "Hidden from the catalog. Toggle 'Show archived' to see it, or set status back to 'draft' or 'published' to restore." });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (doc: unknown) =>
      apiRequest("/api/courses/import/json", "POST", doc),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses?manageable=true&includeArchived=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({
        title: "Course imported",
        description: `"${result.course.title}" created as draft with ${result.moduleCount} modules and ${result.lessonCount} lessons.`,
      });
      setEditingId(result.course.id);
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message ?? "Could not import course file.", variant: "destructive" });
    },
  });

  function handleExport(courseId: string, slug: string) {
    const a = document.createElement("a");
    a.href = `/api/courses/${courseId}/export/json`;
    a.download = `${slug}.orion-course.json`;
    a.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const text = await file.text();
      const doc = JSON.parse(text);
      importMutation.mutate(doc);
    } catch {
      toast({ title: "Invalid file", description: "Could not read the selected file as JSON.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  if (editingId) {
    return <CourseBuilder courseId={editingId} onClose={() => setEditingId(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input for import */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json,.orion-course.json"
        className="hidden"
        onChange={handleImportFile}
        data-testid="input-import-course-file"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-courses-admin-heading">Learning Courses</h2>
          <p className="text-muted-foreground text-sm">Author courses, modules, and lessons.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
              data-testid="switch-show-archived-courses"
            />
            <Label htmlFor="toggle-show-archived" className="cursor-pointer">Show archived</Label>
          </div>
          <Button
            variant="outline"
            onClick={() => importFileRef.current?.click()}
            disabled={importing || importMutation.isPending}
            data-testid="button-import-course"
          >
            {importing || importMutation.isPending
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Upload className="h-4 w-4 mr-1" />}
            Import
          </Button>
          <Button onClick={() => setCreating(true)} data-testid="button-new-course">
            <Plus className="h-4 w-4 mr-1" /> New course
          </Button>
        </div>
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}

      {!isLoading && (!courses || courses.length === 0) && (
        <Card><CardContent className="pt-6 text-muted-foreground" data-testid="text-no-courses-admin">No courses yet. Create one to get started.</CardContent></Card>
      )}

      {!isLoading && courses && courses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {courses.map(c => (
            <Card
              key={c.id}
              className={`hover-elevate ${c.status === "archived" ? "opacity-60" : ""}`}
              data-testid={`card-admin-course-${c.id}`}
            >
              {c.imageUrl && (
                <div className="aspect-video w-full overflow-hidden rounded-t-md">
                  <img
                    src={c.imageUrl}
                    alt={c.title}
                    className="w-full h-full object-cover"
                    data-testid={`img-admin-course-${c.id}`}
                  />
                </div>
              )}
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate" data-testid={`text-admin-course-title-${c.id}`}>{c.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">/{c.slug}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge
                      variant={c.status === "published" ? "default" : c.status === "archived" ? "destructive" : "secondary"}
                      data-testid={`badge-status-${c.id}`}
                    >
                      {c.status}
                    </Badge>
                    <Badge variant="outline">{c.visibility}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
                  <span>{c.moduleCount} modules</span>
                  <span>{c.lessonCount} lessons</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.enrollmentCount}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingId(c.id)} data-testid={`button-edit-course-${c.id}`}>
                    <Edit className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport(c.id, c.slug)}
                    data-testid={`button-export-course-json-${c.id}`}
                    title="Export as .orion-course.json"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Archive "${c.title}"? It will be hidden from the catalog but can be restored.`)) archiveMutation.mutate(c.id);
                    }}
                    data-testid={`button-archive-course-${c.id}`}
                  >
                    <Trash className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <CreateCourseDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setEditingId(id); }}
        />
      )}
    </div>
  );
}

function CreateCourseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

  const createMutation = useMutation({
    mutationFn: async () => {
      const finalSlug = slug || slugify(title);
      return await apiRequest("/api/courses", "POST", {
        title, slug: finalSlug, summary, description: summary,
      });
    },
    onSuccess: (course: Course) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({ title: "Course created" });
      onCreated(course.id);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
          <DialogDescription>Start with a title — you can add modules and lessons next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="course-title">Title</Label>
            <Input
              id="course-title"
              value={title}
              onChange={e => { setTitle(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }}
              data-testid="input-new-course-title"
            />
          </div>
          <div>
            <Label htmlFor="course-slug">Slug</Label>
            <Input id="course-slug" value={slug} onChange={e => setSlug(slugify(e.target.value))} data-testid="input-new-course-slug" />
            <p className="text-xs text-muted-foreground mt-1">URL: /courses/{slug || "your-slug"}</p>
          </div>
          <div>
            <Label htmlFor="course-summary">Summary</Label>
            <Textarea id="course-summary" value={summary} onChange={e => setSummary(e.target.value)} data-testid="input-new-course-summary" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!title || !slug || createMutation.isPending}
            data-testid="button-create-course-submit"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseBuilder({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: course, isLoading } = useQuery<CourseFull>({
    queryKey: ["/api/courses", courseId],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const { data: enrollments } = useQuery<(CourseEnrollment & { user: { name: string | null; email: string | null; username: string } })[]>({
    queryKey: ["/api/courses", courseId, "enrollments"],
    refetchOnWindowFocus: false,
  });
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [creatingLessonInModule, setCreatingLessonInModule] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "structure" | "enrollments">("overview");

  const updateCourse = useMutation({
    mutationFn: async (patch: Partial<Course>) => apiRequest(`/api/courses/${courseId}`, "PUT", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({ title: "Saved" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const createModule = useMutation({
    mutationFn: async (title: string) => apiRequest(`/api/courses/${courseId}/modules`, "POST", {
      title, order: course?.modules.length ?? 0,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] }),
  });

  const deleteModule = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/course-modules/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] }),
  });

  const deleteLesson = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/lessons/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] }),
  });

  if (isLoading || !course) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-back-to-courses-list"><ChevronLeft className="h-4 w-4 mr-1" /> All courses</Button>
        <h2 className="text-xl font-bold flex-1">{course.title}</h2>
        <Badge>{course.status}</Badge>
      </div>

      <div className="flex gap-2 border-b">
        {(["overview", "structure", "enrollments"] as const).map(t => (
          <Button
            key={t}
            variant="ghost"
            size="sm"
            className={tab === t ? "border-b-2 border-primary rounded-none" : ""}
            onClick={() => setTab(t)}
            data-testid={`tab-course-${t}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      {tab === "overview" && (
        <CourseOverview
          course={course}
          onSave={(patch) => updateCourse.mutate(patch)}
          saving={updateCourse.isPending}
        />
      )}

      {tab === "structure" && (
        <div className="space-y-3">
          <Card>
            <CardContent className="pt-6">
              <Button
                onClick={() => {
                  const t = prompt("Module title:");
                  if (t) createModule.mutate(t);
                }}
                data-testid="button-add-module"
              >
                <Plus className="h-4 w-4 mr-1" /> Add module
              </Button>
            </CardContent>
          </Card>
          {course.modules.map((mod, mi) => (
            <Card key={mod.id} data-testid={`card-builder-module-${mod.id}`}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Module {mi + 1}: {mod.title}</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Delete module "${mod.title}" and all its lessons?`)) deleteModule.mutate(mod.id);
                    }}
                    data-testid={`button-delete-module-${mod.id}`}
                  >
                    <Trash className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mod.lessons.map((l, li) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`row-lesson-${l.id}`}>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{li + 1}. {l.title}</div>
                          <div className="text-xs text-muted-foreground capitalize">{l.type.replace("_", " ")}</div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditingLesson(l)} data-testid={`button-edit-lesson-${l.id}`}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (confirm(`Delete lesson "${l.title}"?`)) deleteLesson.mutate(l.id);
                          }}
                          data-testid={`button-delete-lesson-${l.id}`}
                        >
                          <Trash className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreatingLessonInModule(mod.id)}
                    data-testid={`button-add-lesson-${mod.id}`}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add lesson
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "enrollments" && (
        <Card>
          <CardContent className="pt-6">
            {!enrollments || enrollments.length === 0 ? (
              <p className="text-muted-foreground" data-testid="text-no-enrollments">No enrollments yet.</p>
            ) : (
              <div className="space-y-2">
                {enrollments.map(e => (
                  <div key={e.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`row-enrollment-${e.id}`}>
                    <div>
                      <div className="font-medium">{e.user.name || e.user.username}</div>
                      <div className="text-xs text-muted-foreground">{e.user.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{e.status}</Badge>
                      <span className="text-sm">{e.progressPercent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(editingLesson || creatingLessonInModule) && (
        <LessonEditorDialog
          courseId={courseId}
          moduleId={creatingLessonInModule ?? editingLesson!.moduleId}
          lesson={editingLesson}
          existingCount={course.modules.find(m => m.id === (creatingLessonInModule ?? editingLesson!.moduleId))?.lessons.length ?? 0}
          onClose={() => { setEditingLesson(null); setCreatingLessonInModule(null); }}
        />
      )}
    </div>
  );
}

function CourseOverview({ course, onSave, saving }: { course: CourseFull; onSave: (patch: any) => void; saving: boolean }) {
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === "global_admin";
  const { toast } = useToast();
  const [title, setTitle] = useState(course.title);
  const [summary, setSummary] = useState(course.summary || "");
  const [description, setDescription] = useState(course.description);
  const [estimatedMinutes, setEstimatedMinutes] = useState(course.estimatedMinutes?.toString() || "");
  const [status, setStatus] = useState(course.status);
  const [visibility, setVisibility] = useState(course.visibility);
  const [passingScore, setPassingScore] = useState(course.passingScore?.toString() || "80");
  const [certificateEnabled, setCertificateEnabled] = useState(course.certificateEnabled);
  const [showTenantShare, setShowTenantShare] = useState(false);

  useEffect(() => {
    setTitle(course.title);
    setSummary(course.summary || "");
    setDescription(course.description);
    setEstimatedMinutes(course.estimatedMinutes?.toString() || "");
    setStatus(course.status);
    setVisibility(course.visibility);
    setPassingScore(course.passingScore?.toString() || "80");
    setCertificateEnabled(course.certificateEnabled);
  }, [course.id]);

  const uploadImage = useMutation({
    mutationFn: async (imageUrl: string) =>
      apiRequest(`/api/courses/${course.id}/image`, "PUT", { imageUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses?manageable=true&includeArchived=true"] });
      toast({ title: "Image uploaded" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const removeImage = useMutation({
    mutationFn: async () => apiRequest(`/api/courses/${course.id}`, "PUT", { imageUrl: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses?manageable=true&includeArchived=true"] });
      toast({ title: "Image removed" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const handleGetUploadParameters = async () => {
    const res = await fetch("/api/objects/upload", { method: "POST", credentials: "include" });
    const data = await res.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };

  const handleUploadComplete = (result: any) => {
    const url = result?.successful?.[0]?.uploadURL;
    if (url) uploadImage.mutate(url);
  };

  const handleSave = () => {
    onSave({
      title, summary: summary || null, description,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : null,
      status, visibility,
      passingScore: parseInt(passingScore, 10),
      certificateEnabled,
    });
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ov-title">Title</Label>
            <Input id="ov-title" value={title} onChange={e => setTitle(e.target.value)} data-testid="input-overview-title" />
          </div>
          <div>
            <Label htmlFor="ov-minutes">Estimated minutes</Label>
            <Input id="ov-minutes" type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(e.target.value)} data-testid="input-overview-minutes" />
          </div>
          <div>
            <Label htmlFor="ov-status">Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as any)}>
              <SelectTrigger id="ov-status" data-testid="select-overview-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ov-visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={v => setVisibility(v as any)}
              disabled={!isGlobalAdmin}
            >
              <SelectTrigger id="ov-visibility" data-testid="select-overview-visibility"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private (tenant-only)</SelectItem>
              </SelectContent>
            </Select>
            {!isGlobalAdmin && (
              <p className="text-xs text-muted-foreground mt-1">Only global admins can change visibility.</p>
            )}
          </div>
          <div>
            <Label htmlFor="ov-passing">Passing score (0-100)</Label>
            <Input id="ov-passing" type="number" min={0} max={100} value={passingScore} onChange={e => setPassingScore(e.target.value)} data-testid="input-overview-passing" />
          </div>
        </div>

        {/* Hero image */}
        <div>
          <Label>Hero image</Label>
          <p className="text-sm text-muted-foreground mb-2">
            Upload an image for this course (recommended: 1200px+ width, 16:9 aspect ratio, under 10MB).
          </p>
          {course.imageUrl ? (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden border border-border max-w-md">
                <img src={course.imageUrl} alt={course.title} className="w-full h-48 object-cover" data-testid="img-course-hero" />
              </div>
              <div className="flex gap-2">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10485760}
                  allowedFileTypes={["image/jpeg", "image/png", "image/webp"]}
                  onGetUploadParameters={handleGetUploadParameters}
                  onComplete={handleUploadComplete}
                  buttonVariant="outline"
                >
                  <Upload className="h-4 w-4 mr-2" /> Replace image
                </ObjectUploader>
                <Button
                  variant="outline"
                  onClick={() => removeImage.mutate()}
                  disabled={removeImage.isPending}
                  data-testid="button-remove-course-image"
                >
                  <X className="h-4 w-4 mr-2" />
                  {removeImage.isPending ? "Removing..." : "Remove"}
                </Button>
              </div>
            </div>
          ) : (
            <ObjectUploader
              maxNumberOfFiles={1}
              maxFileSize={10485760}
              allowedFileTypes={["image/jpeg", "image/png", "image/webp"]}
              onGetUploadParameters={handleGetUploadParameters}
              onComplete={handleUploadComplete}
            >
              <Upload className="h-4 w-4 mr-2" /> Upload image
            </ObjectUploader>
          )}
        </div>

        <div>
          <Label htmlFor="ov-summary">Summary (catalog blurb)</Label>
          <Textarea id="ov-summary" value={summary} onChange={e => setSummary(e.target.value)} data-testid="input-overview-summary" />
        </div>
        <div>
          <Label htmlFor="ov-description">Description</Label>
          <Textarea id="ov-description" value={description} rows={6} onChange={e => setDescription(e.target.value)} data-testid="input-overview-description" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="cert" checked={certificateEnabled} onCheckedChange={setCertificateEnabled} data-testid="switch-overview-certificate" />
          <Label htmlFor="cert">Certificate on completion (PDF generation TBD)</Label>
        </div>

        {/* Tenant share — only when private */}
        {visibility === "private" && (
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">Tenant access</p>
                <p className="text-sm text-muted-foreground">
                  Share this private course with selected customer tenants beyond its owner.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowTenantShare(true)}
                disabled={!isGlobalAdmin}
                data-testid="button-manage-course-tenants"
              >
                <Share2 className="h-4 w-4 mr-1" /> Manage tenants
              </Button>
            </div>
            {!isGlobalAdmin && (
              <p className="text-xs text-muted-foreground mt-2">Only global admins can attach courses to other tenants.</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-overview">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = `/api/courses/${course.id}/scorm/export`;
            }}
            data-testid="button-export-scorm"
          >
            <Download className="h-4 w-4 mr-1" /> Export SCORM 1.2
          </Button>
        </div>

        {showTenantShare && (
          <CourseTenantShareDialog
            courseId={course.id}
            onClose={() => setShowTenantShare(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CourseTenantShareDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: assigned, isLoading } = useQuery<TenantShareRow[]>({
    queryKey: [`/api/courses/${courseId}/tenants`],
  });
  const { data: tenants } = useQuery<TenantOption[]>({
    queryKey: ["/api/model-tenants"],
  });

  const addMut = useMutation({
    mutationFn: async (tenantId: string) =>
      apiRequest(`/api/courses/${courseId}/tenants`, "POST", { tenantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/courses/${courseId}/tenants`] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });
  const removeMut = useMutation({
    mutationFn: async (tenantId: string) =>
      apiRequest(`/api/courses/${courseId}/tenants/${tenantId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/courses/${courseId}/tenants`] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const assignedIds = new Set((assigned ?? []).map(a => a.tenantId));
  const sortedTenants = (tenants ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Course tenant access</DialogTitle>
          <DialogDescription>
            Select which tenants can access this private course. Tenants here are in addition to the course's owning tenant.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between" data-testid="select-course-tenants">
                {assignedIds.size === 0
                  ? "Select tenants"
                  : `${assignedIds.size} tenant${assignedIds.size > 1 ? "s" : ""} selected`}
                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[440px]">
              {sortedTenants.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">No tenants available</div>
              ) : (
                sortedTenants.map(t => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={assignedIds.has(t.id)}
                    onCheckedChange={(checked) => {
                      if (checked) addMut.mutate(t.id);
                      else removeMut.mutate(t.id);
                    }}
                    data-testid={`checkbox-course-tenant-${t.id}`}
                  >
                    {t.name}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LessonEditorDialog({
  courseId, moduleId, lesson, existingCount, onClose,
}: {
  courseId: string;
  moduleId: string;
  lesson: Lesson | null;
  existingCount: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(lesson?.title || "");
  const [type, setType] = useState<LessonType>((lesson?.type as LessonType) || "rich_text");
  const [contentJson, setContentJson] = useState(JSON.stringify(lesson?.content ?? defaultContentFor("rich_text"), null, 2));
  const [required, setRequired] = useState(lesson?.required ?? true);
  const [scormUploading, setScormUploading] = useState(false);
  const [pptxImporting, setPptxImporting] = useState(false);
  const [slideEditorInitialIdx, setSlideEditorInitialIdx] = useState<number | undefined>(undefined);

  const handlePptxImport = async (file: File) => {
    setPptxImporting(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/slides/pptx-import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
        body: file,
      });

      // Guard against non-JSON responses (e.g. a proxy timeout returning HTML).
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const status = res.status;
        throw new Error(
          status >= 500 || status === 0
            ? "The server timed out converting the file. Try a smaller PowerPoint (fewer slides or lower-resolution images)."
            : `Import failed (HTTP ${status}).`,
        );
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const existing = (() => { try { return normalizeSlides(JSON.parse(contentJson)); } catch { return []; } })();
      const importedSlides: Slide[] = data.slides || [];
      const merged = { slides: [...existing, ...importedSlides] };
      setContentJson(JSON.stringify(merged, null, 2));
      // Jump the editor to the first newly added slide so the user can see them.
      if (importedSlides.length > 0) setSlideEditorInitialIdx(existing.length);
      toast({
        title: "PowerPoint imported",
        description: `${importedSlides.length} slide${importedSlides.length === 1 ? "" : "s"} added — use the slide list on the left to navigate.`,
      });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setPptxImporting(false);
    }
  };

  const handleScormUpload = async (file: File) => {
    setScormUploading(true);
    try {
      const res = await fetch(
        `/api/scorm/import?courseId=${encodeURIComponent(courseId)}&fileName=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/zip" },
          body: file,
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      // Patch the JSON content with the new package details so the
      // lesson is wired up automatically without making the author
      // remember the JSON shape.
      const next = {
        packageId: data.packageId,
        entryPoint: data.entryPoint,
        version: data.scormVersion,
      };
      setContentJson(JSON.stringify(next, null, 2));
      if (!title && data.title) setTitle(data.title);
      toast({ title: "SCORM package uploaded", description: `Entry point: ${data.entryPoint}` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setScormUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let content: any;
      try { content = JSON.parse(contentJson); }
      catch { throw new Error("Invalid JSON in content"); }
      const body = { title, type, content, required, moduleId, order: lesson?.order ?? existingCount };
      if (lesson) return await apiRequest(`/api/lessons/${lesson.id}`, "PUT", body);
      return await apiRequest(`/api/course-modules/${moduleId}/lessons`, "POST", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
      toast({ title: "Saved" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const handleTypeChange = (t: LessonType) => {
    setType(t);
    // Replace default content if user hasn't customized
    setContentJson(JSON.stringify(defaultContentFor(t), null, 2));
  };

  // For `slides`, drive a structured editor and keep `contentJson` (the saved
  // payload) in sync. Falls back to an empty slide set if the JSON is invalid.
  const slidesValue: SlidesContent = (() => {
    if (type !== "slides") return { slides: [] };
    try { return { slides: normalizeSlides(JSON.parse(contentJson)) }; }
    catch { return { slides: [] }; }
  })();

  // All other types drive structured editors off the parsed payload, writing
  // back through `contentJson` so save/raw-JSON editing stay in sync.
  const parsedContent: any = (() => {
    try { return JSON.parse(contentJson) ?? {}; } catch { return {}; }
  })();
  const patchContent = (patch: Record<string, any>) => {
    // Functional update: merge into the *latest* payload rather than the
    // render-time `parsedContent` snapshot, so rapid/batched patches from
    // different fields can't overwrite each other.
    setContentJson(prev => {
      let base: any;
      try { base = JSON.parse(prev) ?? {}; } catch { base = {}; }
      return JSON.stringify({ ...base, ...patch }, null, 2);
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className={`${type === "slides" ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>{lesson ? "Edit lesson" : "New lesson"}</DialogTitle>
          <DialogDescription>
            Configure the lesson's title, type, and content.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ld-title">Title</Label>
            <Input id="ld-title" value={title} onChange={e => setTitle(e.target.value)} data-testid="input-lesson-title" />
          </div>
          <div>
            <Label htmlFor="ld-type">Type</Label>
            <Select value={type} onValueChange={v => handleTypeChange(v as LessonType)}>
              <SelectTrigger id="ld-type" data-testid="select-lesson-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LESSON_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "scorm" && (
            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-sm">Upload SCORM package (.zip)</Label>
              <p className="text-xs text-muted-foreground">
                Uploads the .zip, parses imsmanifest.xml, and wires the lesson to the new package.
                SCORM 1.2 and 2004 are both supported.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleScormUpload(f);
                    e.target.value = "";
                  }}
                  disabled={scormUploading}
                  data-testid="input-scorm-upload"
                  className="max-w-md"
                />
                {scormUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {!scormUploading && <Upload className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          )}
          {type === "slides" ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label>Slides</Label>
                  <p className="text-xs text-muted-foreground">
                    Build slides from content blocks. Import PowerPoint to add <strong>all slides</strong> from a .pptx deck at once.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pptxImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pptxImporting}
                    onClick={() => document.getElementById("pptx-import-input")?.click()}
                    data-testid="button-import-pptx"
                  >
                    <Upload className="h-4 w-4 mr-2" /> Import PowerPoint
                  </Button>
                  <input
                    id="pptx-import-input"
                    type="file"
                    accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePptxImport(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={!title || saveMutation.isPending}
                    data-testid="button-save-lesson-slides"
                  >
                    {saveMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Save className="h-4 w-4 mr-2" />}
                    Save
                  </Button>
                </div>
              </div>
              <SlideEditor
                value={slidesValue}
                courseId={courseId}
                onChange={(v) => setContentJson(JSON.stringify(v, null, 2))}
                initialActiveIdx={slideEditorInitialIdx}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {type === "rich_text" && (
                <div>
                  <Label>Content</Label>
                  <RichTextField
                    key={lesson?.id ?? "new"}
                    value={parsedContent.html || ""}
                    onChange={(html) => patchContent({ html })}
                    placeholder="Write the lesson content…"
                    minHeight={220}
                  />
                </div>
              )}
              {type === "video" && (
                <VideoLessonFields content={parsedContent} courseId={courseId} onPatch={patchContent} />
              )}
              {type === "audio" && (
                <AudioLessonFields content={parsedContent} courseId={courseId} onPatch={patchContent} />
              )}
              {type === "quiz" && (
                <QuizLessonFields content={parsedContent} onChange={(c) => setContentJson(JSON.stringify(c, null, 2))} />
              )}
              {type === "attestation" && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="att-statement">Attestation statement</Label>
                    <Textarea
                      id="att-statement"
                      rows={4}
                      value={parsedContent.statement || ""}
                      onChange={e => patchContent({ statement: e.target.value })}
                      placeholder="I attest I have read and understood this material."
                      data-testid="input-attestation-statement"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Learners type their full name to sign this statement.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="att-typed"
                      checked={parsedContent.requireTyped ?? true}
                      onCheckedChange={(v) => patchContent({ requireTyped: v })}
                      data-testid="switch-attestation-typed"
                    />
                    <Label htmlFor="att-typed">Require typed signature</Label>
                  </div>
                </div>
              )}
              {type === "scorm" && (
                <div className="rounded-md border p-3 text-sm">
                  {parsedContent.packageId ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <dt className="text-muted-foreground">Package</dt>
                      <dd className="font-mono text-xs break-all">{parsedContent.packageId}</dd>
                      <dt className="text-muted-foreground">Entry point</dt>
                      <dd className="font-mono text-xs">{parsedContent.entryPoint}</dd>
                      <dt className="text-muted-foreground">SCORM version</dt>
                      <dd>{parsedContent.version}</dd>
                    </dl>
                  ) : (
                    <p className="text-muted-foreground">
                      No package yet — upload a SCORM .zip above and the lesson is wired up automatically.
                    </p>
                  )}
                </div>
              )}
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer select-none">
                  Advanced: edit raw JSON
                </summary>
                <Textarea
                  id="ld-content"
                  rows={10}
                  value={contentJson}
                  onChange={e => setContentJson(e.target.value)}
                  className="font-mono text-xs mt-2"
                  data-testid="textarea-lesson-content"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {contentHelpFor(type)}
                </p>
              </details>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="ld-req" checked={required} onCheckedChange={setRequired} data-testid="switch-lesson-required" />
            <Label htmlFor="ld-req">Required for course completion</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!title || saveMutation.isPending} data-testid="button-save-lesson">
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** URL + upload + provider + preview for `video` lessons. */
function VideoLessonFields({ content, courseId, onPatch }: {
  content: any;
  courseId: string;
  onPatch: (patch: Record<string, any>) => void;
}) {
  const url: string = content.videoUrl || "";
  const isEmbed = content.provider === "youtube" || content.provider === "vimeo" ||
    /youtube\.com|youtu\.be|vimeo\.com/.test(url);
  return (
    <div className="space-y-2">
      <MediaUrlInput
        label="Video URL (MP4) or YouTube/Vimeo link"
        url={url}
        onChange={(videoUrl) => onPatch({ videoUrl })}
        fileTypes={["video/mp4", "video/webm"]}
      />
      <Select value={content.provider || "mp4"} onValueChange={(v) => onPatch({ provider: v })}>
        <SelectTrigger className="w-40" data-testid="select-video-provider"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="mp4">MP4 (hosted)</SelectItem>
          <SelectItem value="youtube">YouTube</SelectItem>
          <SelectItem value="vimeo">Vimeo</SelectItem>
        </SelectContent>
      </Select>
      <div>
        <Label className="text-xs">Description (optional, shown above the player)</Label>
        <Input
          value={content.description || ""}
          onChange={(e) => onPatch({ description: e.target.value })}
          data-testid="input-video-description"
        />
      </div>
      {url && !isEmbed && (
        <video src={courseMediaUrl(courseId, url)} controls className="w-full max-h-64 rounded-md border" />
      )}
      {url && isEmbed && (
        <p className="text-xs text-muted-foreground">Embedded player — learners see the YouTube/Vimeo player.</p>
      )}
    </div>
  );
}

/** URL + upload + TTS generation + preview for `audio` lessons. */
function AudioLessonFields({ content, courseId, onPatch }: {
  content: any;
  courseId: string;
  onPatch: (patch: Record<string, any>) => void;
}) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const url: string = content.audioUrl || "";

  const generate = async () => {
    const text = (content.transcript || "").trim();
    if (!text) {
      toast({ title: "Add a script first", description: "Type the words to be narrated, then generate.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const data = await requestTts(courseId, text, content.voice || DEFAULT_VOICE);
      onPatch({ audioUrl: data.audioUrl, voice: data.voice });
      toast({ title: "Audio generated" });
    } catch (err: any) {
      toast({ title: "TTS failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      <MediaUrlInput
        label="Audio URL (MP3/WAV) or upload"
        url={url}
        onChange={(audioUrl) => onPatch({ audioUrl })}
        fileTypes={["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/m4a", "audio/mp4"]}
      />
      {url && <audio src={courseMediaUrl(courseId, url)} controls className="w-full" />}
      <div>
        <Label className="text-xs">Description (optional, shown above the player)</Label>
        <Input
          value={content.description || ""}
          onChange={(e) => onPatch({ description: e.target.value })}
          data-testid="input-audio-description"
        />
      </div>
      <div className="rounded-md border p-3 space-y-2">
        <Label className="text-xs font-medium">Or generate the audio from a script (machine voice)</Label>
        <Textarea
          rows={3}
          value={content.transcript || ""}
          onChange={(e) => onPatch({ transcript: e.target.value })}
          placeholder="Type the words to be narrated…"
          data-testid="input-audio-script"
        />
        <div className="flex items-center gap-2">
          <Select value={content.voice || DEFAULT_VOICE} onValueChange={(v) => onPatch({ voice: v })}>
            <SelectTrigger className="w-56" data-testid="select-audio-voice"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TTS_VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={generate} disabled={generating} data-testid="button-generate-audio">
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate audio
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Normalize the freeform quiz payload into a single editable shape. Accepts
 * both naming conventions the platform supports (`options`/`answers`,
 * `correctIds`/`correctAnswerIds`/`correctAnswerId`) — the same ones the
 * server-side grader in course-service understands.
 */
function normalizeQuizContent(raw: any): { passingScore: number; questions: any[] } {
  const questions = Array.isArray(raw?.questions) ? raw.questions : [];
  return {
    passingScore: typeof raw?.passingScore === "number" ? raw.passingScore : 70,
    questions: questions.map((q: any, i: number) => {
      const choices = Array.isArray(q?.answers) ? q.answers : Array.isArray(q?.options) ? q.options : [];
      const answers = choices.map((a: any, j: number) => ({ ...a, id: a?.id || `a${i + 1}_${j + 1}`, text: a?.text ?? "" }));
      const multi = q?.correctIds ?? q?.correctAnswerIds;
      const correctIds: string[] = Array.isArray(multi) ? multi : q?.correctAnswerId ? [q.correctAnswerId] : [];
      const isMultiple = q?.type === "multiple" || (Array.isArray(multi) && multi.length > 1);
      return { ...q, id: q?.id || `q${i + 1}`, text: q?.text ?? "", answers, correctIds, isMultiple };
    }),
  };
}

/** Inverse of `normalizeQuizContent`: emit the saved quiz payload. */
function serializeQuizContent(value: { passingScore: number; questions: any[] }): any {
  return {
    passingScore: value.passingScore,
    questions: value.questions.map((q) => {
      const {
        correctIds, isMultiple,
        options: _opts, correctAnswerIds: _cai, correctAnswerId: _ca, type: _type,
        ...rest
      } = q;
      return {
        ...rest,
        ...(isMultiple
          ? { type: "multiple", correctAnswerIds: correctIds }
          : { correctAnswerId: correctIds[0] || "" }),
      };
    }),
  };
}

/** Structured question/answer builder for `quiz` lessons. */
function QuizLessonFields({ content, onChange }: {
  content: any;
  onChange: (content: any) => void;
}) {
  const quiz = normalizeQuizContent(content);
  const commit = (next: { passingScore: number; questions: any[] }) => onChange(serializeQuizContent(next));
  const updateQuestion = (qi: number, patch: Record<string, any>) => {
    commit({ ...quiz, questions: quiz.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  };

  const toggleCorrect = (q: any, qi: number, answerId: string, on: boolean) => {
    if (!q.isMultiple) {
      updateQuestion(qi, { correctIds: on ? [answerId] : [] });
      return;
    }
    const next = on
      ? Array.from(new Set([...q.correctIds, answerId]))
      : q.correctIds.filter((id: string) => id !== answerId);
    updateQuestion(qi, { correctIds: next });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="quiz-passing" className="text-xs">Passing score (%)</Label>
        <Input
          id="quiz-passing"
          type="number"
          min={0}
          max={100}
          className="w-28"
          value={quiz.passingScore}
          onChange={(e) => commit({ ...quiz, passingScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          data-testid="input-quiz-passing-score"
        />
      </div>
      {quiz.questions.map((q, qi) => (
        <div key={q.id} className="rounded-md border p-3 space-y-2" data-testid={`quiz-question-${qi}`}>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Question {qi + 1}</Label>
            <Button
              type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
              onClick={() => commit({ ...quiz, questions: quiz.questions.filter((_, i) => i !== qi) })}
              title="Delete question" aria-label={`Delete question ${qi + 1}`}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
          <Input
            value={q.text}
            onChange={(e) => updateQuestion(qi, { text: e.target.value })}
            placeholder="Question text"
            data-testid={`input-quiz-question-${qi}`}
          />
          <div className="flex items-center gap-2">
            <Switch
              id={`quiz-multi-${qi}`}
              checked={q.isMultiple}
              onCheckedChange={(v) => updateQuestion(qi, {
                isMultiple: v,
                // Collapsing to single-answer keeps only the first correct choice.
                correctIds: v ? q.correctIds : q.correctIds.slice(0, 1),
              })}
            />
            <Label htmlFor={`quiz-multi-${qi}`} className="text-xs">Multiple correct answers</Label>
          </div>
          <div className="space-y-1.5">
            {q.answers.map((a: any, ai: number) => (
              <div key={a.id} className="flex items-center gap-2">
                <Checkbox
                  checked={q.correctIds.includes(a.id)}
                  onCheckedChange={(on) => toggleCorrect(q, qi, a.id, on === true)}
                  title="Correct answer"
                  aria-label={`Mark answer ${ai + 1} correct`}
                  data-testid={`checkbox-quiz-correct-${qi}-${ai}`}
                />
                <Input
                  value={a.text}
                  onChange={(e) => updateQuestion(qi, {
                    answers: q.answers.map((x: any, j: number) => (j === ai ? { ...x, text: e.target.value } : x)),
                  })}
                  placeholder={`Answer ${ai + 1}`}
                  data-testid={`input-quiz-answer-${qi}-${ai}`}
                />
                <Button
                  type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive shrink-0"
                  onClick={() => updateQuestion(qi, {
                    answers: q.answers.filter((_: any, j: number) => j !== ai),
                    correctIds: q.correctIds.filter((id: string) => id !== a.id),
                  })}
                  title="Delete answer" aria-label={`Delete answer ${ai + 1}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => updateQuestion(qi, { answers: [...q.answers, { id: genId("a"), text: "" }] })}
            data-testid={`button-add-answer-${qi}`}
          >
            <Plus className="h-4 w-4 mr-1" /> Answer
          </Button>
          {q.correctIds.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-500">Mark at least one answer as correct.</p>
          )}
        </div>
      ))}
      <Button
        type="button" variant="outline" size="sm"
        onClick={() => commit({
          ...quiz,
          questions: [...quiz.questions, {
            id: genId("q"), text: "", isMultiple: false, correctIds: [],
            answers: [{ id: genId("a"), text: "" }, { id: genId("a"), text: "" }],
          }],
        })}
        data-testid="button-add-question"
      >
        <Plus className="h-4 w-4 mr-1" /> Question
      </Button>
    </div>
  );
}

function defaultContentFor(type: LessonType): any {
  switch (type) {
    case "rich_text": return { html: "" };
    case "slides": return {
      slides: [
        {
          id: `slide_${Date.now().toString(36)}`,
          blocks: [
            { id: `b_${Date.now().toString(36)}_h`, type: "heading", level: 2, text: "Slide 1" },
            { id: `b_${Date.now().toString(36)}_t`, type: "text", html: "<p>Content</p>" },
          ],
          narration: { mode: "none" },
        },
      ],
    };
    case "video": return { videoUrl: "", provider: "mp4" };
    case "audio": return { audioUrl: "" };
    case "quiz": return {
      passingScore: 70,
      questions: [
        { id: "q1", text: "Sample question?", correctAnswerId: "a1", answers: [
          { id: "a1", text: "Correct" }, { id: "a2", text: "Wrong" },
        ] },
      ],
    };
    case "attestation": return { statement: "I attest I have read and understood this material.", requireTyped: true };
    case "scorm": return { packageId: "", entryPoint: "index.html", version: "1.2" };
    default: return {};
  }
}

function contentHelpFor(type: LessonType): string {
  switch (type) {
    case "rich_text": return "Shape: { html: string }";
    case "slides": return "Block-based slides with optional narration. Edited visually above.";
    case "video": return "Shape: { videoUrl, provider?: 'mp4'|'youtube'|'vimeo' }";
    case "audio": return "Shape: { audioUrl }";
    case "quiz": return "Shape: { passingScore, questions: [{ id, text, answers: [{ id, text }], correctAnswerId }] }";
    case "attestation": return "Shape: { statement, requireTyped }";
    case "scorm": return "Shape: { packageId, entryPoint, version }. Use the Upload SCORM package control above to populate this automatically.";
    default: return "";
  }
}
