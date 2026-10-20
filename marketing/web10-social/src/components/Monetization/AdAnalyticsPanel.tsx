import { useMemo } from 'react';
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
  Megaphone,
  Link,
  Paperclip,
  ChevronRight,
} from 'lucide-react';
import { formatCount } from '@web10/discover';
import { Button } from '@/components/ui/button';
import { projectEarnings, formatProjection, DEFAULT_RATES } from '@/data/ad-projection';
import type { CreatorAnalytics, TopPostDetail } from '@/data/creator-analytics';
import type { AdItem } from '@/data/ads-catalog';

// ── AdAnalyticsPanel — Tier 2b of the creator analytics dashboard ───────────
// The per-ad drill-down: one ad's full performance over the selected window.
// Reached by clicking an ad in the Top Posts list (Ads tab) or by a deep link
// (`/monetize?tab=analytics&ad=<doc_id>`).
//
// The KB spec (creator-dashboard.md, Tier 2b):
//   - The ad's own metrics (impressions, reach, surface breakdown)
//   - Which posts this ad is attached to (reverse lookup: posts whose
//     ad_target = this ad's doc_id) + each post's impressions
//   - The ad's product link (if D89) + the product's aggregate performance
//   - The ad's format (inline / post) + status (active / paused)
//
// All client-side, D60 — zero node surface. The data is the D86 engine's
// `contentAnalytics` rows filtered to this ad (readPostAnalytics) + the
// catalog's posts array for the reverse lookup.

const C_IMPRESSIONS = 'var(--color-brand)';
const C_REACH = 'var(--color-success)';
const C_AXIS = 'var(--color-muted-foreground)';
const C_GRID = 'var(--color-border)';

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface AdAnalyticsPanelProps {
  /** The ad's doc_id (from the URL `?ad=` param). */
  adId: string;
  /** The ad's enriched detail (title, thumbnail, ad format). */
  detail: TopPostDetail;
  /** The ad's per-day metrics over the selected window. */
  analytics: CreatorAnalytics;
  /** The selected window (7 / 30 / 90 days). */
  windowDays: number;
  /** Return to the Tier 1 dashboard (clears the `?ad=` param). */
  onBack: () => void;
  /** The full ad item (offer, product, status, format). */
  ad: AdItem;
  /** The posts this ad is attached to (reverse lookup: post.ad_target === adId). */
  attachedPosts: { doc_id: string; label: string; impressions: number }[];
  /** Drill into the product's per-product aggregate (Tier 5). */
  onSelectProduct?: (docId: string) => void;
}

export function AdAnalyticsPanel({
  adId,
  detail,
  analytics,
  windowDays,
  onBack,
  ad,
  attachedPosts,
  onSelectProduct,
}: AdAnalyticsPanelProps) {
  const { daily, bySurface, totals } = analytics;

  const series = useMemo(
    () => daily.map((d) => ({ ...d, label: dayLabel(d.day) })),
    [daily],
  );

  const hasData = totals.impressions > 0 || totals.reach > 0;

  // The product's aggregate performance (if the ad has a product).
  const product = ad.product;
  const productProjection = useMemo(() => {
    if (!product || product.price === undefined || totals.impressions === 0) return undefined;
    return projectEarnings(totals.impressions, product, DEFAULT_RATES);
  }, [product, totals.impressions]);

  return (
    <div className="space-y-5" data-testid="ad-analytics-panel">
      {/* The header: back button + ad identity. */}
      <div className="flex items-center gap-3" data-testid="ad-analytics-header">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          data-testid="ad-analytics-back"
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
              data-testid="ad-analytics-thumb"
            />
          ) : (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
              <Megaphone className="h-4 w-4" strokeWidth={1.5} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" data-testid="ad-analytics-title">
              {detail.label}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {detail.adFormat === 'post' ? 'Post ad' : 'Inline ad'}
              {' · '}{ad.status === 'active' ? 'Active' : 'Paused'}
              {' · '}Last {windowDays} days
            </p>
          </div>
        </div>
      </div>

      {/* The two big numbers (this ad's totals over the window). */}
      <div className="grid grid-cols-2 gap-3" data-testid="ad-analytics-totals">
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Impressions</p>
          </div>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground" data-testid="ad-analytics-impressions">
            {formatCount(totals.impressions)}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">times shown in {windowDays}d</p>
        </div>
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Reach</p>
          </div>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground" data-testid="ad-analytics-reach">
            {formatCount(totals.reach)}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">distinct people</p>
        </div>
      </div>

      {/* The time-series (impressions area + reach line, this ad only). */}
      <div className="rounded border border-border bg-card p-4" data-testid="ad-analytics-time-series">
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
                    <linearGradient id="adImpressionsFill" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#adImpressionsFill)"
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
                This ad hasn&apos;t been seen in the last {windowDays} days.
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

      {/* The surface breakdown (where this ad was seen). */}
      <div className="rounded border border-border bg-card p-4" data-testid="ad-analytics-surfaces">
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

      {/* The attached posts (reverse lookup: which posts carry this ad). */}
      <div className="rounded border border-border bg-card p-4" data-testid="ad-analytics-attached">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h4 className="text-sm font-medium text-foreground">Attached to</h4>
        </div>
        <div className="mt-3">
          {attachedPosts.length > 0 ? (
            <div className="space-y-2">
              {attachedPosts.map((p) => (
                <div key={p.doc_id} className="flex items-center justify-between rounded border border-border p-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.label}</span>
                  <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatCount(p.impressions)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No posts are currently pinned to this ad.
            </p>
          )}
        </div>
      </div>

      {/* The product link + projection (if the ad has a product). Clickable → Tier 5. */}
      {product && (
        <button
          type="button"
          onClick={() => onSelectProduct?.(ad.product_id || '')}
          disabled={!ad.product_id}
          className="w-full rounded border border-border bg-card p-4 text-left transition-colors hover:bg-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-card"
          data-testid="ad-analytics-product"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <h4 className="text-sm font-medium text-foreground">Product</h4>
            </div>
            {ad.product_id && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />}
          </div>
          <p className="mt-1 text-sm text-foreground">{product.name || 'Untitled product'}</p>
          <p className="text-xs text-muted-foreground">
            ${product.price ?? '—'} · {product.commission_is_percent ? `${product.commission}%` : `$${product.commission}`} commission
          </p>
          {productProjection !== undefined && (
            <p className="mt-2 text-xs text-muted-foreground">
              At {formatCount(totals.impressions)} impressions, this ad projects:
            </p>
          )}
          {productProjection !== undefined && (
            <p className="font-display text-lg font-medium tabular-nums text-success" data-testid="ad-analytics-projection-value">
              {formatProjection(productProjection)}
            </p>
          )}
        </button>
      )}
    </div>
  );
}
