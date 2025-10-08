import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const [, setLocation] = useLocation();
  const { user, loginMutation, registerMutation, isLoading } = useAuth();
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
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
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                <span className="text-3xl font-bold text-primary-foreground">S</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-primary">Synozur</h1>
            <h2 className="text-xl font-semibold mt-2">Maturity Modeler</h2>
            <p className="text-muted-foreground mt-2">Find Your North Star</p>
            <p className="text-xs text-muted-foreground mt-1">The Transformation Company</p>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      value={registerForm.firstName}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, firstName: e.target.value })
                      }
                      required
                      data-testid="input-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      value={registerForm.lastName}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, lastName: e.target.value })
                      }
                      required
                      data-testid="input-lastname"
                    />
                  </div>
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
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Right side - Hero */}
      <div className="flex-1 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 hidden lg:flex flex-col justify-center">
        <div className="max-w-lg">
          <div className="mb-8">
            <h3 className="text-xl font-bold text-primary mb-2">Synozur</h3>
            <p className="text-sm text-muted-foreground">The Transformation Company</p>
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
        </div>
      </div>
    </div>
  );
}