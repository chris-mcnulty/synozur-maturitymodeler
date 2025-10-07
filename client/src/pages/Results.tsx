import { useRoute, useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ScoreCard } from "@/components/ScoreCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Mail, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Result, Assessment, Model, Dimension } from "@shared/schema";

export default function Results() {
  const [, params] = useRoute("/results/:assessmentId");
  const [, setLocation] = useLocation();
  const assessmentId = params?.assessmentId;

  // Fetch result
  const { data: result, isLoading: resultLoading } = useQuery<Result>({
    queryKey: ['/api/results', assessmentId],
    enabled: !!assessmentId,
  });

  // Fetch assessment to get model info
  const { data: assessment } = useQuery<Assessment>({
    queryKey: ['/api/assessments', assessmentId],
    enabled: !!assessmentId,
  });

  // Fetch model with dimensions
  const { data: model } = useQuery<Model & { dimensions: Dimension[] }>({
    queryKey: ['/api/models', 'by-id', assessment?.modelId],
    queryFn: async () => {
      const res = await fetch(`/api/models/by-id/${assessment?.modelId}`);
      return res.json();
    },
    enabled: !!assessment?.modelId,
  });

  // Fetch benchmark data
  const { data: benchmark } = useQuery<{ meanScore: number; sampleSize: number }>({
    queryKey: ['/api/benchmarks', assessment?.modelId],
    enabled: !!assessment?.modelId,
  });

  // Fetch other models for suggestions
  const { data: otherModels = [] } = useQuery<Model[]>({
    queryKey: ['/api/models'],
    select: (models) => models.filter(m => m.id !== assessment?.modelId).slice(0, 3),
  });

  if (resultLoading || !result) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg text-muted-foreground" data-testid="loading-results">Loading results...</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg text-muted-foreground">Unable to load model data</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Transform dimension scores for display
  const dimensionScores = model.dimensions.map(dim => ({
    key: dim.key,
    label: dim.label,
    score: (result.dimensionScores as Record<string, number>)[dim.key] || 0,
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-5xl">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="mb-6"
            data-testid="button-back-home"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Assessments
          </Button>

          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4" data-testid="text-results-title">Your Assessment Results</h1>
            <p className="text-lg text-muted-foreground">
              Congratulations on completing the {model.name}!
            </p>
          </div>

          <ScoreCard
            overallScore={result.overallScore}
            label={result.label}
            dimensions={dimensionScores}
            industryMean={benchmark?.meanScore}
          />

          <div className="mt-12 bg-muted/30 rounded-lg p-8">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-bold mb-4">Next Steps</h3>
                <p className="text-muted-foreground mb-6">
                  Your maturity level is <strong>{result.label}</strong>. {' '}
                  {result.label === 'Leading' && 'You are at the forefront of digital transformation!'}
                  {result.label === 'Strategic' && 'You have strong foundations and strategic capabilities.'}
                  {result.label === 'Operational' && 'You have good operational processes in place with room to grow.'}
                  {result.label === 'Developing' && 'You are building momentum with focused improvement opportunities.'}
                  {result.label === 'Initial' && 'You have significant opportunities to improve your maturity.'}
                </p>
                <div className="flex gap-4">
                  <Button data-testid="button-download-pdf" disabled>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>
                  <Button variant="outline" data-testid="button-email-report" disabled>
                    <Mail className="mr-2 h-4 w-4" />
                    Email Report
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">PDF generation coming soon</p>
              </div>
              <div className="text-center">
                <div className="text-6xl font-bold text-primary mb-2" data-testid="text-overall-score">
                  {result.overallScore}
                </div>
                <div className="text-lg text-muted-foreground">Overall Score</div>
                {benchmark && (
                  <div className="mt-4 text-sm text-muted-foreground">
                    Industry Average: {benchmark.meanScore} ({benchmark.sampleSize} organizations)
                  </div>
                )}
              </div>
            </div>
          </div>

          {otherModels.length > 0 && (
            <div className="mt-12">
              <h3 className="text-2xl font-bold mb-6 text-center">Explore More Assessments</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {otherModels.map((otherModel, idx) => (
                  <Card key={otherModel.id} className="p-6 hover-elevate transition-all" data-testid={`card-model-suggestion-${idx + 1}`}>
                    <h4 className="font-bold text-lg mb-2">{otherModel.name}</h4>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{otherModel.description}</p>
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => setLocation(`/${otherModel.slug}`)}
                      data-testid={`button-model-${otherModel.slug}`}
                    >
                      Start Assessment
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="text-center mt-8">
            <Button 
              onClick={() => setLocation('/')} 
              data-testid="button-view-all-assessments"
            >
              View All Assessments
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
