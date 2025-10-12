import { Footer } from "@/components/Footer";
import { ResultsHistory } from "@/components/ResultsHistory";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import type { Result, Assessment, Model } from "@shared/schema";

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

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    email: '',
    name: '',
    company: '',
    companySize: '',
    jobTitle: '',
    industry: '',
    country: '',
  });

  // Update form when user data loads
  useEffect(() => {
    if (user) {
      setProfileForm({
        email: user.email || '',
        name: user.name || '',
        company: user.company || '',
        companySize: user.companySize || '',
        jobTitle: user.jobTitle || '',
        industry: user.industry || '',
        country: user.country || '',
      });
    }
  }, [user]);
  
  // Fetch all assessments for current user (in a real app, this would be filtered by user)
  const { data: assessments = [] } = useQuery<(Assessment & { model?: Model })[]>({
    queryKey: ['/api/assessments'],
    queryFn: async () => {
      const assessments = await fetch('/api/assessments').then(r => r.json());
      // Fetch model details for each assessment
      const assessmentsWithModels = await Promise.all(
        assessments.map(async (assessment: Assessment) => {
          try {
            const model = await fetch(`/api/models/by-id/${assessment.modelId}`).then(r => r.json());
            return { ...assessment, model };
          } catch {
            return assessment;
          }
        })
      );
      return assessmentsWithModels;
    },
  });

  // Fetch results for all assessments
  const { data: results = [] } = useQuery<(Result & { modelName?: string })[]>({
    queryKey: ['/api/results'],
    queryFn: async () => {
      if (!assessments.length) return [];
      
      const results = await Promise.all(
        assessments.map(async (assessment) => {
          try {
            const result = await fetch(`/api/results/${assessment.id}`).then(r => {
              if (!r.ok) return null;
              return r.json();
            });
            if (result) {
              return {
                ...result,
                assessmentId: assessment.id,
                modelName: assessment.model?.name || 'Unknown Model',
              };
            }
          } catch {
            return null;
          }
        })
      );
      
      return results.filter(Boolean);
    },
    enabled: assessments.length > 0,
  });

  // Transform results for display
  const resultsHistory = results.map(result => ({
    id: result.assessmentId,
    modelName: result.modelName || 'Unknown Model',
    date: new Date(result.createdAt || Date.now()).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    score: result.overallScore,
    label: result.label,
    change: 0, // Would need historical data to calculate
  }));

  const handleResultClick = (resultId: string) => {
    setLocation(`/results/${resultId}`);
  };

  // Validate all required fields
  const validateProfile = () => {
    const requiredFields = [
      { field: 'email', label: 'Email' },
      { field: 'name', label: 'Name' },
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
          description: `${label} is required`,
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!validateProfile()) {
        throw new Error('Please fill in all required fields');
      }
      return apiRequest('/api/profile', 'PUT', profileForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setIsEditing(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <h1 className="text-4xl font-bold mb-8">My Profile</h1>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
              <Card className="p-6">
                <h2 className="text-xl font-bold mb-6">Profile Information</h2>
                {authLoading || !user ? (
                  <div className="space-y-4">
                    <div className="h-10 bg-muted animate-pulse rounded" />
                    <div className="h-10 bg-muted animate-pulse rounded" />
                    <div className="h-10 bg-muted animate-pulse rounded" />
                    <div className="h-10 bg-muted animate-pulse rounded" />
                    <div className="h-10 bg-muted animate-pulse rounded" />
                    <div className="h-10 bg-muted animate-pulse rounded" />
                    <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label>Username</Label>
                      <Input value={user.username} data-testid="input-profile-username" disabled />
                    </div>
                    <div>
                      <Label>Email <span className="text-destructive">*</span></Label>
                      <Input 
                        value={isEditing ? profileForm.email : user.email || ''} 
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        data-testid="input-profile-email" 
                        disabled={!isEditing}
                        required
                      />
                    </div>
                    <div>
                      <Label>Name <span className="text-destructive">*</span></Label>
                      <Input 
                        value={isEditing ? profileForm.name : user.name || ''} 
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        data-testid="input-profile-name" 
                        disabled={!isEditing}
                        required
                      />
                    </div>
                    <div>
                      <Label>Company <span className="text-destructive">*</span></Label>
                      <Input 
                        value={isEditing ? profileForm.company : user.company || ''} 
                        onChange={(e) => setProfileForm({ ...profileForm, company: e.target.value })}
                        data-testid="input-profile-company" 
                        disabled={!isEditing}
                        required
                      />
                    </div>
                    <div>
                      <Label>Job Title <span className="text-destructive">*</span></Label>
                      <Select 
                        value={isEditing ? profileForm.jobTitle : user.jobTitle || undefined} 
                        onValueChange={(value) => setProfileForm({ ...profileForm, jobTitle: value })}
                        disabled={!isEditing}
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
                    <div>
                      <Label>Industry / Sector <span className="text-destructive">*</span></Label>
                      <Select 
                        value={isEditing ? profileForm.industry : user.industry || undefined} 
                        onValueChange={(value) => setProfileForm({ ...profileForm, industry: value })}
                        disabled={!isEditing}
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
                    <div>
                      <Label>Company Size <span className="text-destructive">*</span></Label>
                      <Select 
                        value={isEditing ? profileForm.companySize : user.companySize || undefined} 
                        onValueChange={(value) => setProfileForm({ ...profileForm, companySize: value })}
                        disabled={!isEditing}
                      >
                        <SelectTrigger data-testid="select-company-size">
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
                      <Label>Country <span className="text-destructive">*</span></Label>
                      <Select 
                        value={isEditing ? profileForm.country : user.country || undefined} 
                        onValueChange={(value) => setProfileForm({ ...profileForm, country: value })}
                        disabled={!isEditing}
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
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Button 
                          className="flex-1" 
                          onClick={() => updateProfile.mutate()}
                          disabled={updateProfile.isPending}
                          data-testid="button-save-profile"
                        >
                          {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button 
                          variant="outline" 
                          className="flex-1" 
                          onClick={() => {
                            setIsEditing(false);
                            setProfileForm({
                              email: user.email || '',
                              name: user.name || '',
                              company: user.company || '',
                              companySize: user.companySize || '',
                              jobTitle: user.jobTitle || '',
                              industry: user.industry || '',
                              country: user.country || '',
                            });
                          }}
                          disabled={updateProfile.isPending}
                          data-testid="button-cancel-edit"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        className="w-full" 
                        onClick={() => setIsEditing(true)}
                        data-testid="button-edit-profile"
                      >
                        Edit Profile
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </div>

            <div className="md:col-span-2">
              <h2 className="text-2xl font-bold mb-6">Assessment History</h2>
              {resultsHistory.length > 0 ? (
                <ResultsHistory results={resultsHistory} />
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground mb-4">No assessments completed yet</p>
                  <Button onClick={() => setLocation('/')}>
                    Browse Assessments
                  </Button>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}