import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Extract token from URL query params
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    
    if (!tokenParam) {
      toast({
        title: "Invalid Link",
        description: "This password reset link is invalid. Please request a new one.",
        variant: "destructive",
      });
      setTimeout(() => setLocation("/forgot-password"), 2000);
    } else {
      setToken(tokenParam);
    }
  }, [toast, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/password-reset/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      setSuccess(true);
      toast({
        title: "Password Reset!",
        description: "Your password has been successfully reset. You can now log in with your new password.",
      });

      // Redirect to home after 3 seconds
      setTimeout(() => setLocation("/"), 3000);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Create New Password</CardTitle>
            <CardDescription>
              {success
                ? "Your password has been reset successfully"
                : "Enter your new password below"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <CheckCircle2 className="h-16 w-16 text-green-500" data-testid="icon-success" />
                <p className="text-center text-sm text-muted-foreground" data-testid="text-success-message">
                  Your password has been successfully reset. You will be redirected to the home
                  page shortly.
                </p>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/")}
                  data-testid="button-go-home"
                >
                  Go to Home Page
                </Button>
              </div>
            ) : (
              <form name="orion-password-reset" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    data-testid="input-new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 6 characters long
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-submit"
                >
                  {isLoading ? "Resetting Password..." : "Reset Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
