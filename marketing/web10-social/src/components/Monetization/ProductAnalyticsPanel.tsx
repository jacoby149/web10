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
  Package,
  Paperclip,
  ChevronRight,
} from 'lucide-react';
import { formatCount } from '@web10/discover';
import { Button } from '@/components/ui/button';
import { projectEarnings, formatProjection, DEFAULT_RATES } from '@/data/ad-projection';
import type { CreatorAnalytics } from '@/data/creator-analytics';
import type { AdItem, ProductItem } from '@/data/ads-catalog';

// ── ProductAnalyticsPanel — Tier 5 of the creator analytics dashboard ───────
// The product-level view: "how is this product performing across all its ads?"
// Reached by clicking the product card in the per-ad panel (Tier 2b) or by a
// deep link (`/monetize?tab=analytics&product=<doc_id>`).
//
// The KB spec (creator-dashboard.md, Tier 5):
//   - All ads for this product (by product_id) with individual + aggregate metrics
//   - Which posts have ads attached for this product + each post's impressions
//   - Product-level CTR / conversion (aggregated across all its ads)
//   - The product's actuals (logged revenue) vs the projected earnings
//
// All client-side, D60 — zero node surface. The data is the catalog's ads
// (filtered by product_id) + each ad's contentAnalytics (readPostAnalytics)
// + the catalog's posts for the reverse lookup.

const C_IMPRESSIONS = 'var(--color-brand)';
const C_REACH = 'var(--color-success)';
const C_AXIS = 'var(--color-muted-foreground)';
const C_GRID = 'var(--color-border)';

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ProductAnalyticsPanelProps {
  /** The product's doc_id (from the URL `?product=` param). */
  productId: string;
  /** The product item (name, price, commission, actuals). */
  product: ProductItem;
  /** All ads for this product (by product_id). */
  productAds: AdItem[];
  /** Each ad's per-day metrics (keyed by ad doc_id). */
  adAnalytics: Map<string, CreatorAnalytics>;
  /** The selected window (7 / 30 / 90 days). */
  windowDays: number;
  /** Return to the Tier 1 dashboard (clears the `?product=` param). */
  onBack: () => void;
  /** The posts that have ads attached for this product (reverse lookup). */
  attachedPosts: { doc_id: string; label: string; adDocId: string; impressions: number }[];
  /** Drill into an ad's per-ad detail (Tier 2b). */
  onSelectAd?: (docId: string) => void;
}

