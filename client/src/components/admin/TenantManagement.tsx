import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash, Globe, CheckCircle, XCircle } from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  autoCreateUsers: boolean;
  createdAt: string;
  updatedAt: string;
  domains?: TenantDomain[];
  entitlements?: TenantEntitlement[];
}

interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string;
  verified: boolean;
  createdAt: string;
}

interface TenantEntitlement {
  id: string;
  tenantId: string;
  application: string;
  enabled: boolean;
  features: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export function TenantManagement() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isDomainDialogOpen, setIsDomainDialogOpen] = useState(false);
  const [isEntitlementDialogOpen, setIsEntitlementDialogOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  
  const [tenantForm, setTenantForm] = useState({
    name: '',
    logoUrl: '',
    primaryColor: '',
    secondaryColor: '',
    autoCreateUsers: false,
  });

  const [domainForm, setDomainForm] = useState({
    domain: '',
    isPrimary: false,
  });

  const [entitlementForm, setEntitlementForm] = useState({
    application: 'orion',
    enabled: true,
    featureKey: '',
  });

  // Fetch all tenants
  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['/api/tenants'],
  });

  // Create tenant mutation
  const createTenant = useMutation({
    mutationFn: (data: typeof tenantForm) =>
      apiRequest('/api/tenants', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      toast({ title: 'Tenant created successfully' });
      setIsDialogOpen(false);
      resetTenantForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create tenant', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Update tenant mutation
  const updateTenant = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof tenantForm> }) =>
      apiRequest(`/api/tenants/${id}`, 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      toast({ title: 'Tenant updated successfully' });
      setIsDialogOpen(false);
      setEditingTenant(null);
      resetTenantForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update tenant', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Delete tenant mutation
  const deleteTenant = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/tenants/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      toast({ title: 'Tenant deleted successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete tenant', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Create domain mutation
  const createDomain = useMutation({
    mutationFn: ({ tenantId, data }: { tenantId: string; data: typeof domainForm }) =>
      apiRequest(`/api/tenants/${tenantId}/domains`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      toast({ title: 'Domain added successfully' });
      setIsDomainDialogOpen(false);
      resetDomainForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to add domain', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Update entitlement mutation
  const updateEntitlement = useMutation({
    mutationFn: ({ tenantId, data }: { tenantId: string; data: typeof entitlementForm }) =>
      apiRequest(`/api/tenants/${tenantId}/entitlements`, 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      toast({ title: 'Entitlement updated successfully' });
      setIsEntitlementDialogOpen(false);
      resetEntitlementForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update entitlement', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Toggle domain verification mutation
  const toggleDomainVerification = useMutation({
    mutationFn: ({ tenantId, domainId, verified }: { tenantId: string; domainId: string; verified: boolean }) =>
      apiRequest(`/api/tenants/${tenantId}/domains/${domainId}`, 'PATCH', { verified }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      toast({ title: 'Domain verification updated' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update domain verification', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const resetTenantForm = () => {
    setTenantForm({
      name: '',
      logoUrl: '',
      primaryColor: '',
      secondaryColor: '',
      autoCreateUsers: false,
    });
  };

  const resetDomainForm = () => {
    setDomainForm({
      domain: '',
      isPrimary: false,
    });
  };

  const resetEntitlementForm = () => {
    setEntitlementForm({
      application: 'orion',
      enabled: true,
      featureKey: '',
    });
  };

  const handleEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setTenantForm({
      name: tenant.name,
      logoUrl: tenant.logoUrl || '',
      primaryColor: tenant.primaryColor || '',
      secondaryColor: tenant.secondaryColor || '',
      autoCreateUsers: tenant.autoCreateUsers,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTenant) {
      updateTenant.mutate({ id: editingTenant.id, data: tenantForm });
    } else {
      createTenant.mutate(tenantForm);
    }
  };

  const handleDomainSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTenantId) {
      createDomain.mutate({ tenantId: selectedTenantId, data: domainForm });
    }
  };

  const handleEntitlementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTenantId) {
      updateEntitlement.mutate({ tenantId: selectedTenantId, data: entitlementForm });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold">Tenant Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage multi-tenant organizations and their configurations
            </p>
          </div>
          <Button 
            onClick={() => {
              setEditingTenant(null);
              resetTenantForm();
              setIsDialogOpen(true);
            }}
            data-testid="button-create-tenant"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Tenant
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8">Loading tenants...</div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No tenants found. Create your first tenant to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domains</TableHead>
                <TableHead>Entitlements</TableHead>
                <TableHead>Auto-Create Users</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id} data-testid={`tenant-row-${tenant.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {tenant.logoUrl && (
                        <img 
                          src={tenant.logoUrl} 
                          alt={tenant.name} 
                          className="h-6 w-6 object-contain rounded"
                        />
                      )}
                      <span>{tenant.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {tenant.domains && tenant.domains.length > 0 ? (
                        tenant.domains.map((domain) => (
                          <div key={domain.id} className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {domain.domain}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                toggleDomainVerification.mutate({
                                  tenantId: tenant.id,
                                  domainId: domain.id,
                                  verified: !domain.verified
                                });
                              }}
                              data-testid={`button-toggle-verification-${domain.id}`}
                              title={domain.verified ? "Click to unverify domain" : "Click to verify domain"}
                            >
                              {domain.verified ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No domains</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {tenant.entitlements && tenant.entitlements.length > 0 ? (
                        tenant.entitlements.map((ent) => (
                          <Badge 
                            key={ent.id} 
                            variant={ent.enabled ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {ent.application}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {tenant.autoCreateUsers ? (
                      <Badge variant="default">Enabled</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTenantId(tenant.id);
                          setIsDomainDialogOpen(true);
                        }}
                        data-testid={`button-add-domain-${tenant.id}`}
                      >
                        <Globe className="mr-2 h-4 w-4" />
                        Domains
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTenantId(tenant.id);
                          setIsEntitlementDialogOpen(true);
                        }}
                        data-testid={`button-manage-entitlements-${tenant.id}`}
                      >
                        Entitlements
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(tenant)}
                        data-testid={`button-edit-tenant-${tenant.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete tenant "${tenant.name}"? This action cannot be undone.`)) {
                            deleteTenant.mutate(tenant.id);
                          }
                        }}
                        data-testid={`button-delete-tenant-${tenant.id}`}
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

      {/* Create/Edit Tenant Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTenant ? 'Edit Tenant' : 'Create Tenant'}
            </DialogTitle>
            <DialogDescription>
              {editingTenant 
                ? 'Update tenant details and configuration' 
                : 'Create a new tenant organization'}
            </DialogDescription>
          </DialogHeader>
          <form name="orion-tenant-management" onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tenant Name</Label>
                <Input
                  id="name"
                  value={tenantForm.name}
                  onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                  placeholder="Acme Corporation"
                  required
                  data-testid="input-tenant-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input
                  id="logoUrl"
                  type="url"
                  value={tenantForm.logoUrl}
                  onChange={(e) => setTenantForm({ ...tenantForm, logoUrl: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  data-testid="input-tenant-logo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={tenantForm.primaryColor || '#810FFB'}
                      onChange={(e) => setTenantForm({ ...tenantForm, primaryColor: e.target.value })}
                      className="w-20 h-10 p-1 cursor-pointer"
                      data-testid="input-primary-color-picker"
                    />
                    <Input
                      value={tenantForm.primaryColor}
                      onChange={(e) => setTenantForm({ ...tenantForm, primaryColor: e.target.value })}
                      placeholder="#810FFB"
                      className="flex-1"
                      data-testid="input-primary-color"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="secondaryColor"
                      type="color"
                      value={tenantForm.secondaryColor || '#E60CB3'}
                      onChange={(e) => setTenantForm({ ...tenantForm, secondaryColor: e.target.value })}
                      className="w-20 h-10 p-1 cursor-pointer"
                      data-testid="input-secondary-color-picker"
                    />
                    <Input
                      value={tenantForm.secondaryColor}
                      onChange={(e) => setTenantForm({ ...tenantForm, secondaryColor: e.target.value })}
                      placeholder="#E60CB3"
                      className="flex-1"
                      data-testid="input-secondary-color"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="autoCreateUsers"
                  checked={tenantForm.autoCreateUsers}
                  onCheckedChange={(checked) => 
                    setTenantForm({ ...tenantForm, autoCreateUsers: checked })
                  }
                  data-testid="switch-auto-create-users"
                />
                <Label htmlFor="autoCreateUsers">
                  Auto-create users on first login
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setEditingTenant(null);
                  resetTenantForm();
                }}
                data-testid="button-cancel-tenant"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createTenant.isPending || updateTenant.isPending}
                data-testid="button-save-tenant"
              >
                {createTenant.isPending || updateTenant.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Domain Dialog */}
      <Dialog open={isDomainDialogOpen} onOpenChange={setIsDomainDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Domain</DialogTitle>
            <DialogDescription>
              Add a domain for this tenant organization
            </DialogDescription>
          </DialogHeader>
          <form name="orion-add-domain" onSubmit={handleDomainSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  value={domainForm.domain}
                  onChange={(e) => setDomainForm({ ...domainForm, domain: e.target.value })}
                  placeholder="acme.example.com"
                  required
                  data-testid="input-domain"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isPrimary"
                  checked={domainForm.isPrimary}
                  onCheckedChange={(checked) => 
                    setDomainForm({ ...domainForm, isPrimary: checked })
                  }
                  data-testid="switch-is-primary"
                />
                <Label htmlFor="isPrimary">
                  Set as primary domain
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDomainDialogOpen(false);
                  resetDomainForm();
                }}
                data-testid="button-cancel-domain"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createDomain.isPending}
                data-testid="button-add-domain"
              >
                {createDomain.isPending ? 'Adding...' : 'Add Domain'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Entitlements Dialog */}
      <Dialog open={isEntitlementDialogOpen} onOpenChange={setIsEntitlementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Entitlements</DialogTitle>
            <DialogDescription>
              Configure application access and features for this tenant
            </DialogDescription>
          </DialogHeader>
          <form name="orion-manage-entitlements" onSubmit={handleEntitlementSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="application">Application</Label>
                <Input
                  id="application"
                  value={entitlementForm.application}
                  onChange={(e) => setEntitlementForm({ ...entitlementForm, application: e.target.value })}
                  placeholder="orion"
                  required
                  data-testid="input-application"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="featureKey">Feature Key (optional)</Label>
                <Input
                  id="featureKey"
                  value={entitlementForm.featureKey}
                  onChange={(e) => setEntitlementForm({ ...entitlementForm, featureKey: e.target.value })}
                  placeholder="advanced_analytics"
                  data-testid="input-feature-key"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={entitlementForm.enabled}
                  onCheckedChange={(checked) => 
                    setEntitlementForm({ ...entitlementForm, enabled: checked })
                  }
                  data-testid="switch-enabled"
                />
                <Label htmlFor="enabled">
                  Enabled
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEntitlementDialogOpen(false);
                  resetEntitlementForm();
                }}
                data-testid="button-cancel-entitlement"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateEntitlement.isPending}
                data-testid="button-save-entitlement"
              >
                {updateEntitlement.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
