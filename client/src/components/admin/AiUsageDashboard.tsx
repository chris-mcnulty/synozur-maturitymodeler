import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Brain, DollarSign, Activity, Clock, TrendingUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

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

const COLORS = ['#810FFB', '#E60CB3', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

const operationLabels: Record<string, string> = {
  'recommendation': 'Recommendations',
  'generate-interpretation': 'Interpretations',
  'generate-resources': 'Resources',
  'generate-improvement': 'Improvements',
};

export function AiUsageDashboard() {
  const { data: stats, isLoading } = useQuery<AiUsageStats>({
    queryKey: ['/api/admin/ai/usage'],
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading AI usage statistics...</div>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">No AI usage data available</div>
      </Card>
    );
  }

  // Prepare data for charts
  const dailyData = Object.entries(stats.dailyUsage || {}).map(([date, count]) => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    usage: count,
  })).slice(-14); // Last 14 days

  const operationData = Object.entries(stats.requestsByOperation || {}).map(([operation, count]) => ({
    name: operationLabels[operation] || operation,
    value: count,
  }));

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Brain className="h-5 w-5 text-primary" />
            <span className="text-sm text-muted-foreground">Total Requests</span>
          </div>
          <div className="text-3xl font-bold">{stats.totalRequests.toLocaleString()}</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="h-5 w-5 text-chart-2" />
            <span className="text-sm text-muted-foreground">Estimated Cost</span>
          </div>
          <div className="text-3xl font-bold">${stats.totalEstimatedCost.toFixed(2)}</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-5 w-5 text-chart-3" />
            <span className="text-sm text-muted-foreground">Avg Daily Usage</span>
          </div>
          <div className="text-3xl font-bold">
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
          <div className="text-xl font-bold">
            {operationData.length > 0 
              ? operationData.sort((a, b) => b.value - a.value)[0]?.name
              : 'N/A'}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Usage Chart */}
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

        {/* Operation Distribution Chart */}
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
                  <TableCell className="text-sm">
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
    </div>
  );
}