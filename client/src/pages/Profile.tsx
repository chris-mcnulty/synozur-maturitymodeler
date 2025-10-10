import { Footer } from "@/components/Footer";
import { ResultsHistory } from "@/components/ResultsHistory";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import type { Result, Assessment, Model } from "@shared/schema";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  
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
                      <Input value={user.username} data-testid="input-profile-name" disabled />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input value={user.email || ''} data-testid="input-profile-email" disabled />
                    </div>
                    <div>
                      <Label>Company</Label>
                      <Input value={user.company || ''} data-testid="input-profile-company" disabled />
                    </div>
                    <div>
                      <Label>Job Title</Label>
                      <Input value={user.jobTitle || ''} data-testid="input-profile-title" disabled />
                    </div>
                    <div>
                      <Label>Company Size</Label>
                      <Select value={user.companySize || undefined} disabled>
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
                    <Button className="w-full" data-testid="button-save-profile" disabled>
                      Save Changes
                    </Button>
                    <p className="text-xs text-muted-foreground">Profile editing coming soon</p>
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