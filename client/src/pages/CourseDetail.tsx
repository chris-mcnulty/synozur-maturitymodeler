import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, BookOpen, CheckCircle2, Clock, PlayCircle, FileText, Music, Lock, Award, ChevronLeft, ChevronRight, Download } from "lucide-react";
import DOMPurify from "dompurify";
import type { Course, CourseModule, Lesson, CourseEnrollment, LessonProgress, CourseTag } from "@shared/schema";
import { normalizeSlides, type SlideBlock } from "@shared/slides";

/**
 * Sanitize author-provided HTML before rendering. Lesson content is authored
 * by tenant admins/modelers but learners view it, so an XSS sink would let
 * one malicious author run script in another learner's session.
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/**
 * Author-provided embed URLs go into an iframe src, so reject anything that
 * isn't plain http(s) (e.g. `javascript:`/`data:` schemes).
 */
function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Sandbox for third-party video embeds (YouTube/Vimeo). Their players need
 * scripts + same-origin + fullscreen/popups to function, but this still blocks
 * top-navigation, form submission, downloads, and pointer-lock.
 */
const EMBED_SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups";

/** Render a single slide block in the learner view. */
function SlideBlockView({ block }: { block: SlideBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}` as unknown) as keyof JSX.IntrinsicElements;
      const sizes: Record<number, string> = { 1: "text-2xl", 2: "text-xl", 3: "text-lg" };
      return <Tag className={`${sizes[block.level] || "text-xl"} font-semibold mb-3`}>{block.text}</Tag>;
    }
    case "text":
      return (
        <div
          className="prose prose-sm dark:prose-invert max-w-none mb-3"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html || "") }}
        />
      );
    case "callout": {
      const tones: Record<string, string> = {
        info: "border-blue-500/40 bg-blue-500/10",
        tip: "border-green-500/40 bg-green-500/10",
        warning: "border-amber-500/40 bg-amber-500/10",
      };
      return (
        <div
          className={`rounded-md border-l-4 p-3 mb-3 ${tones[block.tone] || tones.info}`}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html || "") }}
        />
      );
    }
    case "image":
      return (
        <figure className="mb-3">
          {block.url && <img src={block.url} alt={block.alt || ""} className="rounded-md max-w-full" />}
          {block.caption && <figcaption className="text-xs text-muted-foreground mt-1">{block.caption}</figcaption>}
        </figure>
      );
    case "image_slide":
      return block.url ? <img src={block.url} alt={block.alt || ""} className="rounded-md w-full mb-3" /> : null;
    case "video": {
      if (!block.url || !isSafeHttpUrl(block.url)) return null;
      const isEmbed = block.provider === "youtube" || block.provider === "vimeo" ||
        block.url.includes("youtube.com") || block.url.includes("youtu.be") || block.url.includes("vimeo.com");
      return isEmbed ? (
        <div className="relative w-full rounded-md overflow-hidden mb-3" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={block.url}
            className="absolute inset-0 w-full h-full"
            sandbox={EMBED_SANDBOX}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            title="Slide video"
          />
        </div>
      ) : (
        <video src={block.url} poster={block.poster} controls className="w-full rounded-md mb-3" aria-label="Slide video" />
      );
    }
    default:
      return null;
  }
}

/**
 * A lesson is "unlocked" iff every prior REQUIRED lesson in the course
 * (across modules, ordered by module.order then lesson.order) is completed
 * for this enrollment. Mirrors `isLessonUnlocked` on the server.
 */
function computeUnlocked(allLessons: Lesson[], progressByLesson: Map<string, LessonProgress>) {
  const unlocked = new Map<string, boolean>();
  for (let i = 0; i < allLessons.length; i++) {
    const priorRequired = allLessons.slice(0, i).filter(l => l.required);
    const ok = priorRequired.every(l => progressByLesson.get(l.id)?.status === "completed");
    unlocked.set(allLessons[i].id, ok);
  }
  return unlocked;
}

interface CourseFull extends Course {
  modules: (CourseModule & { lessons: Lesson[] })[];
  tags: CourseTag[];
}

interface ProgressData {
  enrollment: CourseEnrollment | null;
  progress: LessonProgress[];
}

const lessonIcon = (type: string) => {
  switch (type) {
    case "video": return PlayCircle;
    case "audio": return Music;
    case "quiz": return CheckCircle2;
    case "attestation": return Award;
    case "scorm": return BookOpen;
    case "slides": return FileText;
    default: return FileText;
  }
};

export default function CourseDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const { data: course, isLoading } = useQuery<CourseFull>({
    queryKey: ["/api/courses", slug],
  });

  const { data: progressData } = useQuery<ProgressData>({
    queryKey: ["/api/courses", course?.id, "my-progress"],
    enabled: !!course?.id && !!user,
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (!course) return;
      return await apiRequest(`/api/courses/${course.id}/enroll`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course?.id, "my-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/courses"] });
      toast({ title: "Enrolled", description: "You can now start the course." });
    },
    onError: (err: Error) => toast({ title: "Failed to enroll", description: err.message, variant: "destructive" }),
  });

  const reissueCertMutation = useMutation({
    mutationFn: async () => {
      if (!course) return;
      return await apiRequest(`/api/courses/${course.id}/certificate`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course?.id, "my-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/courses"] });
      toast({ title: "Certificate ready", description: "Your certificate has been generated." });
    },
    onError: (err: Error) => toast({ title: "Could not generate certificate", description: err.message, variant: "destructive" }),
  });

  // Defense-in-depth: never render a locked lesson, even if state somehow
  // resolves to one. Must be above early-returns to satisfy Rules of Hooks.
  useEffect(() => {
    if (!course) return;
    const lessons = course.modules.flatMap(m => m.lessons);
    const pbLesson = new Map<string, LessonProgress>(
      (progressData?.progress ?? []).map(p => [p.lessonId, p])
    );
    const unlocked = computeUnlocked(lessons, pbLesson);
    const active = activeLessonId ? lessons.find(l => l.id === activeLessonId) ?? null : null;
    if (active && !unlocked.get(active.id)) {
      setActiveLessonId(null);
    }
  }, [course, progressData, activeLessonId]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Skeleton className="h-12 w-2/3 mb-4" />
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Card><CardContent className="pt-6">Course not found.</CardContent></Card>
      </div>
    );
  }

  const allLessons = course.modules.flatMap(m => m.lessons);
  const progressByLesson = new Map<string, LessonProgress>(
    (progressData?.progress ?? []).map(p => [p.lessonId, p])
  );
  const enrollment = progressData?.enrollment;
  const isEnrolled = !!enrollment;

  const unlockedMap = computeUnlocked(allLessons, progressByLesson);

  const activeLesson = activeLessonId
    ? allLessons.find(l => l.id === activeLessonId) ?? null
    : null;

  if (activeLesson && unlockedMap.get(activeLesson.id)) {
    const idx = allLessons.findIndex(l => l.id === activeLesson.id);
    const prev = idx > 0 ? allLessons[idx - 1] : null;
    const next = idx < allLessons.length - 1 ? allLessons[idx + 1] : null;
    const nextUnlocked = !!next && !!unlockedMap.get(next.id);
    return (
      <CoursePlayer
        key={activeLesson.id}
        course={course}
        lesson={activeLesson}
        currentIndex={idx}
        total={allLessons.length}
        progress={progressByLesson.get(activeLesson.id)}
        onPrev={prev ? () => setActiveLessonId(prev.id) : undefined}
        onNext={next && nextUnlocked ? () => setActiveLessonId(next.id) : undefined}
        nextLocked={!!next && !nextUnlocked}
        onExit={() => setActiveLessonId(null)}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Helmet>
        <title>{course.title} | Orion Learning</title>
        <meta name="description" content={course.summary || course.description.slice(0, 160)} />
      </Helmet>
      <Link href="/courses">
        <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-to-courses">
          <ChevronLeft className="h-4 w-4 mr-1" /> All courses
        </Button>
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <h1 className="text-3xl font-bold" data-testid="text-course-title">{course.title}</h1>
          <Badge>{course.status}</Badge>
        </div>
        {course.summary && <p className="text-lg text-muted-foreground mb-2">{course.summary}</p>}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><BookOpen className="h-4 w-4" /> {allLessons.length} lessons</span>
          {course.estimatedMinutes != null && (
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {course.estimatedMinutes} min</span>
          )}
          {course.tags.map(t => <Badge key={t.id} variant="outline">{t.name}</Badge>)}
        </div>
      </div>

      {course.description && (
        <Card className="mb-6">
          <CardContent className="pt-6 prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap" data-testid="text-course-description">
            {course.description}
          </CardContent>
        </Card>
      )}

      {!user && (
        <Card className="mb-6">
          <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
            <span>Sign in to enroll and track progress.</span>
            <Link href="/auth">
              <Button data-testid="button-sign-in-to-enroll">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {user && !isEnrolled && (
        <Card className="mb-6">
          <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
            <span>Enroll to begin tracking your progress.</span>
            <Button
              onClick={() => enrollMutation.mutate()}
              disabled={enrollMutation.isPending}
              data-testid="button-enroll"
            >
              {enrollMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enroll
            </Button>
          </CardContent>
        </Card>
      )}

      {isEnrolled && enrollment && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="font-medium" data-testid="text-enrollment-status">Status: {enrollment.status}</span>
              <span className="text-sm text-muted-foreground" data-testid="text-progress-percent">{enrollment.progressPercent}% complete</span>
            </div>
            <Progress value={enrollment.progressPercent} />
            {enrollment.status === "completed" && course.certificateEnabled && (
              <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  <span>Course completed — your certificate is ready.</span>
                </div>
                {enrollment.certificateUrl ? (
                  <a
                    href={enrollment.certificateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  >
                    <Button data-testid="button-download-certificate">
                      <Download className="h-4 w-4 mr-2" /> Download certificate
                    </Button>
                  </a>
                ) : (
                  <Button
                    onClick={() => reissueCertMutation.mutate()}
                    disabled={reissueCertMutation.isPending}
                    data-testid="button-generate-certificate"
                  >
                    {reissueCertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Generate certificate
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {course.modules.length === 0 && (
          <Card><CardContent className="pt-6 text-muted-foreground">No content yet.</CardContent></Card>
        )}
        {course.modules.map((mod, mIdx) => (
          <Card key={mod.id} data-testid={`card-module-${mod.id}`}>
            <CardHeader>
              <CardTitle className="text-base">
                Module {mIdx + 1}: {mod.title}
              </CardTitle>
              {mod.description && <p className="text-sm text-muted-foreground">{mod.description}</p>}
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mod.lessons.length === 0 && (
                  <p className="text-sm text-muted-foreground">No lessons yet.</p>
                )}
                {mod.lessons.map(l => {
                  const Icon = lessonIcon(l.type);
                  const lp = progressByLesson.get(l.id);
                  const completed = lp?.status === "completed";
                  const failed = lp?.status === "failed";
                  // Sequential gating (client mirror): all prior required lessons across the course
                  // must be completed before this lesson opens. Server enforces this too.
                  const flatLessons = course.modules.flatMap(m => m.lessons);
                  const myIdx = flatLessons.findIndex(x => x.id === l.id);
                  const priorRequired = flatLessons.slice(0, myIdx).filter(x => x.required);
                  const locked = isEnrolled && priorRequired.some(p => progressByLesson.get(p.id)?.status !== "completed");
                  const disabled = !user || (isEnrolled && locked);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        if (!user) return;
                        if (!isEnrolled) return enrollMutation.mutate();
                        if (locked) return;
                        setActiveLessonId(l.id);
                      }}
                      disabled={disabled}
                      className="w-full flex items-center gap-3 p-3 rounded-md hover-elevate text-left disabled:opacity-50"
                      data-testid={`button-lesson-${l.id}`}
                    >
                      {(!user || locked) ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
                      <div className="flex-1">
                        <div className="font-medium">{l.title}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {l.type.replace("_", " ")}{locked ? " · locked" : ""}
                        </div>
                      </div>
                      {completed && <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Complete</Badge>}
                      {failed && <Badge variant="destructive">Failed — retry</Badge>}
                      {lp?.score != null && !failed && !completed && <Badge variant="outline">Score: {lp.score}</Badge>}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface PlayerProps {
  course: Course;
  lesson: Lesson;
  currentIndex: number;
  total: number;
  progress?: LessonProgress;
  onPrev?: () => void;
  onNext?: () => void;
  nextLocked?: boolean;
  onExit: () => void;
}

function CoursePlayer({ course, lesson, currentIndex, total, progress, onPrev, onNext, nextLocked, onExit }: PlayerProps) {
  const { toast } = useToast();
  const [signedName, setSignedName] = useState("");
  const [quizResponses, setQuizResponses] = useState<Record<string, string[]>>({});
  const [slideIdx, setSlideIdx] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(progress?.score ?? null);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(progress?.status ?? null);

  const completeMutation = useMutation({
    mutationFn: async (body: any) => {
      return await apiRequest(`/api/courses/${course.id}/lessons/${lesson.id}/progress`, "POST", body);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course.id, "my-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course.slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/courses"] });
      if (data?.progress) {
        setSubmittedStatus(data.progress.status);
        setSubmittedScore(data.progress.score ?? null);
      }
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const attestMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/courses/${course.id}/lessons/${lesson.id}/attest`, "POST", { signedName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course.id, "my-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course.slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/courses"] });
      setSubmittedStatus("completed");
      toast({ title: "Attestation recorded" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const markComplete = () => {
    completeMutation.mutate({ status: "completed" });
  };

  const submitQuiz = () => {
    completeMutation.mutate({ data: { responses: quizResponses } });
  };

  const renderContent = () => {
    const c = (lesson.content as any) || {};
    switch (lesson.type) {
      case "rich_text":
        return (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.html || "<p>No content.</p>") }}
            data-testid="content-rich-text"
          />
        );
      case "slides": {
        const slides = normalizeSlides(c);
        if (slides.length === 0) return <p>No slides.</p>;
        const slide = slides[Math.min(slideIdx, slides.length - 1)];
        const narrationUrl = slide.narration?.audioUrl;
        return (
          <div
            data-testid="content-slides"
            role="group"
            aria-roledescription="carousel"
            aria-label={`Slides, ${slideIdx + 1} of ${slides.length}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" && slideIdx < slides.length - 1) { setSlideIdx(i => i + 1); e.preventDefault(); }
              if (e.key === "ArrowLeft" && slideIdx > 0) { setSlideIdx(i => i - 1); e.preventDefault(); }
            }}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <div aria-live="polite">
              {slide.blocks.map((b) => <SlideBlockView key={b.id} block={b} />)}
            </div>
            {narrationUrl && (
              <div className="mt-4 rounded-md border bg-muted/40 p-3" data-testid="slide-narration">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Music className="h-3.5 w-3.5" /> Narration
                  </p>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={autoAdvance}
                      onCheckedChange={(v) => setAutoAdvance(v === true)}
                      data-testid="checkbox-auto-advance"
                    />
                    Auto-play &amp; advance
                  </label>
                </div>
                <audio
                  key={slide.id}
                  src={narrationUrl}
                  controls
                  autoPlay={autoAdvance}
                  onEnded={() => { if (autoAdvance && slideIdx < slides.length - 1) setSlideIdx(i => i + 1); }}
                  className="w-full"
                  aria-label={`Narration for slide ${slideIdx + 1}`}
                />
                {slide.narration?.text && (
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">Transcript</summary>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{slide.narration.text}</p>
                  </details>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={slideIdx === 0} onClick={() => setSlideIdx(i => i - 1)} data-testid="button-slide-prev" aria-label="Previous slide">
                Previous slide
              </Button>
              <span className="text-sm text-muted-foreground" aria-hidden="true">{slideIdx + 1} / {slides.length}</span>
              <Button variant="outline" size="sm" disabled={slideIdx >= slides.length - 1} onClick={() => setSlideIdx(i => i + 1)} data-testid="button-slide-next" aria-label="Next slide">
                Next slide
              </Button>
            </div>
          </div>
        );
      }
      case "video": {
        const isEmbed = c.provider === 'youtube' || c.provider === 'vimeo' ||
          (c.videoUrl && (c.videoUrl.includes('youtube.com') || c.videoUrl.includes('youtu.be') || c.videoUrl.includes('vimeo.com')));
        return (
          <div data-testid="content-video" className="space-y-3">
            {c.description && (
              <p className="text-sm text-muted-foreground">{c.description}</p>
            )}
            {!c.videoUrl || !isSafeHttpUrl(c.videoUrl) ? (
              <p className="text-sm text-muted-foreground">No video URL configured.</p>
            ) : isEmbed ? (
              <div className="relative w-full rounded-md overflow-hidden" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={c.videoUrl}
                  className="absolute inset-0 w-full h-full"
                  sandbox={EMBED_SANDBOX}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  title={lesson.title}
                />
              </div>
            ) : (
              <video src={c.videoUrl} controls className="w-full rounded-md" />
            )}
          </div>
        );
      }
      case "audio":
        return (
          <div data-testid="content-audio" className="space-y-3">
            {c.description && (
              <p className="text-sm text-muted-foreground">{c.description}</p>
            )}
            {c.audioUrl ? (
              <audio src={c.audioUrl} controls className="w-full" />
            ) : (
              <p className="text-sm text-muted-foreground">No audio URL configured.</p>
            )}
          </div>
        );
      case "quiz": {
        const questions: any[] = c.questions || [];
        if (submittedScore !== null) {
          const passing = c.passingScore ?? 70;
          const passed = submittedStatus === "completed";
          return (
            <div className="text-center py-8" data-testid="content-quiz-result">
              <div className="mb-3">
                {passed
                  ? <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                  : <div className="h-12 w-12 rounded-full border-4 border-muted mx-auto flex items-center justify-center text-muted-foreground text-xl font-bold">✕</div>
                }
              </div>
              <h3 className="text-2xl font-bold mb-2">{passed ? "Passed!" : "Not quite — try again"}</h3>
              <p className="text-lg text-muted-foreground mb-4">
                Score: {submittedScore} / 100 &nbsp;·&nbsp; Passing: {passing}
              </p>
              {!passed && (
                <Button onClick={() => { setSubmittedScore(null); setSubmittedStatus(null); setQuizResponses({}); }} data-testid="button-quiz-retry">
                  Retry
                </Button>
              )}
            </div>
          );
        }

        const allAnswered = questions.length > 0 &&
          questions.every(q => (quizResponses[q.id]?.length ?? 0) > 0);

        return (
          <div className="space-y-6" data-testid="content-quiz">
            {questions.map((q: any, qi: number) => {
              // Server normalises choices to `answers`; fall back to `options`
              // in case the lesson was loaded without the redact transform.
              const choices: any[] = q.answers || q.options || [];
              const isMultiple = q.type === "multiple";
              const selected = quizResponses[q.id] ?? [];

              return (
                <div key={q.id || qi} className="space-y-2">
                  <p className="font-medium">
                    {qi + 1}. {q.text}
                    {isMultiple && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(select all that apply)</span>
                    )}
                  </p>
                  {isMultiple ? (
                    <div className="space-y-2">
                      {choices.map((a: any) => {
                        const checked = selected.includes(a.id);
                        return (
                          <div key={a.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`${q.id}-${a.id}`}
                              checked={checked}
                              onCheckedChange={on => {
                                setQuizResponses(r => {
                                  const prev = r[q.id] ?? [];
                                  const next = on
                                    ? [...prev, a.id]
                                    : prev.filter(x => x !== a.id);
                                  return { ...r, [q.id]: next };
                                });
                              }}
                              data-testid={`checkbox-quiz-${q.id}-${a.id}`}
                            />
                            <Label htmlFor={`${q.id}-${a.id}`} className="cursor-pointer">{a.text}</Label>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <RadioGroup
                      value={selected[0] ?? ""}
                      onValueChange={v => setQuizResponses(r => ({ ...r, [q.id]: [v] }))}
                    >
                      {choices.map((a: any) => (
                        <div key={a.id} className="flex items-center gap-2">
                          <RadioGroupItem value={a.id} id={`${q.id}-${a.id}`} data-testid={`radio-quiz-${q.id}-${a.id}`} />
                          <Label htmlFor={`${q.id}-${a.id}`} className="cursor-pointer">{a.text}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                </div>
              );
            })}
            <Button
              onClick={submitQuiz}
              disabled={completeMutation.isPending || !allAnswered}
              data-testid="button-quiz-submit"
            >
              {completeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit quiz
            </Button>
          </div>
        );
      }
      case "attestation": {
        const completed = submittedStatus === "completed";
        return (
          <div data-testid="content-attestation">
            <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
              <p>{c.statement || "I attest I have read and understood this material."}</p>
            </div>
            {completed ? (
              <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" /> Attestation recorded</Badge>
            ) : (
              <div className="space-y-3 max-w-md">
                <Label htmlFor="signed-name">Type your full name to sign</Label>
                <Input
                  id="signed-name"
                  value={signedName}
                  onChange={e => setSignedName(e.target.value)}
                  placeholder="Your full name"
                  data-testid="input-signed-name"
                />
                <Button
                  onClick={() => attestMutation.mutate()}
                  disabled={attestMutation.isPending || signedName.trim().length < 2}
                  data-testid="button-attest"
                >
                  {attestMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Sign attestation
                </Button>
              </div>
            )}
          </div>
        );
      }
      case "scorm":
        return (
          <ScormPlayer
            courseId={course.id}
            courseSlug={course.slug}
            lesson={lesson}
            initialCmi={(progress?.data as any)?.cmi || {}}
            onComplete={(status, score) => {
              setSubmittedStatus(status);
              if (score != null) setSubmittedScore(score);
            }}
          />
        );
      default:
        return <p>Unsupported lesson type.</p>;
    }
  };

  const isCompleted = submittedStatus === "completed";
  const showCompleteButton = ["rich_text", "slides", "video", "audio"].includes(lesson.type);

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onExit} data-testid="button-exit-player">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to course
        </Button>
        <span className="text-sm text-muted-foreground">Lesson {currentIndex + 1} of {total}</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-lesson-title">{lesson.title}</CardTitle>
          <p className="text-sm text-muted-foreground capitalize">{lesson.type.replace("_", " ")}</p>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
      <div className="flex items-center justify-between mt-4 gap-2">
        <Button variant="outline" disabled={!onPrev} onClick={onPrev} data-testid="button-prev-lesson">
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <div className="flex items-center gap-2">
          {showCompleteButton && !isCompleted && (
            <Button
              onClick={markComplete}
              disabled={completeMutation.isPending}
              data-testid="button-mark-complete"
            >
              {completeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Mark complete
            </Button>
          )}
          {isCompleted && <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>}
          <Button disabled={!onNext} onClick={onNext} data-testid="button-next-lesson">
            {nextLocked && <Lock className="h-4 w-4 mr-1" />}
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * ScormPlayer — embeds a SCORM SCO in a *sandboxed* iframe and bridges
 * its runtime API back to our `lesson_progress` row via `postMessage`.
 *
 * Security model: the iframe uses `sandbox="allow-scripts allow-forms
 * allow-popups"` so the SCO runs in a unique opaque origin and cannot
 * touch the host app, its cookies, or its same-origin APIs. The server
 * injects a SCORM API shim into served HTML which buffers cmi.* writes
 * locally and posts a `{type:"scorm-progress", cmi}` message to the
 * parent on `LMSCommit` / `LMSFinish` (and 2004's `Commit` /
 * `Terminate`). We accept those messages here only when they originate
 * from this iframe's contentWindow, then forward to the dedicated
 * `/scorm/progress` endpoint which translates cmi.* into our
 * normalized status + score shape.
 */
function ScormPlayer({
  courseId, courseSlug, lesson, onComplete,
}: {
  courseId: string;
  courseSlug: string;
  lesson: Lesson;
  initialCmi: Record<string, any>;
  onComplete: (status: string | null, score: number | null) => void;
}) {
  const content = (lesson.content as any) || {};
  const packageId: string | undefined = content.packageId;
  const entryPoint: string = content.entryPoint || "index.html";
  const version: "1.2" | "2004" = content.version === "2004" ? "2004" : "1.2";
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Mint a signed launch URL on mount. The token in the URL path
  // authorizes the cookieless asset stream so the sandboxed iframe can
  // pull every relative subresource without losing auth, and the URL
  // fragment carries any prior cmi snapshot for resume support.
  useEffect(() => {
    if (!packageId) { setSrc(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}/lessons/${lesson.id}/scorm/launch`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || "Could not launch SCORM package");
        }
        const data = await res.json();
        if (!cancelled) setSrc(data.src);
      } catch (e: any) {
        if (!cancelled) setLaunchError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [packageId, courseId, lesson.id]);

  useEffect(() => {
    if (!packageId) return;
    const onMessage = async (ev: MessageEvent) => {
      // Origin is "null" because the iframe is sandboxed without
      // allow-same-origin, so we cannot validate by origin string.
      // Instead, walk the source's parent chain and accept the message
      // only if it originated from our player iframe or any frame
      // nested inside it. Real SCORM packages frequently load the SCO
      // inside an internal sub-iframe, and we still need their
      // postMessage events to land here.
      const playerWin = iframeRef.current?.contentWindow;
      if (!playerWin || !ev.source) return;
      let cur: Window | null = ev.source as Window;
      let trusted = false;
      for (let i = 0; i < 8 && cur; i++) {
        if (cur === playerWin) { trusted = true; break; }
        try { cur = cur.parent === cur ? null : cur.parent; } catch { break; }
      }
      if (!trusted) return;
      const data = ev.data;
      if (!data || data.type !== "scorm-progress") return;
      try {
        const res = await fetch(
          `/api/courses/${courseId}/lessons/${lesson.id}/scorm/progress`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cmi: data.cmi || {} }),
          },
        );
        if (res.ok) {
          const out = await res.json();
          onComplete(out.progress?.status ?? null, out.progress?.score ?? null);
          queryClient.invalidateQueries({ queryKey: ["/api/courses", courseSlug] });
          queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "my-progress"] });
        }
      } catch {/* best-effort persistence */}
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [packageId, courseId, courseSlug, lesson.id, onComplete]);

  if (!packageId) {
    return (
      <div className="text-center py-8 text-muted-foreground" data-testid="content-scorm-empty">
        <p>This SCORM lesson has not been wired up yet.</p>
        <p className="text-sm">An admin can upload a package from the course builder.</p>
      </div>
    );
  }

  if (launchError) {
    return (
      <div className="text-center py-8 text-destructive" data-testid="content-scorm-error">
        <p>SCORM player failed to load.</p>
        <p className="text-sm">{launchError}</p>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="content-scorm-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="content-scorm">
      <div className="text-xs text-muted-foreground mb-2">SCORM {version} · {entryPoint}</div>
      <iframe
        ref={iframeRef}
        src={src}
        title={lesson.title}
        className="w-full rounded-md border"
        style={{ height: "70vh" }}
        // No allow-same-origin: the SCO runs in a unique opaque origin
        // and cannot touch the host app, cookies, or our APIs. The
        // injected shim communicates back via window.parent.postMessage.
        sandbox="allow-scripts allow-forms allow-popups"
        data-testid="iframe-scorm"
      />
    </div>
  );
}
