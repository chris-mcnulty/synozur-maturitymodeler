import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

// Standard dropdown options
const JOB_ROLES = [
  "Chief Executive Officer (CEO)",
  "Chief Technology Officer (CTO)",
  "Chief Financial Officer (CFO)",
  "Chief Marketing Officer (CMO)",
  "Chief Operating Officer (COO)",
  "Vice President",
  "Director",
  "Senior Manager",
  "Manager",
  "Team Lead",
  "Project Manager",
  "Product Manager",
  "Software Engineer",
  "Data Analyst",
  "Business Analyst",
  "Sales Executive",
  "Marketing Specialist",
  "Human Resources Specialist",
  "Customer Support Representative",
  "Other",
];

const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "Education",
  "Manufacturing",
  "Retail",
  "Transportation",
  "Energy",
  "Telecommunications",
  "Media & Entertainment",
  "Real Estate",
  "Construction",
  "Agriculture",
  "Government",
  "Nonprofit",
  "Professional Services",
  "Insurance",
  "Automotive",
  "Pharmaceuticals",
  "Other",
];

const COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "Germany",
  "France",
  "Italy",
  "Spain",
  "Netherlands",
  "Sweden",
  "Switzerland",
  "Japan",
  "China",
  "India",
  "Brazil",
  "Mexico",
  "South Africa",
  "Singapore",
  "United Arab Emirates",
  "New Zealand",
];

interface ProfileGateProps {
  onComplete: (profile: any) => void;
}

export function ProfileGate({ onComplete }: ProfileGateProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginData, setLoginData] = useState({
    username: "",
    password: "",
  });
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    company: "",
    companySize: "",
    jobTitle: "",
    industry: "",
    country: "",
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Login failed");
      return response.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/user"], user);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Login successful",
        description: "Welcome back! You can now access your report.",
      });
      onComplete(user);
    },
    onError: () => {
      toast({
        title: "Login failed",
        description: "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Registration failed");
      }
      return response.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/user"], user);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Account created!",
        description: "Welcome! You can now access your report.",
      });
      onComplete(user);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginData.username.trim() || !loginData.password.trim()) {
      toast({
        title: "Required fields missing",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }
    
    loginMutation.mutate(loginData);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all required fields
    const requiredFields = [
      { field: 'username', label: 'Username' },
      { field: 'password', label: 'Password' },
      { field: 'name', label: 'Name' },
      { field: 'email', label: 'Email' },
      { field: 'company', label: 'Company' },
      { field: 'jobTitle', label: 'Job Title' },
      { field: 'industry', label: 'Industry' },
      { field: 'companySize', label: 'Company Size' },
      { field: 'country', label: 'Country' },
    ];

    for (const { field, label } of requiredFields) {
      if (!formData[field as keyof typeof formData]?.trim()) {
        toast({
          title: "Required field missing",
          description: `${label} is required`,
          variant: "destructive",
        });
        return;
      }
    }
    
    registerMutation.mutate(formData);
  };

  return (
    <Card className="p-8 max-w-2xl mx-auto" data-testid="card-profile-gate">
      <div className="flex gap-4 mb-6 border-b">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`pb-2 px-1 font-semibold transition-colors ${
            mode === 'login' 
              ? 'text-primary border-b-2 border-primary' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="button-switch-login"
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`pb-2 px-1 font-semibold transition-colors ${
            mode === 'register' 
              ? 'text-primary border-b-2 border-primary' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="button-switch-register"
        >
          Create Account
        </button>
      </div>

      {mode === 'login' ? (
        <>
          <h2 className="text-2xl font-bold mb-2">Welcome Back</h2>
          <p className="text-muted-foreground mb-6">
            Login to access your assessment report and receive your PDF.
          </p>

          <form name="orion-profile-gate-login" onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                value={loginData.username}
                onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                required
                data-testid="input-login-username"
              />
            </div>

            <div>
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
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
              data-testid="button-login-submit"
            >
              {loginMutation.isPending ? "Logging in..." : "Login & Access Report"}
            </Button>
          </form>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold mb-2">Create Your Account</h2>
          <p className="text-muted-foreground mb-6">
            Register to access your assessment report and receive your PDF.
          </p>

          <form name="orion-profile-gate-register" onSubmit={handleRegister} className="space-y-4">
            <div>
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                data-testid="input-username"
              />
            </div>

            <div>
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                data-testid="input-password"
              />
            </div>

            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="input-name"
              />
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                data-testid="input-email"
              />
            </div>

            <div>
              <Label htmlFor="company">Company *</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
                data-testid="input-company"
              />
            </div>

            <div>
              <Label htmlFor="jobTitle">Job Title *</Label>
              <Select value={formData.jobTitle} onValueChange={(value) => setFormData({ ...formData, jobTitle: value })}>
                <SelectTrigger id="jobTitle" data-testid="select-job-title">
                  <SelectValue placeholder="Select job title" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="industry">Industry *</Label>
              <Select value={formData.industry} onValueChange={(value) => setFormData({ ...formData, industry: value })}>
                <SelectTrigger id="industry" data-testid="select-industry">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((industry) => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="companySize">Company Size *</Label>
              <Select value={formData.companySize} onValueChange={(value) => setFormData({ ...formData, companySize: value })}>
                <SelectTrigger id="companySize" data-testid="select-company-size">
                  <SelectValue placeholder="Select company size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Sole Proprietor (1)</SelectItem>
                  <SelectItem value="2-9">Small Team (2-9)</SelectItem>
                  <SelectItem value="10-49">Small Business (10-49)</SelectItem>
                  <SelectItem value="50-249">Medium Business (50-249)</SelectItem>
                  <SelectItem value="250-999">Large Business (250-999)</SelectItem>
                  <SelectItem value="1000-9999">Enterprise (1,000-9,999)</SelectItem>
                  <SelectItem value="10000+">Large Enterprise (10,000+)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="country">Country *</Label>
              <Select value={formData.country} onValueChange={(value) => setFormData({ ...formData, country: value })}>
                <SelectTrigger id="country" data-testid="select-country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country} value={country}>{country}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={registerMutation.isPending}
              data-testid="button-register-submit"
            >
              {registerMutation.isPending ? "Creating account..." : "Create Account & Access Report"}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}
