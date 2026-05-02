import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Upload, X, Loader2 } from "lucide-react";
import { hexToHsl } from "@/hooks/use-tenant-branding";
import type { Tenant } from "@shared/schema";
import { tenantBrandingSchema } from "@shared/schema";

const formSchema = z.object({
  logoUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  primaryColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/i, "Use a hex color, e.g. #810FFB")
    .or(z.literal("")),
  accentColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/i, "Use a hex color, e.g. #E60CB3")
    .or(z.literal("")),
  emailFromName: z.string().max(100).or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

interface BrandingPanelProps {
  tenantId: string;
  isGlobalAdmin: boolean;
  availableTenants?: Array<{ id: string; name: string }>;
}

export function BrandingPanel({ tenantId, isGlobalAdmin, availableTenants = [] }: BrandingPanelProps) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenantId);

  const { data: tenant, isLoading } = useQuery<Tenant>({
    queryKey: ["/api/tenants", selectedTenantId],
    enabled: !!selectedTenantId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      logoUrl: null,
      faviconUrl: null,
      primaryColor: "",
      accentColor: "",
      emailFromName: "",
    },
  });

  // Hydrate form when tenant data loads / changes
  useEffect(() => {
    if (tenant) {
      form.reset({
        logoUrl: tenant.logoUrl ?? null,
        faviconUrl: tenant.faviconUrl ?? null,
        primaryColor: tenant.primaryColor ?? "",
        accentColor: tenant.accentColor ?? "",
        emailFromName: tenant.emailFromName ?? "",
      });
    }
  }, [tenant?.id, tenant?.logoUrl, tenant?.faviconUrl, tenant?.primaryColor, tenant?.accentColor, tenant?.emailFromName]);

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = tenantBrandingSchema.parse({
        logoUrl: values.logoUrl ?? "",
        faviconUrl: values.faviconUrl ?? "",
        primaryColor: values.primaryColor,
        accentColor: values.accentColor,
        emailFromName: values.emailFromName,
      });
      return await apiRequest(`/api/tenants/${selectedTenantId}/branding`, "PUT", payload);
    },
    onSuccess: () => {
      toast({ title: "Branding saved", description: "Your changes are live." });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", selectedTenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/tenant"] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save branding",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGetUploadParameters = async () => {
    const data = await apiRequest("/api/objects/upload", "POST");
    return { method: "PUT" as const, url: data.uploadURL };
  };

  const watchedLogo = form.watch("logoUrl");
  const watchedPrimary = form.watch("primaryColor");
  const watchedAccent = form.watch("accentColor");
  const previewPrimaryHsl = watchedPrimary ? hexToHsl(watchedPrimary) : null;
  const previewAccentHsl = watchedAccent ? hexToHsl(watchedAccent) : null;

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate(values);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" data-testid="heading-branding">Branding</h2>
        <p className="text-sm text-muted-foreground">
          Customize the logo, colors, favicon, and email "From" name shown to your tenant's users.
        </p>
      </div>

      {isGlobalAdmin && availableTenants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenant</CardTitle>
            <CardDescription>Select which tenant's branding to edit.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
              <SelectTrigger data-testid="select-branding-tenant" className="max-w-md">
                <SelectValue placeholder="Select a tenant" />
              </SelectTrigger>
              <SelectContent>
                {availableTenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {!selectedTenantId ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Select a tenant to edit its branding.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tenant…
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Logo */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Logo</CardTitle>
                  <CardDescription>PNG, JPG, or SVG. Max 2 MB. Shown in the header for your users.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-center min-h-24 rounded-md border bg-muted/30 p-4">
                    {watchedLogo ? (
                      <img src={watchedLogo} alt="Tenant logo preview" className="max-h-16 w-auto object-contain" data-testid="img-logo-preview" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No logo set — Synozur default will be used.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ObjectUploader
                      maxFileSize={2 * 1024 * 1024}
                      allowedFileTypes={["image/png", "image/jpeg", "image/svg+xml", "image/webp"]}
                      onGetUploadParameters={handleGetUploadParameters}
                      onComplete={(result) => {
                        const uploaded = result.successful?.[0];
                        if (uploaded?.uploadURL) {
                          form.setValue("logoUrl", uploaded.uploadURL as string, { shouldDirty: true });
                        }
                      }}
                      buttonVariant="outline"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload logo
                    </ObjectUploader>
                    {watchedLogo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => form.setValue("logoUrl", null, { shouldDirty: true })}
                        data-testid="button-clear-logo"
                      >
                        <X className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Favicon */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Favicon</CardTitle>
                  <CardDescription>Square PNG or ICO recommended. Max 256 KB.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 min-h-16 rounded-md border bg-muted/30 p-4">
                    {form.watch("faviconUrl") ? (
                      <img src={form.watch("faviconUrl")!} alt="Favicon preview" className="h-8 w-8 object-contain" data-testid="img-favicon-preview" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No favicon set — Synozur default will be used.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ObjectUploader
                      maxFileSize={256 * 1024}
                      allowedFileTypes={["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml"]}
                      onGetUploadParameters={handleGetUploadParameters}
                      onComplete={(result) => {
                        const uploaded = result.successful?.[0];
                        if (uploaded?.uploadURL) {
                          form.setValue("faviconUrl", uploaded.uploadURL as string, { shouldDirty: true });
                        }
                      }}
                      buttonVariant="outline"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload favicon
                    </ObjectUploader>
                    {form.watch("faviconUrl") && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => form.setValue("faviconUrl", null, { shouldDirty: true })}
                        data-testid="button-clear-favicon"
                      >
                        <X className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Colors */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Colors</CardTitle>
                  <CardDescription>Primary and accent colors used throughout the app.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary color</FormLabel>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Input type="text" placeholder="#810FFB" {...field} value={field.value ?? ""} data-testid="input-primary-color" className="max-w-[160px]" />
                          </FormControl>
                          <Input
                            type="color"
                            value={field.value || "#810FFB"}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            data-testid="input-primary-color-picker"
                            className="h-9 w-12 p-1"
                          />
                          {!previewPrimaryHsl && field.value && (
                            <span className="text-xs text-destructive">Invalid hex</span>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accentColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accent color</FormLabel>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Input type="text" placeholder="#E60CB3" {...field} value={field.value ?? ""} data-testid="input-accent-color" className="max-w-[160px]" />
                          </FormControl>
                          <Input
                            type="color"
                            value={field.value || "#E60CB3"}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            data-testid="input-accent-color-picker"
                            className="h-9 w-12 p-1"
                          />
                          {!previewAccentHsl && field.value && (
                            <span className="text-xs text-destructive">Invalid hex</span>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Email */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Email</CardTitle>
                  <CardDescription>Display name shown in the "From" header of tenant-scoped emails.</CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="emailFromName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email "From" display name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Acme Corp Support" {...field} value={field.value ?? ""} data-testid="input-email-from-name" />
                        </FormControl>
                        <FormDescription>
                          Leave blank to use the tenant name. The sender address (e.g. support@synozur.com) is unchanged.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Live preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview</CardTitle>
                <CardDescription>How your branding will look in the app.</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="rounded-md border p-6 space-y-4"
                  style={{
                    ...(previewPrimaryHsl ? ({ ["--primary" as any]: previewPrimaryHsl }) : {}),
                    ...(previewAccentHsl ? ({ ["--accent" as any]: previewAccentHsl }) : {}),
                  }}
                  data-testid="branding-preview"
                >
                  <div className="flex items-center gap-3">
                    {watchedLogo ? (
                      <img src={watchedLogo} alt="Logo" className="h-8 w-auto object-contain" />
                    ) : (
                      <div className="h-8 w-24 rounded bg-muted" />
                    )}
                    <span className="text-lg font-bold">Orion</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button type="button" variant="default">Primary button</Button>
                    <Button type="button" variant="outline">Outline</Button>
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-accent text-accent-foreground">
                      Accent badge
                    </span>
                  </div>
                  <p className="text-sm">
                    Sample text with a <a href="#" className="text-primary underline">primary link</a>.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={updateMutation.isPending || !form.formState.isDirty} data-testid="button-save-branding">
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save branding
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={updateMutation.isPending}
                onClick={() => {
                  if (tenant) {
                    form.reset({
                      logoUrl: tenant.logoUrl ?? null,
                      faviconUrl: tenant.faviconUrl ?? null,
                      primaryColor: tenant.primaryColor ?? "",
                      accentColor: tenant.accentColor ?? "",
                      emailFromName: tenant.emailFromName ?? "",
                    });
                  }
                }}
                data-testid="button-discard-branding"
              >
                Discard changes
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
