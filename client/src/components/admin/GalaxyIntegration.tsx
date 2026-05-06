import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Copy, RefreshCw, Send, ExternalLink, Plus, Trash2, KeyRound, CheckCircle } from "lucide-react";

interface Policy {
  id: string;
  enabled: boolean;
  exposeAssessments: boolean;
  exposeResults: boolean;
  exposeRecommendations: boolean;
  exposeInsights: boolean;
  exposeCertificates: boolean;
  exposedModelIds: string[] | null;
  audienceMode: 'all' | 'roles';
  audienceRoles: string[] | null;
  audienceTags: string[] | null;
  allowedOrigins: string[] | null;
  rateLimitPerMinute: number;
}

interface WebhookView {
  id: string;
  url: string;
  active: boolean;
  events: string[] | null;
  signingSecretMasked: string;
}

interface PortalKey {
  id: string;
  label: string;
  allowedDomains: string[];
  allowedOrigins: string[];
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export function GalaxyIntegration() {
  const { toast } = useToast();
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");

  // Portal key creation form state
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyDomains, setNewKeyDomains] = useState("");
  const [newKeyOrigins, setNewKeyOrigins] = useState("");
  const [revealedPortalKey, setRevealedPortalKey] = useState<{ keyId: string; rawKey: string } | null>(null);

  // Portal key edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDomains, setEditDomains] = useState("");
  const [editOrigins, setEditOrigins] = useState("");

  const policyQuery = useQuery<{ policy: Policy | null }>({ queryKey: ['/api/admin/galaxy/policy'] });
  const webhookQuery = useQuery<{ webhook: WebhookView | null }>({ queryKey: ['/api/admin/galaxy/webhook'] });
  const deliveriesQuery = useQuery<{ deliveries: any[] }>({ queryKey: ['/api/admin/galaxy/deliveries'] });
  const auditQuery = useQuery<{ entries: any[] }>({ queryKey: ['/api/admin/galaxy/audit'] });
  const portalKeysQuery = useQuery<{ keys: PortalKey[] }>({ queryKey: ['/api/admin/galaxy/portal-keys'] });

  const policy: Policy = policyQuery.data?.policy ?? {
    id: '',
    enabled: false,
    exposeAssessments: true,
    exposeResults: true,
    exposeRecommendations: true,
    exposeInsights: true,
    exposeCertificates: false,
    exposedModelIds: null,
    audienceMode: 'all',
    audienceRoles: null,
    audienceTags: null,
    allowedOrigins: null,
    rateLimitPerMinute: 120,
  };

  const modelsQuery = useQuery<{ models: { id: string; name: string; status: string }[] }>({
    queryKey: ['/api/admin/galaxy/models'],
  });

