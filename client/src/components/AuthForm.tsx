import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type AuthMode = "signin" | "signup" | "forgot";

interface AuthFormProps {
  mode: AuthMode;
  onSubmit: (data: any) => void;
}

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(`${mode} submitted:`, formData);
    onSubmit(formData);
  };

  const titles = {
    signin: "Sign In",
    signup: "Create Account",
    forgot: "Reset Password",
  };

  return (
    <Card className="p-8 max-w-md mx-auto" data-testid={`card-auth-${mode}`}>
      <div className="text-center mb-6">
        <div className="text-3xl font-bold text-primary mb-2">
          Orion
        </div>
        <h2 className="text-2xl font-bold">{titles[mode]}</h2>
      </div>

      <form name={`orion-auth-${mode}`} onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              data-testid="input-username"
            />
          </div>
        )}

        {mode !== "signin" && (
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              data-testid="input-email"
            />
          </div>
        )}

        {mode === "signin" && (
          <div>
            <Label htmlFor="usernameOrEmail">Username or Email</Label>
            <Input
              id="usernameOrEmail"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              data-testid="input-username-email"
            />
          </div>
        )}

        {mode !== "forgot" && (
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              data-testid="input-password"
            />
          </div>
        )}

        <Button type="submit" className="w-full" data-testid={`button-${mode}`}>
          {mode === "signin" && "Sign In"}
          {mode === "signup" && "Create Account"}
          {mode === "forgot" && "Send Reset Link"}
        </Button>
      </form>

      {mode === "signin" && (
        <div className="mt-4 text-center text-sm">
          <a href="#" className="text-primary hover:underline" data-testid="link-forgot-password">
            Forgot password?
          </a>
          <div className="mt-2">
            Don't have an account?{" "}
            <a href="#" className="text-primary hover:underline" data-testid="link-signup">
              Sign up
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}
