import { useLocation } from "wouter";
import { Footer } from "@/components/Footer";
import { ModelCard } from "@/components/ModelCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock, FileText, BarChart3, CheckCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Model, Assessment, Dimension } from "@shared/schema";

type ModelWithQuestionCount = Model & { questionCount: number };
import heroBackground from '@assets/AI_network_hero_background.png';

export default function Landing() {
  const [, setLocation] = useLocation();
  
  const { data: models = [], isLoading } = useQuery<ModelWithQuestionCount[]>({
    queryKey: ['/api/models'],
  });

  // Separate featured and regular models
  const featuredModels = models.filter(m => m.featured);
  const regularModels = models.filter(m => !m.featured);
  const featuredModel = featuredModels[0]; // Get first featured model

  // Fetch dimensions for featured model
  const { data: featuredDimensions = [] } = useQuery<Dimension[]>({
    queryKey: ['/api/dimensions', featuredModel?.id],
    queryFn: async () => {
      if (!featuredModel) return [];
      const response = await fetch(`/api/dimensions/${featuredModel.id}`);
      if (!response.ok) return [];
      return await response.json();
    },
    enabled: !!featuredModel,
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
      <main className="flex-1">
        {/* Hero Section - Matching prototype */}
        <section className="relative min-h-[600px] flex items-center bg-gray-900 overflow-hidden">
          <div className="absolute inset-0">
            <img 
              src={heroBackground}
              alt="AI Network Background"
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60" />
          </div>
          
          <div className="container relative z-10 mx-auto px-4 py-20 text-center">
            {/* Featured Model Title and Description */}
            {featuredModel && (
              <>
                <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  {featuredModel.name}
                </h2>
                <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto mb-8">
                  {featuredModel.description}
                </p>
              </>
            )}
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Digital Transformation Maturity Models
            </h1>
            <p className="text-xl md:text-2xl text-white/90 max-w-4xl mx-auto mb-8">
              Take Synozur's comprehensive assessments to identify where your organization stands on your transformation journey. 
              Receive a precise Maturity Score and personalized recommendations to advance your capabilities.
            </p>
            <p className="text-lg text-white/80 mb-12 max-w-3xl mx-auto">
              This is our beta version; signup to learn more when we release the full version with weights, 
              industry benchmarks, and over-time comparisons.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
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

        {/* Featured Model Section */}
        {featuredModel && (
          <section className="py-20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
            <div className="container mx-auto px-4">
              <div className="max-w-6xl mx-auto">
                <Badge className="mb-6 px-4 py-1 text-sm bg-primary/10 text-primary border-primary/20">
                  Featured Assessment
                </Badge>
                
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                  {/* Left: Image and Key Info */}
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl blur-2xl group-hover:blur-3xl transition-all"></div>
                    <Card className="relative overflow-hidden border-2 border-primary/20 hover-elevate">
                      {featuredModel.imageUrl ? (
                        <img 
                          src={featuredModel.imageUrl} 
                          alt={featuredModel.name}
                          className="w-full h-80 object-cover"
                        />
                      ) : (
                        <div className="w-full h-80 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                          <BarChart3 className="h-24 w-24 text-primary/40" />
                        </div>
                      )}
                      <div className="p-6 bg-gradient-to-t from-background to-transparent">
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" />
                            <span className="font-semibold">{featuredModel.questionCount} Questions</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            <span className="font-semibold">{featuredModel.estimatedTime || '10 mins'}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Right: Details */}
                  <div>
                    <p className="text-lg text-muted-foreground mb-6">
                      {featuredModel.description}
                    </p>

                    {featuredDimensions.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                          Assessment Dimensions
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {featuredDimensions.slice(0, 6).map((dimension) => (
                            <div key={dimension.id} className="flex items-center gap-2 text-sm">
                              <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                              <span>{dimension.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button 
                      size="lg"
                      className="w-full sm:w-auto px-8"
                      onClick={() => setLocation(`/${featuredModel.slug}`)}
                      data-testid={`button-start-featured-${featuredModel.slug}`}
                    >
                      Start {featuredModel.name}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Maturity Journey Section - Matching prototype */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl font-bold text-center mb-16">Your Maturity Journey</h2>
            
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
          </div>
        </section>

        {/* All Available Models - Graphically Interesting Display */}
        <section className="py-20 bg-gradient-to-br from-background via-primary/5 to-background relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-20 left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>
          </div>
          <div className="container mx-auto px-4 relative z-10">
            <div className="text-center mb-16">
              <Badge className="mb-4 px-4 py-1 text-sm" variant="outline">
                Comprehensive Assessment Suite
              </Badge>
              <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                All Maturity Models
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Choose from our complete collection of enterprise maturity assessments.
                Each model provides tailored insights for your transformation journey.
              </p>
            </div>
            
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="h-64 animate-pulse bg-muted" />
                ))}
              </div>
            ) : regularModels.length === 0 ? (
              <Card className="max-w-2xl mx-auto p-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Models Available</h3>
                <p className="text-muted-foreground">
                  Check back soon for our maturity assessment models.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                {regularModels.map((model, index) => (
                  <Card 
                    key={model.id}
                    className="group relative overflow-hidden hover-elevate transition-all duration-300 cursor-pointer border-2 hover:border-primary/50"
                    onClick={() => setLocation(`/${model.slug}`)}
                    data-testid={`card-model-${model.slug}`}
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-bl-full"></div>
                    <div className="p-6 relative z-10">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <BarChart3 className="h-6 w-6 text-primary" />
                        </div>
                        {model.id === aiModel?.id && (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            Featured
                          </Badge>
                        )}
                      </div>
                      
                      <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                        {model.name}
                      </h3>
                      
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                        {model.description || 'Comprehensive assessment to evaluate your organization\'s maturity level'}
                      </p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4" />
                            <span>{model.questionCount} questions</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{model.estimatedTime || '10 mins'}</span>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="group-hover:text-primary"
                          data-testid={`button-start-${model.slug}`}
                        >
                          Start
                          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            
            {regularModels.length > 0 && (
              <div className="mt-12 text-center">
                <p className="text-muted-foreground mb-4">
                  Can't find the assessment you're looking for?
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => window.open('https://www.synozur.com/contact', '_blank')}
                  data-testid="button-request-custom"
                >
                  Request Custom Assessment
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Discover Your Maturity?
            </h2>
            <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
              Join leading organizations that are using Synozur's assessment to accelerate their transformation journey
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