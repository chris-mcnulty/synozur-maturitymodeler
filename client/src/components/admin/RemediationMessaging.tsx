import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Send, Users, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Calendar } from "lucide-react";

interface RemediationResult {
  assessmentId: string;
  resultId: string;
  completedAt: string;
  name: string;
  email: string | null;
  userId: string | null;
  overallScore: number;
  storedLabel: string;
}

interface ResultsResponse {
  modelName: string;
  results: RemediationResult[];
}

interface MaturityLevel {
  name: string;
  maxScore: number;
}

function computeCorrectLevel(score: number, levels: MaturityLevel[]): string {
  const sorted = [...levels].sort((a, b) => a.maxScore - b.maxScore);
  for (const level of sorted) {
    if (score <= level.maxScore) return level.name;
  }
  return sorted[sorted.length - 1]?.name || 'Unknown';
}

const DEFAULT_LEVELS: MaturityLevel[] = [
  { name: 'Foundational', maxScore: 70 },
  { name: 'Frontier', maxScore: 100 },
];

const DEFAULT_SUBJECT = 'Your {{modelName}} Assessment Result – Correct Maturity Level';

const DEFAULT_MESSAGE = `Hi {{name}},

Thank you for completing the {{modelName}} assessment earlier today.

We want to make sure you have the right information ahead of our upcoming session. Based on your score, your maturity level is:

  {{correctLevel}}

Please use this level when selecting your class or breakout session for the onsite event next week.

If you have any questions, please don't hesitate to reach out — we're here to help.

Warm regards,
The Synozur Team`;

