import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import heroImage from '@assets/generated_images/Hero_image_with_team_collaboration_c8f0445f.png';

export function HeroSection() {
  return (
    <section className="relative min-h-[600px] md:min-h-[700px] flex items-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img 
          src={heroImage} 
          alt="Team collaboration with AI technology" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/85" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/80 to-background/95" />
      </div>
      
      <div className="container relative z-10 mx-auto px-4 py-20">
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6" data-testid="text-hero-title">
            Assess Your Organization's Maturity
          </h1>
          <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl" data-testid="text-hero-subtitle">
            Science-backed assessments trusted by leading enterprises. Measure your progress, benchmark against peers, and drive meaningful transformation.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button 
              size="lg" 
              className="bg-white text-primary hover:bg-white/90 border-2 border-white hover-elevate active-elevate-2"
              data-testid="button-start-assessment"
            >
              Start Your Assessment
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-2 border-white text-white bg-white/10 backdrop-blur-sm hover:bg-white/20 hover-elevate active-elevate-2"
              data-testid="button-learn-more"
            >
              Learn More
            </Button>
          </div>

          <div className="mt-8 flex items-center gap-3" data-testid="text-powered-by">
            <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-white/10 backdrop-blur-sm border border-white/20">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" opacity="0.9"><rect x="0" y="0" width="7" height="7" /><rect x="9" y="0" width="7" height="7" /><rect x="0" y="9" width="7" height="7" /><rect x="9" y="9" width="7" height="7" /></svg>
              <span className="text-sm text-white/80">
                Built on <span className="font-semibold text-white/95">Microsoft Azure AI Foundry</span>
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-white/10 backdrop-blur-sm border border-white/20">
              <Sparkles className="h-4 w-4 text-white/90" />
              <span className="text-sm text-white/80">
                Featuring <span className="font-semibold text-white/95">GPT-5.4</span> & <span className="font-semibold text-white/95">Claude Opus 4.6</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
