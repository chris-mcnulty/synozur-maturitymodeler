import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Skeleton } from '@/components/ui/skeleton';

interface OAuthApplication {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
}

interface ConsentRequest {
  application: OAuthApplication;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  response_type: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

const scopeDescriptions: Record<string, { title: string; description: string; icon?: any }> = {
  'openid': {
    title: 'Basic Profile Information',
    description: 'Your user ID and basic account information',
  },
  'profile': {
    title: 'Profile Details',
    description: 'Your name, company, and job title',
  },
  'email': {
    title: 'Email Address',
    description: 'Your email address and verification status',
  },
  'roles': {
    title: 'Roles & Permissions',
    description: 'Your roles and permissions within applications',
  },
  'assessments:read': {
    title: 'View Assessments',
    description: 'Access to view your assessment history and results',
  },
  'assessments:write': {
    title: 'Manage Assessments',
    description: 'Create and manage assessments on your behalf',
  },
};

export default function OAuthConsent() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const [error, setError] = useState<string | null>(null);

  // Extract OAuth parameters from URL
  const client_id = searchParams.get('client_id');
  const redirect_uri = searchParams.get('redirect_uri');
  const response_type = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');
  const code_challenge = searchParams.get('code_challenge');
  const code_challenge_method = searchParams.get('code_challenge_method');

  // Fetch consent details
  const { data: consentRequest, isLoading } = useQuery({
    queryKey: ['/api/oauth/consent', client_id, redirect_uri],
    enabled: !!(client_id && redirect_uri && response_type),
    queryFn: async () => {
      const params = new URLSearchParams({
        client_id: client_id!,
        redirect_uri: redirect_uri!,
        response_type: response_type!,
        scope: scope || '',
      });
      const response = await fetch(`/api/oauth/consent?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error_description || 'Failed to load consent details');
      }
      return response.json() as Promise<ConsentRequest>;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        client_id,
        redirect_uri,
        response_type,
        scope,
        state,
        code_challenge,
        code_challenge_method,
        approved: true,
      };
      return apiRequest('/api/oauth/consent', 'POST', body);
    },
    onSuccess: (data) => {
      // Redirect to the authorization URL returned by the server
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      }
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to approve authorization');
    },
  });

  // Deny mutation
  const denyMutation = useMutation({
    mutationFn: async () => {
      const body = {
        client_id,
        redirect_uri,
        response_type,
        scope,
        state,
        code_challenge,
        code_challenge_method,
        approved: false,
      };
      return apiRequest('/api/oauth/consent', 'POST', body);
    },
    onSuccess: (data) => {
      // Redirect with error
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      }
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to deny authorization');
    },
  });

  const requestedScopes = scope ? scope.split(' ').filter(s => s) : [];

  if (!client_id || !redirect_uri || !response_type) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Invalid Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Missing required OAuth parameters. Please try again from the requesting application.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!consentRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Application Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The requesting application could not be found or is not authorized.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 to-accent/5">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Shield className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Authorization Request</CardTitle>
          <CardDescription className="text-base mt-2">
            <span className="font-semibold text-foreground">
              {consentRequest.application.name}
            </span>{' '}
            is requesting access to your account
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {consentRequest.application.description && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">
                {consentRequest.application.description}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="font-medium text-sm">This application will be able to:</h3>
            <div className="space-y-2">
              {requestedScopes.length > 0 ? (
                requestedScopes.map((scopeKey) => {
                  const scopeInfo = scopeDescriptions[scopeKey];
                  return (
                    <div
                      key={scopeKey}
                      className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                      data-testid={`scope-item-${scopeKey}`}
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {scopeInfo?.title || scopeKey}
                        </p>
                        {scopeInfo?.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {scopeInfo.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 rounded-md bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    Basic account access only
                  </p>
                </div>
              )}
            </div>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              You can revoke this authorization at any time from your account settings.
            </AlertDescription>
          </Alert>
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => denyMutation.mutate()}
            disabled={denyMutation.isPending || approveMutation.isPending}
            data-testid="button-deny-consent"
          >
            Deny
          </Button>
          <Button
            className="flex-1"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending || denyMutation.isPending}
            data-testid="button-approve-consent"
          >
            {approveMutation.isPending ? 'Authorizing...' : 'Authorize'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}