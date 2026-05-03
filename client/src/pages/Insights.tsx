import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, BarChart3, Sparkles, Lock, Users, Target, AlertCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Footer } from "@/components/Footer";
import { MarkdownContent } from "@/components/MarkdownContent";
import { apiRequest } from "@/lib/queryClient";
import { USER_ROLES } from "@shared/constants";

interface BenchmarkStat {
  sampleSize: number;
  meanPercent: number;
  percentile: number;
}

interface ModelInsight {
  modelId: string;
  modelName: string;
  modelClass: string;
  maxScore: number;
  assessmentCount: number;
  latestScore: number;
  latestScorePercent: number;
  latestLabel: string | null;
  trendDelta: number;
  trendDirection: "up" | "down" | "flat" | "single";
  trend: Array<{
    assessmentId: string;
    completedAt: string | null;
    score: number;
    scorePercent: number;
    label: string | null;
  }>;
  benchmarks?: {
    global?: BenchmarkStat;
    tenant?: BenchmarkStat;
  };
}

interface DimensionInsight {
  label: string;
  averagePercent: number;
  modelCount: number;
  sampleSize: number;
  contributingModels: Array<{ modelName: string; averagePercent: number }>;
}

interface UserInsightsResponse {
  scope: "user";
  totalCompleted: number;
  modelCount: number;
  models: ModelInsight[];
  crossModelDimensions: DimensionInsight[];
  benchmarkRadar?: {
    global: DimensionInsight[];
    tenant: DimensionInsight[];
  };
}

interface TenantInsightsResponse {
  scope: "tenant";
  tenantId: string;
  tenantName: string;
  cohortSize: number;
  minCohort: number;
  belowThreshold: boolean;
  totalCompleted: number;
  modelCount: number;
  models: ModelInsight[];
  crossModelDimensions: DimensionInsight[];
}

type InsightsResponse = UserInsightsResponse | TenantInsightsResponse;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TrendIcon({ direction, delta }: { direction: ModelInsight["trendDirection"]; delta: number }) {
  if (direction === "up") return <span className="inline-flex items-center gap-1 text-chart-3"><TrendingUp className="h-4 w-4" /> +{delta}%</span>;
  if (direction === "down") return <span className="inline-flex items-center gap-1 text-chart-5"><TrendingDown className="h-4 w-4" /> {delta}%</span>;
  if (direction === "flat") return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="h-4 w-4" /> {delta >= 0 ? "+" : ""}{delta}%</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">single completion</span>;
}

function PerModelTrendCard({ model }: { model: ModelInsight }) {
  const data = model.trend.map(t => ({
    date: formatDate(t.completedAt) || "—",
    score: t.score,
    scorePercent: t.scorePercent,
  }));

  return (
    <Card className="p-6" data-testid={`card-model-trend-${model.modelId}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h3 className="font-semibold text-lg" data-testid={`text-model-name-${model.modelId}`}>{model.modelName}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary" data-testid={`badge-assessment-count-${model.modelId}`}>
              {model.assessmentCount} assessment{model.assessmentCount === 1 ? "" : "s"}
            </Badge>
            {model.latestLabel && <Badge variant="outline">{model.latestLabel}</Badge>}
            <Badge variant="outline" className="text-xs">/{model.maxScore} scale</Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-primary leading-none" data-testid={`text-model-latest-score-${model.modelId}`}>
            {model.latestScore}
          </div>
          <div className="text-xs text-muted-foreground mt-1">latest score · {model.latestScorePercent}%</div>
          <div className="mt-2 text-sm" data-testid={`text-model-trend-${model.modelId}`}>
            <TrendIcon direction={model.trendDirection} delta={model.trendDelta} />
          </div>
        </div>
      </div>

      {(model.benchmarks?.global || model.benchmarks?.tenant) && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid={`benchmarks-${model.modelId}`}>
          {model.benchmarks?.global && (
            <div className="rounded-md border border-border p-3" data-testid={`benchmark-global-${model.modelId}`}>
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">vs. all peers</span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-semibold" data-testid={`text-percentile-global-${model.modelId}`}>
                  {model.benchmarks.global.percentile}<span className="text-sm font-normal text-muted-foreground">th pct</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  peer avg {model.benchmarks.global.meanPercent}% · n={model.benchmarks.global.sampleSize}
                </span>
              </div>
            </div>
          )}
          {model.benchmarks?.tenant && (
            <div className="rounded-md border border-border p-3" data-testid={`benchmark-tenant-${model.modelId}`}>
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">vs. your organization</span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-semibold" data-testid={`text-percentile-tenant-${model.modelId}`}>
                  {model.benchmarks.tenant.percentile}<span className="text-sm font-normal text-muted-foreground">th pct</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  org avg {model.benchmarks.tenant.meanPercent}% · n={model.benchmarks.tenant.sampleSize}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {model.assessmentCount >= 2 ? (
        <div className="h-[200px]" data-testid={`chart-model-trend-${model.modelId}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <YAxis
                domain={[0, model.maxScore]}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number, name) => name === "score" ? [`${value}/${model.maxScore}`, "Score"] : [value, name]}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid={`empty-trend-${model.modelId}`}>
          Take this assessment again to see trend over time. We track score changes whenever you reassess.
        </div>
      )}
    </Card>
  );
}

