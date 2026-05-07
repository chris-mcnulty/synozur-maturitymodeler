import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  Plus, Edit, Trash, ChevronLeft, Save, Loader2, Upload, X, ChevronDown, Share2,
  ArrowUp, ArrowDown, BookOpen, ExternalLink, GraduationCap,
} from "lucide-react";
import type {
  Academy, AcademyItem, AcademyExternalProvider, Course,
} from "@shared/schema";

interface AcademyListItem extends Academy {
  itemCount: number;
}

interface AcademyItemWithCourse extends AcademyItem {
  course?: Pick<Course, "id" | "slug" | "title" | "summary" | "imageUrl" | "estimatedMinutes" | "status" | "visibility"> | null;
}

interface AcademyFull extends Academy {
  items: AcademyItemWithCourse[];
}

interface TenantShareRow {
  id: string;
  tenantId: string;
  tenantName: string;
  createdAt: string;
}

interface TenantOption { id: string; name: string }

const PROVIDER_LABELS: Record<AcademyExternalProvider, string> = {
  linkedin_learning: "LinkedIn Learning",
  coursera: "Coursera",
  pluralsight: "Pluralsight",
  youtube: "YouTube",
  udemy: "Udemy",
  edx: "edX",
  other: "Other",
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

export function AcademyManagement() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const listUrl = showArchived
    ? "/api/academies?manageable=true&includeArchived=true"
    : "/api/academies?manageable=true";
  const { data: academies, isLoading } = useQuery<AcademyListItem[]>({
    queryKey: [listUrl],
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/academies/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true&includeArchived=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies"] });
      toast({ title: "Academy archived" });
    },
  });

  if (editingId) {
    return <AcademyBuilder academyId={editingId} onClose={() => setEditingId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-academies-admin-heading">Academies</h2>
          <p className="text-muted-foreground text-sm">
            Build sequenced learning paths from Orion courses and external sources (LinkedIn Learning, Coursera, etc.).
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-show-archived-academies"
              checked={showArchived}
              onCheckedChange={setShowArchived}
              data-testid="switch-show-archived-academies"
            />
            <Label htmlFor="toggle-show-archived-academies" className="cursor-pointer">Show archived</Label>
          </div>
          <Button onClick={() => setCreating(true)} data-testid="button-new-academy">
            <Plus className="h-4 w-4 mr-1" /> New academy
          </Button>
        </div>
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}

      {!isLoading && (!academies || academies.length === 0) && (
        <Card>
          <CardContent className="pt-6 text-muted-foreground" data-testid="text-no-academies">
            No academies yet. Create one to start sequencing courses.
          </CardContent>
        </Card>
      )}

      {!isLoading && academies && academies.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {academies.map(a => (
            <Card
              key={a.id}
              className={`hover-elevate ${a.status === "archived" ? "opacity-60" : ""}`}
              data-testid={`card-admin-academy-${a.id}`}
            >
              {a.imageUrl && (
                <div className="aspect-video w-full overflow-hidden rounded-t-md">
                  <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                </div>
              )}
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate" data-testid={`text-admin-academy-title-${a.id}`}>{a.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">/{a.slug}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant={a.status === "published" ? "default" : a.status === "archived" ? "destructive" : "secondary"}>
                      {a.status}
                    </Badge>
                    <Badge variant="outline">{a.visibility}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                  <span>{a.itemCount} item{a.itemCount === 1 ? "" : "s"}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingId(a.id)} data-testid={`button-edit-academy-${a.id}`}>
                    <Edit className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Archive "${a.title}"?`)) archiveMutation.mutate(a.id);
                    }}
                    data-testid={`button-archive-academy-${a.id}`}
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
        <CreateAcademyDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setEditingId(id); }}
        />
      )}
    </div>
  );
}

function CreateAcademyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const finalSlug = slug || slugify(title);
      return await apiRequest("/api/academies", "POST", {
        title, slug: finalSlug, summary, description: summary,
      });
    },
    onSuccess: (academy: Academy) => {
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true&includeArchived=true"] });
      toast({ title: "Academy created" });
      onCreated(academy.id);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New academy</DialogTitle>
          <DialogDescription>Start with a title — you can add courses and external links next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="academy-title">Title</Label>
            <Input
              id="academy-title"
              value={title}
              onChange={e => { setTitle(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }}
              data-testid="input-new-academy-title"
            />
          </div>
          <div>
            <Label htmlFor="academy-slug">Slug</Label>
            <Input id="academy-slug" value={slug} onChange={e => setSlug(slugify(e.target.value))} data-testid="input-new-academy-slug" />
            <p className="text-xs text-muted-foreground mt-1">URL: /academies/{slug || "your-slug"}</p>
          </div>
          <div>
            <Label htmlFor="academy-summary">Summary</Label>
            <Textarea id="academy-summary" value={summary} onChange={e => setSummary(e.target.value)} data-testid="input-new-academy-summary" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!title || !slug || createMutation.isPending}
            data-testid="button-create-academy-submit"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcademyBuilder({ academyId, onClose }: { academyId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === "global_admin";
  const { data: academy, isLoading } = useQuery<AcademyFull>({
    queryKey: [`/api/academies/${academyId}`],
  });
  const [tab, setTab] = useState<"overview" | "items">("overview");
  const [addingItem, setAddingItem] = useState(false);
  const [showTenantShare, setShowTenantShare] = useState(false);

  const updateMut = useMutation({
    mutationFn: async (patch: Partial<Academy>) => apiRequest(`/api/academies/${academyId}`, "PUT", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/academies/${academyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true&includeArchived=true"] });
      toast({ title: "Saved" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const reorderMut = useMutation({
    mutationFn: async (orderedIds: string[]) =>
      apiRequest(`/api/academies/${academyId}/items/reorder`, "PUT", { orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/academies/${academyId}`] });
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/academy-items/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/academies/${academyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true&includeArchived=true"] });
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (imageUrl: string) =>
      apiRequest(`/api/academies/${academyId}/image`, "PUT", { imageUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/academies/${academyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true&includeArchived=true"] });
      toast({ title: "Image uploaded" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const handleGetUploadParameters = async () => {
    const res = await fetch("/api/objects/upload", { method: "POST", credentials: "include" });
    const data = await res.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };

  if (isLoading || !academy) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const moveItem = (itemId: string, direction: -1 | 1) => {
    const ids = academy.items.map(i => i.id);
    const idx = ids.indexOf(itemId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    reorderMut.mutate(ids);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-back-to-academies-list">
          <ChevronLeft className="h-4 w-4 mr-1" /> All academies
        </Button>
        <h2 className="text-xl font-bold flex-1">{academy.title}</h2>
        <Badge>{academy.status}</Badge>
      </div>

      <div className="flex gap-2 border-b">
        {(["overview", "items"] as const).map(t => (
          <Button
            key={t}
            variant="ghost"
            size="sm"
            className={tab === t ? "border-b-2 border-primary rounded-none" : ""}
            onClick={() => setTab(t)}
            data-testid={`tab-academy-${t}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      {tab === "overview" && (
        <AcademyOverview
          academy={academy}
          isGlobalAdmin={isGlobalAdmin}
          saving={updateMut.isPending}
          onSave={(patch) => updateMut.mutate(patch)}
          onUploadImage={uploadImage.mutate}
          onGetUploadParameters={handleGetUploadParameters}
          onOpenTenantShare={() => setShowTenantShare(true)}
        />
      )}

      {tab === "items" && (
        <div className="space-y-3">
          <Card>
            <CardContent className="pt-6">
              <Button onClick={() => setAddingItem(true)} data-testid="button-add-academy-item">
                <Plus className="h-4 w-4 mr-1" /> Add item
              </Button>
            </CardContent>
          </Card>
          {academy.items.length === 0 && (
            <Card><CardContent className="pt-6 text-muted-foreground">No items yet — add an Orion course or an external link.</CardContent></Card>
          )}
          {academy.items.map((item, idx) => (
            <Card key={item.id} data-testid={`row-academy-item-${item.id}`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-muted-foreground font-mono text-sm w-8 text-right">{idx + 1}.</div>
                    {item.itemType === "course" ? (
                      <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {item.itemType === "course"
                          ? (item.course?.title ?? <span className="text-destructive">[course missing]</span>)
                          : item.externalTitle}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.itemType === "course"
                          ? `Orion course / ${item.course?.slug ?? "?"}`
                          : `${PROVIDER_LABELS[item.externalProvider as AcademyExternalProvider] ?? "External"} — ${item.externalUrl}`}
                      </div>
                    </div>
                    {item.required && <Badge variant="outline">required</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveItem(item.id, -1)}
                      disabled={idx === 0 || reorderMut.isPending}
                      data-testid={`button-move-up-${item.id}`}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveItem(item.id, 1)}
                      disabled={idx === academy.items.length - 1 || reorderMut.isPending}
                      data-testid={`button-move-down-${item.id}`}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm(`Remove this item from the academy?`)) deleteItemMut.mutate(item.id);
                      }}
                      data-testid={`button-delete-academy-item-${item.id}`}
                    >
                      <Trash className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {addingItem && (
        <AddAcademyItemDialog
          academyId={academyId}
          existingCount={academy.items.length}
          onClose={() => setAddingItem(false)}
        />
      )}

      {showTenantShare && (
        <AcademyTenantShareDialog
          academyId={academyId}
          onClose={() => setShowTenantShare(false)}
        />
      )}
    </div>
  );
}

function AcademyOverview({
  academy, isGlobalAdmin, saving, onSave, onUploadImage, onGetUploadParameters, onOpenTenantShare,
}: {
  academy: AcademyFull;
  isGlobalAdmin: boolean;
  saving: boolean;
  onSave: (patch: any) => void;
  onUploadImage: (url: string) => void;
  onGetUploadParameters: () => Promise<{ method: "PUT"; url: string }>;
  onOpenTenantShare: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(academy.title);
  const [summary, setSummary] = useState(academy.summary || "");
  const [description, setDescription] = useState(academy.description);
  const [estimatedMinutes, setEstimatedMinutes] = useState(academy.estimatedMinutes?.toString() || "");
  const [status, setStatus] = useState(academy.status);
  const [visibility, setVisibility] = useState(academy.visibility);

  const removeImage = useMutation({
    mutationFn: async () => apiRequest(`/api/academies/${academy.id}`, "PUT", { imageUrl: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/academies/${academy.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true&includeArchived=true"] });
      toast({ title: "Image removed" });
    },
  });

  const handleUploadComplete = (result: any) => {
    const url = result?.successful?.[0]?.uploadURL;
    if (url) onUploadImage(url);
  };

  const handleSave = () => {
    onSave({
      title, summary: summary || null, description,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : null,
      status, visibility,
    });
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ac-title">Title</Label>
            <Input id="ac-title" value={title} onChange={e => setTitle(e.target.value)} data-testid="input-academy-title" />
          </div>
          <div>
            <Label htmlFor="ac-min">Estimated minutes</Label>
            <Input id="ac-min" type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(e.target.value)} data-testid="input-academy-minutes" />
          </div>
          <div>
            <Label htmlFor="ac-status">Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as any)}>
              <SelectTrigger id="ac-status" data-testid="select-academy-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ac-vis">Visibility</Label>
            <Select value={visibility} onValueChange={v => setVisibility(v as any)} disabled={!isGlobalAdmin}>
              <SelectTrigger id="ac-vis" data-testid="select-academy-visibility"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private (tenant-only)</SelectItem>
              </SelectContent>
            </Select>
            {!isGlobalAdmin && (
              <p className="text-xs text-muted-foreground mt-1">Only global admins can change visibility.</p>
            )}
          </div>
        </div>

        <div>
          <Label>Hero image</Label>
          <p className="text-sm text-muted-foreground mb-2">Upload an image for this academy (under 10MB).</p>
          {academy.imageUrl ? (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden border border-border max-w-md">
                <img src={academy.imageUrl} alt={academy.title} className="w-full h-48 object-cover" data-testid="img-academy-hero" />
              </div>
              <div className="flex gap-2">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10485760}
                  allowedFileTypes={["image/jpeg", "image/png", "image/webp"]}
                  onGetUploadParameters={onGetUploadParameters}
                  onComplete={handleUploadComplete}
                  buttonVariant="outline"
                >
                  <Upload className="h-4 w-4 mr-2" /> Replace image
                </ObjectUploader>
                <Button
                  variant="outline"
                  onClick={() => removeImage.mutate()}
                  disabled={removeImage.isPending}
                  data-testid="button-remove-academy-image"
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
              onGetUploadParameters={onGetUploadParameters}
              onComplete={handleUploadComplete}
            >
              <Upload className="h-4 w-4 mr-2" /> Upload image
            </ObjectUploader>
          )}
        </div>

        <div>
          <Label htmlFor="ac-summary">Summary (catalog blurb)</Label>
          <Textarea id="ac-summary" value={summary} onChange={e => setSummary(e.target.value)} data-testid="input-academy-summary" />
        </div>
        <div>
          <Label htmlFor="ac-description">Description</Label>
          <Textarea id="ac-description" value={description} rows={6} onChange={e => setDescription(e.target.value)} data-testid="input-academy-description" />
        </div>

        {visibility === "private" && (
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">Tenant access</p>
                <p className="text-sm text-muted-foreground">
                  Share this private academy with selected customer tenants beyond its owner.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={onOpenTenantShare}
                disabled={!isGlobalAdmin}
                data-testid="button-manage-academy-tenants"
              >
                <Share2 className="h-4 w-4 mr-1" /> Manage tenants
              </Button>
            </div>
            {!isGlobalAdmin && (
              <p className="text-xs text-muted-foreground mt-2">Only global admins can attach academies to other tenants.</p>
            )}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} data-testid="button-save-academy-overview">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
      </CardContent>
    </Card>
  );
}

function AddAcademyItemDialog({
  academyId, existingCount, onClose,
}: {
  academyId: string;
  existingCount: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [itemType, setItemType] = useState<"course" | "external">("course");
  const [courseId, setCourseId] = useState("");
  const [externalProvider, setExternalProvider] = useState<AcademyExternalProvider>("linkedin_learning");
  const [externalTitle, setExternalTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalDuration, setExternalDuration] = useState("");
  const [externalDescription, setExternalDescription] = useState("");
  const [required, setRequired] = useState(true);

  const { data: courses } = useQuery<{ id: string; title: string; slug: string; status: string }[]>({
    queryKey: ["/api/courses?manageable=true"],
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const body: any = {
        itemType,
        order: existingCount,
        required,
      };
      if (itemType === "course") {
        body.courseId = courseId;
      } else {
        body.externalProvider = externalProvider;
        body.externalTitle = externalTitle;
        body.externalUrl = externalUrl;
        body.externalDescription = externalDescription || null;
        body.externalDurationMinutes = externalDuration ? parseInt(externalDuration, 10) : null;
      }
      return apiRequest(`/api/academies/${academyId}/items`, "POST", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/academies/${academyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/academies?manageable=true"] });
      toast({ title: "Item added" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const canSubmit = itemType === "course"
    ? !!courseId
    : !!externalTitle && !!externalUrl;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add academy item</DialogTitle>
          <DialogDescription>Add an Orion course or an external link to this learning sequence.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="item-type">Type</Label>
            <Select value={itemType} onValueChange={v => setItemType(v as any)}>
              <SelectTrigger id="item-type" data-testid="select-academy-item-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="course">Orion course</SelectItem>
                <SelectItem value="external">External (LinkedIn Learning, etc.)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {itemType === "course" && (
            <div>
              <Label htmlFor="item-course">Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="item-course" data-testid="select-academy-item-course">
                  <SelectValue placeholder="Pick a course" />
                </SelectTrigger>
                <SelectContent>
                  {(courses ?? [])
                    .filter(c => c.status !== "archived")
                    .map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {itemType === "external" && (
            <>
              <div>
                <Label htmlFor="item-provider">Provider</Label>
                <Select value={externalProvider} onValueChange={v => setExternalProvider(v as AcademyExternalProvider)}>
                  <SelectTrigger id="item-provider" data-testid="select-academy-item-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="item-ext-title">Title</Label>
                <Input id="item-ext-title" value={externalTitle} onChange={e => setExternalTitle(e.target.value)} data-testid="input-academy-item-ext-title" />
              </div>
              <div>
                <Label htmlFor="item-ext-url">URL</Label>
                <Input id="item-ext-url" type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} data-testid="input-academy-item-ext-url" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="item-ext-min">Duration (minutes)</Label>
                  <Input id="item-ext-min" type="number" value={externalDuration} onChange={e => setExternalDuration(e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="item-ext-desc">Description</Label>
                <Textarea id="item-ext-desc" value={externalDescription} onChange={e => setExternalDescription(e.target.value)} />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <Switch id="item-required" checked={required} onCheckedChange={setRequired} data-testid="switch-academy-item-required" />
            <Label htmlFor="item-required">Required</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!canSubmit || createMut.isPending}
            data-testid="button-create-academy-item-submit"
          >
            {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcademyTenantShareDialog({ academyId, onClose }: { academyId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: assigned, isLoading } = useQuery<TenantShareRow[]>({
    queryKey: [`/api/academies/${academyId}/tenants`],
  });
  const { data: tenants } = useQuery<TenantOption[]>({
    queryKey: ["/api/model-tenants"],
  });

  const addMut = useMutation({
    mutationFn: async (tenantId: string) =>
      apiRequest(`/api/academies/${academyId}/tenants`, "POST", { tenantId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/academies/${academyId}/tenants`] }),
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });
  const removeMut = useMutation({
    mutationFn: async (tenantId: string) =>
      apiRequest(`/api/academies/${academyId}/tenants/${tenantId}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/academies/${academyId}/tenants`] }),
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const assignedIds = new Set((assigned ?? []).map(a => a.tenantId));
  const sortedTenants = (tenants ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Academy tenant access</DialogTitle>
          <DialogDescription>Pick which tenants can access this private academy.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between" data-testid="select-academy-tenants">
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
                    data-testid={`checkbox-academy-tenant-${t.id}`}
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

// Re-export the icon used in the sidebar
export { GraduationCap as AcademyIcon };
