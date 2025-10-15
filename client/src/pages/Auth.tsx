import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import synozurLogo from "@assets/SynozurLogo_color 1400_1759973943542.png";

export default function Auth() {
  const [, setLocation] = useLocation();
  const { user, loginMutation, registerMutation, isLoading } = useAuth();
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    username: "",
    email: "",
    password: "",
    name: "",
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginForm);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(registerForm);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Forms */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md p-8">
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center mb-4">
              <img 
                src={synozurLogo} 
                alt="Synozur Logo" 
                className="w-24 h-24 object-contain"
              />
            </div>
            <h2 className="text-xl font-semibold mt-2">Maturity Modeler</h2>
            <p className="text-muted-foreground mt-2">Find Your North Star</p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    type="text"
                    value={loginForm.username}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, username: e.target.value })
                    }
                    required
                    data-testid="input-login-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    required
                    data-testid="input-login-password"
                  />
                </div>
                <div className="flex justify-end">
                  <a 
                    href="/forgot-password" 
                    className="text-sm text-primary hover:underline"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </a>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    "Login"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={registerForm.name}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, name: e.target.value })
                    }
                    required
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={registerForm.username}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, username: e.target.value })
                    }
                    required
                    data-testid="input-register-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={registerForm.email}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, email: e.target.value })
                    }
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={registerForm.password}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, password: e.target.value })
                    }
                    required
                    data-testid="input-register-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={registerMutation.isPending}
                  data-testid="button-register"
                >
                  {registerMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Sign Up"
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-4">
                  By signing up, you agree to our{" "}
                  <a 
                    href="https://www.synozur.com/privacy" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-primary hover:underline"
                    data-testid="link-privacy-policy"
                  >
                    Privacy Policy
                  </a>
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Right side - Hero */}
      <div className="flex-1 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 hidden lg:flex flex-col justify-center">
        <div className="max-w-lg">
          <div className="mb-8">
            <img 
              src={synozurLogo} 
              alt="Synozur Logo" 
              className="w-32 h-32 object-contain mb-4"
            />
          </div>
          <h2 className="text-4xl font-bold mb-6">
            Transform Your Organization
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Assess your organization's maturity across multiple models and dimensions. 
            Get actionable insights, track progress, and benchmark against industry standards.
          </p>
          <ul className="space-y-4">
            <li className="flex items-start">
              <span className="text-primary mr-3">✓</span>
              <span>Comprehensive assessment models</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-3">✓</span>
              <span>Industry benchmarking</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-3">✓</span>
              <span>Actionable recommendations</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-3">✓</span>
              <span>Progress tracking over time</span>
            </li>
          </ul>

          <div className="mt-12 pt-8 border-t border-border">
            <h3 className="text-2xl font-bold mb-4">Why Sign Up?</h3>
            <p className="text-muted-foreground mb-6">
              Because your maturity journey deserves more than guesswork. When you sign up, you unlock tools that make progress clear and actionable:
            </p>
            <ul className="space-y-3 mb-6">
              <li className="flex items-start">
                <span className="text-primary mr-3">✅</span>
                <span>Personalized recommendations designed to fit your goals</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-3">✅</span>
                <span>Saved assessments so you can track growth over time</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-3">✅</span>
                <span>Downloadable PDFs for easy sharing and reference</span>
              </li>
            </ul>
            <p className="font-semibold mb-6">And the best part? It's completely free.</p>
            
            <h4 className="font-semibold mb-3">We take your privacy seriously:</h4>
            <ul className="space-y-2 mb-6">
              <li className="flex items-start text-sm text-muted-foreground">
                <span className="mr-2">•</span>
                <span>We never sell or share your data</span>
              </li>
              <li className="flex items-start text-sm text-muted-foreground">
                <span className="mr-2">•</span>
                <span>We only use anonymized insights to improve benchmarks</span>
              </li>
            </ul>
            
            <p className="text-sm text-muted-foreground">
              By signing up, you agree to receive occasional updates from Synozur—always relevant, never overwhelming—and you can unsubscribe anytime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}