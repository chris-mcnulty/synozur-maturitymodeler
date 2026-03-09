import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Brain, DollarSign, Activity, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

interface AiUsageStats {
  totalRequests: number;
  totalEstimatedCost: number;
  requestsByOperation: Record<string, number>;
  dailyUsage: Record<string, number>;
  recentLogs: Array<{
    id: string;
    userId: string;
    modelName: string;
    operation: string;
    estimatedCost: number;
    createdAt: string;
  }>;
}

interface ProvidersData {
  providers: { id: string; displayName: string; isAvailable: boolean; models: { id: string; displayName: string }[] }[];
  active: { providerId: string; modelId: string };
}

const COLORS = ['#810FFB', '#E60CB3', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

const operationLabels: Record<string, string> = {
  'recommendation': 'Recommendations',
  'generate-interpretation': 'Interpretations',
  'generate-resources': 'Resources',
  'generate-improvement': 'Improvements',
};

export function AiUsageDashboard() {
  const { toast } = useToast();
  const [aiProviderId, setAiProviderId] = useState<string>('');
  const [aiModelId, setAiModelId] = useState<string>('');

  const { data: stats, isLoading } = useQuery<AiUsageStats>({
    queryKey: ['/api/admin/ai/usage'],
  });

  const { data: aiProvidersData } = useQuery<ProvidersData>({
    queryKey: ['/api/ai/providers'],
    queryFn: async () => {
      const response = await fetch('/api/ai/providers');
      if (!response.ok) throw new Error('Failed to fetch AI providers');
      return response.json();
    },
    staleTime: 30000,
  });

  useEffect(() => {
    if (aiProvidersData) {
      setAiProviderId(aiProvidersData.active.providerId);
      setAiModelId(aiProvidersData.active.modelId);
    }
  }, [aiProvidersData]);

  const saveAiConfig = useMutation({
    mutationFn: async ({ providerId, modelId }: { providerId: string; modelId: string }) => {
      await apiRequest('/api/settings/aiProvider', 'POST', { value: providerId });
      await apiRequest('/api/settings/aiModel', 'POST', { value: modelId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/providers'] });
      toast({
        title: "AI provider saved",
        description: `Now using ${aiProvidersData?.providers.find(p => p.id === aiProviderId)?.displayName ?? aiProviderId} / ${aiModelId}.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save AI provider settings.", variant: "destructive" });
    },
  });

  const dailyData = Object.entries(stats?.dailyUsage || {}).map(([date, count]) => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    usage: count,
  })).slice(-14);

  const operationData = Object.entries(stats?.requestsByOperation || {}).map(([operation, count]) => ({
    name: operationLabels[operation] || operation,
    value: count,
  }));

  return (
    <div className="space-y-6">
      {/* AI Provider Configuration */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">AI Provider</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Select which provider and model powers all AI-generated summaries, roadmaps, and insights.
        </p>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5 min-w-[180px]">
            <Label htmlFor="aiProvider" className="text-xs">Provider</Label>
            <Select
              value={aiProviderId}
              onValueChange={(val) => {
                setAiProviderId(val);
                const provider = aiProvidersData?.providers.find(p => p.id === val);
                setAiModelId(provider?.models[0]?.id ?? '');
              }}
            >
              <SelectTrigger id="aiProvider" data-testid="select-ai-provider">
                <SelectValue placeholder="Select provider…" />
              </SelectTrigger>
              <SelectContent>
                {aiProvidersData?.providers.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      {p.isAvailable
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      }
                      {p.displayName}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 min-w-[180px]">
            <Label htmlFor="aiModel" className="text-xs">Model</Label>
            <Select
              value={aiModelId}
              onValueChange={setAiModelId}
              disabled={!aiProviderId}
            >
              <SelectTrigger id="aiModel" data-testid="select-ai-model">
                <SelectValue placeholder="Select model…" />
              </SelectTrigger>
              <SelectContent>
                {aiProvidersData?.providers
                  .find(p => p.id === aiProviderId)
                  ?.models.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            onClick={() => saveAiConfig.mutate({ providerId: aiProviderId, modelId: aiModelId })}
            disabled={saveAiConfig.isPending || !aiProviderId || !aiModelId}
            data-testid="button-save-ai-config"
          >
            {saveAiConfig.isPending ? 'Saving…' : 'Apply'}
          </Button>
        </div>
      </Card>

      {/* Statistics Cards */}
      {isLoading ? (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">Loading AI usage statistics...</div>
        </Card>
      ) : !stats ? (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">No AI usage data available</div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Brain className="h-5 w-5 text-primary" />
                <span className="text-sm text-muted-foreground">Total Requests</span>
              </div>
              <div className="text-3xl font-bold" data-testid="text-total-requests">{stats.totalRequests.toLocaleString()}</div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="h-5 w-5 text-chart-2" />
                <span className="text-sm text-muted-foreground">Estimated Cost</span>
              </div>
              <div className="text-3xl font-bold" data-testid="text-estimated-cost">${stats.totalEstimatedCost.toFixed(2)}</div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Activity className="h-5 w-5 text-chart-3" />
                <span className="text-sm text-muted-foreground">Avg Daily Usage</span>
              </div>
              <div className="text-3xl font-bold" data-testid="text-avg-daily">
                {dailyData.length > 0 
                  ? Math.round(dailyData.reduce((sum, d) => sum + d.usage, 0) / dailyData.length)
                  : 0}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="h-5 w-5 text-chart-4" />
                <span className="text-sm text-muted-foreground">Most Used</span>
              </div>
              <div className="text-xl font-bold" data-testid="text-most-used">
                {operationData.length > 0 
                  ? operationData.sort((a, b) => b.value - a.value)[0]?.name
                  : 'N/A'}
              </div>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Daily AI Usage (Last 14 Days)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.2)" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground) / 0.5)" />
                  <YAxis stroke="hsl(var(--muted-foreground) / 0.5)" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="usage" fill="#810FFB" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Usage by Operation Type</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={operationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {operationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {operationData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm">{entry.name}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Recent Activity Table */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent AI Generations</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Est. Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentLogs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No recent AI activity
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.recentLogs?.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {operationLabels[log.operation] || log.operation}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-model-${log.id}`}>
                        {log.modelName}
                      </TableCell>
                      <TableCell className="text-sm">
                        ${(log.estimatedCost / 100).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
