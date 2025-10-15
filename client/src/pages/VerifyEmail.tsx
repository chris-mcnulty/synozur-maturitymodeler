import { Footer } from "@/components/Footer";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      // Get token from URL query params
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setStatus('error');
        setMessage('No verification token found. Please check the link in your email.');
        return;
      }

      try {
        const response = await apiRequest('/api/auth/verify-email', 'POST', { token });
        setStatus('success');
        setMessage(response.message || 'Your email has been verified successfully!');
      } catch (error: any) {
        setStatus('error');
        setMessage(error.message || 'Failed to verify email. The link may be expired or invalid.');
      }
    };

    verifyEmail();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center py-12">
        <div className="container mx-auto px-4 max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                {status === 'loading' && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
                {status === 'success' && <CheckCircle2 className="h-12 w-12 text-green-600" />}
                {status === 'error' && <XCircle className="h-12 w-12 text-destructive" />}
              </div>
              <CardTitle>
                {status === 'loading' && 'Verifying Email...'}
                {status === 'success' && 'Email Verified!'}
                {status === 'error' && 'Verification Failed'}
              </CardTitle>
              <CardDescription>
                {message}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {status === 'success' && (
                <>
                  <Button
                    onClick={() => setLocation('/profile')}
                    data-testid="button-go-to-profile"
                  >
                    Go to Profile
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setLocation('/')}
                    data-testid="button-go-to-home"
                  >
                    Browse Assessments
                  </Button>
                </>
              )}
              {status === 'error' && (
                <>
                  <Button
                    onClick={() => setLocation('/profile')}
                    data-testid="button-go-to-profile-retry"
                  >
                    Go to Profile
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setLocation('/auth')}
                    data-testid="button-go-to-auth"
                  >
                    Sign In
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
