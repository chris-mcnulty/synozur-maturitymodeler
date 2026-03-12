import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock, CheckCircle2, Clock, XCircle, ExternalLink, Copy, Shield, ArrowRight, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

interface AccessStatusData {
  canAccess: boolean;
  requestStatus: "none" | "pending" | "approved" | "denied";
  adminConsentGranted: boolean;
  adminConsentUrl: string | null;
  ssoConfigured: boolean;
  model: {
    id: string;
    name: string;
    slug: string;
    description: string;
    estimatedTime?: string | null;
    visibility: string;
  };
  existingRequest: {
    id: string;
    status: string;
    requestedAt: string;
    denialReason?: string | null;
  } | null;
}

interface PrivateAccessGateProps {
  modelSlug: string;
  modelNameFallback?: string;
  modelDescFallback?: string;
}

export function PrivateAccessGate({ modelSlug, modelNameFallback, modelDescFallback }: PrivateAccessGateProps) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [consentCopied, setConsentCopied] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", organization: "", message: "" });

  const { data: user } = useQuery<User>({ queryKey: ["/api/user"] });

  const { data: accessStatus, isLoading } = useQuery<AccessStatusData>({
    queryKey: ["/api/models", modelSlug, "access-status"],
    queryFn: () => fetch(`/api/models/${modelSlug}/access-status`).then(r => r.json()),
  });

  const requestMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/models/${modelSlug}/request-access`, "POST", {
        requestorName: form.name,
        requestorEmail: form.email,
        organizationName: form.organization,
        message: form.message || undefined,
      }),
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/models", modelSlug, "access-status"] });
    },
    onError: (error: any) => {
      if (error?.message?.includes("already pending")) {
        toast({ title: "Request already submitted", description: "We already have a pending request for this email address." });
        setSubmitted(true);
      } else {
        toast({ title: "Failed to submit request", description: "Please try again.", variant: "destructive" });
      }
    },
  });

  const handleCopyConsent = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setConsentCopied(true);
      setTimeout(() => setConsentCopied(false), 2000);
      toast({ title: "Copied", description: "Admin consent URL copied to clipboard." });
    } catch {
      toast({ title: "Could not copy", description: "Please copy the URL manually.", variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Checking access...</div>
      </div>
    );
  }

  const model = accessStatus?.model ?? {
    name: modelNameFallback ?? "Private Assessment",
    description: modelDescFallback ?? "",
    slug: modelSlug,
    id: "",
    visibility: "private",
    estimatedTime: null,
  };

  const status = accessStatus?.requestStatus ?? "none";
  const adminConsentUrl = accessStatus?.adminConsentUrl;
  const adminConsentGranted = accessStatus?.adminConsentGranted ?? false;
  const ssoConfigured = accessStatus?.ssoConfigured ?? false;

  // Pre-fill form from user profile if available
  const defaultName = form.name || user?.name || "";
  const defaultEmail = form.email || user?.email || "";
  const defaultOrg = form.organization || user?.company || "";

  const prefillForm = () => {
    setForm(f => ({
      name: f.name || user?.name || "",
      email: f.email || user?.email || "",
      organization: f.organization || user?.company || "",
      message: f.message,
    }));
  };

  if (status === "pending" || submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-lg w-full" data-testid="card-access-pending">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-7 h-7 text-amber-500" />
              </div>
            </div>
            <h2 className="text-xl font-semibold mb-2">Request Under Review</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Your request to access <span className="font-medium text-foreground">{model.name}</span> has been submitted.
              Our team will review it shortly.
            </p>
            {ssoConfigured && !adminConsentGranted && adminConsentUrl && (
              <div className="mt-6 text-left">
                <Separator className="mb-6" />
                <div className="flex items-start gap-3 p-4 rounded-md bg-muted/50">
                  <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium mb-1">Speed up your access</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Ask your Microsoft 365 administrator to grant consent for your organization.
                      This allows everyone in your org to sign in without individual prompts.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyConsent(adminConsentUrl)}
                      data-testid="button-copy-consent-url-pending"
                      className="gap-2"
                    >
                      {consentCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {consentCopied ? "Copied" : "Copy admin consent URL"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-lg w-full" data-testid="card-access-denied">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-7 h-7 text-destructive" />
              </div>
            </div>
            <h2 className="text-xl font-semibold mb-2">Access Not Approved</h2>
            <p className="text-muted-foreground text-sm mb-1">
              Your request to access <span className="font-medium text-foreground">{model.name}</span> was not approved.
            </p>
            {accessStatus?.existingRequest?.denialReason && (
              <p className="text-sm text-muted-foreground mt-2 italic">
                "{accessStatus.existingRequest.denialReason}"
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              Contact <a href="mailto:support@synozur.com" className="underline">support@synozur.com</a> if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-7 h-7 text-primary" />
            </div>
          </div>
          <Badge variant="secondary" className="mb-3">Private Assessment</Badge>
          <h1 className="text-2xl font-bold mb-2" data-testid="text-private-model-name">{model.name}</h1>
          {model.description && (
            <p className="text-muted-foreground text-sm max-w-md mx-auto">{model.description}</p>
          )}
        </div>

        {ssoConfigured && adminConsentGranted ? (
          <>
            <Card className="border-primary/30" data-testid="card-sso-signin">
              <CardContent className="py-8">
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">Your organization has approved Orion</p>
                    <p className="text-xs text-muted-foreground">
                      Sign in with your Microsoft work account to access this assessment.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="gap-2"
                    onClick={() => {
                      window.location.href = `/auth/sso/microsoft?returnUrl=${encodeURIComponent('/' + model.slug)}`;
                    }}
                    data-testid="button-sso-signin-private"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 23 23" className="flex-shrink-0">
                      <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
                      <rect x="12" y="1" width="10" height="10" fill="#7fba00"/>
                      <rect x="1" y="12" width="10" height="10" fill="#00a4ef"/>
                      <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
                    </svg>
                    Sign in with Microsoft
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-3 text-muted-foreground">
                  Don't have a Microsoft work account?
                </span>
              </div>
            </div>

            <details className="group" data-testid="details-request-access-fallback">
              <summary className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors py-2 list-none [&::-webkit-details-marker]:hidden">
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                Request access manually instead
              </summary>
              <Card className="mt-3" data-testid="card-request-access-form">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Request Access</CardTitle>
                  <CardDescription className="text-xs">
                    Fill in your details and we'll review your request.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="req-name">Full name</Label>
                        <Input
                          id="req-name"
                          placeholder="Jane Smith"
                          value={form.name || defaultName}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          onFocus={prefillForm}
                          required
                          data-testid="input-requestor-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="req-email">Work email</Label>
                        <Input
                          id="req-email"
                          type="email"
                          placeholder="jane@company.com"
                          value={form.email || defaultEmail}
                          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                          onFocus={prefillForm}
                          required
                          data-testid="input-requestor-email"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="req-org">Organization</Label>
                      <Input
                        id="req-org"
                        placeholder="Acme Corp"
                        value={form.organization || defaultOrg}
                        onChange={e => setForm(f => ({ ...f, organization: e.target.value }))}
                        onFocus={prefillForm}
                        required
                        data-testid="input-requestor-org"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="req-message">
                        Message <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Textarea
                        id="req-message"
                        placeholder="Why are you interested in this assessment?"
                        value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        rows={3}
                        data-testid="textarea-requestor-message"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={requestMutation.isPending}
                      data-testid="button-submit-access-request"
                    >
                      {requestMutation.isPending ? "Submitting..." : (
                        <>Request Access <ArrowRight className="w-4 h-4" /></>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </details>
          </>
        ) : (
          <>
            {ssoConfigured && (
              <ConsentStep
                adminConsentGranted={adminConsentGranted}
                adminConsentUrl={adminConsentUrl}
                modelName={model.name}
                onCopy={handleCopyConsent}
                copied={consentCopied}
              />
            )}

            {ssoConfigured && (
              <Card className="border-primary/30" data-testid="card-sso-signin-preconsent">
                <CardContent className="py-6">
                  <div className="text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Already have access? Sign in with your Microsoft work account.
                    </p>
                    <Button
                      className="gap-2"
                      onClick={() => {
                        window.location.href = `/auth/sso/microsoft?returnUrl=${encodeURIComponent('/' + model.slug)}`;
                      }}
                      data-testid="button-sso-signin-private-preconsent"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 23 23" className="flex-shrink-0">
                        <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
                        <rect x="12" y="1" width="10" height="10" fill="#7fba00"/>
                        <rect x="1" y="12" width="10" height="10" fill="#00a4ef"/>
                        <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
                      </svg>
                      Sign in with Microsoft
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-3 text-muted-foreground">
                  {ssoConfigured ? "Don't have a Microsoft work account?" : "or"}
                </span>
              </div>
            </div>

            <details className="group" data-testid="details-request-access-fallback">
              <summary className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors py-2 list-none [&::-webkit-details-marker]:hidden">
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                Request access manually instead
              </summary>
              <Card className="mt-3" data-testid="card-request-access-form">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Request Access</CardTitle>
                  <CardDescription className="text-xs">
                    Fill in your details and we'll review your request.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="req-name">Full name</Label>
                        <Input
                          id="req-name"
                          placeholder="Jane Smith"
                          value={form.name || defaultName}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          onFocus={prefillForm}
                          required
                          data-testid="input-requestor-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="req-email">Work email</Label>
                        <Input
                          id="req-email"
                          type="email"
                          placeholder="jane@company.com"
                          value={form.email || defaultEmail}
                          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                          onFocus={prefillForm}
                          required
                          data-testid="input-requestor-email"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="req-org">Organization</Label>
                      <Input
                        id="req-org"
                        placeholder="Acme Corp"
                        value={form.organization || defaultOrg}
                        onChange={e => setForm(f => ({ ...f, organization: e.target.value }))}
                        onFocus={prefillForm}
                        required
                        data-testid="input-requestor-org"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="req-message">
                        Message <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Textarea
                        id="req-message"
                        placeholder="Why are you interested in this assessment?"
                        value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        rows={3}
                        data-testid="textarea-requestor-message"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={requestMutation.isPending}
                      data-testid="button-submit-access-request"
                    >
                      {requestMutation.isPending ? "Submitting..." : (
                        <>Request Access <ArrowRight className="w-4 h-4" /></>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function StepBadge({ number }: { number: number }) {
  return (
    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
      {number}
    </div>
  );
}

function generateEmailTemplate(adminConsentUrl: string | null | undefined, modelName: string): string {
  const consentLink = adminConsentUrl ?? "[ADMIN CONSENT URL — contact orion@synozur.com]";
  return `Subject: Action Required — Approve Microsoft SSO Access for Orion Maturity Assessment

