import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { ModelType } from "@shared/schema";

interface ModelTypesEditorProps {
  modelId: string;
}

interface LocalType {
  key: string;
  name: string;
  tagline: string;
  description: string;
  superpowers: string;
  proTip: string;
  imageUrl: string;
}

function toLocal(t: ModelType): LocalType {
  return {
    key: t.key,
    name: t.name,
    tagline: t.tagline || "",
    description: t.description || "",
    superpowers: (t.superpowers || []).join("\n"),
    proTip: t.proTip || "",
    imageUrl: t.imageUrl || "",
  };
}

export function ModelTypesEditor({ modelId }: ModelTypesEditorProps) {
  const { toast } = useToast();

  const { data: types = [] } = useQuery<ModelType[]>({
    queryKey: ["/api/models", modelId, "types"],
    queryFn: async (): Promise<ModelType[]> => apiRequest(`/api/models/${modelId}/types`, "GET"),
  });

  const [locals, setLocals] = useState<Record<string, LocalType>>({});

  useEffect(() => {
    setLocals((prev) => {
      const next = { ...prev };
      types.forEach((t) => {
        if (!next[t.id]) next[t.id] = toLocal(t);
      });
      return next;
    });
  }, [types]);

  const getLocal = (t: ModelType): LocalType => locals[t.id] || toLocal(t);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/models", modelId, "types"] });

  const createType = useMutation({
    mutationFn: () =>
      apiRequest(`/api/models/${modelId}/types`, "POST", {
        key: `type_${Date.now()}`,
        name: "New Type",
        order: types.length,
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Type added" });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to add type.", variant: "destructive" }),
  });

  const updateType = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ModelType> }) =>
      apiRequest(`/api/model-types/${id}`, "PUT", updates),
    onSuccess: () => invalidate(),
    onError: () =>
      toast({ title: "Error", description: "Failed to save type.", variant: "destructive" }),
  });

  const deleteType = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/model-types/${id}`, "DELETE"),
    onSuccess: () => {
      invalidate();
      toast({ title: "Type deleted" });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to delete type.", variant: "destructive" }),
  });

  const save = (t: ModelType, field: keyof LocalType) => {
    const local = getLocal(t);
    if (field === "superpowers") {
      const arr = local.superpowers
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      updateType.mutate({ id: t.id, updates: { superpowers: arr } });
    } else {
      updateType.mutate({ id: t.id, updates: { [field]: local[field] || null } as Partial<ModelType> });
    }
  };

  const setField = (id: string, field: keyof LocalType, value: string) =>
    setLocals((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const sorted = [...types].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Archetypes</h3>
          <p className="text-sm text-muted-foreground">
            Define the types a respondent can be categorized into. Each answer votes for one type.
          </p>
        </div>
        <Button
          onClick={() => createType.mutate()}
          disabled={createType.isPending}
          data-testid="button-add-type"
        >
          <Plus className="w-4 h-4" />
          Add Type
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border rounded-md">
          No types yet. Add your first archetype.
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((t) => {
            const local = getLocal(t);
            return (
              <Card key={t.id} className="p-4 space-y-3" data-testid={`type-card-${t.id}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                    <div>
                      <Label>Key</Label>
                      <Input
                        value={local.key}
                        onChange={(e) => setField(t.id, "key", e.target.value)}
                        onBlur={() => local.key !== t.key && save(t, "key")}
                        placeholder="visionary"
                        data-testid={`input-type-key-${t.id}`}
                      />
                    </div>
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={local.name}
                        onChange={(e) => setField(t.id, "name", e.target.value)}
                        onBlur={() => local.name !== t.name && save(t, "name")}
                        placeholder="The Visionary"
                        data-testid={`input-type-name-${t.id}`}
                      />
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteType.mutate(t.id)}
                    data-testid={`button-delete-type-${t.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div>
                  <Label>Tagline</Label>
                  <Input
                    value={local.tagline}
                    onChange={(e) => setField(t.id, "tagline", e.target.value)}
                    onBlur={() => local.tagline !== (t.tagline || "") && save(t, "tagline")}
                    placeholder="Short, punchy summary"
                    data-testid={`input-type-tagline-${t.id}`}
                  />
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={local.description}
                    onChange={(e) => setField(t.id, "description", e.target.value)}
                    onBlur={() => local.description !== (t.description || "") && save(t, "description")}
                    placeholder="What this archetype is about…"
                    className="resize-none"
                    rows={3}
                    data-testid={`input-type-description-${t.id}`}
                  />
                </div>

                <div>
                  <Label>Superpowers (one per line)</Label>
                  <Textarea
                    value={local.superpowers}
                    onChange={(e) => setField(t.id, "superpowers", e.target.value)}
                    onBlur={() =>
                      local.superpowers !== (t.superpowers || []).join("\n") && save(t, "superpowers")
                    }
                    placeholder={"Strength one\nStrength two"}
                    className="resize-none"
                    rows={3}
                    data-testid={`input-type-superpowers-${t.id}`}
                  />
                </div>

                <div>
                  <Label>Pro Tip</Label>
                  <Textarea
                    value={local.proTip}
                    onChange={(e) => setField(t.id, "proTip", e.target.value)}
                    onBlur={() => local.proTip !== (t.proTip || "") && save(t, "proTip")}
                    placeholder="Advice for this archetype"
                    className="resize-none"
                    rows={2}
                    data-testid={`input-type-protip-${t.id}`}
                  />
                </div>

                <div>
                  <Label>Image URL</Label>
                  <Input
                    value={local.imageUrl}
                    onChange={(e) => setField(t.id, "imageUrl", e.target.value)}
                    onBlur={() => local.imageUrl !== (t.imageUrl || "") && save(t, "imageUrl")}
                    placeholder="https://…"
                    data-testid={`input-type-image-${t.id}`}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
