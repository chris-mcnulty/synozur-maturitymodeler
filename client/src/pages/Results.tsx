import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ScoreCard } from "@/components/ScoreCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Mail } from "lucide-react";
import resultsImage from '@assets/generated_images/Results_roadmap_next_steps_ec45a8b6.png';

export default function Results() {
  //todo: remove mock functionality - fetch from API
  const dimensions = [
    { key: "strategy", label: "Strategy & Leadership", score: 350 },
    { key: "data", label: "Data & Infrastructure", score: 320 },
    { key: "talent", label: "Talent & Culture", score: 380 },
    { key: "technology", label: "Technology & Tools", score: 340 },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Your Assessment Results</h1>
            <p className="text-lg text-muted-foreground">
              Congratulations on completing your AI Maturity Assessment!
            </p>
          </div>

          <ScoreCard
            overallScore={348}
            label="Operational"
            dimensions={dimensions}
            industryMean={315}
          />

          <div className="mt-12 bg-muted/30 rounded-lg p-8">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-bold mb-4">Next Steps</h3>
                <p className="text-muted-foreground mb-6">
                  Your detailed PDF report has been sent to your email. Download it to explore personalized recommendations and action items.
                </p>
                <div className="flex gap-4">
                  <Button data-testid="button-download-pdf">
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>
                  <Button variant="outline" data-testid="button-email-report">
                    <Mail className="mr-2 h-4 w-4" />
                    Email Report
                  </Button>
                </div>
              </div>
              <div>
                <img
                  src={resultsImage}
                  alt="Next steps roadmap"
                  className="rounded-lg w-full"
                />
              </div>
            </div>
          </div>

          <div className="mt-12">
            <h3 className="text-2xl font-bold mb-6 text-center">Explore More Assessments</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <Card className="p-6 hover-elevate transition-all" data-testid="card-model-suggestion-1">
                <h4 className="font-bold text-lg mb-2">Digital Transformation</h4>
                <p className="text-sm text-muted-foreground mb-4">Measure your digital maturity and modernization readiness</p>
                <Button variant="outline" className="w-full" data-testid="button-model-digital">
                  Start Assessment
                </Button>
              </Card>
              <Card className="p-6 hover-elevate transition-all" data-testid="card-model-suggestion-2">
                <h4 className="font-bold text-lg mb-2">Data Governance</h4>
                <p className="text-sm text-muted-foreground mb-4">Assess your data management and compliance practices</p>
                <Button variant="outline" className="w-full" data-testid="button-model-data">
                  Start Assessment
                </Button>
              </Card>
              <Card className="p-6 hover-elevate transition-all" data-testid="card-model-suggestion-3">
                <h4 className="font-bold text-lg mb-2">Cloud Readiness</h4>
                <p className="text-sm text-muted-foreground mb-4">Evaluate your organization's cloud adoption maturity</p>
                <Button variant="outline" className="w-full" data-testid="button-model-cloud">
                  Start Assessment
                </Button>
              </Card>
            </div>

            <div className="text-center">
              <h3 className="text-xl font-bold mb-4">Resources & Support</h3>
              <div className="flex flex-wrap justify-center gap-4">
                <Button variant="outline" data-testid="button-resource-1">
                  Responsible AI Guide
                </Button>
                <Button variant="outline" data-testid="button-resource-2">
                  Implementation Toolkit
                </Button>
                <Button data-testid="button-cta">
                  Talk to Synozur
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
