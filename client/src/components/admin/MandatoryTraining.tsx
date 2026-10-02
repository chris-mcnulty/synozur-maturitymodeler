import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, RefreshCw, Users } from "lucide-react";
import { AddRequiredCourses } from "./AddRequiredCourses";
import { AddRequiredLearners } from "./AddRequiredLearners";

type Option = { id: string; name?: string; title?: string; email?: string; [key: string]: any };
type TrainingItem = {
  itemId: string;
  kind: string;
  title: string;
  status: string;
  completedAt?: string | null;
  progressPercent?: number;
  score?: number | null;
  resultLabel?: string | null;
  href?: string | null;
};
type Recipient = {
  userId: string;
  name?: string;
  email?: string;
  status: string;
  completedAt?: string | null;
  items?: TrainingItem[];
};
type Schedule = { id: string; title: string; releaseAt?: string; dueAt?: string; [key: string]: any };
type Report = {
  schedule: Schedule;
  items: any[];
  recipients: Recipient[];
  summary?: Record<string, any>;
  emails?: Array<{ status?: string; email?: string; name?: string; reason?: string; error?: string; message?: string }>;
  emailSummary?: Record<string, any>;
};
type Tenant = { id: string; name: string };

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function displayName(option: Option) {
  return option.name || option.title || option.email || option.id;
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function MandatoryTraining({ tenants = [], isGlobalAdmin, defaultTenantId }: {
  tenants?: Tenant[];
  isGlobalAdmin?: boolean;
  defaultTenantId?: string | null;
}) {
  const { toast } = useToast();
  const [tenantId, setTenantId] = useState(defaultTenantId || "");
  const [title, setTitle] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [modelId, setModelId] = useState("");
  const [userIds, setUserIds] = useState<string[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  useEffect(() => {
    if (defaultTenantId && !tenantId) setTenantId(defaultTenantId);
  }, [defaultTenantId, tenantId]);
  useEffect(() => {
    setIdempotencyKey(newIdempotencyKey());
  }, [tenantId, title, releaseAt, dueAt, courseIds, modelId, userIds]);
  const tenantQuery = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  const optionsQuery = useQuery<{ users?: Option[]; courses?: Option[]; models?: Option[] }>({
    queryKey: [`/api/admin/mandatory-training/options${tenantQuery}`],
    enabled: !isGlobalAdmin || Boolean(tenantId),
  });
  const schedulesQuery = useQuery<Schedule[]>({
    queryKey: ["/api/admin/mandatory-training"],
    staleTime: 0,
    refetchOnMount: "always",
  });
  const detailQuery = useQuery<Report>({
    queryKey: [`/api/admin/mandatory-training/${selectedScheduleId}`],
    enabled: Boolean(selectedScheduleId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const options = optionsQuery.data;
  const users = options?.users || [];
  const courses = options?.courses || [];
  const models = options?.models || [];
  const eligibleUsers = useMemo(() => users, [users]);
  const recipients = detailQuery.data?.recipients || [];
  const normalizeStatus = (status?: string) => (status || "").toLowerCase().replace(/[\s-]+/g, "_");
  const visibleRecipients = statusFilter === "all"
    ? recipients
    : recipients.filter(recipient => normalizeStatus(recipient.status) === statusFilter);
  const releaseTimestamp = releaseAt ? new Date(releaseAt).getTime() : Date.now();
  const dueTimestamp = new Date(dueAt).getTime();
  const dateInvalid = !dueAt || !Number.isFinite(releaseTimestamp) || !Number.isFinite(dueTimestamp) ||
    (releaseAt && releaseTimestamp <= Date.now()) || dueTimestamp <= releaseTimestamp || dueTimestamp <= Date.now();
  const canCreate = Boolean(tenantId && title.trim() && (courseIds.length > 0 || modelId) && userIds.length > 0 && !dateInvalid);

  const createMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/mandatory-training", "POST", {
      tenantId,
      title: title.trim(),
      ...(releaseAt ? { releaseAt: new Date(releaseAt).toISOString() } : {}),
      dueAt: new Date(dueAt).toISOString(),
      courseIds,
      modelId: modelId || null,
      userIds,
      idempotencyKey,
    }),
    onSuccess: async (created: any) => {
      toast({ title: "Required training scheduled", description: "Recipients will see this assignment when it is released." });
      setIdempotencyKey(newIdempotencyKey());
      setTitle("");
      setCourseIds([]);
      setModelId("");
      setUserIds([]);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/mandatory-training"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/required-training-availability"] });
      const id = created?.schedule?.id || created?.id;
      if (id) setSelectedScheduleId(id);
    },
    onError: (error: Error) => toast({ title: "Could not schedule training", description: error.message, variant: "destructive" }),
  });

  const toggleId = (ids: string[], id: string, checked: boolean) =>
    checked ? Array.from(new Set([...ids, id])) : ids.filter(value => value !== id);

  const downloadReport = async () => {
    if (!selectedScheduleId) return;
    try {
      const query = statusFilter !== "all" ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const response = await fetch(`/api/admin/mandatory-training/${encodeURIComponent(selectedScheduleId)}/export${query}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error((await response.text()) || response.statusText);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `required-training-${selectedScheduleId}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Export failed", description: error instanceof Error ? error.message : "Could not download the report.", variant: "destructive" });
    }
  };

  const rawScheduleList: any = schedulesQuery.data;
  const scheduleList: Schedule[] = (Array.isArray(rawScheduleList)
    ? rawScheduleList
    : rawScheduleList?.schedules || rawScheduleList?.data || []
  ).map((entry: any) => entry.schedule || entry);

  return (
    <div className="space-y-6" data-testid="mandatory-training-admin">
      <div>
        <h2 className="text-2xl font-bold">Required Training</h2>
        <p className="text-muted-foreground mt-1">Schedule required courses and assessments, then monitor completion.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Schedule training</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {isGlobalAdmin && (
            <div className="space-y-2">
              <Label htmlFor="mandatory-tenant">Tenant</Label>
              <Select value={tenantId} onValueChange={value => {
                setTenantId(value);
                setCourseIds([]);
                setModelId("");
                setUserIds([]);
              }}>
                <SelectTrigger id="mandatory-tenant" data-testid="select-mandatory-tenant"><SelectValue placeholder="Choose a tenant" /></SelectTrigger>
                <SelectContent>
                  {tenants.map(tenant => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-3">
              <Label htmlFor="mandatory-title">Assignment title</Label>
              <Input id="mandatory-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Annual safety training" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mandatory-release">Release date and time</Label>
              <Input id="mandatory-release" type="datetime-local" value={releaseAt} onChange={event => setReleaseAt(event.target.value)} />
              <p className="text-xs text-muted-foreground">Optional. Leave blank to release immediately.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mandatory-due">Due date and time</Label>
              <Input id="mandatory-due" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} />
            </div>
            <div className="self-end text-sm text-muted-foreground">
              The due date must be in the future and after the release date.
            </div>
          </div>

          {!tenantId && isGlobalAdmin ? (
            <p className="text-sm text-muted-foreground">Choose a tenant to load its available learners and content.</p>
          ) : optionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading tenant options…</p>
          ) : optionsQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">Could not load options: {(optionsQuery.error as Error).message}</p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Required courses</Label>
                <div className="max-h-44 overflow-auto rounded-md border p-3 space-y-2">
                  {courses.length ? courses.map(course => (
                    <label key={course.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={courseIds.includes(course.id)} onCheckedChange={checked => setCourseIds(toggleId(courseIds, course.id, checked === true))} />
                      <span>{displayName(course)}</span>
                    </label>
                  )) : <p className="text-sm text-muted-foreground">No courses available.</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mandatory-model">Required assessment (optional)</Label>
                <Select value={modelId || "__none__"} onValueChange={value => setModelId(value === "__none__" ? "" : value)}>
                  <SelectTrigger id="mandatory-model"><SelectValue placeholder="Select an assessment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No assessment</SelectItem>
                    {models.map(model => <SelectItem key={model.id} value={model.id}>{displayName(model)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Label className="pt-2">Learners</Label>
                <div className="max-h-44 overflow-auto rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2 border-b pb-2 text-sm">
                    <Checkbox
                      checked={eligibleUsers.length > 0 && userIds.length === eligibleUsers.length}
                      onCheckedChange={checked => setUserIds(checked === true ? eligibleUsers.map(user => user.id) : [])}
                    />
                    <span>Select all ({eligibleUsers.length})</span>
                  </div>
                  {eligibleUsers.map(user => (
                    <label key={user.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={userIds.includes(user.id)} onCheckedChange={checked => setUserIds(toggleId(userIds, user.id, checked === true))} />
                      <span>{displayName(user)}{user.email && user.name ? <span className="text-muted-foreground"> · {user.email}</span> : null}</span>
                    </label>
                  ))}
                  {!eligibleUsers.length && <p className="text-sm text-muted-foreground">No learners available.</p>}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted/50 p-4 text-sm" data-testid="mandatory-training-preview">
            <div className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> Preview</div>
            <p className="mt-1">{userIds.length} learner{userIds.length === 1 ? "" : "s"} · {courseIds.length + (modelId ? 1 : 0)} required item{courseIds.length + (modelId ? 1 : 0) === 1 ? "" : "s"}</p>
            <p className="text-muted-foreground mt-1">Release: {releaseAt ? dateText(releaseAt) : "Immediately"} · Due: {dueAt ? dateText(dueAt) : "Not set"}</p>
            <p className="text-muted-foreground">Selected: {[
              ...courses.filter(course => courseIds.includes(course.id)).map(displayName),
              ...models.filter(model => model.id === modelId).map(displayName),
            ].join(", ") || "No required items selected"}</p>
            {userIds.length > 0 && <p className="text-muted-foreground">Learners: {eligibleUsers.filter(user => userIds.includes(user.id)).map(displayName).join(", ")}</p>}
          </div>
          <Button disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()} data-testid="button-schedule-mandatory-training">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Schedule required training
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle>Assignments and completion report</CardTitle>
          <Button variant="outline" size="sm" onClick={() => {
            void schedulesQuery.refetch();
            if (selectedScheduleId) void detailQuery.refetch();
          }}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {schedulesQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading assignments…</p> : null}
          {schedulesQuery.isError ? <p role="alert" className="text-sm text-destructive">Could not load assignments: {(schedulesQuery.error as Error).message}</p> : null}
          {!schedulesQuery.isLoading && !scheduleList.length && <p className="text-sm text-muted-foreground">No required training assignments yet.</p>}
          {scheduleList.length > 0 && (
            <div className="space-y-2">
              {scheduleList.map(schedule => (
                <button key={schedule.id} type="button" onClick={() => setSelectedScheduleId(schedule.id)}
                  className={`w-full rounded-md border p-3 text-left hover:bg-muted/50 ${selectedScheduleId === schedule.id ? "border-primary bg-muted/40" : ""}`}>
                  <span className="font-medium">{schedule.title}</span>
                  <span className="block text-xs text-muted-foreground mt-1">Release {dateText(schedule.releaseAt)} · Due {dateText(schedule.dueAt)}</span>
                </button>
              ))}
            </div>
          )}
          {selectedScheduleId && (
            <div className="space-y-4 border-t pt-5">
              {detailQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading completion report…</p> : null}
              {detailQuery.isError ? <p role="alert" className="text-sm text-destructive">Could not load report: {(detailQuery.error as Error).message}</p> : null}
              {detailQuery.data && (
                <>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-semibold">{detailQuery.data.schedule?.title || "Completion report"}</h3>
                      <p className="text-sm text-muted-foreground">
                        {[
                          ["Recipients", detailQuery.data.summary?.recipientCount],
                          ["Completed", detailQuery.data.summary?.completedCount],
                          ["In progress", detailQuery.data.summary?.inProgressCount],
                          ["Not started", detailQuery.data.summary?.notStartedCount],
                          ["Overdue", detailQuery.data.summary?.overdueCount],
                          ["Completion", typeof detailQuery.data.summary?.completionPercent === "number" ? `${detailQuery.data.summary.completionPercent}%` : undefined],
                        ].filter(([, value]) => value !== undefined).map(([label, value]) => `${label}: ${String(value)}`).join(" · ") ||
                          `${recipients.filter(r => r.status?.toLowerCase() === "completed").length} completed of ${recipients.length} recipients`}
                      </p>
                      {detailQuery.data.emailSummary && (
                        <p className="text-sm text-muted-foreground">
                          Email delivery: {Object.entries(detailQuery.data.emailSummary)
                            .filter(([, value]) => typeof value === "number")
                            .map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase())}: ${value}`)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-36" aria-label="Filter recipients by status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="not_started">Not started</SelectItem>
                          <SelectItem value="in_progress">In progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={downloadReport}><Download className="h-4 w-4 mr-2" /> CSV</Button>
                    </div>
                  </div>
                  <AddRequiredCourses
                    key={detailQuery.data.schedule.id}
                    scheduleId={detailQuery.data.schedule.id}
                    tenantId={detailQuery.data.schedule.tenantId}
                    dueAt={detailQuery.data.schedule.dueAt}
                    existingCourseIds={detailQuery.data.items.filter(item => item.kind === "course").map(item => item.contentId)}
                  />
                  <AddRequiredLearners
                    key={`learners-${detailQuery.data.schedule.id}`}
                    scheduleId={detailQuery.data.schedule.id}
                    tenantId={detailQuery.data.schedule.tenantId}
                    dueAt={detailQuery.data.schedule.dueAt}
                    assignedUserIds={detailQuery.data.recipients.map(recipient => recipient.userId)}
                  />
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/40 text-left">
                        <th className="p-3">Learner</th><th className="p-3">Status</th><th className="p-3">Completed</th><th className="p-3">Required items</th>
                      </tr></thead>
                      <tbody>
                        {visibleRecipients.map(recipient => (
                          <tr key={recipient.userId} className="border-b last:border-0 align-top">
                            <td className="p-3">{recipient.name || recipient.email || recipient.userId}{recipient.email && recipient.name ? <span className="block text-muted-foreground">{recipient.email}</span> : null}</td>
                            <td className="p-3"><Badge variant={recipient.status === "completed" ? "secondary" : "outline"}>{recipient.status || "pending"}</Badge></td>
                            <td className="p-3">{dateText(recipient.completedAt)}</td>
                            <td className="p-3 space-y-1">{(recipient.items || []).map(item => (
                              <div key={item.itemId} className="min-w-48">
                                <span>{item.title} </span><span className="text-muted-foreground">({item.status}{typeof item.progressPercent === "number" ? ` · ${item.progressPercent}%` : ""})</span>
                                {item.completedAt && <span className="block text-xs text-muted-foreground">Completed {dateText(item.completedAt)}</span>}
                                {(item.score !== null && item.score !== undefined || item.resultLabel) && (
                                  <span className="block text-xs text-muted-foreground">
                                    {item.score !== null && item.score !== undefined ? `Score: ${item.score}` : ""}
                                    {item.score !== null && item.score !== undefined && item.resultLabel ? " · " : ""}
                                    {item.resultLabel || ""}
                                  </span>
                                )}
                              </div>
                            ))}{!recipient.items?.length ? "—" : null}</td>
                          </tr>
                        ))}
                        {!visibleRecipients.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No recipients match this status.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {(detailQuery.data.emails || []).some(email => ["failed", "skipped"].includes((email.status || "").toLowerCase())) && (
                    <div className="rounded-md border p-3 text-sm" data-testid="mandatory-training-email-issues">
                      <p className="font-medium">Email delivery issues</p>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {(detailQuery.data.emails || []).filter(email => ["failed", "skipped"].includes((email.status || "").toLowerCase())).map((email, index) => (
                          <li key={`${email.email || email.name || "delivery"}-${index}`}>
                            {email.name || email.email || "Recipient"} · {email.status}
                            {(email.reason || email.error || email.message) ? `: ${email.reason || email.error || email.message}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}