export function RemediationMessaging({ models }: { models: Array<{ id: string; name: string }> }) {
  const { toast } = useToast();
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterByDate, setFilterByDate] = useState(true);
  const [levels, setLevels] = useState<MaturityLevel[]>(DEFAULT_LEVELS);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; failedList: string[] } | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<ResultsResponse>({
    queryKey: ['/api/admin/remediation/results', selectedModelId, filterByDate ? selectedDate : 'all'],
    queryFn: async () => {
      const params = new URLSearchParams({ modelId: selectedModelId });
      if (filterByDate && selectedDate) params.set('date', selectedDate);
      const res = await fetch(`/api/admin/remediation/results?${params}`);
      if (!res.ok) throw new Error('Failed to fetch results');
      return res.json();
    },
    enabled: !!selectedModelId,
  });

  const rows = useMemo(() => {
    if (!data?.results) return [];
    return data.results.map(r => ({
      ...r,
      correctLevel: computeCorrectLevel(r.overallScore, levels),
    }));
  }, [data, levels]);

  const rowsWithEmail = rows.filter(r => r.email);

  const allSelected = rowsWithEmail.length > 0 && rowsWithEmail.every(r => selected.has(r.assessmentId));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rowsWithEmail.map(r => r.assessmentId)));
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const recipients = rowsWithEmail
        .filter(r => selected.has(r.assessmentId))
        .map(r => ({ email: r.email!, name: r.name, overallScore: r.overallScore, correctLevel: r.correctLevel }));
      return apiRequest('/api/admin/remediation/send', 'POST', {
        recipients,
        subject: subject.replace(/\{\{modelName\}\}/g, data?.modelName || ''),
        messageTemplate,
        modelName: data?.modelName || '',
      });
    },
    onSuccess: (result: any) => {
      setSendResult({ sent: result.sent, failed: result.failed, failedList: result.failed || [] });
      toast({ title: `Sent ${result.sent} email${result.sent !== 1 ? 's' : ''}`, description: result.failed > 0 ? `${result.failed} failed` : 'All delivered successfully' });
    },
    onError: (err: Error) => {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
    },
  });

  const updateLevel = (idx: number, field: 'name' | 'maxScore', value: string | number) => {
    setLevels(prev => prev.map((l, i) => i === idx ? { ...l, [field]: field === 'maxScore' ? Number(value) : value } : l));
  };

  const selectedCount = rowsWithEmail.filter(r => selected.has(r.assessmentId)).length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-semibold mb-1">Outreach Messaging</h2>
        <p className="text-sm text-muted-foreground">Find people who took an assessment on a specific day and send them a personalised email — useful for correcting maturity level information after a scale change.</p>
      </div>

      {/* Step 1: Select model + date */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Find Respondents</CardTitle>
          <CardDescription>Select the assessment and date to find who completed it.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <Label htmlFor="model-select" className="mb-1.5 block">Assessment Model</Label>
              <Select value={selectedModelId} onValueChange={v => { setSelectedModelId(v); setSelected(new Set()); }}>
                <SelectTrigger id="model-select" data-testid="select-remediation-model">
                  <SelectValue placeholder="Choose a model…" />
                </SelectTrigger>
                <SelectContent>
                  {models.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <div className="flex items-center gap-2 mb-1.5">
                <Label htmlFor="date-select">Date</Label>
                <button
                  type="button"
                  onClick={() => setFilterByDate(f => !f)}
                  className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${filterByDate ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}
                  data-testid="toggle-date-filter"
                >
                  {filterByDate ? 'On' : 'Off — showing all'}
                </button>
              </div>
              <Input
                id="date-select"
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                disabled={!filterByDate}
                data-testid="input-remediation-date"
              />
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={!selectedModelId || isFetching} data-testid="button-remediation-search">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1.5">Search</span>
            </Button>
          </div>
          {selectedModelId && !filterByDate && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Showing all completed responses for this model — turn Date filter on to narrow to a specific day.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Correct maturity scale */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">2. Set Correct Maturity Scale</CardTitle>
          <CardDescription>Define the correct levels to apply to each respondent's score. The tool will compute the right level for each person.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {levels.map((level, idx) => (
              <div key={idx} className="flex gap-3 items-center">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">Level {idx + 1} Name</Label>
                  <Input
                    value={level.name}
                    onChange={e => updateLevel(idx, 'name', e.target.value)}
                    placeholder="e.g. Foundational"
                    data-testid={`input-level-name-${idx}`}
                  />
                </div>
                <div className="w-36">
                  <Label className="text-xs text-muted-foreground mb-1 block">Max Score (inclusive)</Label>
                  <Input
                    type="number"
                    value={level.maxScore}
                    onChange={e => updateLevel(idx, 'maxScore', e.target.value)}
                    data-testid={`input-level-max-${idx}`}
                  />
                </div>
                {levels.length > 1 && (
                  <Button size="icon" variant="ghost" className="mt-5" onClick={() => setLevels(prev => prev.filter((_, i) => i !== idx))}>
                    ×
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLevels(prev => [...prev, { name: '', maxScore: 100 }])} data-testid="button-add-level">
              + Add level
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Respondent table */}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading respondents…
        </div>
      )}

      {data && rows.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No completed assessments found for this model on {selectedDate}.
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">3. Select Recipients</CardTitle>
              <CardDescription>{rows.length} respondent{rows.length !== 1 ? 's' : ''} found — {rowsWithEmail.length} with email addresses</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{selectedCount} selected</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left px-4 py-2 w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Score</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Stored Level</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Correct Level</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.assessmentId} className="border-b last:border-0 hover-elevate">
                      <td className="px-4 py-2.5">
                        <Checkbox
                          checked={selected.has(r.assessmentId)}
                          onCheckedChange={() => r.email && toggle(r.assessmentId)}
                          disabled={!r.email}
                          data-testid={`checkbox-recipient-${r.assessmentId}`}
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.email || <span className="text-destructive text-xs">No email</span>}</td>
                      <td className="px-4 py-2.5">{r.overallScore}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-xs">{r.storedLabel}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={r.storedLabel !== r.correctLevel ? 'default' : 'secondary'} className="text-xs">
                          {r.correctLevel}
                          {r.storedLabel !== r.correctLevel && ' ✓'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {r.completedAt ? new Date(r.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Compose message */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">4. Compose Message</CardTitle>
            <CardDescription>
              Available variables: <code className="text-xs bg-muted px-1 rounded">{"{{name}}"}</code>{' '}
              <code className="text-xs bg-muted px-1 rounded">{"{{correctLevel}}"}</code>{' '}
              <code className="text-xs bg-muted px-1 rounded">{"{{score}}"}</code>{' '}
              <code className="text-xs bg-muted px-1 rounded">{"{{modelName}}"}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="subject" className="mb-1.5 block">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                data-testid="input-remediation-subject"
              />
            </div>
            <div>
              <Label htmlFor="body" className="mb-1.5 block">Message Body</Label>
              <Textarea
                id="body"
                value={messageTemplate}
                onChange={e => setMessageTemplate(e.target.value)}
                rows={14}
                className="font-mono text-sm"
                data-testid="textarea-remediation-body"
              />
            </div>

            {sendResult && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>
                  {sendResult.sent} email{sendResult.sent !== 1 ? 's' : ''} sent successfully
                  {sendResult.failed > 0 && ` · ${sendResult.failed} failed: ${sendResult.failedList.join(', ')}`}
                </span>
              </div>
            )}

            {selectedCount === 0 && rows.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                Select at least one recipient above to send.
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                {selectedCount > 0 ? `Sending to ${selectedCount} recipient${selectedCount !== 1 ? 's' : ''}` : 'No recipients selected'}
              </span>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={selectedCount === 0 || sendMutation.isPending || !subject || !messageTemplate}
                data-testid="button-remediation-send"
              >
                {sendMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Send {selectedCount > 0 ? `to ${selectedCount}` : ''}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
