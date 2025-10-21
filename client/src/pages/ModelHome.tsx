import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, CheckCircle2, Target, TrendingUp, ArrowLeft, Sparkles, Save } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Model, Dimension, Assessment, User } from "@shared/schema";
import openingGraphic from '@assets/generated_images/Opening_graphic_AI_transformation_bf033f89.png';

export default function ModelHome() {
  const [, params] = useRoute("/:modelSlug");
  const [, setLocation] = useLocation();
  const modelSlug = params?.modelSlug || "";

  // Fetch model data from API based on modelSlug
  const { data: model, isLoading } = useQuery<Model & { dimensions: Dimension[] }>({
    queryKey: ['/api/models', modelSlug],
    enabled: !!modelSlug,
  });

  // Check if user is logged in
  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  // Update page title when model loads
  useEffect(() => {
    if (model) {
      document.title = `${model.name} | The Synozur Alliance`;
    }
  }, [model]);

  // Create assessment mutation
  const createAssessment = useMutation({
    mutationFn: async () => {
      if (!model) throw new Error("Model not loaded");
      return apiRequest('/api/assessments', 'POST', {
        modelId: model.id,
      });
    },
    onSuccess: (assessment: Assessment) => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments'] });
      setLocation(`/assessment/${assessment.id}`);
    },
  });

  const handleStartAssessment = () => {
    createAssessment.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg text-muted-foreground">Loading model...</div>
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
            <div className="text-lg text-muted-foreground mb-4">Model not found</div>
            <Button onClick={() => setLocation('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Assessments
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>{model.name} | The Synozur Alliance</title>
        <meta name="description" content={model.description} />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://models.synozur.com/${model.slug}`} />
        <meta property="og:title" content={`${model.name} | The Synozur Alliance`} />
        <meta property="og:description" content={model.description} />
        <meta property="og:image" content="https://models.synozur.com/og-image.jpg" />
        <meta property="og:image:width" content="1024" />
        <meta property="og:image:height" content="1024" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={`https://models.synozur.com/${model.slug}`} />
        <meta name="twitter:title" content={`${model.name} | The Synozur Alliance`} />
        <meta name="twitter:description" content={model.description} />
        <meta name="twitter:image" content="https://models.synozur.com/og-image.jpg" />
      </Helmet>
      
      <main className="flex-1">
        <section className="relative min-h-[400px] flex items-center overflow-hidden bg-primary">
          <div className="absolute inset-0 z-0">
            <img 
              src={model.imageUrl || openingGraphic}
              alt={model.name}
              className="w-full h-full object-cover opacity-20"
            />
          </div>
          
          <div className="container relative z-10 mx-auto px-4 py-16">
            <div className="max-w-4xl">
              <Badge variant="secondary" className="mb-4">
                Version {model.version || '1.0.0'}
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4" data-testid="text-model-title">
                {model.name}
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl" data-testid="text-model-description">
                {model.description}
              </p>
              <div className="flex flex-wrap gap-4">
                <Button 
                  size="lg" 
                  className="bg-white text-primary hover:bg-white/90 border-2 border-white"
                  onClick={handleStartAssessment}
                  disabled={createAssessment.isPending}
                  data-testid="button-start-assessment"
                >
                  {createAssessment.isPending ? 'Creating...' : 'Start Assessment'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2 text-white/90">
                  <Target className="h-5 w-5" />
                  <span>{model.estimatedTime || '15-20 minutes'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              {/* Gentle nudge for anonymous users */}
              {!user && (
                <Alert className="mb-8 bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20" data-testid="alert-signup-nudge">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium mb-1">Get personalized insights and save your progress</p>
                      <p className="text-sm text-muted-foreground">
                        Create a free account to unlock AI-powered recommendations and save your assessment results
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setLocation(`/auth?redirect=/${modelSlug}`)}
                        data-testid="button-signup-nudge"
                      >
                        Sign Up Free
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setLocation(`/auth?redirect=/${modelSlug}`)}
                        data-testid="button-login-nudge"
                      >
                        Log In
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              
              <h2 className="text-3xl font-bold mb-8 text-center">Assessment Dimensions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {model.dimensions.map((dimension, index) => (
                  <Card key={dimension.id} className="p-6 hover-elevate transition-all" data-testid={`dimension-card-${index}`}>
                    <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      {dimension.label}
                    </h3>
                    <p className="text-muted-foreground">{dimension.description || `Evaluate your ${dimension.label.toLowerCase()} capabilities`}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">What You'll Receive</h2>
              <ul className="space-y-4 text-left max-w-2xl mx-auto mb-8">
                <li className="flex items-start gap-3" data-testid="benefit-0">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-lg">Comprehensive assessment of your maturity level</span>
                </li>
                <li className="flex items-start gap-3" data-testid="benefit-1">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-lg">Benchmarking against industry peers</span>
                </li>
                
                <li className="mt-6 mb-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pl-9">WITH FREE REGISTRATION:</h3>
                </li>
                
                <li className="flex items-start gap-3" data-testid="benefit-2">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-lg">Personalized roadmap and recommendations</span>
                </li>
                <li className="flex items-start gap-3" data-testid="benefit-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-lg">Executive-ready PDF report</span>
                </li>
                <li className="flex items-start gap-3" data-testid="benefit-4">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-lg">Save and compare assessments over time</span>
                </li>
              </ul>
              <Button 
                size="lg" 
                className="mt-4" 
                onClick={handleStartAssessment}
                disabled={createAssessment.isPending}
                data-testid="button-get-started"
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 bg-primary text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Begin?</h2>
            <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto">
              Take the first step toward excellence. Complete your assessment in {model.estimatedTime || '15-20 minutes'}.
            </p>
            <Button 
              size="lg" 
              className="bg-white text-primary hover:bg-white/90 border-2 border-white"
              onClick={handleStartAssessment}
              disabled={createAssessment.isPending}
              data-testid="button-cta-start"
            >
              Start Your Assessment
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}