  const updatePolicy = useMutation({
    mutationFn: async (patch: Partial<Policy>) => {
      return await apiRequest('/api/admin/galaxy/policy', 'PUT', patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/galaxy/policy'] });
      toast({ title: 'Galaxy policy updated' });
    },
    onError: (e: any) => toast({ title: 'Update failed', description: String(e?.message ?? e), variant: 'destructive' }),
  });

  const saveWebhook = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/galaxy/webhook', 'PUT', { url: webhookUrl, active: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/galaxy/webhook'] });
      toast({ title: 'Webhook saved' });
    },
  });

  const rotateSecret = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/galaxy/webhook/rotate-secret', 'POST', {});
    },
    onSuccess: (data: any) => {
      setRevealedSecret(data.signingSecret);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/galaxy/webhook'] });
      toast({ title: 'Secret rotated', description: 'Copy now — it will not be shown again.' });
    },
  });

  const redeliver = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/galaxy/deliveries/${id}/redeliver`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/galaxy/deliveries'] });
      toast({ title: 'Delivery requeued' });
    },
  });

  const testEvent = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/galaxy/webhook/test', 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/galaxy/deliveries'] });
      toast({ title: 'Test event sent' });
    },
  });

  const createPortalKey = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/galaxy/portal-keys', 'POST', {
        label: newKeyLabel.trim(),
        allowedDomains: newKeyDomains.split(',').map((d) => d.trim()).filter(Boolean),
        allowedOrigins: newKeyOrigins.split(',').map((o) => o.trim()).filter(Boolean),
      });
    },
    onSuccess: (data: any) => {
      setRevealedPortalKey({ keyId: data.key.id, rawKey: data.rawKey });
      setNewKeyLabel('');
      setNewKeyDomains('');
      setNewKeyOrigins('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/galaxy/portal-keys'] });
      toast({ title: 'Portal key created', description: 'Copy the key now — it will not be shown again.' });
    },
    onError: (e: any) => toast({ title: 'Failed to create key', description: String(e?.message ?? e), variant: 'destructive' }),
  });

  const updatePortalKey = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; allowedDomains?: string[]; allowedOrigins?: string[]; isActive?: boolean }) => {
      return await apiRequest(`/api/admin/galaxy/portal-keys/${id}`, 'PATCH', patch);
    },
    onSuccess: () => {
      setEditingKey(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/galaxy/portal-keys'] });
      toast({ title: 'Portal key updated' });
    },
    onError: (e: any) => toast({ title: 'Update failed', description: String(e?.message ?? e), variant: 'destructive' }),
  });

  const deletePortalKey = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/galaxy/portal-keys/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/galaxy/portal-keys'] });
      toast({ title: 'Portal key revoked' });
    },
    onError: (e: any) => toast({ title: 'Delete failed', description: String(e?.message ?? e), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6" data-testid="page-galaxy-integration">
      <div>
        <h2 className="text-2xl font-semibold">Galaxy Client Portal</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Configure the API that Galaxy portals use to read assessments, courses, results, and traffic from Orion.
        </p>
      </div>

      <Tabs defaultValue="policy">
        <TabsList>
          <TabsTrigger value="policy" data-testid="tab-galaxy-policy">Policy</TabsTrigger>
          <TabsTrigger value="portal-keys" data-testid="tab-galaxy-portal-keys">Portal Keys</TabsTrigger>
          <TabsTrigger value="webhook" data-testid="tab-galaxy-webhook">Webhook</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-galaxy-activity">Activity</TabsTrigger>
          <TabsTrigger value="api" data-testid="tab-galaxy-api">API</TabsTrigger>
        </TabsList>

        <TabsContent value="policy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Exposure Policy</CardTitle>
              <CardDescription>Master switch and per-artifact controls for what Galaxy can see.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-base">Enable Galaxy</Label>
                  <p className="text-sm text-muted-foreground">When off, all Galaxy API calls return 403 for users in this tenant.</p>
                </div>
                <Switch
                  data-testid="switch-galaxy-enabled"
                  checked={policy.enabled}
                  onCheckedChange={(v) => updatePolicy.mutate({ enabled: v })}
                />
              </div>
              <Separator />
              {([
                ['exposeAssessments', 'Assessments'],
                ['exposeResults', 'Results'],
                ['exposeRecommendations', 'Recommendations'],
                ['exposeInsights', 'Insights'],
                ['exposeCertificates', 'Certificates'],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <Label htmlFor={`switch-${key}`}>{label}</Label>
                  <Switch
                    id={`switch-${key}`}
                    data-testid={`switch-${key}`}
                    checked={Boolean(policy[key])}
                    onCheckedChange={(v) => updatePolicy.mutate({ [key]: v } as Partial<Policy>)}
                  />
                </div>
              ))}
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Audience</Label>
                  <Select
                    value={policy.audienceMode}
                    onValueChange={(v) => updatePolicy.mutate({ audienceMode: v as Policy['audienceMode'] })}
                  >
                    <SelectTrigger data-testid="select-audience-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tenant users</SelectItem>
                      <SelectItem value="roles">Specific roles</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="input-rate-limit">Rate limit (req/min/user)</Label>
                  <Input
                    id="input-rate-limit"
                    data-testid="input-rate-limit"
                    type="number"
                    min={0}
                    max={10000}
                    defaultValue={policy.rateLimitPerMinute}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n) && n !== policy.rateLimitPerMinute) {
                        updatePolicy.mutate({ rateLimitPerMinute: n });
                      }
                    }}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Exposed models</Label>
                <p className="text-xs text-muted-foreground">Leave all unchecked to expose every tenant-visible model. Otherwise, only checked models are visible to Galaxy.</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto">
                  {(modelsQuery.data?.models ?? []).map((m) => {
                    const exposed = policy.exposedModelIds === null ? true : policy.exposedModelIds.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 text-sm" data-testid={`model-toggle-${m.id}`}>
                        <input
                          type="checkbox"
                          checked={exposed}
                          onChange={(e) => {
                            const current = policy.exposedModelIds ?? (modelsQuery.data?.models ?? []).map((x) => x.id);
                            const next = e.target.checked
                              ? Array.from(new Set([...current, m.id]))
                              : current.filter((x) => x !== m.id);
                            updatePolicy.mutate({ exposedModelIds: next });
                          }}
                        />
                        <span>{m.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="input-allowed-origins">Allowed CORS origins (one per line)</Label>
                <textarea
                  id="input-allowed-origins"
                  data-testid="input-allowed-origins"
                  rows={3}
                  className="w-full rounded-md border bg-background p-2 text-sm font-mono"
                  defaultValue={(policy.allowedOrigins ?? []).join('\n')}
                  onBlur={(e) => {
                    const lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                    updatePolicy.mutate({ allowedOrigins: lines.length ? lines : null });
                  }}
                  placeholder="https://galaxy.example.com"
                />
              </div>
              {policy.audienceMode === 'roles' && (
                <div className="space-y-2">
                  <Label htmlFor="input-audience-roles">Audience roles (comma-separated)</Label>
                  <Input
                    id="input-audience-roles"
                    data-testid="input-audience-roles"
                    defaultValue={(policy.audienceRoles ?? []).join(', ')}
                    onBlur={(e) => {
                      const roles = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                      updatePolicy.mutate({ audienceRoles: roles.length ? roles : null });
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portal-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create portal key</CardTitle>
              <CardDescription>
                Issue a static API key for an external portal (e.g. synozur-baseline). The portal authenticates with
                <code className="mx-1 text-xs">Authorization: ApiKey &lt;key&gt;</code> and passes
                <code className="ml-1 text-xs">?domain=synozur.com</code> to scope data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="input-portal-key-label">Label</Label>
                  <Input
                    id="input-portal-key-label"
                    data-testid="input-portal-key-label"
                    placeholder="synozur-baseline"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="input-portal-key-domains">Allowed domains (comma-separated)</Label>
                  <Input
                    id="input-portal-key-domains"
                    data-testid="input-portal-key-domains"
                    placeholder="synozur.com, synozur.io"
                    value={newKeyDomains}
                    onChange={(e) => setNewKeyDomains(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="input-portal-key-origins">Allowed origins (comma-separated)</Label>
                  <Input
                    id="input-portal-key-origins"
                    data-testid="input-portal-key-origins"
                    placeholder="https://synozur.com"
                    value={newKeyOrigins}
                    onChange={(e) => setNewKeyOrigins(e.target.value)}
                  />
                </div>
              </div>
              <Button
                data-testid="button-create-portal-key"
                onClick={() => createPortalKey.mutate()}
                disabled={createPortalKey.isPending || !newKeyLabel.trim()}
              >
                <Plus className="h-4 w-4 mr-2" /> Issue key
              </Button>

              {revealedPortalKey && (
                <div className="rounded-md border p-4 bg-muted/50 space-y-2" data-testid="panel-revealed-portal-key">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Key created — copy it now. It will not be shown again.
                  </div>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={revealedPortalKey.rawKey}
                      className="font-mono text-xs"
                      data-testid="text-revealed-portal-key"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(revealedPortalKey.rawKey);
                        toast({ title: 'Copied to clipboard' });
                      }}
                      data-testid="button-copy-portal-key"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    Use as: <code>Authorization: ApiKey {revealedPortalKey.rawKey.slice(0, 12)}…</code>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issued portal keys</CardTitle>
              <CardDescription>Keys let external portals pull models, courses, results, and traffic without per-user OAuth.</CardDescription>
            </CardHeader>
            <CardContent>
              {portalKeysQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (portalKeysQuery.data?.keys ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No portal keys yet.</p>
              ) : (
                <div className="space-y-3">
                  {(portalKeysQuery.data?.keys ?? []).map((k) => (
                    <div
                      key={k.id}
                      className="rounded-md border p-4 space-y-3"
                      data-testid={`card-portal-key-${k.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">{k.label}</span>
                          <Badge variant={k.isActive ? 'default' : 'secondary'}>
                            {k.isActive ? 'Active' : 'Revoked'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-toggle-key-${k.id}`}
                            onClick={() => updatePortalKey.mutate({ id: k.id, isActive: !k.isActive })}
                            disabled={updatePortalKey.isPending}
                          >
                            {k.isActive ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            data-testid={`button-delete-key-${k.id}`}
                            onClick={() => {
                              if (confirm(`Revoke key "${k.label}"? This cannot be undone.`)) {
                                deletePortalKey.mutate(k.id);
                              }
                            }}
                            disabled={deletePortalKey.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground">Allowed domains: </span>
                          {k.allowedDomains.length > 0 ? k.allowedDomains.join(', ') : <em>any</em>}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Allowed origins: </span>
                          {k.allowedOrigins.length > 0 ? k.allowedOrigins.join(', ') : <em>any</em>}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Created: </span>
                          {new Date(k.createdAt).toLocaleDateString()}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Last used: </span>
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : <em>never</em>}
                        </div>
                      </div>

                      {editingKey === k.id ? (
                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Domains (comma-separated)</Label>
                              <Input
                                data-testid={`input-edit-domains-${k.id}`}
                                className="text-xs h-8"
                                value={editDomains}
                                onChange={(e) => setEditDomains(e.target.value)}
                                placeholder="synozur.com, synozur.io"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Origins (comma-separated)</Label>
                              <Input
                                data-testid={`input-edit-origins-${k.id}`}
                                className="text-xs h-8"
                                value={editOrigins}
                                onChange={(e) => setEditOrigins(e.target.value)}
                                placeholder="https://synozur.com"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              data-testid={`button-save-key-edit-${k.id}`}
                              onClick={() =>
                                updatePortalKey.mutate({
                                  id: k.id,
                                  allowedDomains: editDomains.split(',').map((d) => d.trim()).filter(Boolean),
                                  allowedOrigins: editOrigins.split(',').map((o) => o.trim()).filter(Boolean),
                                })
                              }
                              disabled={updatePortalKey.isPending}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingKey(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          data-testid={`button-edit-key-${k.id}`}
                          onClick={() => {
                            setEditingKey(k.id);
                            setEditDomains(k.allowedDomains.join(', '));
                            setEditOrigins(k.allowedOrigins.join(', '));
                          }}
                        >
                          Edit domains / origins
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Portal API endpoints</CardTitle>
              <CardDescription>
                These endpoints accept <code>Authorization: ApiKey &lt;key&gt;</code> or <code>X-Galaxy-Key: &lt;key&gt;</code>. All read-only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm font-mono text-muted-foreground">
                <li><span className="text-green-500">GET</span> /api/galaxy/v1/portal/models?domain=synozur.com</li>
                <li><span className="text-green-500">GET</span> /api/galaxy/v1/portal/courses?domain=synozur.com</li>
                <li><span className="text-green-500">GET</span> /api/galaxy/v1/portal/results?domain=synozur.com&amp;modelId=&amp;limit=50&amp;from=ISO</li>
                <li><span className="text-green-500">GET</span> /api/galaxy/v1/portal/traffic?from=ISO&amp;to=ISO</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Models, courses, and results require <code>?domain=</code>. Traffic is app-wide; no domain needed.
                Domain must be in the key's allowed-domains list (or the list can be empty to allow any).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhook" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Outbound Webhook</CardTitle>
              <CardDescription>Receive signed events when assessments complete or attestations are signed. Signature header: <code>x-galaxy-signature: sha256=…</code> over <code>{`${'{timestamp}.{body}'}`}</code>.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="input-webhook-url">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="input-webhook-url"
                    data-testid="input-webhook-url"
                    placeholder="https://galaxy.example.com/webhooks/orion"
                    defaultValue={webhookQuery.data?.webhook?.url ?? ''}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <Button data-testid="button-save-webhook" onClick={() => saveWebhook.mutate()} disabled={saveWebhook.isPending || !webhookUrl}>
                    Save
                  </Button>
                </div>
              </div>

              {webhookQuery.data?.webhook && (
                <div className="space-y-2">
                  <Label>Signing secret</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">{webhookQuery.data.webhook.signingSecretMasked}</Badge>
                    <Button size="sm" variant="outline" data-testid="button-rotate-secret" onClick={() => rotateSecret.mutate()} disabled={rotateSecret.isPending}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Rotate
                    </Button>
                    <Button size="sm" variant="outline" data-testid="button-test-webhook" onClick={() => testEvent.mutate()} disabled={testEvent.isPending}>
                      <Send className="h-3 w-3 mr-1" /> Send test event
                    </Button>
                  </div>
                  {revealedSecret && (
                    <div className="rounded-md border p-3 bg-muted/50 space-y-2">
                      <p className="text-sm font-medium">New signing secret (copy now — it will not be shown again):</p>
                      <div className="flex gap-2">
                        <Input readOnly value={revealedSecret} className="font-mono text-xs" data-testid="text-revealed-secret" />
                        <Button size="icon" variant="outline" onClick={() => navigator.clipboard.writeText(revealedSecret)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent webhook deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              {deliveriesQuery.data?.deliveries?.length ? (
                <div className="space-y-2">
                  {deliveriesQuery.data.deliveries.slice(0, 25).map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between text-sm border-b pb-2 gap-2" data-testid={`row-delivery-${d.id}`}>
                      <span className="font-mono text-xs">{d.eventType}</span>
                      <Badge variant={d.status === 'delivered' ? 'default' : d.status === 'failed' ? 'destructive' : 'secondary'}>
                        {d.status} {d.responseStatus ? `(${d.responseStatus})` : ''}
                      </Badge>
                      <span className="text-muted-foreground text-xs">{new Date(d.createdAt).toLocaleString()}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-redeliver-${d.id}`}
                        onClick={() => redeliver.mutate(d.id)}
                        disabled={redeliver.isPending}
                      >
                        Redeliver
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No deliveries yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent API audit log</CardTitle>
              <CardDescription>Sensitive Galaxy reads (assessments, results, insights).</CardDescription>
            </CardHeader>
            <CardContent>
              {auditQuery.data?.entries?.length ? (
                <div className="space-y-1 max-h-96 overflow-auto">
                  {auditQuery.data.entries.slice(0, 50).map((e: any) => (
                    <div key={e.id} className="text-xs font-mono flex justify-between gap-2 border-b py-1" data-testid={`row-audit-${e.id}`}>
                      <span>{new Date(e.createdAt).toLocaleString()}</span>
                      <span>{e.method} {e.path}</span>
                      <span>{e.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No API calls yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API reference</CardTitle>
              <CardDescription>
                User-scoped OAuth API at <code>/api/galaxy/v1</code> (requires OAuth token with <code>galaxy_portal</code> scope).
                Portal key API at <code>/api/galaxy/v1/portal</code> (requires <code>Authorization: ApiKey &lt;key&gt;</code>).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild data-testid="button-openapi">
                <a href="/api/galaxy/v1/openapi.json" target="_blank" rel="noreferrer">
                  Open OpenAPI 3.1 spec <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">USER-SCOPED (OAuth bearer)</p>
                  <ul className="space-y-1 text-sm font-mono">
                    <li>GET /api/galaxy/v1/me</li>
                    <li>GET /api/galaxy/v1/artifacts</li>
                    <li>GET /api/galaxy/v1/assessments</li>
                    <li>GET /api/galaxy/v1/assessments/:id</li>
                    <li>GET /api/galaxy/v1/insights/me</li>
                    <li>GET /api/galaxy/v1/courses</li>
                    <li>GET /api/galaxy/v1/certificates</li>
                    <li>GET /api/galaxy/v1/attestations</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">PORTAL / DOMAIN-SCOPED (ApiKey)</p>
                  <ul className="space-y-1 text-sm font-mono">
                    <li>GET /api/galaxy/v1/portal/models?domain=</li>
                    <li>GET /api/galaxy/v1/portal/courses?domain=</li>
                    <li>GET /api/galaxy/v1/portal/results?domain=</li>
                    <li>GET /api/galaxy/v1/portal/traffic?from=&amp;to=</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
