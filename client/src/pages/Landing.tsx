import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ModelCard } from "@/components/ModelCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock, FileText, BarChart3, CheckCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Model, Assessment } from "@shared/schema";
import heroBackground from '@assets/generated_images/Opening_graphic_AI_transformation_bf033f89.png';

export default function Landing() {
  const [, setLocation] = useLocation();
  
  const { data: models = [], isLoading } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });

  // Fetch hero model setting
  const { data: heroModelSetting } = useQuery({
    queryKey: ['/api/settings/heroModel'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/settings/heroModel');
        if (response.ok) {
          return await response.json();
        }
        return null;
      } catch {
        return null;
      }
    },
  });

  // Get the hero model based on admin selection or default to AI model
  const getHeroModel = () => {
    if (heroModelSetting?.value) {
      const selectedModel = models.find(m => m.id === heroModelSetting.value);
      if (selectedModel) return selectedModel;
    }
    // Default to AI model if no selection or model not found
    return models.find(m => m.slug === 'digital-transformation' || m.slug.includes('ai')) || models[0];
  };

  const aiModel = getHeroModel();

  // Create assessment for the main AI model
  const createAssessment = useMutation({
    mutationFn: async () => {
      if (!aiModel) throw new Error("No model available");
      const response = await apiRequest('POST', '/api/assessments', {
        modelId: aiModel.id,
      });
      const assessment = await response.json();
      return assessment as Assessment;
    },
    onSuccess: (assessment) => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments'] });
      setLocation(`/assessment/${assessment.id}`);
    },
  });

  const maturityStages = [
    { label: "Nascent", range: "100-199", color: "bg-red-600" },
    { label: "Experimental", range: "200-299", color: "bg-orange-500" },
    { label: "Operational", range: "300-399", color: "bg-yellow-500" },
    { label: "Strategic", range: "400-449", color: "bg-green-500" },
    { label: "Transformational", range: "450-500", color: "bg-primary" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section - Matching prototype */}
        <section className="relative min-h-[600px] flex items-center bg-gradient-to-b from-primary/95 to-primary overflow-hidden">
          <div className="absolute inset-0">
            <img 
              src={heroBackground}
              alt="AI Network Background"
              className="w-full h-full object-cover opacity-20"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-primary/50 to-primary/90" />
          </div>
          
          <div className="container relative z-10 mx-auto px-4 py-20 text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6">
              Discover Your AI Maturity
            </h1>
            <p className="text-xl md:text-2xl text-white/90 max-w-4xl mx-auto mb-8">
              Take Synozur's comprehensive assessment to identify where your organization stands on the AI journey. 
              Receive a precise AI Maturity Score (100-500) and personalized recommendations to advance your capabilities.
            </p>
            <p className="text-lg text-white/80 mb-12 max-w-3xl mx-auto">
              This is our beta version; signup to learn more when we release the full version with weights, 
              industry benchmarks, and over-time comparisons.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-white/90 px-8 py-6 text-lg"
                onClick={() => createAssessment.mutate()}
                disabled={createAssessment.isPending || !aiModel}
                data-testid="button-start-assessment-hero"
              >
                {createAssessment.isPending ? 'Starting...' : 'Start Assessment'}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="bg-white/10 text-white border-white/30 hover:bg-white/20 px-8 py-6 text-lg"
                onClick={() => window.open('https://www.synozur.com/ai', '_blank')}
                data-testid="button-learn-more"
              >
                Learn More
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="bg-white/10 text-white border-white/30 hover:bg-white/20 px-8 py-6 text-lg"
                onClick={() => window.open('https://www.synozur.com/join', '_blank')}
                data-testid="button-sign-up"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </section>

        {/* Maturity Journey Section - Matching prototype */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl font-bold text-center mb-16">Your AI Maturity Journey</h2>
            
            <div className="max-w-6xl mx-auto mb-16">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {maturityStages.map((stage, index) => (
                  <div key={stage.label} className="relative">
                    <div className={`${stage.color} rounded-lg p-6 text-white transition-transform hover:scale-105`}>
                      <div className="text-3xl font-bold mb-2">{stage.label}</div>
                      <div className="text-lg opacity-90">{stage.range}</div>
                    </div>
                    {index < maturityStages.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2">
                        <ArrowRight className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Statistics - Matching prototype */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <Card className="p-8 text-center hover-elevate">
                <div className="text-5xl font-bold text-primary mb-3">12</div>
                <div className="text-lg font-semibold mb-2">Questions</div>
                <div className="text-muted-foreground">
                  Comprehensive assessment across six critical AI maturity dimensions
                </div>
              </Card>
              <Card className="p-8 text-center hover-elevate">
                <div className="text-5xl font-bold text-primary mb-3">10</div>
                <div className="text-lg font-semibold mb-2">Minutes</div>
                <div className="text-muted-foreground">
                  Quick, focused evaluation designed for busy executives and leaders
                </div>
              </Card>
              <Card className="p-8 text-center hover-elevate">
                <div className="text-5xl font-bold text-primary mb-3">5</div>
                <div className="text-lg font-semibold mb-2">Insights</div>
                <div className="text-muted-foreground">
                  Actionable recommendations tailored to your organization's needs
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Assessment Dimensions */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">Six Critical Dimensions</h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Our comprehensive assessment evaluates your organization across the key areas that matter most for AI success
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <Card className="p-6 hover-elevate">
                <CheckCircle className="h-8 w-8 text-primary mb-3" />
                <h3 className="text-xl font-bold mb-2">Strategy & Vision</h3>
                <p className="text-muted-foreground">
                  Executive alignment and AI governance frameworks
                </p>
              </Card>
              <Card className="p-6 hover-elevate">
                <CheckCircle className="h-8 w-8 text-primary mb-3" />
                <h3 className="text-xl font-bold mb-2">Technology & Infrastructure</h3>
                <p className="text-muted-foreground">
                  Technical capabilities and platform readiness
                </p>
              </Card>
              <Card className="p-6 hover-elevate">
                <CheckCircle className="h-8 w-8 text-primary mb-3" />
                <h3 className="text-xl font-bold mb-2">Operations & Processes</h3>
                <p className="text-muted-foreground">
                  Operational integration and process optimization
                </p>
              </Card>
              <Card className="p-6 hover-elevate">
                <CheckCircle className="h-8 w-8 text-primary mb-3" />
                <h3 className="text-xl font-bold mb-2">Culture & People</h3>
                <p className="text-muted-foreground">
                  Organizational readiness and talent development
                </p>
              </Card>
              <Card className="p-6 hover-elevate">
                <CheckCircle className="h-8 w-8 text-primary mb-3" />
                <h3 className="text-xl font-bold mb-2">Customer Experience</h3>
                <p className="text-muted-foreground">
                  Customer-centric AI applications and engagement
                </p>
              </Card>
              <Card className="p-6 hover-elevate">
                <CheckCircle className="h-8 w-8 text-primary mb-3" />
                <h3 className="text-xl font-bold mb-2">Data & Analytics</h3>
                <p className="text-muted-foreground">
                  Data quality, accessibility, and insights generation
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Other Available Assessments */}
        {models.length > 1 && (
          <section className="py-20 bg-background">
            <div className="container mx-auto px-4">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4">Additional Assessments</h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  Explore our complete suite of maturity assessments
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {models.filter(m => m.id !== aiModel?.id).slice(0, 3).map((model) => (
                  <ModelCard 
                    key={model.id} 
                    id={model.id}
                    slug={model.slug}
                    name={model.name}
                    description={model.description || ''}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="py-20 bg-primary text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Discover Your AI Maturity?
            </h2>
            <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
              Join leading organizations that are using Synozur's assessment to accelerate their AI transformation journey
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-white/90 px-8 py-6 text-lg"
                onClick={() => createAssessment.mutate()}
                disabled={createAssessment.isPending || !aiModel}
                data-testid="button-start-assessment-cta"
              >
                Start Your Assessment
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="bg-transparent text-white border-white hover:bg-white/10 px-8 py-6 text-lg"
                onClick={() => window.open('https://www.synozur.com', '_blank')}
                data-testid="button-visit-synozur"
              >
                Visit Synozur.com
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}