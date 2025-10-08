import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ResultsHistory } from "@/components/ResultsHistory";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Result, Assessment, Model } from "@shared/schema";

export default function Profile() {
  const [, setLocation] = useLocation();
  
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
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <h1 className="text-4xl font-bold mb-8">My Profile</h1>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
              <Card className="p-6">
                <h2 className="text-xl font-bold mb-6">Profile Information</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input defaultValue="Alex Chen" data-testid="input-profile-name" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input defaultValue="alex@example.com" data-testid="input-profile-email" />
                  </div>
                  <div>
                    <Label>Company</Label>
                    <Input defaultValue="Contoso Ltd" data-testid="input-profile-company" />
                  </div>
                  <div>
                    <Label>Job Title</Label>
                    <Input defaultValue="CTO" data-testid="input-profile-title" />
                  </div>
                  <Button className="w-full" data-testid="button-save-profile" disabled>
                    Save Changes
                  </Button>
                  <p className="text-xs text-muted-foreground">Profile editing coming soon</p>
                </div>
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