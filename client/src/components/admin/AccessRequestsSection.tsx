import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Clock, Shield, Copy, ExternalLink, Building, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AccessRequest {
  id: string;
  modelId: string;
  modelName: string;
  requestorName: string;
  requestorEmail: string;
  organizationName: string;
  organizationDomain?: string | null;
  tenantId?: string | null;
  ssoTenantId?: string | null;
  adminConsentGranted: boolean;
  message?: string | null;
  status: string;
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  denialReason?: string | null;
}

interface Props {
  accessRequests: AccessRequest[];
  onRefresh: () => void;
  currentUserId: string;
}

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Requests" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
];

export function AccessRequestsSection({ accessRequests, onRefresh, currentUserId }: Props) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [denyTarget, setDenyTarget] = useState<AccessRequest | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<AccessRequest | null>(null);
  const [emailConsentUrl, setEmailConsentUrl] = useState<string>("");
  const [emailConsentLoading, setEmailConsentLoading] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const filtered = statusFilter === "all"
    ? accessRequests
    : accessRequests.filter(r => r.status === statusFilter);

  const pendingCount = accessRequests.filter(r => r.status === "pending").length;

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/access-requests/${id}/approve`, "PATCH", {}),
    onSuccess: () => {
      toast({ title: "Access approved", description: "The tenant has been added to the model's allow-list." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-requests/count"] });
      onRefresh();
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const denyMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest(`/api/admin/access-requests/${id}/deny`, "PATCH", { reason }),
    onSuccess: () => {
      toast({ title: "Request denied" });
      setDenyDialogOpen(false);
      setDenyTarget(null);
      setDenyReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-requests/count"] });
      onRefresh();
    },
    onError: () => toast({ title: "Failed to deny request", variant: "destructive" }),
  });

  const handleDenyOpen = (req: AccessRequest) => {
    setDenyTarget(req);
    setDenyReason("");
    setDenyDialogOpen(true);
  };

  const handleDenyConfirm = () => {
    if (!denyTarget) return;
    denyMutation.mutate({ id: denyTarget.id, reason: denyReason });
  };

  const handleEmailOpen = async (req: AccessRequest) => {
    setEmailCopied(false);
    setEmailConsentUrl("");
    setEmailConsentLoading(true);
    setEmailTarget(req);
    setEmailDialogOpen(true);
    try {
      const qs = req.ssoTenantId ? `?ssoTenantId=${encodeURIComponent(req.ssoTenantId)}` : "";
      const res = await fetch(`/api/auth/sso/admin-consent${qs}`);
      if (res.ok) {
        const data = await res.json();
        setEmailConsentUrl(data.consentUrl ?? "[ADMIN CONSENT URL — contact orion@synozur.com]");
      } else {
        setEmailConsentUrl("[ADMIN CONSENT URL — contact orion@synozur.com]");
      }
    } catch {
      setEmailConsentUrl("[ADMIN CONSENT URL — contact orion@synozur.com]");
    }
    setEmailConsentLoading(false);
  };

  const generateEmailText = (req: AccessRequest, consentUrl: string): string => {
    const modelUrl = `${window.location.origin}/${req.modelId}`;

    return `Subject: Action Required — Approve Microsoft SSO for Orion Maturity Assessment

