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
import { Loader2, BookOpen, CheckCircle2, Clock, PlayCircle, FileText, Music, Lock, Award, ChevronLeft, ChevronRight } from "lucide-react";
import DOMPurify from "dompurify";
import type { Course, CourseModule, Lesson, CourseEnrollment, LessonProgress, CourseTag } from "@shared/schema";

/**
 * Sanitize author-provided HTML before rendering. Lesson content is authored
 * by tenant admins/modelers but learners view it, so an XSS sink would let
 * one malicious author run script in another learner's session.
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
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
      toast({ title: "Enrolled", description: "You can now start the course." });
    },
    onError: (err: Error) => toast({ title: "Failed to enroll", description: err.message, variant: "destructive" }),
  });

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

  // Defense-in-depth: never render a locked lesson, even if the URL state
  // somehow resolves to one. The server enforces this on writes; the UI
  // enforces it on reads so locked content cannot be opened.
  useEffect(() => {
    if (activeLesson && !unlockedMap.get(activeLesson.id)) {
      setActiveLessonId(null);
    }
  }, [activeLesson, unlockedMap]);

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
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium" data-testid="text-enrollment-status">Status: {enrollment.status}</span>
              <span className="text-sm text-muted-foreground" data-testid="text-progress-percent">{enrollment.progressPercent}% complete</span>
            </div>
            <Progress value={enrollment.progressPercent} />
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
  const [quizResponses, setQuizResponses] = useState<Record<string, string>>({});
  const [slideIdx, setSlideIdx] = useState(0);
  const [submittedScore, setSubmittedScore] = useState<number | null>(progress?.score ?? null);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(progress?.status ?? null);

  const completeMutation = useMutation({
    mutationFn: async (body: any) => {
      return await apiRequest(`/api/courses/${course.id}/lessons/${lesson.id}/progress`, "POST", body);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course.id, "my-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", course.slug] });
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
        const slides: Array<{ title?: string; html?: string; imageUrl?: string }> = c.slides || [];
        if (slides.length === 0) return <p>No slides.</p>;
        const slide = slides[Math.min(slideIdx, slides.length - 1)];
        return (
          <div data-testid="content-slides">
            {slide.title && <h3 className="text-xl font-semibold mb-3">{slide.title}</h3>}
            {slide.imageUrl && <img src={slide.imageUrl} alt="" className="rounded-md mb-3 max-w-full" />}
            {slide.html && (
              <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(slide.html) }} />
            )}
            <div className="flex items-center justify-between gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={slideIdx === 0} onClick={() => setSlideIdx(i => i - 1)} data-testid="button-slide-prev">
                Previous slide
              </Button>
              <span className="text-sm text-muted-foreground">{slideIdx + 1} / {slides.length}</span>
              <Button variant="outline" size="sm" disabled={slideIdx >= slides.length - 1} onClick={() => setSlideIdx(i => i + 1)} data-testid="button-slide-next">
                Next slide
              </Button>
            </div>
          </div>
        );
      }
      case "video":
        return (
          <div data-testid="content-video">
            {c.videoUrl ? (
              <video src={c.videoUrl} controls className="w-full rounded-md" />
            ) : <p>No video URL.</p>}
          </div>
        );
      case "audio":
        return (
          <div data-testid="content-audio">
            {c.audioUrl ? (
              <audio src={c.audioUrl} controls className="w-full" />
            ) : <p>No audio URL.</p>}
          </div>
        );
      case "quiz": {
        const questions: any[] = c.questions || [];
        if (submittedScore !== null) {
          const passing = c.passingScore ?? 70;
          return (
            <div className="text-center py-8" data-testid="content-quiz-result">
              <h3 className="text-2xl font-bold mb-2">
                {submittedStatus === "completed" ? "Passed!" : "Try again"}
              </h3>
              <p className="text-lg mb-4">Score: {submittedScore} / 100 (passing: {passing})</p>
              {submittedStatus !== "completed" && (
                <Button onClick={() => { setSubmittedScore(null); setSubmittedStatus(null); setQuizResponses({}); }} data-testid="button-quiz-retry">
                  Retry
                </Button>
              )}
            </div>
          );
        }
        return (
          <div className="space-y-6" data-testid="content-quiz">
            {questions.map((q: any, qi: number) => (
              <div key={q.id || qi}>
                <p className="font-medium mb-2">{qi + 1}. {q.text}</p>
                <RadioGroup
                  value={quizResponses[q.id] || ""}
                  onValueChange={v => setQuizResponses(r => ({ ...r, [q.id]: v }))}
                >
                  {(q.answers || []).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <RadioGroupItem value={a.id} id={`${q.id}-${a.id}`} data-testid={`radio-quiz-${q.id}-${a.id}`} />
                      <Label htmlFor={`${q.id}-${a.id}`}>{a.text}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
            <Button
              onClick={submitQuiz}
              disabled={completeMutation.isPending || Object.keys(quizResponses).length < questions.length}
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
