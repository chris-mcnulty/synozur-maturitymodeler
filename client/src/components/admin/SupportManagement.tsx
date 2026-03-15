import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Search, Send, ExternalLink, ArrowLeft, CheckCircle2, Clock, AlertCircle, Settings, RefreshCw, Link2 } from "lucide-react";
import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS, USER_ROLES } from "@shared/constants";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@shared/schema";
import type { SupportTicket, SupportTicketReply, Tenant } from "@shared/schema";

interface TicketDetailResponse extends SupportTicket {
  authorName: string;
  authorEmail?: string;
  tenantName?: string;
  replies: Array<SupportTicketReply & { authorName: string; authorRole: string }>;
}

interface PlannerStatusResponse {
  configured: boolean;
  connected: boolean;
  message?: string;
}

interface PlannerGroup {
  id: string;
  displayName: string;
}

interface PlannerPlan {
  id: string;
  title: string;
  webUrl?: string;
}

interface SupportIntegrations {
  supportPlannerEnabled: boolean;
  supportPlannerTenantId: string;
  supportPlannerClientId: string;
  supportPlannerHasClientSecret: boolean;
  supportPlannerPlanId: string | null;
  supportPlannerPlanTitle: string | null;
  supportPlannerPlanWebUrl: string | null;
  supportPlannerGroupId: string | null;
  supportPlannerGroupName: string | null;
  supportPlannerBucketName: string | null;
  showChangelogOnLogin: boolean;
}

function getStatusColor(status: string) {
  switch (status) {
    case "open": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "in_progress": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "resolved": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "closed": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    default: return "";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "high": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "medium": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "low": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    default: return "";
  }
}

function BucketNameInput({ value, onSave }: { value: string; onSave: (val: string) => void }) {
  const [localValue, setLocalValue] = useState(value);
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">Bucket Name</label>
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== value) {
            onSave(localValue);
          }
        }}
        placeholder="Support Tickets"
        data-testid="input-bucket-name"
      />
    </div>
  );
}

