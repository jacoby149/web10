import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Eye, Users, TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCount } from '@web10/discover';
import type { CreatorAnalytics } from '@/data/creator-analytics';

// ── ReachCharts — Tier 1 of the creator analytics dashboard ─────────────────
// The funnel's first beat: "your content is already being seen." Renders the
// D86 engine's real reach as charts (the "Google/YouTube Analytics" feel):
//
//   1. The two big numbers (total impressions + reach over the window).
//   2. The time-series (impressions area + reach line, overlaid) — the
//      "is my audience growing" tell, with a 7d / 30d / 90d window toggle.
//   3. The surface breakdown (horizontal bar) — "where are people seeing me?"
//   4. The top posts (ranked list) — the 5 highest-impression posts in the
//      window (the drill-down entry point for Tier 2).
//
// Charting: Recharts (the KB decision — hover tooltips + gradient fills +
// responsive, the dashboard feel without a 300kb dependency). Colors are
// tokens-only (brand violet for impressions, success green for reach).
//
// No data → a designed empty state, not a blank chart.

const WINDOW_OPTIONS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;

// Chart palette (tokens). Impressions = brand violet (the primary metric);
// reach = success green (distinct, in the semantic set).
const C_IMPRESSIONS = 'var(--color-brand)';
const C_REACH = 'var(--color-success)';
const C_AXIS = 'var(--color-muted-foreground)';
const C_GRID = 'var(--color-border)';

/** Format a day label (`YYYY-MM-DD`) for the x-axis (e.g. `Oct 5`). */
function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ReachChartsProps {
  analytics: CreatorAnalytics;
  windowDays: number;
  onWindowChange: (days: number) => void;
  /** doc_id → a short label (title or truncated text) for the top-posts list. */
  postLabels: Map<string, string>;
}

export function ReachCharts({ analytics, windowDays, onWindowChange, postLabels }: ReachChartsProps) {
  const { daily, bySurface, topPosts, totals } = analytics;

  // The time-series data: one point per day (impressions + reach).
  const series = useMemo(
    () => daily.map((d) => ({ ...d, label: dayLabel(d.day) })),
    [daily],
  );

  const hasData = totals.impressions > 0 || totals.reach > 0;

  return (
    <div className="space-y-6">
      {/* The hero: the two big numbers + the time-series. */}
      <div className="rounded border border-border bg-card p-5" data-testid="analytics-reach">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
              <Eye className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-display text-lg font-medium text-foreground">Your Reach</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Real impressions across your posts — the audience you already have, before any ad.
              </p>
            </div>
          </div>
          {/* The window toggle (7d / 30d / 90d). */}
          <div className="flex flex-shrink-0 rounded-md border border-border p-0.5" data-testid="analytics-window-toggle">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => onWindowChange(opt.days)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  windowDays === opt.days
                    ? 'bg-elevated text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                data-testid={`analytics-window-${opt.days}`}
                aria-pressed={windowDays === opt.days}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* The two big numbers. */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded bg-elevated/50 p-3">
            <div className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Impressions</p>
            </div>
            <p className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground" data-testid="analytics-total-impressions">
              {formatCount(totals.impressions)}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">times your content was shown</p>
          </div>
          <div className="rounded bg-elevated/50 p-3">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Reach</p>
            </div>
            <p className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground" data-testid="analytics-total-reach">
              {formatCount(totals.reach)}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">distinct people who saw it</p>
          </div>
        </div>

        {/* The time-series (impressions area + reach line). */}
        <div className="mt-4" data-testid="analytics-time-series">
          {hasData ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="impressionsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C_IMPRESSIONS} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C_IMPRESSIONS} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: C_AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: C_GRID }}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fill: C_AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v: number) => formatCount(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--color-foreground)',
                    }}
                    labelStyle={{ color: 'var(--color-muted-foreground)' }}
                    formatter={(value: number, name: string) => [
                      formatCount(value),
                      name === 'impressions' ? 'Impressions' : 'Reach',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="impressions"
                    stroke={C_IMPRESSIONS}
                    strokeWidth={2}
                    fill="url(#impressionsFill)"
                  />
                  <Line
                    type="monotone"
                    dataKey="reach"
                    stroke={C_REACH}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-56 flex-col items-center justify-center rounded border border-dashed border-border text-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
              <p className="mt-3 text-sm font-medium text-foreground">No views in this window yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                As your posts get seen, your reach chart fills in here — the audience you&apos;re building, day by day.
              </p>
            </div>
          )}
          {/* The legend. */}
          {hasData && (
            <div className="mt-2 flex items-center gap-4 text-[0.6875rem] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: C_IMPRESSIONS }} /> Impressions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: C_REACH }} /> Reach
              </span>
            </div>
          )}
        </div>
      </div>

      {/* The surface breakdown + top posts (two columns on desktop, stacked on mobile). */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* By surface — "where are people seeing me?" */}
        <div className="rounded border border-border bg-card p-5" data-testid="analytics-by-surface">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
              <BarChart3 className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-display text-lg font-medium text-foreground">By Surface</h3>
              <p className="mt-1 text-sm text-muted-foreground">Where people are seeing your content.</p>
            </div>
          </div>
          <div className="mt-4">
            {bySurface.length > 0 ? (
              <div className="space-y-2.5">
                {bySurface.map((s) => {
                  const max = bySurface[0].impressions || 1;
                  const pct = Math.round((s.impressions / max) * 100);
                  return (
                    <div key={s.surface}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="capitalize text-foreground">{s.surface}</span>
                        <span className="tabular-nums text-muted-foreground">{formatCount(s.impressions)}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: C_IMPRESSIONS }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No surface data in this window yet.</p>
            )}
          </div>
        </div>

        {/* Top posts — the ranked list (the Tier 2 drill-down entry point). */}
        <div className="rounded border border-border bg-card p-5" data-testid="analytics-top-posts">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
              <TrendingUp className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-display text-lg font-medium text-foreground">Top Posts</h3>
              <p className="mt-1 text-sm text-muted-foreground">Your best-performing posts this window.</p>
            </div>
          </div>
          <div className="mt-4">
            {topPosts.length > 0 ? (
              <ol className="space-y-2">
                {topPosts.slice(0, 5).map((p, i) => (
                  <li
                    key={p.doc_id}
                    className="flex items-center gap-3 rounded border border-border p-2.5"
                    data-testid={`analytics-top-post-${i}`}
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-elevated text-xs font-medium tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {postLabels.get(p.doc_id) || 'Untitled post'}
                    </span>
                    <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatCount(p.impressions)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">No posts with views in this window yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
