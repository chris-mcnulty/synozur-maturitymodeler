import { HeroSection } from "@/components/HeroSection";
import { ModelCard } from "@/components/ModelCard";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@shared/schema";

export default function Landing() {
  const { data: models = [], isLoading } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Featured Assessments
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Choose from our science-backed maturity models to benchmark your organization and drive meaningful change.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              {isLoading ? (
                <div data-testid="loading-models" className="col-span-full text-center text-muted-foreground">
                  Loading assessments...
                </div>
              ) : models.length === 0 ? (
                <div data-testid="no-models" className="col-span-full text-center text-muted-foreground">
                  No assessments available yet.
                </div>
              ) : (
                models.map((model) => (
                  <ModelCard 
                    key={model.slug} 
                    slug={model.slug}
                    name={model.name}
                    description={model.description}
                    imageUrl={model.imageUrl || undefined}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Trusted by Leading Organizations
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Join thousands of enterprises using Synozur to measure, benchmark, and accelerate their transformation journeys.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <div className="text-center p-6">
                  <div className="text-4xl font-bold text-primary mb-2">10,000+</div>
                  <div className="text-sm text-muted-foreground">Assessments Completed</div>
                </div>
                <div className="text-center p-6">
                  <div className="text-4xl font-bold text-secondary mb-2">500+</div>
                  <div className="text-sm text-muted-foreground">Organizations</div>
                </div>
                <div className="text-center p-6">
                  <div className="text-4xl font-bold text-primary mb-2">30+</div>
                  <div className="text-sm text-muted-foreground">Industries</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
