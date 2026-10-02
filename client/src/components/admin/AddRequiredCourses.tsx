import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus } from "lucide-react";

type CourseOption = { id: string; title: string };

export function AddRequiredCourses({ scheduleId, tenantId, existingCourseIds, dueAt }: {
  scheduleId: string;
  tenantId: string;
  existingCourseIds: string[];
  dueAt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { toast } = useToast();
  const options = useQuery<{ courses: CourseOption[] }>({
    queryKey: [`/api/admin/mandatory-training/options?tenantId=${encodeURIComponent(tenantId)}`],
    enabled: open && Boolean(tenantId),
  });
  const courses = (options.data?.courses || []).filter(course => !existingCourseIds.includes(course.id));
  const add = useMutation({
    mutationFn: () => apiRequest(`/api/admin/mandatory-training/${scheduleId}/courses`, "POST", { courseIds: selected }),
    onSuccess: async (result: { addedCount: number }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/admin/mandatory-training/${scheduleId}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/mandatory-training"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/me/mandatory-training"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/me/required-training-availability"] }),
      ]);
      setSelected([]);
      setOpen(false);
      toast({ title: "Required training updated", description: result.addedCount
        ? `${result.addedCount} course${result.addedCount === 1 ? "" : "s"} added. Existing course completions are preserved.`
        : "Those courses are already included in this training set." });
    },
    onError: (error: Error) => toast({ title: "Could not add courses", description: error.message, variant: "destructive" }),
  });

  if (!open) return (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="button-add-required-courses">
      <Plus className="h-4 w-4 mr-2" /> Add courses
    </Button>
  );
  return (
    <div className="space-y-3 rounded-md border p-4" data-testid="required-courses-editor">
      <h4 className="font-semibold">Add courses to this training set</h4>
      <p className="text-sm text-muted-foreground">
        These courses will be required for all existing recipients, with the same release and due dates.
        Their previous course completions stay intact, but the set is not complete until every required item is finished.
        Existing notification emails are not re-sent.
      </p>
      {dueAt && new Date(dueAt) < new Date() && (
        <p className="text-sm text-destructive" role="alert">This set’s due date has passed. Unfinished new courses will be overdue immediately.</p>
      )}
      {options.isLoading && <p className="text-sm">Loading available courses…</p>}
      {options.isError && <p role="alert" className="text-sm text-destructive">Could not load courses: {(options.error as Error).message}</p>}
      {courses.map(course => (
        <label key={course.id} className="flex items-center gap-2 text-sm">
          <Checkbox disabled={add.isPending} checked={selected.includes(course.id)}
            onCheckedChange={checked => setSelected(ids => checked === true ? [...ids, course.id] : ids.filter(id => id !== course.id))} />
          <span>{course.title}</span>
        </label>
      ))}
      {!options.isLoading && !options.isError && !courses.length &&
        <p className="text-sm text-muted-foreground">No additional published courses are available to this tenant.</p>}
      <div className="flex gap-2">
        <Button disabled={add.isPending || !selected.length} onClick={() => add.mutate()} data-testid="button-save-required-courses">
          {add.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add selected courses
        </Button>
        <Button variant="outline" disabled={add.isPending} onClick={() => { setOpen(false); setSelected([]); }}>Cancel</Button>
      </div>
    </div>
  );
}