function TenantSupportSettings({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();

  const { data: integrations, isLoading } = useQuery<SupportIntegrations>({
    queryKey: ["/api/tenants", tenantId, "support-integrations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/support-integrations`);
      if (!res.ok) throw new Error("Failed to load integrations");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<SupportIntegrations>) => {
      return await apiRequest(`/api/tenants/${tenantId}/support-integrations`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "support-integrations"] });
      toast({ title: "Settings updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4" /> Tenant Support Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Show Changelog on Login</p>
            <p className="text-xs text-muted-foreground">Display "What's New" modal to users when they log in after a new version is released</p>
          </div>
          <Switch
            checked={integrations?.showChangelogOnLogin ?? true}
            onCheckedChange={(checked) => updateMutation.mutate({ showChangelogOnLogin: checked })}
            data-testid="switch-changelog-on-login"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PlannerSettings({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [localTenantId, setLocalTenantId] = useState("");
  const [localClientId, setLocalClientId] = useState("");
  const [localClientSecret, setLocalClientSecret] = useState("");
  const [credsInitialized, setCredsInitialized] = useState(false);

  const { data: integrations, isLoading: intLoading } = useQuery<SupportIntegrations>({
    queryKey: ["/api/tenants", tenantId, "support-integrations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/support-integrations`);
      if (!res.ok) throw new Error("Failed to load integrations");
      return res.json();
    },
    enabled: !!tenantId,
  });

  if (integrations && !credsInitialized) {
    setLocalTenantId(integrations.supportPlannerTenantId || "");
    setLocalClientId(integrations.supportPlannerClientId || "");
    setLocalClientSecret("");
    setCredsInitialized(true);
  }

  const { data: plannerStatus, refetch: refetchStatus } = useQuery<PlannerStatusResponse>({
    queryKey: ["/api/planner/status", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/planner/status?tenantId=${tenantId}`);
      if (!res.ok) throw new Error("Failed to check status");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: groups = [] } = useQuery<PlannerGroup[]>({
    queryKey: ["/api/planner/groups", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/planner/groups?tenantId=${tenantId}`);
      if (!res.ok) throw new Error("Failed to load groups");
      return res.json();
    },
    enabled: plannerStatus?.connected === true,
  });

  const { data: plans = [] } = useQuery<PlannerPlan[]>({
    queryKey: ["/api/planner/groups", selectedGroupId, "plans", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/planner/groups/${selectedGroupId}/plans?tenantId=${tenantId}`);
      if (!res.ok) throw new Error("Failed to load plans");
      return res.json();
    },
    enabled: !!selectedGroupId,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      return await apiRequest(`/api/tenants/${tenantId}/support-integrations`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "support-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner/status", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner/groups", tenantId] });
      toast({ title: "Planner settings updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/tenants/${tenantId}/support-integrations/sync-existing`, "POST");
    },
    onSuccess: (data: { synced: number; failed: number; total: number }) => {
      toast({ title: "Sync complete", description: `${data.synced} synced, ${data.failed} failed of ${data.total} total.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Sync failed.", variant: "destructive" });
    },
  });

  if (intLoading) {
    return <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />;
  }

  const handleSaveCredentials = () => {
    const updates: Record<string, any> = {
      supportPlannerTenantId: localTenantId || "",
      supportPlannerClientId: localClientId || "",
    };
    if (localClientSecret) {
      updates.supportPlannerClientSecret = localClientSecret;
    }
    updateMutation.mutate(updates);
    setLocalClientSecret("");
  };

  const handleSelectPlan = (plan: PlannerPlan) => {
    const group = groups.find(g => g.id === selectedGroupId);
    updateMutation.mutate({
      supportPlannerPlanId: plan.id,
      supportPlannerPlanTitle: plan.title,
      supportPlannerPlanWebUrl: plan.webUrl || null,
      supportPlannerGroupId: selectedGroupId,
      supportPlannerGroupName: group?.displayName || null,
    });
  };

  const hasPerTenantCreds = !!(integrations?.supportPlannerTenantId && integrations?.supportPlannerClientId && integrations?.supportPlannerHasClientSecret);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" /> Microsoft Planner Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <p className="text-sm font-medium">Entra ID App Registration</p>
          <p className="text-xs text-muted-foreground">
            Each tenant can connect their own Azure AD app registration for Planner access. The app needs <code>Tasks.ReadWrite.All</code> and <code>Group.Read.All</code> application permissions with admin consent.
            {!hasPerTenantCreds && " Falls back to global credentials if not set."}
          </p>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Azure AD Tenant ID</label>
              <Input
                value={localTenantId}
                onChange={(e) => setLocalTenantId(e.target.value)}
                placeholder="e.g. 0fc6ac5c-d5e5-4855-b3b2-e8d80ca7884e"
                data-testid="input-planner-tenant-id"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Application (Client) ID</label>
              <Input
                value={localClientId}
                onChange={(e) => setLocalClientId(e.target.value)}
                placeholder="e.g. 12345678-abcd-efgh-ijkl-123456789012"
                data-testid="input-planner-client-id"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Client Secret {integrations?.supportPlannerHasClientSecret && <span className="text-green-600">(saved)</span>}
              </label>
              <Input
                type="password"
                value={localClientSecret}
                onChange={(e) => setLocalClientSecret(e.target.value)}
                placeholder={integrations?.supportPlannerHasClientSecret ? "Leave blank to keep existing" : "Enter client secret"}
                data-testid="input-planner-client-secret"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveCredentials}
              disabled={updateMutation.isPending || (!localTenantId && !localClientId)}
              className="gap-2"
              data-testid="button-save-planner-credentials"
            >
              Save Credentials
            </Button>
          </div>
        </div>

        <div className="border-t pt-4" />

        {!plannerStatus?.configured && (
          <p className="text-sm text-muted-foreground">
            Enter per-tenant Entra ID credentials above, or set global PLANNER_TENANT_ID, PLANNER_CLIENT_ID, and PLANNER_CLIENT_SECRET environment variables.
          </p>
        )}

        {plannerStatus?.configured && !plannerStatus?.connected && (
          <p className="text-sm text-destructive">
            Planner is configured but connection failed: {plannerStatus.message}
          </p>
        )}

        {plannerStatus?.configured && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchStatus()}
              className="gap-2"
              data-testid="button-test-planner-connection"
            >
              <RefreshCw className="h-4 w-4" />
              Test Connection
            </Button>
            <Badge variant={plannerStatus?.connected ? "default" : "destructive"} className="text-xs">
              {plannerStatus?.connected ? "Connected" : "Disconnected"}
            </Badge>
            {hasPerTenantCreds && <Badge variant="outline" className="text-xs">Per-Tenant Credentials</Badge>}
          </div>
        )}

        {plannerStatus?.connected && (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Enable Planner Sync</p>
                <p className="text-xs text-muted-foreground">Automatically create Planner tasks for new support tickets</p>
              </div>
              <Switch
                checked={integrations?.supportPlannerEnabled || false}
                onCheckedChange={(checked) => updateMutation.mutate({ supportPlannerEnabled: checked })}
                data-testid="switch-planner-enabled"
              />
            </div>

            {integrations?.supportPlannerPlanId && (
              <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                <p><span className="font-medium">Group:</span> {integrations.supportPlannerGroupName}</p>
                <p><span className="font-medium">Plan:</span> {integrations.supportPlannerPlanTitle}</p>
                <p><span className="font-medium">Bucket:</span> {integrations.supportPlannerBucketName || "Support Tickets"}</p>
                {integrations.supportPlannerPlanWebUrl && (
                  <a href={integrations.supportPlannerPlanWebUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Open in Planner
                  </a>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1 block">Select Group</label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger data-testid="select-planner-group"><SelectValue placeholder="Choose a group..." /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedGroupId && plans.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1 block">Select Plan</label>
                <div className="space-y-1">
                  {plans.map((p) => (
                    <Button
                      key={p.id}
                      variant={integrations?.supportPlannerPlanId === p.id ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => handleSelectPlan(p)}
                      data-testid={`button-plan-${p.id}`}
                    >
                      {p.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <BucketNameInput
              value={integrations?.supportPlannerBucketName || "Support Tickets"}
              onSave={(val) => updateMutation.mutate({ supportPlannerBucketName: val })}
            />

            {integrations?.supportPlannerEnabled && integrations?.supportPlannerPlanId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="gap-2"
                data-testid="button-sync-existing"
              >
                <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                Sync Unsynced Tickets
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SupportManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTenantId, setSettingsTenantId] = useState<string | null>(null);

  const isGlobalAdmin = user?.role === USER_ROLES.GLOBAL_ADMIN || user?.role === 'admin';

  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets"],
  });

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    enabled: isGlobalAdmin,
  });

  const { data: ticketDetail, isLoading: detailLoading } = useQuery<TicketDetailResponse>({
    queryKey: ["/api/support/tickets", selectedTicketId],
    enabled: !!selectedTicketId,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, string> }) => {
      return await apiRequest(`/api/support/tickets/${id}`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
      toast({ title: "Ticket updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update ticket.", variant: "destructive" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ ticketId, message, isInternal }: { ticketId: string; message: string; isInternal: boolean }) => {
      return await apiRequest(`/api/support/tickets/${ticketId}/replies`, "POST", { message, isInternal });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
      setReplyMessage("");
      setIsInternal(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send reply.", variant: "destructive" });
    },
  });

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || String(t.ticketNumber).includes(search);
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    const matchesTenant = tenantFilter === "all" || t.tenantId === tenantFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesTenant;
  });

  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    inProgress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
  };

  if (showSettings) {
    const effectiveTenantId = settingsTenantId || user?.tenantId;
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => { setShowSettings(false); setSettingsTenantId(null); }} className="gap-2 mb-2" data-testid="button-back-from-settings">
          <ArrowLeft className="h-4 w-4" /> Back to Tickets
        </Button>

        {isGlobalAdmin && tenants.length > 0 && (
          <div className="mb-4">
            <label className="text-sm font-medium mb-1 block">Manage Integrations for Tenant</label>
            <Select value={effectiveTenantId || ""} onValueChange={setSettingsTenantId}>
              <SelectTrigger className="w-72" data-testid="select-settings-tenant"><SelectValue placeholder="Select a tenant..." /></SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {effectiveTenantId ? (
          <>
            <TenantSupportSettings tenantId={effectiveTenantId} />
            <PlannerSettings key={effectiveTenantId} tenantId={effectiveTenantId} />
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Please select a tenant to manage its support integration settings.
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (selectedTicketId && ticketDetail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedTicketId(null)} className="gap-2 mb-2" data-testid="button-back-to-tickets">
          <ArrowLeft className="h-4 w-4" /> Back to All Tickets
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Ticket #{ticketDetail.ticketNumber}</p>
                <CardTitle data-testid="text-admin-ticket-subject">{ticketDetail.subject}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  by {ticketDetail.authorName} ({ticketDetail.authorEmail}) &middot; {ticketDetail.tenantName || "No Tenant"} &middot; {new Date(ticketDetail.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select
                  value={ticketDetail.status}
                  onValueChange={(v) => updateMutation.mutate({ id: ticketDetail.id, updates: { status: v } })}
                >
                  <SelectTrigger className="w-36" data-testid="select-admin-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={ticketDetail.priority}
                  onValueChange={(v) => updateMutation.mutate({ id: ticketDetail.id, updates: { priority: v } })}
                >
                  <SelectTrigger className="w-28" data-testid="select-admin-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p] || p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-md p-4 mb-4">
              <p className="whitespace-pre-wrap text-sm" data-testid="text-admin-ticket-description">{ticketDetail.description}</p>
            </div>

            <h4 className="font-semibold mb-3">Replies ({ticketDetail.replies?.length || 0})</h4>
            <div className="space-y-3 mb-4">
              {ticketDetail.replies?.map((reply) => (
                <Card key={reply.id} className={reply.isInternal ? "border-yellow-500/30 bg-yellow-500/5" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{reply.authorName}</span>
                        <Badge variant="outline" className="text-xs">{reply.authorRole}</Badge>
                        {reply.isInternal && <Badge className="bg-yellow-500/20 text-yellow-600 text-xs">Internal</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(reply.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{reply.message}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="p-4 space-y-3">
                <Textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Write a reply..."
                  rows={3}
                  data-testid="input-admin-reply"
                />
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Switch checked={isInternal} onCheckedChange={setIsInternal} data-testid="switch-internal" />
                    <span className="text-sm text-muted-foreground">Internal note (not visible to user)</span>
                  </div>
                  <Button
                    onClick={() => replyMutation.mutate({ ticketId: ticketDetail.id, message: replyMessage, isInternal })}
                    disabled={!replyMessage.trim() || replyMutation.isPending}
                    className="gap-2"
                    data-testid="button-admin-send-reply"
                  >
                    <Send className="h-4 w-4" /> Send Reply
                  </Button>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Support Tickets</h2>
        {(user?.tenantId || isGlobalAdmin) && (
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-2" data-testid="button-planner-settings">
            <Settings className="h-4 w-4" /> Planner Settings
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold" data-testid="stat-total-tickets">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total Tickets</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-blue-500" />
            <span className="text-2xl font-bold" data-testid="stat-open-tickets">{stats.open}</span>
          </div>
          <div className="text-xs text-muted-foreground">Open</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-500" />
            <span className="text-2xl font-bold" data-testid="stat-in-progress-tickets">{stats.inProgress}</span>
          </div>
          <div className="text-xs text-muted-foreground">In Progress</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-2xl font-bold" data-testid="stat-resolved-tickets">{stats.resolved}</span>
          </div>
          <div className="text-xs text-muted-foreground">Resolved</div>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-admin-search-tickets"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-admin-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s] || s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-32" data-testid="select-admin-priority-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p] || p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40" data-testid="select-admin-category-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {TICKET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{TICKET_CATEGORY_LABELS[c] || c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isGlobalAdmin && tenants.length > 0 && (
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger className="w-44" data-testid="select-admin-tenant-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tenants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No support tickets found.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map((ticket) => (
                <TableRow key={ticket.id} className="cursor-pointer" onClick={() => setSelectedTicketId(ticket.id)} data-testid={`row-ticket-${ticket.id}`}>
                  <TableCell className="font-mono text-sm">{ticket.ticketNumber}</TableCell>
                  <TableCell className="font-medium max-w-xs truncate">{ticket.subject}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getStatusColor(ticket.status)}`}>{TICKET_STATUS_LABELS[ticket.status] || ticket.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getPriorityColor(ticket.priority)}`}>{TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(ticket.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" data-testid={`button-view-ticket-${ticket.id}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
