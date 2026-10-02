import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, UserPlus } from "lucide-react";

type Learner = { id: string; name?: string | null; email?: string | null };

export function AddRequiredLearners({ scheduleId, tenantId, assignedUserIds, dueAt }: {
  scheduleId: string;
  tenantId: string;
  assignedUserIds: string[];
  dueAt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [emailText, setEmailText] = useState("");
  const { toast } = useToast();
  const options = useQuery<{ users: Learner[] }>({
    queryKey: [`/api/admin/mandatory-training/options?tenantId=${encodeURIComponent(tenantId)}`],
    enabled: open && Boolean(tenantId),
  });
  const users = (options.data?.users || []).filter(user => !assignedUserIds.includes(user.id));
  const emails = [...new Set(emailText.split(/[\s,;]+/).map(email => email.trim().toLowerCase()).filter(Boolean))];
  const validEmails = emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const add = useMutation({
    mutationFn: () => apiRequest(`/api/admin/mandatory-training/${scheduleId}/learners`, "POST", { userIds, entraEmails: emails }),
    onSuccess: async (result: { addedCount: number; createdCount: number }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/admin/mandatory-training/${scheduleId}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/mandatory-training"] }),
        queryClient.invalidateQueries({ queryKey: [`/api/admin/mandatory-training/options?tenantId=${encodeURIComponent(tenantId)}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/me/mandatory-training"] }),
      ]);
      setUserIds([]);
      setEmailText("");
      setOpen(false);
      toast({
        title: "Learners added",
        description: `${result.addedCount} learner${result.addedCount === 1 ? "" : "s"} added.${result.createdCount ? ` ${result.createdCount} Microsoft account${result.createdCount === 1 ? "" : "s"} pre-registered. Share the Orion link so they can sign in with Microsoft.` : ""}`,
      });
    },
    onError: (error: Error) => toast({ title: "Could not add learners", description: error.message, variant: "destructive" }),
  });
  if (!open) return (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="button-add-required-learners">
      <UserPlus className="h-4 w-4 mr-2" /> Add learners
    </Button>
  );
  return (
    <div className="space-y-4 rounded-md border p-4" data-testid="required-learners-editor">
      <h4 className="font-semibold">Add learners to this training set</h4>
      <p className="text-sm text-muted-foreground">
        New learners receive every item in this set, with its existing release and due dates.
        Existing learners and their progress are unchanged. Courses already completed by a new learner still count.
      </p>
      {dueAt && new Date(dueAt) < new Date() &&
        <p className="text-sm text-destructive" role="alert">The due date has passed. New learners’ unfinished training will be overdue immediately.</p>}
      <div className="space-y-2">
        <h5 className="text-sm font-medium">Existing Orion users</h5>
        {options.isLoading && <p className="text-sm">Loading learners…</p>}
        {options.isError && <p className="text-sm text-destructive" role="alert">Could not load learners: {(options.error as Error).message}</p>}
        {users.map(user => (
          <label key={user.id} className="flex items-center gap-2 text-sm">
            <Checkbox disabled={add.isPending} checked={userIds.includes(user.id)}
              onCheckedChange={checked => setUserIds(ids => checked === true ? [...ids, user.id] : ids.filter(id => id !== user.id))} />
            <span>{user.name || user.email || user.id}{user.name && user.email ? ` (${user.email})` : ""}</span>
          </label>
        ))}
        {!options.isLoading && !options.isError && !users.length &&
          <p className="text-sm text-muted-foreground">All available users in this tenant are already assigned.</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`entra-emails-${scheduleId}`}>Microsoft Entra users who haven’t joined Orion</Label>
        <Textarea id={`entra-emails-${scheduleId}`} value={emailText} disabled={add.isPending}
          onChange={event => setEmailText(event.target.value)} rows={4}
          placeholder={"Enter work email addresses, one per line"} data-testid="input-required-entra-emails" />
        <p className="text-xs text-muted-foreground">
          Use the email address returned by their Microsoft work-account sign-in. Separate addresses with new lines or commas.
          New users get a regular Orion account in this tenant, without a local password.
          This requires the tenant’s Microsoft Entra organization ID to be configured.
          On their first Microsoft sign-in, their assigned training is already available.
          No invitation email is sent by this action; share the Orion link with them.
        </p>
        {!validEmails && <p className="text-sm text-destructive" role="alert">Enter valid email addresses only.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={add.isPending || !validEmails || (!userIds.length && !emails.length)}
          onClick={() => add.mutate()} data-testid="button-save-required-learners">
          {add.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add selected learners
        </Button>
        <Button variant="outline" disabled={add.isPending} onClick={() => { setOpen(false); setUserIds([]); setEmailText(""); }}>Cancel</Button>
      </div>
    </div>
  );
}