function CrossModelRadarCard({
  dimensions,
  scope,
  benchmarkRadar,
}: {
  dimensions: DimensionInsight[];
  scope: "user" | "tenant";
  benchmarkRadar?: { global: DimensionInsight[]; tenant: DimensionInsight[] };
}) {
  const data = useMemo(() => {
    const globalMap = new Map((benchmarkRadar?.global ?? []).map(d => [d.label, d.averagePercent]));
    const tenantMap = new Map((benchmarkRadar?.tenant ?? []).map(d => [d.label, d.averagePercent]));
    return dimensions
      .slice(0, 12) // radar legibility
      .map(d => ({
        label: d.label,
        score: d.averagePercent,
        modelCount: d.modelCount,
        globalBenchmark: globalMap.get(d.label),
        tenantBenchmark: tenantMap.get(d.label),
      }));
  }, [dimensions, benchmarkRadar]);

  const hasGlobalBenchmark = scope === "user" && data.some(d => typeof d.globalBenchmark === "number");
  const hasTenantBenchmark = scope === "user" && data.some(d => typeof d.tenantBenchmark === "number");

  if (data.length < 3) {
    return (
      <Card className="p-6" data-testid="card-cross-model-empty">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Cross-Model Strengths</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {scope === "tenant"
            ? "Need at least three shared dimensions across the tenant cohort to render the radar."
            : "Complete a few more dimensions across your assessments to see a cross-model radar view."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6" data-testid="card-cross-model-radar">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Cross-Model Strengths</h3>
        <span className="text-sm text-muted-foreground ml-auto">
          Normalized to % of max score across {data.length} dimension{data.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <Radar name="You" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
            {hasTenantBenchmark && (
              <Radar
                name="Org avg"
                dataKey="tenantBenchmark"
                stroke="hsl(var(--chart-3))"
                fill="hsl(var(--chart-3))"
                fillOpacity={0.1}
                strokeDasharray="4 4"
              />
            )}
            {hasGlobalBenchmark && (
              <Radar
                name="Peer avg"
                dataKey="globalBenchmark"
                stroke="hsl(var(--muted-foreground))"
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.08}
                strokeDasharray="3 3"
              />
            )}
            {(hasGlobalBenchmark || hasTenantBenchmark) && (
              <Legend wrapperStyle={{ fontSize: 12 }} />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: number, name: string) => [`${value}%`, name]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function StrengthsAndGapsCard({ dimensions }: { dimensions: DimensionInsight[] }) {
  if (dimensions.length === 0) return null;
  const sorted = [...dimensions].sort((a, b) => b.averagePercent - a.averagePercent);
  const strengths = sorted.slice(0, 3);
  const gaps = sorted.slice(-3).reverse();

  return (
    <Card className="p-6" data-testid="card-strengths-gaps">
      <h3 className="font-semibold mb-4">Strengths and Gaps</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Top strengths</div>
          <ul className="space-y-2" data-testid="list-strengths">
            {strengths.map(d => (
              <li key={`s-${d.label}`} className="flex items-center justify-between gap-3" data-testid={`row-strength-${d.label}`}>
                <span className="truncate">{d.label}</span>
                <Badge variant="secondary">{d.averagePercent}%</Badge>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Priority gaps</div>
          <ul className="space-y-2" data-testid="list-gaps">
            {gaps.map(d => (
              <li key={`g-${d.label}`} className="flex items-center justify-between gap-3" data-testid={`row-gap-${d.label}`}>
                <span className="truncate">{d.label}</span>
                <Badge variant="outline">{d.averagePercent}%</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function NarrativeCard({
  data,
  scope,
  userContext,
  narrative,
  setNarrative,
}: {
  data: InsightsResponse;
  scope: "user" | "tenant";
  userContext?: { industry?: string; companySize?: string; jobTitle?: string };
  narrative: string | null;
  setNarrative: (n: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      const payload = {
        scope,
        models: data.models.map(m => ({
          modelName: m.modelName,
          modelClass: m.modelClass,
          latestScorePercent: m.latestScorePercent,
          assessmentCount: m.assessmentCount,
          trendDirection: m.trendDirection,
          trendDelta: m.trendDelta,
        })),
        crossModelDimensions: data.crossModelDimensions.map(d => ({
          label: d.label,
          averagePercent: d.averagePercent,
          modelCount: d.modelCount,
        })),
        cohortSize: scope === "tenant" ? (data as TenantInsightsResponse).cohortSize : undefined,
        userContext,
      };
      const res = await apiRequest("POST", "/api/ai/generate-portfolio-narrative", payload);
      return (await res.json()) as { narrative: string };
    },
    onSuccess: (result) => {
      setNarrative(result.narrative);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.message || "AI is unavailable right now. Please try again later.");
    },
  });

  return (
    <Card className="p-6" data-testid="card-narrative">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Portfolio Narrative</h3>
        <span className="text-sm text-muted-foreground">AI-generated, cached for 90 days</span>
        <div className="ml-auto">
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || data.models.length === 0}
            data-testid="button-generate-narrative"
          >
            {generate.isPending ? "Generating..." : narrative ? "Regenerate" : "Generate Narrative"}
          </Button>
        </div>
      </div>

      {data.models.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-narrative-empty">
          Complete at least one assessment to generate an AI narrative.
        </p>
      ) : narrative ? (
        <MarkdownContent content={narrative} className="prose-sm" />
      ) : error ? (
        <Alert variant="destructive" data-testid="alert-narrative-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">
          Click "Generate Narrative" to ask the AI to summarize the portfolio — strengths, gaps, and recommended next steps.
        </p>
      )}
    </Card>
  );
}

function InsightsContent({
  data,
  scope,
  userContext,
  userName,
  userCompany,
}: {
  data: InsightsResponse;
  scope: "user" | "tenant";
  userContext?: { industry?: string; companySize?: string; jobTitle?: string };
  userName?: string;
  userCompany?: string;
}) {
  const [, setLocation] = useLocation();
  const isTenant = data.scope === "tenant";
  const { toast } = useToast();
  const [narrative, setNarrative] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const { generateInsightsPDF } = await import("@/services/insightsPdfGenerator");
      const tenantData = data.scope === "tenant" ? (data as TenantInsightsResponse) : null;
      const pdf = await generateInsightsPDF({
        scope,
        tenantName: tenantData?.tenantName,
        cohortSize: tenantData?.cohortSize,
        totalCompleted: data.totalCompleted,
        models: data.models.map(m => ({
          modelId: m.modelId,
          modelName: m.modelName,
          modelClass: m.modelClass,
          maxScore: m.maxScore,
          assessmentCount: m.assessmentCount,
          latestScore: m.latestScore,
          latestScorePercent: m.latestScorePercent,
          latestLabel: m.latestLabel,
          trendDelta: m.trendDelta,
          trendDirection: m.trendDirection,
          trend: m.trend.map(t => ({
            completedAt: t.completedAt,
            score: t.score,
            scorePercent: t.scorePercent,
          })),
        })),
        crossModelDimensions: data.crossModelDimensions.map(d => ({
          label: d.label,
          averagePercent: d.averagePercent,
          modelCount: d.modelCount,
        })),
        narrative,
        userContext: scope === "user" ? {
          name: userName,
          company: userCompany,
          jobTitle: userContext?.jobTitle,
          industry: userContext?.industry,
        } : undefined,
      });
      const today = new Date().toISOString().split("T")[0];
      pdf.save(`orion-insights-${scope}-${today}.pdf`);
      toast({
        title: "PDF downloaded",
        description: "Your Insights report has been downloaded.",
      });
    } catch (err) {
      console.error("Failed to generate insights PDF:", err);
      toast({
        title: "Could not generate PDF",
        description: "Something went wrong while building your report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  if (data.totalCompleted === 0) {
    return (
      <Card className="p-10 text-center" data-testid="card-empty-state">
        <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          {isTenant ? "No tenant assessments yet" : "Your insights will appear here"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          {isTenant
            ? "Once people in your organization complete maturity assessments, you'll see aggregated trends here."
            : "Complete a maturity assessment to see your trends, strengths, and gaps across all the models you take."}
        </p>
        {!isTenant && (
          <Button onClick={() => setLocation("/")} data-testid="button-browse-assessments">
            Browse Assessments
          </Button>
        )}
      </Card>
    );
  }

  if (isTenant && (data as TenantInsightsResponse).belowThreshold) {
    const t = data as TenantInsightsResponse;
    return (
      <Card className="p-10 text-center" data-testid="card-tenant-below-threshold">
        <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Cohort too small to display</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          We protect anonymity by only showing tenant-level insights when at least <strong>{t.minCohort}</strong> people have completed assessments. This tenant has <strong>{t.cohortSize}</strong> so far.
        </p>
      </Card>
    );
  }

  if (data.totalCompleted === 1 && !isTenant) {
    const m = data.models[0];
    return (
      <div className="space-y-6">
        <Card className="p-6" data-testid="card-single-completion">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Great start!</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            You've completed your first assessment ({m.modelName}, {m.latestScore}/{m.maxScore} · {m.latestScorePercent}%). Take another assessment — or retake this one — to unlock trend lines, cross-model strengths, and an AI portfolio narrative.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setLocation("/")} data-testid="button-browse-more">
              Browse Assessments
            </Button>
            <Button
              onClick={handleDownloadPdf}
              disabled={downloading}
              variant="outline"
              data-testid="button-download-insights-pdf"
            >
              <Download className="h-4 w-4" />
              {downloading ? "Preparing PDF..." : "Download PDF"}
            </Button>
          </div>
        </Card>
        <PerModelTrendCard model={m} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isTenant && (
        <Alert data-testid="alert-tenant-cohort">
          <Users className="h-4 w-4" />
          <AlertDescription>
            Showing aggregated, anonymized insights across <strong>{(data as TenantInsightsResponse).cohortSize}</strong> people in <strong>{(data as TenantInsightsResponse).tenantName}</strong>. Models and dimensions with fewer than <strong>{(data as TenantInsightsResponse).minCohort}</strong> contributors are hidden.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleDownloadPdf}
          disabled={downloading}
          variant="outline"
          data-testid="button-download-insights-pdf"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Preparing PDF..." : "Download PDF"}
        </Button>
      </div>

      <NarrativeCard
        data={data}
        scope={scope}
        userContext={userContext}
        narrative={narrative}
        setNarrative={setNarrative}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CrossModelRadarCard
          dimensions={data.crossModelDimensions}
          scope={scope}
          benchmarkRadar={data.scope === "user" ? (data as UserInsightsResponse).benchmarkRadar : undefined}
        />
        <StrengthsAndGapsCard dimensions={data.crossModelDimensions} />
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Per-Model Trends</h2>
        {data.models.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground" data-testid="card-no-models">
            No models meet the minimum cohort threshold yet.
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="grid-model-trends">
            {data.models.map(m => (
              <PerModelTrendCard key={m.modelId} model={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Insights() {
  const { user } = useAuth();
  const isTenantAdmin = user?.role === USER_ROLES.TENANT_ADMIN || user?.role === USER_ROLES.GLOBAL_ADMIN;
  const [tab, setTab] = useState<"user" | "tenant">("user");

  const userQuery = useQuery<UserInsightsResponse>({
    queryKey: ["/api/insights/user"],
    enabled: !!user,
  });

  const tenantQuery = useQuery<TenantInsightsResponse>({
    queryKey: ["/api/insights/tenant"],
    enabled: !!user && isTenantAdmin && tab === "tenant",
  });

  const userContext = user
    ? { industry: user.industry || undefined, companySize: user.companySize || undefined, jobTitle: user.jobTitle || undefined }
    : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>Insights - Orion</title>
        <meta name="description" content="Cross-model insights and trends across your maturity assessments." />
      </Helmet>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Insights & Trends</h1>
          <p className="text-muted-foreground">
            See how your maturity portfolio is evolving across every assessment you've taken.
          </p>
        </div>

        {isTenantAdmin ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "user" | "tenant")} className="space-y-6">
            <TabsList data-testid="tabs-insights-scope">
              <TabsTrigger value="user" data-testid="tab-personal">Personal</TabsTrigger>
              <TabsTrigger value="tenant" data-testid="tab-tenant">Tenant</TabsTrigger>
            </TabsList>

            <TabsContent value="user" className="space-y-6">
              {userQuery.isLoading ? (
                <Card className="p-6"><div className="h-40 bg-muted animate-pulse rounded" /></Card>
              ) : userQuery.error ? (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Failed to load insights.</AlertDescription></Alert>
              ) : userQuery.data ? (
                <InsightsContent data={userQuery.data} scope="user" userContext={userContext} userName={user?.name || undefined} userCompany={user?.company || undefined} />
              ) : null}
            </TabsContent>

            <TabsContent value="tenant" className="space-y-6">
              {tenantQuery.isLoading ? (
                <Card className="p-6"><div className="h-40 bg-muted animate-pulse rounded" /></Card>
              ) : tenantQuery.error ? (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Failed to load tenant insights.</AlertDescription></Alert>
              ) : tenantQuery.data ? (
                <InsightsContent data={tenantQuery.data} scope="tenant" userContext={userContext} />
              ) : null}
            </TabsContent>
          </Tabs>
        ) : userQuery.isLoading ? (
          <Card className="p-6"><div className="h-40 bg-muted animate-pulse rounded" /></Card>
        ) : userQuery.error ? (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Failed to load insights.</AlertDescription></Alert>
        ) : userQuery.data ? (
          <InsightsContent data={userQuery.data} scope="user" userContext={userContext} userName={user?.name || undefined} userCompany={user?.company || undefined} />
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
