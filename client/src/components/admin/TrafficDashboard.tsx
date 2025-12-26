import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { Download, Globe, Monitor, Smartphone, Tablet, RefreshCw, Users, Eye, Home, UserPlus } from "lucide-react";

interface TrafficData {
  totalVisits: number;
  pageBreakdown: Record<string, number>;
  topCountries: [string, number][];
  deviceBreakdown: Record<string, number>;
  topBrowsers: [string, number][];
  timeSeries: { date: string; count: number }[];
  filterOptions: {
    countries: string[];
    browsers: string[];
  };
  visits: Array<{
    id: string;
    page: string;
    visitedAt: string;
    country: string | null;
    deviceType: string | null;
    browser: string | null;
    browserVersion: string | null;
    os: string | null;
    referrer: string | null;
  }>;
}

const COLORS = ['#810FFB', '#E60CB3', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const deviceIcons: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

const pageLabels: Record<string, string> = {
  homepage: 'Homepage',
  signup: 'Sign Up',
  login: 'Login',
};

export function TrafficDashboard() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [pageFilter, setPageFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [browserFilter, setBrowserFilter] = useState("all");

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (pageFilter !== 'all') params.set('page', pageFilter);
    if (countryFilter !== 'all') params.set('country', countryFilter);
    if (deviceFilter !== 'all') params.set('deviceType', deviceFilter);
    if (browserFilter !== 'all') params.set('browser', browserFilter);
    return params.toString();
  };

  const { data, isLoading, refetch } = useQuery<TrafficData>({
    queryKey: ['/api/traffic', dateFrom, dateTo, pageFilter, countryFilter, deviceFilter, browserFilter],
    queryFn: async () => {
      const res = await fetch(`/api/traffic?${buildQueryString()}`);
      if (!res.ok) throw new Error('Failed to fetch traffic data');
      return res.json();
    },
  });

  const handleExport = () => {
    window.location.href = `/api/traffic/export?${buildQueryString()}`;
  };

  const resetFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setDateFrom(d.toISOString().split('T')[0]);
    setDateTo(new Date().toISOString().split('T')[0]);
    setPageFilter("all");
    setCountryFilter("all");
    setDeviceFilter("all");
    setBrowserFilter("all");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const deviceData = data?.deviceBreakdown 
    ? Object.entries(data.deviceBreakdown).map(([name, value]) => ({ name, value }))
    : [];

  const browserData = data?.topBrowsers 
    ? data.topBrowsers.map(([name, value]) => ({ name, value }))
    : [];

  const pageData = data?.pageBreakdown
    ? Object.entries(data.pageBreakdown).map(([name, value]) => ({ 
        name: pageLabels[name] || name, 
        value 
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Traffic Analytics</h2>
          <p className="text-muted-foreground">Monitor visitor activity on key pages</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-traffic">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleExport} data-testid="button-export-traffic">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
            <div className="space-y-2">
              <Label>Page</Label>
              <Select value={pageFilter} onValueChange={setPageFilter}>
                <SelectTrigger data-testid="select-page-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pages</SelectItem>
                  <SelectItem value="homepage">Homepage</SelectItem>
                  <SelectItem value="signup">Sign Up</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger data-testid="select-country-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {data?.filterOptions?.countries?.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Device</Label>
              <Select value={deviceFilter} onValueChange={setDeviceFilter}>
                <SelectTrigger data-testid="select-device-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  <SelectItem value="desktop">Desktop</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                  <SelectItem value="tablet">Tablet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Browser</Label>
              <Select value={browserFilter} onValueChange={setBrowserFilter}>
                <SelectTrigger data-testid="select-browser-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Browsers</SelectItem>
                  {data?.filterOptions?.browsers?.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters} className="mt-4" data-testid="button-reset-filters">
            Reset Filters
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-visits">{data?.totalVisits || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Homepage</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-homepage-visits">{data?.pageBreakdown?.homepage || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Sign Up</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-signup-visits">{data?.pageBreakdown?.signup || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Countries</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-unique-countries">{data?.topCountries?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Visits Over Time</CardTitle>
            <CardDescription>Daily visit count for the selected period</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {data?.timeSeries && data.timeSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                  />
                  <Line type="monotone" dataKey="count" stroke="#810FFB" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No data available for the selected period
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device Distribution</CardTitle>
            <CardDescription>Breakdown by device type</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {deviceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {deviceData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Countries</CardTitle>
            <CardDescription>Visitor distribution by country</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.topCountries && data.topCountries.length > 0 ? (
              <div className="space-y-2">
                {data.topCountries.map(([country, count], i) => (
                  <div key={country} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm w-5">{i + 1}.</span>
                      <span>{country}</span>
                    </div>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-center py-4">No country data available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Browsers</CardTitle>
            <CardDescription>Visitor distribution by browser</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {browserData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={browserData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="name" type="category" width={80} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="value" fill="#E60CB3" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No browser data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Visits</CardTitle>
          <CardDescription>Last 100 visits matching the current filters</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Browser</TableHead>
                <TableHead>OS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.visits && data.visits.length > 0 ? (
                data.visits.map((visit) => {
                  const DeviceIcon = deviceIcons[visit.deviceType || 'desktop'] || Monitor;
                  return (
                    <TableRow key={visit.id} data-testid={`row-visit-${visit.id}`}>
                      <TableCell>
                        {new Date(visit.visitedAt).toLocaleString('en-US', { 
                          timeZone: 'America/Los_Angeles',
                          dateStyle: 'short',
                          timeStyle: 'medium'
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{pageLabels[visit.page] || visit.page}</Badge>
                      </TableCell>
                      <TableCell>{visit.country || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <DeviceIcon className="h-4 w-4" />
                          <span className="capitalize">{visit.deviceType || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {visit.browser ? `${visit.browser} ${visit.browserVersion || ''}` : '-'}
                      </TableCell>
                      <TableCell>{visit.os || '-'}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No visits recorded yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
