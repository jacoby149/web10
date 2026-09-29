import React from 'react';
import axios from 'axios';
import AppShell from '../shared/AppShell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, Eye, MousePointerClick, AlertTriangle, Activity, Globe, Megaphone, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const DAYS_OPTIONS = [7, 30, 90] as const;
type Days = (typeof DAYS_OPTIONS)[number];

interface Summary {
  days: number;
  totals: { pageviews: number; funnel: number; errors: number };
  top_paths: { path: string; count: number }[];
  top_referrers: { referrer: string; count: number }[];
  funnel: { event: string; count: number }[];
  top_errors: { message: string; count: number }[];
  timeseries: { day: string; pageviews: number }[];
  // Node ad performance (D57) — the operator's revenue. Real data comes from
  // the D81 content_events engine (node ads are docs tagged `ad`). Mock until
  // the D81 capture is built.
  node_ads: {
    impressions: number;
    clicks: number;
    ctr: number;
    timeseries: { day: string; impressions: number; clicks: number }[];
  } | null;
}

// Canned data for ?mock=1 preview (the mock interface has no I.v3 / node).
function mockSummary(days: number): Summary {
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const n = Math.min(days, 30);
  const ts = Array.from({ length: n }, (_, i) => {
    const day = daysAgo(n - 1 - i);
    const base = 300 + Math.round(Math.sin(i / 3) * 80) + i * 12;
    return {
      day,
      pageviews: base + Math.round(Math.random() * 40),
      impressions: Math.round(base * 0.4),
      clicks: Math.round(base * 0.03),
    };
  });
  const totalImp = ts.reduce((s, r) => s + r.impressions, 0);
  const totalClk = ts.reduce((s, r) => s + r.clicks, 0);
  return {
    days,
    totals: { pageviews: 12847, funnel: 342, errors: 18 },
    top_paths: [
      { path: '/', count: 5203 },
      { path: '/trending', count: 2891 },
      { path: '/app-store', count: 1764 },
      { path: '/import', count: 1120 },
      { path: '/docs/sdk', count: 640 },
    ],
    top_referrers: [
      { referrer: 'https://news.ycombinator.com', count: 412 },
      { referrer: 'https://twitter.com', count: 287 },
      { referrer: 'https://www.google.com', count: 198 },
      { referrer: 'https://reddit.com', count: 96 },
    ],
    funnel: [
      { event: 'landing', count: 342 },
      { event: 'docs_view', count: 201 },
      { event: 'app_store_view', count: 156 },
      { event: 'exporter_view', count: 88 },
      { event: 'export_started', count: 41 },
      { event: 'export_complete', count: 29 },
    ],
    top_errors: [
      { message: 'TypeError: Cannot read properties of undefined (reading map)', count: 9 },
      { message: 'Failed to fetch', count: 6 },
      { message: 'ReferenceError: wapi is not defined', count: 3 },
    ],
    timeseries: ts.map(({ day, pageviews }) => ({ day, pageviews })),
    node_ads: {
      impressions: totalImp,
      clicks: totalClk,
      ctr: totalImp ? Math.round((totalClk / totalImp) * 1000) / 10 : 0,
      timeseries: ts.map(({ day, impressions, clicks }) => ({ day, impressions, clicks })),
    },
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function StatCard({ label, value, icon: Icon, tone, suffix }: { label: string; value: number | string; icon: React.ElementType; tone: 'brand' | 'warning' | 'danger'; suffix?: string }) {
  const toneClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-brand';
  const testId = `analytics-stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <Card data-testid={testId}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-elevated">
          <Icon className={`h-5 w-5 ${toneClass}`} strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <div className="font-display text-2xl font-bold text-foreground tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && <span className="ml-0.5 text-base font-medium text-muted-foreground">{suffix}</span>}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function RankList({ rows, render, empty, testId }: { rows: any[]; render: (row: any) => React.ReactNode; empty: string; testId: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{empty}</p>;
  }
  return (
    <div className="space-y-1.5" data-testid={testId}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-3 rounded-sm border border-border bg-elevated px-3 py-2">
          <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">{render(row)}</div>
          <span className="shrink-0 font-mono text-sm text-foreground tabular-nums">{row.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsShell({ I, children }: { I: Record<string, any>; children: React.ReactNode }) {
  return (
    <AppShell I={I} padded={false}>
      {children}
    </AppShell>
  );
}

function AnalyticsPage({ I }: { I: Record<string, any> }) {
  const [days, setDays] = React.useState<Days>(30);
  const [data, setData] = React.useState<Summary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const nodePost = async (path: string, body: Record<string, any>) => {
    const decoded = I.v3.readToken();
    const provider = decoded.provider;
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : '';
    return axios.post(`${protocol}//${provider}${port}${path}`, body, {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const load = async (d: Days) => {
    setLoading(true);
    setError(null);
    try {
      if (I.isMock) {
        setData(mockSummary(d));
        return;
      }
      const resp = await nodePost('/admin/analytics', { token: I.v3.state.token, days: d });
      // The node doesn't return node_ads yet (D81 engine not built) — default
      // to null, but preserve it if a future node does return it.
      setData({ ...resp.data, node_ads: resp.data.node_ads ?? null });
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to load analytics. Are you an admin?');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (I.isAdmin) load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [I.isAdmin, days]);

  if (!I.isAdmin) {
    return (
      <AnalyticsShell I={I}>
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          <div
            className="flex flex-col items-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center"
            data-testid="analytics-admins-only"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
              <Lock className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground">Admins only</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Analytics is this node's usage data — pageviews, traffic sources, node ad
              performance, and errors. Only this node's admins can view it.
            </p>
          </div>
        </div>
      </AnalyticsShell>
    );
  }

  if (loading && !data) {
    return (
      <AnalyticsShell I={I}>
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6" data-testid="analytics-loading">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AnalyticsShell>
    );
  }

  if (error && !data) {
    return (
      <AnalyticsShell I={I}>
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="analytics-error">
            {error}
          </div>
        </div>
      </AnalyticsShell>
    );
  }

  if (!data) return null;

  return (
    <AnalyticsShell I={I}>
      <div className="mx-auto max-w-3xl p-4 sm:p-6" data-testid="analytics-page">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">Analytics</h1>
          <div className="flex items-center gap-1 rounded-md border border-border bg-elevated p-0.5" data-testid="analytics-days-toggle">
            {DAYS_OPTIONS.map((d) => (
              <Button
                key={d}
                variant={days === d ? 'brand' : 'ghost'}
                size="sm"
                className="h-7 px-2.5"
                onClick={() => setDays(d)}
                data-testid={`analytics-days-${d}`}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          First-party usage for this node, over the last {data.days} days. Content-free —
          paths, traffic sources, node ad performance, and error counts only, never user content.
        </p>

        {error && (
          <div className="mb-4 rounded bg-danger-muted p-3 text-sm text-danger" data-testid="analytics-load-error">{error}</div>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Pageviews" value={data.totals.pageviews} icon={Eye} tone="brand" />
            <StatCard label="Funnel events" value={data.totals.funnel} icon={MousePointerClick} tone="warning" />
            <StatCard label="Errors" value={data.totals.errors} icon={AlertTriangle} tone="danger" />
          </div>

          {/* Time-series: pageviews over the window (the line graph). */}
          <Card data-testid="analytics-timeseries-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand-300" strokeWidth={1.5} />
                <CardTitle>Pageviews over time</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {data.timeseries.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="analytics-timeseries-empty">
                  No pageviews recorded in this window.
                </p>
              ) : (
                <div className="h-56 w-full" data-testid="analytics-timeseries">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.timeseries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={32}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '0.5rem',
                          fontSize: 12,
                        }}
                        labelStyle={{ color: 'var(--color-foreground)' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="pageviews"
                        stroke="var(--color-brand)"
                        strokeWidth={2}
                        fill="url(#pvFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Node ads (D57) — the operator's revenue. Mock until D81 capture. */}
          <Card data-testid="analytics-node-ads-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-brand-300" strokeWidth={1.5} />
                <CardTitle>Node ads</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.node_ads ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Impressions" value={data.node_ads.impressions} icon={Eye} tone="brand" />
                    <StatCard label="Clicks" value={data.node_ads.clicks} icon={MousePointerClick} tone="warning" />
                    <StatCard label="CTR" value={data.node_ads.ctr} icon={TrendingUp} tone="brand" suffix="%" />
                  </div>
                  {data.node_ads.timeseries.length > 0 && (
                    <div className="h-40 w-full" data-testid="analytics-node-ads-timeseries">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.node_ads.timeseries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="adFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                          <XAxis
                            dataKey="day"
                            tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={32}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                          />
                          <Tooltip
                            contentStyle={{
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '0.5rem',
                              fontSize: 12,
                            }}
                          />
                          <Area type="monotone" dataKey="impressions" stroke="var(--color-brand)" strokeWidth={2} fill="url(#adFill)" />
                          <Area type="monotone" dataKey="clicks" stroke="var(--color-warning)" strokeWidth={2} fill="transparent" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="analytics-node-ads-empty">
                  Node ad performance arrives with the content analytics engine (D81) —
                  node ads are docs tagged <code className="rounded bg-elevated px-1 font-mono text-xs">ad</code>,
                  tracked the same way as creator ads.
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="analytics-top-paths-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-300" strokeWidth={1.5} />
                <CardTitle>Top pages</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <RankList
                rows={data.top_paths}
                testId="analytics-top-paths"
                empty="No pageviews recorded in this window."
                render={(row) => (
                  <span className="block truncate font-mono text-sm text-foreground">{row.path}</span>
                )}
              />
            </CardContent>
          </Card>

          <Card data-testid="analytics-referrers-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-brand-300" strokeWidth={1.5} />
                <CardTitle>Where traffic comes from</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <RankList
                rows={data.top_referrers}
                testId="analytics-referrers"
                empty="No external referrers in this window (all traffic is direct)."
                render={(row) => (
                  <div className="min-w-0">
                    <span className="block truncate font-mono text-sm text-foreground">{hostOf(row.referrer)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.referrer}</span>
                  </div>
                )}
              />
            </CardContent>
          </Card>

          <Card data-testid="analytics-funnel-card">
            <CardHeader>
              <CardTitle>Funnel events</CardTitle>
            </CardHeader>
            <CardContent>
              <RankList
                rows={data.funnel}
                testId="analytics-funnel"
                empty="No funnel events in this window."
                render={(row) => (
                  <span className="block truncate font-mono text-sm text-foreground">{row.event}</span>
                )}
              />
            </CardContent>
          </Card>

          <Card data-testid="analytics-errors-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" strokeWidth={1.5} />
                <CardTitle>Top errors</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <RankList
                rows={data.top_errors}
                testId="analytics-errors"
                empty="No client-side errors in this window."
                render={(row) => (
                  <span className="block truncate font-mono text-sm text-foreground" title={row.message}>{row.message}</span>
                )}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AnalyticsShell>
  );
}

export default AnalyticsPage;
