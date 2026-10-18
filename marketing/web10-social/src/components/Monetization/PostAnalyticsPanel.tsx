import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  ArrowLeft,
  Eye,
  Users,
  TrendingUp,
  BarChart3,
  Image,
  Play,
  Music,
  Megaphone,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCount } from '@web10/discover';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { projectEarnings, formatProjection, DEFAULT_RATES } from '@/data/ad-projection';
import type { CreatorAnalytics, TopPostDetail } from '@/data/creator-analytics';
import type { AdProduct } from '@/data/types';

// ── PostAnalyticsPanel — Tier 2 of the creator analytics dashboard ──────────
// The per-post drill-down: one post's full performance over the selected
// window. Reached by clicking a post in the Top Posts list (Tier 1) or by a
// deep link (`/monetize?tab=analytics&post=<doc_id>`).
//
// The KB spec (creator-dashboard.md, Tier 2):
//   - Impressions + reach per day (ComposedChart: area + line)
//   - Surface breakdown (horizontal bars)
//   - Avg watch % (single stat, video/short posts)
//   - The projection for this post (if it has a product ad)
//
// All client-side, D60 — zero node surface. The data is the D86 engine's
// `contentAnalytics` rows filtered to this doc (readPostAnalytics).

const C_IMPRESSIONS = 'var(--color-brand)';
const C_REACH = 'var(--color-success)';
const C_AXIS = 'var(--color-muted-foreground)';
const C_GRID = 'var(--color-border)';

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface PostAnalyticsPanelProps {
  /** The post's doc_id (from the URL `?post=` param). */
  docId: string;
  /** The post's enriched detail (title, thumbnail, content type, ad format). */
  detail: TopPostDetail;
  /** The post's per-day metrics over the selected window. */
  analytics: CreatorAnalytics;
  /** The selected window (7 / 30 / 90 days). */
  windowDays: number;
  /** Return to the Tier 1 dashboard (clears the `?post=` param). */
  onBack: () => void;
  /** The post's product (if it has one) — for the projection beat. */
  product?: AdProduct | null;
}

export function PostAnalyticsPanel({
  docId,
  detail,
  analytics,
  windowDays,
  onBack,
  product,
}: PostAnalyticsPanelProps) {
  const { daily, bySurface, totals } = analytics;

  const series = useMemo(
    () => daily.map((d) => ({ ...d, label: dayLabel(d.day) })),
    [daily],
  );

  const hasData = totals.impressions > 0 || totals.reach > 0;

  // The projection beat: if this post has a product ad with a price, show
  // what it could be making at its actual impression count.
  const projection = useMemo(() => {
    if (!product || product.price === undefined || totals.impressions === 0) return undefined;
    return projectEarnings(totals.impressions, product, DEFAULT_RATES);
  }, [product, totals.impressions]);

  // The content-type icon (same logic as ReachCharts' Top Posts).
  const typeIcon = detail.isAd ? (
    <Megaphone className="h-4 w-4" strokeWidth={1.5} />
  ) : detail.contentType === 'short' ? (
    <Music className="h-4 w-4" strokeWidth={1.5} />
  ) : detail.contentType === 'video' ? (
    <Play className="h-4 w-4" strokeWidth={1.5} />
  ) : (
    <Image className="h-4 w-4" strokeWidth={1.5} />
  );

  return (
    <div className="space-y-5" data-testid="post-analytics-panel">
      {/* The header: back button + post identity. */}
      <div className="flex items-center gap-3" data-testid="post-analytics-header">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          data-testid="post-analytics-back"
          className="flex-shrink-0"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {detail.thumbnailUrl ? (
            <img
              src={detail.thumbnailUrl}
              alt=""
              className="h-9 w-9 flex-shrink-0 rounded object-cover"
              data-testid="post-analytics-thumb"
            />
          ) : (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
              {typeIcon}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" data-testid="post-analytics-title">
              {detail.label}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {detail.isAd
                ? detail.adFormat === 'post' ? 'Post ad' : 'Inline ad'
                : detail.contentType === 'video' ? 'Video'
                : detail.contentType === 'short' ? 'Short'
                : 'Post'}
              {' · '}Last {windowDays} days
            </p>
          </div>
        </div>
      </div>

      {/* The two big numbers (this post's totals over the window). */}
      <div className="grid grid-cols-2 gap-3" data-testid="post-analytics-totals">
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Impressions</p>
          </div>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground" data-testid="post-analytics-impressions">
            {formatCount(totals.impressions)}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">times shown in {windowDays}d</p>
        </div>
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Reach</p>
          </div>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground" data-testid="post-analytics-reach">
            {formatCount(totals.reach)}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">distinct people</p>
        </div>
      </div>

      {/* The time-series (impressions area + reach line, this post only). */}
      <div className="rounded border border-border bg-card p-4" data-testid="post-analytics-time-series">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h4 className="text-sm font-medium text-foreground">Daily performance</h4>
        </div>
        <div className="mt-3">
          {hasData ? (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="postImpressionsFill" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#postImpressionsFill)"
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
            <div className="flex h-48 flex-col items-center justify-center rounded border border-dashed border-border text-center">
              <TrendingUp className="h-7 w-7 text-muted-foreground" strokeWidth={1.25} />
              <p className="mt-2 text-sm font-medium text-foreground">No views in this window</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                This post hasn&apos;t been seen in the last {windowDays} days.
              </p>
            </div>
          )}
        </div>
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

      {/* The surface breakdown (where this post was seen). */}
      <div className="rounded border border-border bg-card p-4" data-testid="post-analytics-surfaces">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h4 className="text-sm font-medium text-foreground">Where it was seen</h4>
        </div>
        <div className="mt-3">
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
            <p className="text-xs text-muted-foreground">No surface data in this window.</p>
          )}
        </div>
      </div>

      {/* The watch % stat (video/short posts only). */}
      {detail.avgWatchPct != null && (
        <div className="rounded border border-border bg-card p-4" data-testid="post-analytics-watch">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <h4 className="text-sm font-medium text-foreground">Average watch</h4>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <p className="font-display text-2xl font-medium tabular-nums text-foreground" data-testid="post-analytics-watch-pct">
              {Math.round(detail.avgWatchPct * 100)}%
            </p>
            <p className="text-xs text-muted-foreground">of the video watched on average</p>
          </div>
        </div>
      )}

      {/* The projection beat (if this post has a product ad with a price). */}
      {product && product.price !== undefined && projection !== undefined && (
        <div className="rounded border border-border bg-card p-4" data-testid="post-analytics-projection">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <h4 className="text-sm font-medium text-foreground">What this could be making</h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            At {formatCount(totals.impressions)} impressions, this post projects:
          </p>
          <p className="mt-1 font-display text-xl font-medium tabular-nums text-success" data-testid="post-analytics-projection-value">
            {formatProjection(projection)}
          </p>
        </div>
      )}
    </div>
  );
}
