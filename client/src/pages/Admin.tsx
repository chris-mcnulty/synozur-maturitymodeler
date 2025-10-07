import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdminTable } from "@/components/AdminTable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, BarChart3, Settings } from "lucide-react";

export default function Admin() {
  //todo: remove mock functionality - fetch from API
  const models = [
    { id: 1, name: "AI Maturity", slug: "ai-maturity", version: "1.0.0", status: "published" },
    { id: 2, name: "Digital Transformation", slug: "digital-transform", version: "2.1.0", status: "published" },
    { id: 3, name: "Data Governance", slug: "data-gov", version: "1.0.0", status: "draft" },
  ];

  const results = [
    { id: 1, date: "2025-01-15", userName: "Alex Chen", company: "Contoso", modelName: "AI Maturity", score: 348 },
    { id: 2, date: "2025-01-14", userName: "Sarah Smith", company: "Acme Corp", modelName: "Digital Transform", score: 425 },
    { id: 3, date: "2025-01-13", userName: "Mike Johnson", company: "Tech Inc", modelName: "AI Maturity", score: 280 },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold">Admin Console</h1>
            <Button variant="outline" data-testid="button-settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="p-6">
              <div className="text-3xl font-bold text-primary mb-2">12</div>
              <div className="text-sm text-muted-foreground">Active Models</div>
            </Card>
            <Card className="p-6">
              <div className="text-3xl font-bold text-secondary mb-2">1,234</div>
              <div className="text-sm text-muted-foreground">Total Assessments</div>
            </Card>
            <Card className="p-6">
              <div className="text-3xl font-bold text-chart-3 mb-2">89%</div>
              <div className="text-sm text-muted-foreground">Completion Rate</div>
            </Card>
            <Card className="p-6">
              <div className="text-3xl font-bold text-chart-4 mb-2">45</div>
              <div className="text-sm text-muted-foreground">Benchmarks</div>
            </Card>
          </div>

          <Tabs defaultValue="models" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="models" data-testid="tab-models">Models</TabsTrigger>
              <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>
              <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
              <TabsTrigger value="audit" data-testid="tab-audit">Audit Log</TabsTrigger>
            </TabsList>

            <TabsContent value="models" className="space-y-4">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Model Management</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" data-testid="button-import-csv">
                      <Upload className="mr-2 h-4 w-4" />
                      Import CSV
                    </Button>
                    <Button data-testid="button-create-model">
                      Create Model
                    </Button>
                  </div>
                </div>
                <AdminTable type="models" data={models} />
              </Card>
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Assessment Results</h2>
                  <div className="flex gap-2">
                    <Input placeholder="Search..." className="w-64" data-testid="input-search-results" />
                    <Button variant="outline" data-testid="button-export-results">
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                  </div>
                </div>
                <AdminTable type="results" data={results} />
              </Card>
            </TabsContent>

            <TabsContent value="benchmarks" className="space-y-4">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Benchmark Management</h2>
                  <Button data-testid="button-rebuild-benchmarks">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Rebuild Benchmarks
                  </Button>
                </div>
                <p className="text-muted-foreground">
                  Configure and manage industry benchmarks. Benchmarks are automatically updated nightly.
                </p>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="space-y-4">
              <Card className="p-6">
                <h2 className="text-xl font-bold mb-6">Audit Log</h2>
                <p className="text-muted-foreground">
                  Track all administrative actions and changes to models, results, and system configuration.
                </p>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
