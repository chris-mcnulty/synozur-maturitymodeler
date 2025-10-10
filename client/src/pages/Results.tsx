import { useRoute, useLocation } from "wouter";
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
  const { data: result, isLoading: resultLoading, error: resultError } = useQuery<Result>({
    queryKey: ['/api/results', assessmentId],
    enabled: !!assessmentId,
    retry: false, // Don't retry on 404
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

  if (resultLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg text-muted-foreground" data-testid="loading-results">Loading results...</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (resultError || !result) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <h2 className="text-2xl font-bold mb-4" data-testid="text-error-title">Results Not Available</h2>
            <p className="text-muted-foreground mb-6" data-testid="text-error-message">
              We couldn't find results for this assessment. This may happen if:
            </p>
            <ul className="text-sm text-muted-foreground text-left mb-8 space-y-2">
              <li>• The assessment is incomplete</li>
              <li>• Not all questions were answered</li>
              <li>• There was an error calculating results</li>
            </ul>
            <div className="space-y-4">
              <Button
                onClick={() => setLocation(`/assessment/${assessmentId}`)}
                className="w-full"
                data-testid="button-return-assessment"
              >
                Return to Assessment
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/')}
                className="w-full"
                data-testid="button-home"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen flex flex-col">
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
                  {result.label === 'Transformational' && 'You are at the forefront of AI transformation, leading the industry!'}
                  {result.label === 'Strategic' && 'You have strong strategic foundations and are well-positioned for AI success.'}
                  {result.label === 'Operational' && 'You have good operational AI processes with clear opportunities to advance.'}
                  {result.label === 'Experimental' && 'You are experimenting with AI and building momentum for transformation.'}
                  {result.label === 'Nascent' && 'You are at the beginning of your AI journey with significant growth potential.'}
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
