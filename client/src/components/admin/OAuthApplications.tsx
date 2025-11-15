import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash, Copy, Key, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";

interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  environment: 'development' | 'staging' | 'production';
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: string[];
  pkceRequired: boolean;
  createdAt: string;
  updatedAt: string;
  clientSecret?: string; // Only present when just created/regenerated
}

export function OAuthApplications() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<OAuthClient | null>(null);
  const [newClientSecret, setNewClientSecret] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    environment: 'development' as 'development' | 'staging' | 'production',
    redirectUris: '',
    postLogoutRedirectUris: '',
    pkceRequired: true,
  });

  const { data: clients = [], isLoading } = useQuery<OAuthClient[]>({
    queryKey: ['/api/admin/oauth-clients'],
  });

  const createClient = useMutation({
    mutationFn: (data: typeof formData) => {
      const payload = {
        ...data,
        redirectUris: data.redirectUris.split('\n').filter(uri => uri.trim()),
        postLogoutRedirectUris: data.postLogoutRedirectUris ? data.postLogoutRedirectUris.split('\n').filter(uri => uri.trim()) : [],
      };
      return apiRequest('/api/admin/oauth-clients', 'POST', payload);
    },
    onSuccess: (data: OAuthClient) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/oauth-clients'] });
      toast({ title: 'OAuth client created successfully' });
      setNewClientSecret(data.clientSecret || null);
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create OAuth client',
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const updateClient = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const payload: any = { ...data };
      if (data.redirectUris) {
        payload.redirectUris = data.redirectUris.split('\n').filter((uri: string) => uri.trim());
      }
      if (data.postLogoutRedirectUris !== undefined) {
        payload.postLogoutRedirectUris = data.postLogoutRedirectUris 
          ? data.postLogoutRedirectUris.split('\n').filter((uri: string) => uri.trim())
          : [];
      }
      return apiRequest(`/api/admin/oauth-clients/${id}`, 'PUT', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/oauth-clients'] });
      toast({ title: 'OAuth client updated successfully' });
      setIsEditDialogOpen(false);
      setSelectedClient(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update OAuth client',
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const deleteClient = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/oauth-clients/${id}`, 'DELETE', undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/oauth-clients'] });
      toast({ title: 'OAuth client deleted successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete OAuth client',
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const regenerateSecret = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/oauth-clients/${id}/regenerate-secret`, 'POST', undefined),
    onSuccess: (data: OAuthClient) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/oauth-clients'] });
      toast({ title: 'Client secret regenerated successfully' });
      setNewClientSecret(data.clientSecret || null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to regenerate client secret',
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      environment: 'development',
      redirectUris: '',
      postLogoutRedirectUris: '',
      pkceRequired: true,
    });
  };

  const handleEdit = (client: OAuthClient) => {
    setSelectedClient(client);
    setFormData({
      name: client.name,
      environment: client.environment,
      redirectUris: client.redirectUris.join('\n'),
      postLogoutRedirectUris: client.postLogoutRedirectUris?.join('\n') || '',
      pkceRequired: client.pkceRequired,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (client: OAuthClient) => {
    if (confirm(`Are you sure you want to delete "${client.name}"? This will revoke all tokens and consents for this client.`)) {
      deleteClient.mutate(client.id);
    }
  };

  const handleRegenerateSecret = (client: OAuthClient) => {
    if (confirm(`Are you sure you want to regenerate the client secret for "${client.name}"? The old secret will stop working immediately.`)) {
      regenerateSecret.mutate(client.id);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  if (isLoading) {
    return <div>Loading OAuth clients...</div>;
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold">OAuth Applications</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage OAuth 2.1 clients that can authenticate users via Orion
            </p>
          </div>
          <Button 
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
            data-testid="button-create-oauth-client"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create OAuth Client
          </Button>
        </div>

        {clients.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No OAuth clients configured</p>
            <p className="text-sm mt-2">Create your first OAuth client to enable external applications to authenticate via Orion</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Client ID</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>PKCE Required</TableHead>
                <TableHead>Redirect URIs</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id} data-testid={`row-oauth-client-${client.clientId}`}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded">{client.clientId}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(client.clientId, 'Client ID')}
                        data-testid={`button-copy-client-id-${client.clientId}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={client.environment === 'production' ? 'default' : 'secondary'}>
                      {client.environment}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {client.pkceRequired ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <span className="text-muted-foreground text-sm">No</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      {client.redirectUris.length} URI(s)
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(client.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRegenerateSecret(client)}
                        data-testid={`button-regenerate-secret-${client.clientId}`}
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(client)}
                        data-testid={`button-edit-${client.clientId}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(client)}
                        data-testid={`button-delete-${client.clientId}`}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create Client Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create OAuth Client</DialogTitle>
            <DialogDescription>
              Create a new OAuth 2.1 client application. The client secret will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Application Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Application"
                data-testid="input-client-name"
              />
            </div>
            <div>
              <Label htmlFor="environment">Environment</Label>
              <Select
                value={formData.environment}
                onValueChange={(value) => setFormData({ ...formData, environment: value as any })}
              >
                <SelectTrigger data-testid="select-environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="redirectUris">Redirect URIs (one per line)</Label>
              <textarea
                id="redirectUris"
                className="w-full min-h-24 p-2 border rounded-md text-sm font-mono"
                value={formData.redirectUris}
                onChange={(e) => setFormData({ ...formData, redirectUris: e.target.value })}
                placeholder="https://myapp.example.com/auth/callback&#10;https://myapp-dev.example.com/auth/callback"
                data-testid="input-redirect-uris"
              />
            </div>
            <div>
              <Label htmlFor="postLogoutUris">Post-Logout Redirect URIs (optional, one per line)</Label>
              <textarea
                id="postLogoutUris"
                className="w-full min-h-20 p-2 border rounded-md text-sm font-mono"
                value={formData.postLogoutRedirectUris}
                onChange={(e) => setFormData({ ...formData, postLogoutRedirectUris: e.target.value })}
                placeholder="https://myapp.example.com/logout"
                data-testid="input-post-logout-uris"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="pkceRequired">Require PKCE</Label>
                <p className="text-xs text-muted-foreground">Recommended for security (OAuth 2.1 compliance)</p>
              </div>
              <Switch
                id="pkceRequired"
                checked={formData.pkceRequired}
                onCheckedChange={(checked) => setFormData({ ...formData, pkceRequired: checked })}
                data-testid="switch-pkce-required"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createClient.mutate(formData)}
              disabled={!formData.name || !formData.redirectUris}
              data-testid="button-submit-create-client"
            >
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit OAuth Client</DialogTitle>
            <DialogDescription>
              Update the configuration for {selectedClient?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Application Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-edit-client-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-environment">Environment</Label>
              <Select
                value={formData.environment}
                onValueChange={(value) => setFormData({ ...formData, environment: value as any })}
              >
                <SelectTrigger data-testid="select-edit-environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-redirectUris">Redirect URIs (one per line)</Label>
              <textarea
                id="edit-redirectUris"
                className="w-full min-h-24 p-2 border rounded-md text-sm font-mono"
                value={formData.redirectUris}
                onChange={(e) => setFormData({ ...formData, redirectUris: e.target.value })}
                data-testid="input-edit-redirect-uris"
              />
            </div>
            <div>
              <Label htmlFor="edit-postLogoutUris">Post-Logout Redirect URIs (optional, one per line)</Label>
              <textarea
                id="edit-postLogoutUris"
                className="w-full min-h-20 p-2 border rounded-md text-sm font-mono"
                value={formData.postLogoutRedirectUris}
                onChange={(e) => setFormData({ ...formData, postLogoutRedirectUris: e.target.value })}
                data-testid="input-edit-post-logout-uris"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="edit-pkceRequired">Require PKCE</Label>
                <p className="text-xs text-muted-foreground">Recommended for security (OAuth 2.1 compliance)</p>
              </div>
              <Switch
                id="edit-pkceRequired"
                checked={formData.pkceRequired}
                onCheckedChange={(checked) => setFormData({ ...formData, pkceRequired: checked })}
                data-testid="switch-edit-pkce-required"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedClient && updateClient.mutate({ id: selectedClient.id, data: formData })}
              disabled={!formData.name || !formData.redirectUris}
              data-testid="button-submit-edit-client"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Secret Display Dialog */}
      <Dialog open={!!newClientSecret} onOpenChange={() => setNewClientSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client Secret Generated</DialogTitle>
            <DialogDescription>
              <Alert variant="default" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This is the only time you'll see this secret. Copy it now and store it securely.
                </AlertDescription>
              </Alert>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Client Secret</Label>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all" data-testid="text-client-secret">
                  {newClientSecret}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => newClientSecret && copyToClipboard(newClientSecret, 'Client secret')}
                  data-testid="button-copy-client-secret"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewClientSecret(null)} data-testid="button-close-secret-dialog">
              I've Saved the Secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
