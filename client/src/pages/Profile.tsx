import { Footer } from "@/components/Footer";
import { ResultsHistory } from "@/components/ResultsHistory";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, Mail, Lock } from "lucide-react";
import type { Result, Assessment, Model } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

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
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileForm, setProfileForm] = useState({
    email: '',
    name: '',
    company: '',
    companySize: '',
    jobTitle: '',
    industry: '',
    country: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
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
  
  // Fetch all assessments for current user
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
    enabled: !authLoading,
  });

  // Fetch tenant details if user has tenantId
  const { data: tenant } = useQuery({
    queryKey: ['/api/user/tenant'],
    queryFn: async () => {
      if (!user?.tenantId) return null;
      const response = await fetch('/api/user/tenant');
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!user?.tenantId,
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

  // Validate password requirements
  const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one punctuation mark');
    }
    
    return { valid: errors.length === 0, errors };
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

  // Resend verification email mutation
  const resendVerification = useMutation({
    mutationFn: async () => {
      if (!user?.email) {
        throw new Error('No email address found');
      }
      return apiRequest('/api/auth/resend-verification', 'POST', { email: user.email });
    },
    onSuccess: () => {
      toast({
        title: "Verification email sent",
        description: "Please check your inbox for the verification link.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification email",
        variant: "destructive",
      });
    },
  });

  // Change password mutation
  const changePassword = useMutation({
    mutationFn: async () => {
      // Validate current password is provided
      if (!passwordForm.currentPassword) {
        throw new Error('Current password is required');
      }
      
      // Validate new password matches confirmation
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('New passwords do not match');
      }
      
      // Validate password requirements
      const validation = validatePassword(passwordForm.newPassword);
      if (!validation.valid) {
        throw new Error(validation.errors[0]);
      }
      
      return apiRequest('/api/auth/change-password', 'POST', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
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
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Profile Information</h2>
                  {!authLoading && user && !isEditing && (
                    <Button 
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      data-testid="button-edit-profile"
                    >
                      Edit
                    </Button>
                  )}
                </div>
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
                    {user.tenantId && (
                      <div>
                        <Label>Organization</Label>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" data-testid="badge-tenant">
                            {tenant?.name || 'Loading...'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Your account is associated with this tenant organization
                        </p>
                      </div>
                    )}
                    <div>
                      <Label>Email <span className="text-destructive">*</span></Label>
                      <Input 
                        value={isEditing ? profileForm.email : user.email || ''} 
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        data-testid="input-profile-email" 
                        disabled={!isEditing}
                        required
                      />
                      {user.emailVerified ? (
                        <div className="flex items-center gap-2 mt-2 text-sm text-green-600 dark:text-green-400" data-testid="email-verified-status">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Email verified</span>
                        </div>
                      ) : (
                        <Alert className="mt-2" data-testid="email-unverified-alert">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="flex items-center justify-between">
                            <span className="text-sm">Email not verified</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resendVerification.mutate()}
                              disabled={resendVerification.isPending}
                              data-testid="button-resend-verification"
                              className="ml-2"
                            >
                              <Mail className="h-3 w-3 mr-1" />
                              {resendVerification.isPending ? 'Sending...' : 'Resend'}
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}
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
                    ) : null}
                  </div>
                )}
              </Card>

              {/* Password Change Card */}
              <Card className="p-6 mt-6">
                <h2 className="text-xl font-bold mb-6">Change Password</h2>
                {!isChangingPassword ? (
                  <Button 
                    onClick={() => setIsChangingPassword(true)}
                    data-testid="button-change-password"
                    className="w-full"
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Change Password
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="current-password">Current Password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        data-testid="input-current-password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-password">New Password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        data-testid="input-new-password"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Password must be at least 8 characters, include one uppercase letter, and one punctuation mark (!@#$%^&*(),.?":{}|&lt;&gt;)
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="confirm-password">Confirm New Password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        data-testid="input-confirm-password"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        className="flex-1" 
                        onClick={() => changePassword.mutate()}
                        disabled={changePassword.isPending}
                        data-testid="button-submit-password-change"
                      >
                        {changePassword.isPending ? 'Changing...' : 'Change Password'}
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1" 
                        onClick={() => {
                          setIsChangingPassword(false);
                          setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        }}
                        disabled={changePassword.isPending}
                        data-testid="button-cancel-password-change"
                      >
                        Cancel
                      </Button>
                    </div>
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