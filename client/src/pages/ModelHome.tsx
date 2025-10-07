import { useRoute } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, Target, TrendingUp } from "lucide-react";
import openingGraphic from '@assets/generated_images/Opening_graphic_AI_transformation_bf033f89.png';

export default function ModelHome() {
  const [, params] = useRoute("/:modelSlug");
  const modelSlug = params?.modelSlug || "";

  // TODO: Fetch model data from API based on modelSlug
  const model = {
    name: "AI Maturity Assessment",
    slug: "ai-maturity",
    description: "Evaluate your organization's readiness to harness the transformative power of artificial intelligence.",
    version: "1.0.0",
    estimatedTime: "15-20 minutes",
    dimensions: [
      { name: "Strategy & Leadership", description: "Executive vision and AI governance framework" },
      { name: "Data & Infrastructure", description: "Data quality, accessibility, and technical capabilities" },
      { name: "Talent & Culture", description: "Skills, mindset, and organizational readiness" },
      { name: "Technology & Tools", description: "AI platforms, tools, and implementation maturity" },
    ],
    benefits: [
      "Comprehensive assessment of AI capabilities",
      "Benchmarking against industry peers",
      "Personalized roadmap and recommendations",
      "Executive-ready PDF report",
    ],
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="relative min-h-[400px] flex items-center overflow-hidden bg-primary">
          <div className="absolute inset-0 z-0">
            <img 
              src={openingGraphic}
              alt={model.name}
              className="w-full h-full object-cover opacity-20"
            />
          </div>
          
          <div className="container relative z-10 mx-auto px-4 py-16">
            <div className="max-w-4xl">
              <Badge variant="secondary" className="mb-4">
                Version {model.version}
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
                  data-testid="button-start-assessment"
                >
                  Start Assessment
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2 text-white/90">
                  <Target className="h-5 w-5" />
                  <span>{model.estimatedTime}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold mb-8 text-center">Assessment Dimensions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {model.dimensions.map((dimension, index) => (
                  <Card key={index} className="p-6 hover-elevate transition-all" data-testid={`dimension-card-${index}`}>
                    <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      {dimension.name}
                    </h3>
                    <p className="text-muted-foreground">{dimension.description}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl font-bold mb-6">What You'll Receive</h2>
                  <ul className="space-y-4">
                    {model.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-3" data-testid={`benefit-${index}`}>
                        <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-lg">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                  <Button size="lg" className="mt-8" data-testid="button-get-started">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
                <div className="relative">
                  <Card className="p-8 bg-gradient-to-br from-primary/10 to-transparent">
                    <div className="text-center">
                      <TrendingUp className="h-16 w-16 text-primary mx-auto mb-4" />
                      <h3 className="text-2xl font-bold mb-2">Science-Backed Framework</h3>
                      <p className="text-muted-foreground mb-6">
                        Our assessment is grounded in research and validated by leading enterprises across industries.
                      </p>
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                          <div className="text-3xl font-bold text-primary">10k+</div>
                          <div className="text-sm text-muted-foreground">Assessments</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold text-primary">500+</div>
                          <div className="text-sm text-muted-foreground">Organizations</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-primary text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Begin?</h2>
            <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto">
              Take the first step toward AI excellence. Complete your assessment in {model.estimatedTime}.
            </p>
            <Button 
              size="lg" 
              className="bg-white text-primary hover:bg-white/90 border-2 border-white"
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
