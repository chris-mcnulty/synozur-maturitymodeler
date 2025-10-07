import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ResultsHistory } from "@/components/ResultsHistory";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Profile() {
  //todo: remove mock functionality - fetch from API
  const results = [
    { id: "1", modelName: "AI Maturity Assessment", date: "January 15, 2025", score: 348, label: "Operational", change: 28 },
    { id: "2", modelName: "Digital Transformation", date: "January 10, 2025", score: 425, label: "Strategic", change: -15 },
    { id: "3", modelName: "AI Maturity Assessment", date: "December 1, 2024", score: 320, label: "Operational" },
  ];

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
                  <Button className="w-full" data-testid="button-save-profile">
                    Save Changes
                  </Button>
                </div>
              </Card>
            </div>

            <div className="md:col-span-2">
              <h2 className="text-2xl font-bold mb-6">Assessment History</h2>
              <ResultsHistory results={results} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