Hi [IT Administrator's Name],

I'm reaching out to request your help enabling Microsoft single sign-on (SSO) for our organization's access to Orion, Synozur's Transformation & Maturity Assessment Platform.

—— WHAT IS ORION? ——

Orion is a private, AI-powered maturity assessment platform from Synozur — The Transformation Company. It enables organizations to measure and accelerate their transformation across key capability dimensions, with AI-generated roadmaps tailored to each result.

Our organization — ${req.organizationName} — has been granted access to a private Orion workspace. To enable seamless, password-free sign-in for our team using their existing Microsoft 365 accounts, we need a one-time admin consent approval from you.

—— WHAT YOU NEED TO DO ——

This is a one-time action that takes less than 2 minutes:

1. Open the link below in your browser (requires Global Administrator or Application Administrator role in Azure / Entra ID)

2. Review the permissions — Orion only requests the minimum necessary, read-only permissions:
   • Sign in and read user profile (openid, profile)
   • View user email address (email)
   • Read basic user information (User.Read)
   No sensitive data, write access, mailbox access, or any other permissions are requested.

3. Click "Accept" to grant consent for your entire organization

—— ADMIN CONSENT LINK ——

${consentUrl}

—— AFTER YOU GRANT CONSENT ——

Users in our organization can sign in to Orion at the link below by clicking "Sign in with Microsoft":
${modelUrl}

You're welcome to verify it works by signing in yourself after granting consent.

—— QUESTIONS? ——

If you have any questions about Orion, what it's used for, or the permissions being requested, the Orion team is happy to help:

Email: orion@synozur.com
Website: https://www.synozur.com

Thank you for your help with this!

Best regards,
${req.requestorName}
${req.organizationName}`;
  };

  const handleCopyEmail = async () => {
    if (!emailTarget) return;
    try {
      await navigator.clipboard.writeText(generateEmailText(emailTarget, emailConsentUrl));
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2500);
      toast({ title: "Email copied", description: "Paste it into your email client to send." });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  function statusBadge(status: string) {
    if (status === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
    if (status === "approved") return <Badge className="gap-1 bg-green-600 text-white"><CheckCircle2 className="w-3 h-3" />Approved</Badge>;
    if (status === "denied") return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Denied</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  }

  return (
    <div className="space-y-6" data-testid="section-access-requests">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">Access Requests</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage requests from organizations to access private assessment models.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {pendingCount} pending
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2" data-testid="button-refresh-access-requests">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {statusFilter === "all" ? "No access requests yet." : `No ${statusFilter} requests.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requestor</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(req => (
                <TableRow key={req.id} data-testid={`row-access-request-${req.id}`}>
                  <TableCell>
                    <div className="font-medium text-sm">{req.requestorName}</div>
                    <div className="text-xs text-muted-foreground">{req.requestorEmail}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium">{req.organizationName}</div>
                        {req.organizationDomain && (
                          <div className="text-xs text-muted-foreground">{req.organizationDomain}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{req.modelName}</div>
                  </TableCell>
                  <TableCell>
                    {req.adminConsentGranted ? (
                      <Badge className="gap-1 bg-green-600/10 text-green-700 dark:text-green-400 border-green-600/20" variant="outline">
                        <CheckCircle2 className="w-3 h-3" />Granted
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(req.status)}</TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(req.requestedAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleEmailOpen(req)}
                        data-testid={`button-email-${req.id}`}
                      >
                        <Copy className="w-3 h-3" />
                        Email template
                      </Button>
                      {req.status === "pending" && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1.5 text-xs bg-green-600 hover:bg-green-700"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(req.id)}
                            data-testid={`button-approve-${req.id}`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => handleDenyOpen(req)}
                            data-testid={`button-deny-${req.id}`}
                          >
                            <XCircle className="w-3 h-3" />
                            Deny
                          </Button>
                        </>
                      )}
                    </div>
                    {req.message && (
                      <div className="text-xs text-muted-foreground italic mt-1 max-w-48 text-right truncate" title={req.message}>
                        "{req.message}"
                      </div>
                    )}
                    {req.denialReason && (
                      <div className="text-xs text-destructive mt-1 text-right">Reason: {req.denialReason}</div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Access Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You are denying access for <strong>{denyTarget?.requestorName}</strong> from{" "}
              <strong>{denyTarget?.organizationName}</strong> to{" "}
              <strong>{denyTarget?.modelName}</strong>.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="deny-reason">Reason (optional — shown to requestor)</Label>
              <Textarea
                id="deny-reason"
                value={denyReason}
                onChange={e => setDenyReason(e.target.value)}
                placeholder="e.g. This assessment is not available for your organization at this time."
                rows={3}
                data-testid="textarea-deny-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={denyMutation.isPending}
              onClick={handleDenyConfirm}
              data-testid="button-confirm-deny"
            >
              {denyMutation.isPending ? "Denying..." : "Deny Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>IT Admin Consent Email Template</DialogTitle>
            <CardDescription className="text-sm mt-1">
              Copy this email and send it to your IT administrator. Replace{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">[IT Administrator's Name]</code> before sending.
            </CardDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {emailConsentLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generating consent URL...
              </div>
            ) : (
              <pre className="text-xs bg-muted rounded-md p-4 whitespace-pre-wrap font-mono leading-relaxed">
                {emailTarget ? generateEmailText(emailTarget, emailConsentUrl) : ""}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Close</Button>
            <Button
              className="gap-2"
              disabled={emailConsentLoading}
              onClick={handleCopyEmail}
              data-testid="button-copy-email-template"
            >
              {emailCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {emailCopied ? "Copied!" : "Copy email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