Hi [IT Administrator's Name],

I'm reaching out to request your help enabling Microsoft single sign-on (SSO) for our team's access to Orion, a private maturity assessment platform from Synozur.

—— WHAT IS ORION? ——

Orion is Synozur's AI-powered Transformation & Maturity Assessment Platform. It enables organizations to measure and improve their transformation capabilities across key dimensions, with AI-generated roadmaps tailored to each result.

Our team has been granted access to a private Orion workspace ("${modelName}"). To enable seamless, password-free sign-in for everyone using their existing Microsoft 365 accounts, we need a one-time admin consent approval from you.

—— WHAT YOU NEED TO DO ——

This is a one-time action that takes under 2 minutes:

1. Open the link below in your browser
   (Requires Global Administrator or Application Administrator role in Azure / Entra ID)

2. Review the permissions — Orion only requests the minimum necessary, read-only permissions:
   • Sign in and read user profile (openid, profile)
   • View user email address (email)
   • Read basic user information (User.Read)
   No sensitive data, write access, mailbox access, or any other permissions are requested.

3. Click "Accept" to grant consent for your entire organization

—— ADMIN CONSENT LINK ——

${consentLink}

—— AFTER YOU GRANT CONSENT ——

Once you've approved, users in our organization can sign in to Orion by clicking "Sign in with Microsoft" on the assessment page. You're welcome to verify it works by trying to sign in yourself.

—— QUESTIONS? ——

If you have any questions about Orion, what it's used for, or the permissions being requested, the Orion team is happy to help:

  Email: orion@synozur.com
  Website: https://www.synozur.com

Thank you for your help!`;
}

function ConsentStep({
  adminConsentGranted,
  adminConsentUrl,
  modelName,
  onCopy,
  copied,
}: {
  adminConsentGranted: boolean;
  adminConsentUrl: string | null | undefined;
  modelName: string;
  onCopy: (url: string) => void;
  copied: boolean;
}) {
  const { toast } = useToast();
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(generateEmailTemplate(adminConsentUrl, modelName));
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2500);
      toast({ title: "Email copied", description: "Paste it into your email client and fill in the admin's name." });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  if (adminConsentGranted) {
    return (
      <Card className="border-green-500/30" data-testid="card-consent-granted">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Microsoft admin consent granted</p>
              <p className="text-xs text-muted-foreground">
                Your organization can sign in with Microsoft once access is approved.
              </p>
            </div>
            <StepBadge number={1} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="card-consent-step">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <StepBadge number={1} />
            <div>
              <CardTitle className="text-base">IT Admin: Grant Microsoft Consent</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Ask your Microsoft 365 Global Administrator to approve Orion for your organization.
                This is a one-time step that enables seamless sign-in for everyone.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Shield className="w-4 h-4" />
            <AlertDescription className="text-xs">
              Orion only requests minimal read-only permissions: user profile, email, and basic sign-in.
              No sensitive data or write access is requested.
            </AlertDescription>
          </Alert>

          {adminConsentUrl ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 flex-1"
                  onClick={() => onCopy(adminConsentUrl)}
                  data-testid="button-copy-consent-url"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy consent URL"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  asChild
                  data-testid="button-open-consent-url"
                >
                  <a href={adminConsentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this URL with your IT admin — they'll see a Microsoft page to approve Orion for your organization.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Microsoft SSO consent URL not available. Contact <a href="mailto:orion@synozur.com" className="underline">orion@synozur.com</a>.
            </p>
          )}

          <Separator />

          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Not sure how to explain this to your IT admin? Use our ready-made email template.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setEmailDialogOpen(true)}
              data-testid="button-generate-email-template"
            >
              <Mail className="w-3.5 h-3.5" />
              Generate email for IT admin
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>IT Admin Consent Email Template</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Copy this email and send it to your Microsoft 365 administrator. Replace{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">[IT Administrator's Name]</code>{" "}
              before sending.
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            <pre className="text-xs bg-muted rounded-md p-4 whitespace-pre-wrap font-mono leading-relaxed">
              {generateEmailTemplate(adminConsentUrl, modelName)}
            </pre>
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Close</Button>
            <Button
              className="gap-2"
              onClick={handleCopyEmail}
              data-testid="button-copy-email-template"
            >
              {emailCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {emailCopied ? "Copied!" : "Copy email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