export function ProductAnalyticsPanel({
  productId,
  product,
  productAds,
  adAnalytics,
  windowDays,
  onBack,
  attachedPosts,
  onSelectAd,
}: ProductAnalyticsPanelProps) {
  const p = product.product;

  // Aggregate metrics across all the product's ads.
  const aggregate = useMemo(() => {
    let impressions = 0;
    let reach = 0;
    let actuals = 0;
    for (const ad of productAds) {
      const a = adAnalytics.get(ad.doc.doc_id);
      if (a) {
        impressions += a.totals.impressions;
        reach += a.totals.reach;
      }
      if (ad.product?.actuals !== undefined) actuals += ad.product.actuals;
    }
    return { impressions, reach, actuals };
  }, [productAds, adAnalytics]);

  // The aggregate projection (at the product's actual impression count).
  const projection = useMemo(() => {
    if (p.price === undefined || aggregate.impressions === 0) return undefined;
    return projectEarnings(aggregate.impressions, p, DEFAULT_RATES);
  }, [p, aggregate.impressions]);

  // The aggregate time-series (sum across all ads, per day).
  const series = useMemo(() => {
    const byDay = new Map<string, { day: string; impressions: number; reach: number }>();
    for (const ad of productAds) {
      const a = adAnalytics.get(ad.doc.doc_id);
      if (!a) continue;
      for (const d of a.daily) {
        const entry = byDay.get(d.day) ?? { day: d.day, impressions: 0, reach: 0 };
        entry.impressions += d.impressions;
        entry.reach += d.reach;
        byDay.set(d.day, entry);
      }
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, label: dayLabel(d.day) }));
  }, [productAds, adAnalytics]);

  // The aggregate surface breakdown (sum across all ads, per surface).
  const bySurface = useMemo(() => {
    const bySurf = new Map<string, { surface: string; impressions: number; reach: number }>();
    for (const ad of productAds) {
      const a = adAnalytics.get(ad.doc.doc_id);
      if (!a) continue;
      for (const s of a.bySurface) {
        const entry = bySurf.get(s.surface) ?? { surface: s.surface, impressions: 0, reach: 0 };
        entry.impressions += s.impressions;
        entry.reach += s.reach;
        bySurf.set(s.surface, entry);
      }
    }
    return [...bySurf.values()].sort((a, b) => b.impressions - a.impressions);
  }, [productAds, adAnalytics]);

  const hasData = aggregate.impressions > 0 || aggregate.reach > 0;

  return (
    <div className="space-y-5" data-testid="product-analytics-panel">
      {/* The header: back button + product identity. */}
      <div className="flex items-center gap-3" data-testid="product-analytics-header">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          data-testid="product-analytics-back"
          className="flex-shrink-0"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
            <Package className="h-4 w-4" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" data-testid="product-analytics-title">
              {p.name || 'Untitled product'}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              ${p.price ?? '—'} · {p.commission_is_percent ? `${p.commission}%` : `$${p.commission}`} commission · Last {windowDays} days
            </p>
          </div>
        </div>
      </div>

      {/* The aggregate totals (across all the product's ads). */}
      <div className="grid grid-cols-2 gap-3" data-testid="product-analytics-totals">
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Impressions</p>
          </div>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground" data-testid="product-analytics-impressions">
            {formatCount(aggregate.impressions)}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">across {productAds.length} ad{productAds.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Reach</p>
          </div>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground" data-testid="product-analytics-reach">
            {formatCount(aggregate.reach)}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">distinct people</p>
        </div>
      </div>

      {/* The aggregate time-series (sum across all ads). */}
      <div className="rounded border border-border bg-card p-4" data-testid="product-analytics-time-series">
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
                    <linearGradient id="productImpressionsFill" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#productImpressionsFill)"
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
                This product&apos;s ads haven&apos;t been seen in the last {windowDays} days.
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

      {/* The per-ad list (each ad's individual metrics). */}
      <div className="rounded border border-border bg-card p-4" data-testid="product-analytics-ads">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h4 className="text-sm font-medium text-foreground">Ads</h4>
        </div>
        <div className="mt-3">
          {productAds.length > 0 ? (
            <div className="space-y-2">
              {productAds.map((ad) => {
                const a = adAnalytics.get(ad.doc.doc_id);
                return (
                  <button
                    key={ad.doc.doc_id}
                    type="button"
                    onClick={() => onSelectAd?.(ad.doc.doc_id)}
                    className="flex w-full items-center justify-between rounded border border-border p-2.5 text-left transition-colors hover:bg-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`product-analytics-ad-${ad.doc.doc_id}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{ad.text || ad.title || 'Untitled ad'}</span>
                    <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatCount(a?.totals.impressions ?? 0)}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No ads reference this product yet.</p>
          )}
        </div>
      </div>

      {/* The attached posts (reverse lookup: which posts carry this product's ads). */}
      <div className="rounded border border-border bg-card p-4" data-testid="product-analytics-attached">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h4 className="text-sm font-medium text-foreground">Attached to</h4>
        </div>
        <div className="mt-3">
          {attachedPosts.length > 0 ? (
            <div className="space-y-2">
              {attachedPosts.map((post) => (
                <div key={post.doc_id} className="flex items-center justify-between rounded border border-border p-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{post.label}</span>
                  <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatCount(post.impressions)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No posts are currently pinned to this product&apos;s ads.
            </p>
          )}
        </div>
      </div>

      {/* The actuals vs projection (the tell). */}
      <div className="rounded border border-border bg-card p-4" data-testid="product-analytics-finance">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h4 className="text-sm font-medium text-foreground">Performance</h4>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded bg-elevated/50 p-3">
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Projected</p>
            <p className="mt-1 font-display text-lg font-medium tabular-nums text-foreground" data-testid="product-analytics-projection">
              {projection !== undefined ? formatProjection(projection) : '—'}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">at {formatCount(aggregate.impressions)} impressions</p>
          </div>
          <div className="rounded bg-elevated/50 p-3">
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Actuals</p>
            <p className="mt-1 font-display text-lg font-medium tabular-nums text-foreground" data-testid="product-analytics-actuals">
              {aggregate.actuals > 0 ? `$${aggregate.actuals.toLocaleString()}` : '—'}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">you logged</p>
          </div>
        </div>
      </div>
    </div>
  );
}
