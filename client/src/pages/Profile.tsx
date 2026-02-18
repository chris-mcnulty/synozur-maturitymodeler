import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { CheckCircle2, AlertCircle, Mail, Lock, Trash2, TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import type { User } from "@shared/schema";
import { JOB_ROLES, INDUSTRIES, COUNTRIES } from "@/lib/constants";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AssessmentHistoryItem {
  assessmentId: string;
  modelId: string;
  modelName: string;
  modelSlug: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  isProxy: boolean;
  resultId: string | null;
  overallScore: number | null;
  maturityLevel: string | null;
  resultCreatedAt: string | null;
  maxScore: number;
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<AssessmentHistoryItem | null>(null);
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

  const { data: assessmentHistory = [], isLoading: historyLoading } = useQuery<AssessmentHistoryItem[]>({
    queryKey: ['/api/user/assessment-history'],
    enabled: !authLoading && !!user,
  });

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

  const uniqueModels = useMemo(() => {
    const modelMap = new Map<string, string>();
    assessmentHistory.forEach(item => {
      if (!modelMap.has(item.modelId)) {
        modelMap.set(item.modelId, item.modelName);
      }
    });
    return Array.from(modelMap.entries()).map(([id, name]) => ({ id, name }));
  }, [assessmentHistory]);

  const filteredHistory = useMemo(() => {
    if (selectedModelFilter === 'all') return assessmentHistory;
    return assessmentHistory.filter(item => item.modelId === selectedModelFilter);
  }, [assessmentHistory, selectedModelFilter]);

  const completedForChart = useMemo(() => {
    if (selectedModelFilter === 'all') return [];
    return assessmentHistory
      .filter(item => item.modelId === selectedModelFilter && item.status === 'completed' && item.overallScore !== null)
      .sort((a, b) => {
        const dateA = new Date(a.completedAt || a.startedAt || 0).getTime();
        const dateB = new Date(b.completedAt || b.startedAt || 0).getTime();
        return dateA - dateB;
      })
      .map(item => ({
        date: new Date(item.completedAt || item.startedAt || 0).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        }),
        score: item.overallScore!,
        maxScore: item.maxScore,
      }));
  }, [assessmentHistory, selectedModelFilter]);

  const deleteAssessment = useMutation({
    mutationFn: async (assessmentId: string) => {
      return apiRequest(`/api/assessments/${assessmentId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/assessment-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assessments'] });
      setDeleteTarget(null);
      toast({
        title: "Assessment deleted",
        description: "The assessment has been permanently removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete assessment",
        variant: "destructive",
      });
    },
  });

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

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!passwordForm.currentPassword) {
        throw new Error('Current password is required');
      }
      
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('New passwords do not match');
      }
      
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
      toast({
        title: "Password changed",
        description: "Your password has been changed successfully.",
      });
      setIsChangingPassword(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  const handleResultClick = (assessmentId: string) => {
    setLocation(`/results/${assessmentId}`);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="h-8 bg-muted animate-pulse rounded w-1/3 mb-8" />
            <div className="grid md:grid-cols-3 gap-8">
              <div className="md:col-span-1">
                <Card className="p-6">
                  <div className="space-y-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                </Card>
              </div>
              <div className="md:col-span-2">
                <div className="h-8 bg-muted animate-pulse rounded w-1/3 mb-6" />
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="p-6">
                      <div className="h-16 bg-muted animate-pulse rounded" />
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <Card className="p-8 text-center max-w-md">
            <h2 className="text-xl font-bold mb-4">Sign In Required</h2>
            <p className="text-muted-foreground mb-4">Please sign in to view your profile.</p>
            <Button onClick={() => setLocation('/auth')}>Sign In</Button>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const getTrendIcon = (current: AssessmentHistoryItem) => {
    if (selectedModelFilter === 'all') return null;
    const sameModel = assessmentHistory
      .filter(h => h.modelId === current.modelId && h.status === 'completed' && h.overallScore !== null)
      .sort((a, b) => {
        const dateA = new Date(a.completedAt || a.startedAt || 0).getTime();
        const dateB = new Date(b.completedAt || b.startedAt || 0).getTime();
        return dateB - dateA;
      });
    const idx = sameModel.findIndex(h => h.assessmentId === current.assessmentId);
    if (idx < 0 || idx >= sameModel.length - 1) return null;
    const prev = sameModel[idx + 1];
    if (!prev.overallScore || !current.overallScore) return null;
    const diff = current.overallScore - prev.overallScore;
    if (diff > 0) return { icon: <TrendingUp className="h-4 w-4 text-chart-3" />, diff };
    if (diff < 0) return { icon: <TrendingDown className="h-4 w-4 text-chart-5" />, diff };
    return { icon: <Minus className="h-4 w-4 text-muted-foreground" />, diff: 0 };
  };

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <h1 className="text-4xl font-bold mb-8">My Profile</h1>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
              <Card className="p-6">
                <div className="flex items-center justify-between gap-2 mb-6">
                  <h2 className="text-xl font-bold">Profile Information</h2>
                  {!isEditing && (
                    <Button 
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      data-testid="button-edit-profile"
                    >
                      Edit
                    </Button>
                  )}
                </div>
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
              </Card>

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
                        Password must be at least 8 characters, include one uppercase letter, and one punctuation mark (!@#$%^&*(),.?&quot;:{}|&lt;&gt;)
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
              <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
                <h2 className="text-2xl font-bold">Assessment History</h2>
                {uniqueModels.length > 1 && (
                  <Select value={selectedModelFilter} onValueChange={setSelectedModelFilter}>
                    <SelectTrigger className="w-[240px]" data-testid="select-model-filter">
                      <SelectValue placeholder="Filter by assessment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assessments</SelectItem>
                      {uniqueModels.map(model => (
                        <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedModelFilter !== 'all' && completedForChart.length >= 2 && (
                <Card className="p-6 mb-6" data-testid="score-trend-chart">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Score Over Time</h3>
                    <span className="text-sm text-muted-foreground ml-auto">
                      {completedForChart.length} assessment{completedForChart.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={completedForChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis
                          domain={[0, completedForChart[0]?.maxScore || 100]}
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                            color: 'hsl(var(--foreground))',
                          }}
                          formatter={(value: number) => [`${value}`, 'Score']}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {historyLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="p-6">
                      <div className="h-16 bg-muted animate-pulse rounded" />
                    </Card>
                  ))}
                </div>
              ) : filteredHistory.length > 0 ? (
                <div className="space-y-4" data-testid="results-history">
                  {filteredHistory.map((item) => {
                    const date = item.completedAt || item.startedAt;
                    const dateStr = date
                      ? new Date(date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'Unknown date';
                    const trend = item.status === 'completed' ? getTrendIcon(item) : null;

                    return (
                      <Card key={item.assessmentId} className="p-6 hover-elevate transition-all" data-testid={`result-card-${item.assessmentId}`}>
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-lg mb-1 truncate" data-testid={`text-model-${item.assessmentId}`}>
                              {item.modelName}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm text-muted-foreground" data-testid={`text-date-${item.assessmentId}`}>
                                {dateStr}
                              </p>
                              {item.status !== 'completed' && (
                                <Badge variant="outline">{item.status}</Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {item.status === 'completed' && item.overallScore !== null && (
                              <div className="text-center">
                                <div className="text-3xl font-bold text-primary" data-testid={`text-score-${item.assessmentId}`}>
                                  {item.overallScore}
                                </div>
                                {item.maturityLevel && (
                                  <Badge variant="secondary" className="mt-1">
                                    {item.maturityLevel}
                                  </Badge>
                                )}
                              </div>
                            )}

                            {trend && (
                              <div className="flex items-center gap-1 text-sm">
                                {trend.icon}
                                <span className={trend.diff > 0 ? "text-chart-3" : trend.diff < 0 ? "text-chart-5" : "text-muted-foreground"}>
                                  {trend.diff > 0 ? "+" : ""}{trend.diff}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center gap-1">
                              {item.status === 'completed' && (
                                <Button
                                  variant="outline"
                                  data-testid={`button-view-${item.assessmentId}`}
                                  onClick={() => handleResultClick(item.assessmentId)}
                                >
                                  View Details
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-delete-${item.assessmentId}`}
                                onClick={() => setDeleteTarget(item)}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground mb-4">
                    {selectedModelFilter !== 'all'
                      ? 'No assessments found for this model'
                      : 'No assessments completed yet'}
                  </p>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assessment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteTarget?.modelName} assessment
              {deleteTarget?.completedAt || deleteTarget?.startedAt
                ? ` from ${new Date(deleteTarget.completedAt || deleteTarget.startedAt || '').toLocaleDateString()}`
                : ''}
              ? This will permanently remove the assessment and all associated results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && deleteAssessment.mutate(deleteTarget.assessmentId)}
              disabled={deleteAssessment.isPending}
            >
              {deleteAssessment.isPending ? 'Deleting...' : 'Delete Assessment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
