import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, Building, Briefcase } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import synozurLogo from "@assets/SynozurLogo_color 1400_1759973943542.png";
import { JOB_ROLES, INDUSTRIES, COMPANY_SIZES, COUNTRIES } from "@/lib/constants";

export default function CompleteProfile() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  
  const queryParams = new URLSearchParams(window.location.search);
  const returnTo = queryParams.get('returnTo') || '/';

  const [profileForm, setProfileForm] = useState({
    company: "",
    companySize: "",
    jobTitle: "",
    industry: "",
    country: "",
  });

  useEffect(() => {
    if (user) {
      setProfileForm({
        company: user.company || "",
        companySize: user.companySize || "",
        jobTitle: user.jobTitle || "",
        industry: user.industry || "",
        country: user.country || "",
      });
    }
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof profileForm) => {
      return apiRequest('/api/user/profile', 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: "Profile completed",
        description: "Thank you for completing your profile!",
      });
      window.location.href = decodeURIComponent(returnTo);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update profile",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const requiredFields = [
      { field: 'company', label: 'Company' },
      { field: 'jobTitle', label: 'Job Title' },
      { field: 'industry', label: 'Industry' },
      { field: 'companySize', label: 'Company Size' },
      { field: 'country', label: 'Country' },
    ];

    for (const { field, label } of requiredFields) {
      if (!profileForm[field as keyof typeof profileForm]?.trim()) {
        toast({
          title: "Required field missing",
          description: `Please fill in: ${label}`,
          variant: "destructive",
        });
        return;
      }
    }
    
    updateProfileMutation.mutate(profileForm);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="flex-1 flex flex-col p-8">
        <div className="flex items-center justify-center flex-1">
          <Card className="w-full max-w-lg p-8">
            <div className="mb-8 text-center">
              <div className="flex items-center justify-center mb-4">
                <img 
                  src={synozurLogo} 
                  alt="Synozur Logo" 
                  className="w-16 h-16 object-contain"
                />
              </div>
              <h2 className="text-2xl font-bold mt-2">Complete Your Profile</h2>
              <p className="text-muted-foreground mt-2">
                Welcome, {user.name || user.email}! Please tell us a bit more about yourself to personalize your experience.
              </p>
            </div>

            <form name="orion-complete-profile" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company" className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Company <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="company"
                  type="text"
                  value={profileForm.company}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, company: e.target.value })
                  }
                  placeholder="Your company name"
                  required
                  data-testid="input-company"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="jobTitle" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Job Title <span className="text-destructive">*</span>
                </Label>
                <Select 
                  value={profileForm.jobTitle} 
                  onValueChange={(value) => setProfileForm({ ...profileForm, jobTitle: value })}
                  required
                >
                  <SelectTrigger data-testid="select-job-title">
                    <SelectValue placeholder="Select job title" />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="industry">Industry <span className="text-destructive">*</span></Label>
                <Select 
                  value={profileForm.industry} 
                  onValueChange={(value) => setProfileForm({ ...profileForm, industry: value })}
                  required
                >
                  <SelectTrigger data-testid="select-industry">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((industry) => (
                      <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="companySize">Company Size <span className="text-destructive">*</span></Label>
                <Select 
                  value={profileForm.companySize} 
                  onValueChange={(value) => setProfileForm({ ...profileForm, companySize: value })}
                  required
                >
                  <SelectTrigger data-testid="select-company-size">
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_SIZES.map((size) => (
                      <SelectItem key={size.value} value={size.value}>{size.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="country">Country <span className="text-destructive">*</span></Label>
                <Select 
                  value={profileForm.country} 
                  onValueChange={(value) => setProfileForm({ ...profileForm, country: value })}
                  required
                >
                  <SelectTrigger data-testid="select-country">
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
                disabled={updateProfileMutation.isPending}
                data-testid="button-complete-profile"
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Complete Profile"
                )}
              </Button>
              
              <p className="text-xs text-center text-muted-foreground mt-4">
                This information helps us provide personalized recommendations and benchmark your results against similar organizations.
              </p>
            </form>
          </Card>
        </div>
      </div>

      <div className="flex-1 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 hidden lg:flex flex-col justify-center">
        <div className="max-w-lg">
          <h2 className="text-3xl font-bold mb-6">
            Why We Need This Information
          </h2>
          <ul className="space-y-4 text-muted-foreground">
            <li className="flex items-start">
              <span className="text-primary mr-3 mt-1">
                <User className="h-5 w-5" />
              </span>
              <div>
                <strong className="text-foreground">Personalized Insights</strong>
                <p>Your role and industry help us tailor recommendations specifically for your context.</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-3 mt-1">
                <Building className="h-5 w-5" />
              </span>
              <div>
                <strong className="text-foreground">Relevant Benchmarking</strong>
                <p>Compare your results against similar organizations in your industry and size category.</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-3 mt-1">
                <Briefcase className="h-5 w-5" />
              </span>
              <div>
                <strong className="text-foreground">Better AI Recommendations</strong>
                <p>Our AI uses your profile to generate more actionable and relevant improvement roadmaps.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
