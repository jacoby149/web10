import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, AlertTriangle, RefreshCw, Wallet, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/components/shared/Toast';
import { readMyCatalog, type AdItem } from '@/data/ads-catalog';
import { projectEarnings, formatProjection, DEFAULT_RATES } from '@/data/ad-projection';
import { readCreatorAnalytics, enrichTopPosts, type CreatorAnalytics, type TopPostDetail } from '@/data/creator-analytics';
import { ReachCharts } from './ReachCharts';

// The Analytics section (ads-october focus #5) — the "how it's performing"
// view. A funnel, top to bottom:
//
// 1. **Your Reach** (Tier 1) — the D86 engine's real reach as charts (the
//    "Google/YouTube Analytics" feel): the two big numbers, the time-series
//    (impressions + reach), the surface breakdown, and the top posts. Shown
//    even with zero ads — the funnel's first beat: "your content is already
//    being seen."
// 2. **What you could be making** (Tier 3) — a what-if calculator (impressions
//    slider + price + commission) that projects earnings from the audience the
//    creator already has. Works with or without a product; the CTA nudges
//    toward the Ads tab when no product ad exists yet.
// 3. **Portfolio + Performance** (Tier 4) — the projection-vs-actual tell
//    (focus #4), only rendered when at least one product ad exists.
//
// Data: the owner's own catalog (readMyCatalog) + the D86 contentAnalytics
// read (the creator's own content, I3-bound). No node surface (D60).
//
// KB: knowledge-base/web10-v3/analytics/creator-dashboard.md

type Tell = { label: string; variant: 'success' | 'warning' | 'danger' | 'brand' | 'default'; note: string };

/** The projection-vs-actual tell (focus #4). A rough signal — the live version
 *  needs the D86 impression count; today it compares the logged actuals to the
 *  per-100k projection as a gut-check. */
function computeTell(projection: number | undefined, actuals: number | undefined): Tell | null {
  if (projection === undefined || actuals === undefined) return null;
  const ratio = actuals / projection;
  if (ratio >= 1.5) return { label: 'winner', variant: 'success', note: 'Beating the projection — make more like it.' };
  if (ratio >= 0.8) return { label: 'on track', variant: 'brand', note: 'Close to the projection — the rates are about right.' };
  if (ratio >= 0.3) return { label: 'underperforming', variant: 'warning', note: 'Below the projection — the rates may be off, or the creative is weak.' };
  return { label: 'not matching', variant: 'danger', note: 'This isn\u2019t good — the projection and the actuals don\u2019t line up. What\u2019s up?' };
}

/** Format an impression count for the what-if slider label (10k / 100k / 1M). */
function formatImpressions(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString()}M`;
  return `${Math.round(n / 1000)}k`;
}

const EMPTY_ANALYTICS: CreatorAnalytics = {
  daily: [],
  bySurface: [],
  topPosts: [],
  totals: { impressions: 0, reach: 0 },
};

export function AnalyticsSection() {
  const navigate = useNavigate();
  const [ads, setAds] = useState<AdItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<CreatorAnalytics>(EMPTY_ANALYTICS);
  const [topPostDetails, setTopPostDetails] = useState<TopPostDetail[]>([]);
  // The time-series window (7d / 30d / 90d). Default 30d (the GA/YouTube default).
  const [windowDays, setWindowDays] = useState(30);
  // True once the first load has completed. The first load shows the skeleton;
  // a window switch (7d/30d/90d) refreshes the charts in place (no blank flash,
  // so the window toggle stays in the DOM while the new data loads).
  const hasLoadedRef = useRef(false);

  // What-if calculator state (the "what you could be making" funnel).
  // Defaults: 100k impressions (the canonical "100k ~ $30" baseline), $30
  // price, 10% commission — the operator's own example from focus.md.
  const [calcImpressions, setCalcImpressions] = useState(100_000);
  const [calcPrice, setCalcPrice] = useState(30);
  const [calcCommission, setCalcCommission] = useState(10);

  const load = useCallback(async () => {
    // Only the FIRST load blanks the section (the skeleton). A window switch
    // (7d/30d/90d) refreshes the charts in place — no blank flash, so the
    // window toggle stays in the DOM while the new data loads.
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const catalog = await readMyCatalog();
      const productAds = catalog.ads.filter((a) => a.product);
      setAds(productAds);

      // The D86 creator analytics over the selected window (the creator's own
      // content, I3-bound). A read failure degrades to the empty shape (the
      // reach charts show their empty state, never an error) — the reach card
      // is a funnel beat, not a hard dependency.
      const a = await readCreatorAnalytics(windowDays);
      setAnalytics(a);
      // Seed the calculator with the real total when there is one — the funnel
      // starts from the audience the creator already has (clamped to the slider
      // range, 10k–1M).
      if (a.totals.impressions > 0) {
        setCalcImpressions(Math.min(Math.max(a.totals.impressions, 10_000), 1_000_000));
      }
      // Enrich the top posts with their doc identity (title, thumbnail,
      // content type, ad format) so the Top Posts list shows real previews.
      const enriched = await enrichTopPosts(a.topPosts);
      setTopPostDetails(enriched);
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load your analytics');
      if (/403|not a member/i.test(msg)) setAds([]);
      else setError(msg);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => { load(); }, [load]);

  const productAds = useMemo(() => ads || [], [ads]);

  // The what-if projection: same math as the per-ad projection, but driven by
  // the creator's own assumed price + commission (no product required).
  const projectedEarnings = useMemo(() => {
    const tempProduct = {
      price: calcPrice,
      commission: calcCommission,
      commission_is_percent: true,
    };
    return projectEarnings(calcImpressions, tempProduct, DEFAULT_RATES);
  }, [calcImpressions, calcPrice, calcCommission]);

  // The portfolio (the "net's total catch"): the sum of the per-100k projections
  // across the catalog + the total actuals logged. 30 ads read as a portfolio.
  const portfolio = useMemo(() => {
    let projected = 0;
    let hasProjection = false;
    let actuals = 0;
    for (const ad of productAds) {
      const proj = projectEarnings(100_000, ad.product, DEFAULT_RATES);
      if (proj !== undefined) { projected += proj; hasProjection = true; }
      if (ad.product?.actuals !== undefined) actuals += ad.product.actuals;
    }
    return { count: productAds.length, projected, hasProjection, actuals };
  }, [productAds]);

  const hasProductAds = productAds.length > 0;

  return (
    <div className="space-y-6" data-testid="analytics-section">
      {/* Your Reach (Tier 1) — the D86 engine's real reach as charts, always
          shown. The funnel's first beat: "your content is already being seen." */}
      {loading ? (
        <div className="rounded border border-border bg-card p-5" data-testid="analytics-loading">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-3 h-16 w-full" />
          <Skeleton className="mt-2 h-56 w-full" />
        </div>
      ) : error ? (
        <div className="rounded border border-danger/40 bg-danger-muted/30 p-4" data-testid="analytics-error" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" strokeWidth={1.5} />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Couldn&apos;t load your analytics</p>
              <p className="mt-1 text-xs text-muted-foreground break-all">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={load} data-testid="analytics-retry">
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <ReachCharts
          analytics={analytics}
          windowDays={windowDays}
          onWindowChange={setWindowDays}
          topPostDetails={topPostDetails}
        />
      )}

      {/* What you could be making (Tier 3) — the what-if calculator. Always
          shown; the funnel's "potential" beat. Seeded with the real reach. */}
      <div className="rounded border border-border bg-card p-5" data-testid="analytics-calculator">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
            <TrendingUp className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-medium text-foreground">What you could be making</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Drag the slider, set a price and a commission — the projection updates live.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {/* Impressions slider */}
          <div data-testid="analytics-calc-impressions">
            <div className="flex items-center justify-between">
              <label htmlFor="calc-impressions" className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <SlidersHorizontal className="h-3 w-3" strokeWidth={1.75} /> Impressions
              </label>
              <span className="text-[0.6875rem] tabular-nums text-foreground">{formatImpressions(calcImpressions)}</span>
            </div>
            <input
              id="calc-impressions"
              type="range"
              min={10_000}
              max={1_000_000}
              step={10_000}
              value={calcImpressions}
              onChange={(e) => setCalcImpressions(Number(e.target.value))}
              className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-elevated accent-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="analytics-calc-impressions-slider"
            />
          </div>

          {/* Price + commission inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="calc-price" className="text-[0.6875rem] text-muted-foreground">Price ($)</label>
              <input
                id="calc-price"
                type="number"
                min={0}
                step={1}
                value={calcPrice}
                onChange={(e) => setCalcPrice(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded border border-border bg-elevated/50 px-2 py-1 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="analytics-calc-price"
              />
            </div>
            <div>
              <label htmlFor="calc-commission" className="text-[0.6875rem] text-muted-foreground">Commission (%)</label>
              <input
                id="calc-commission"
                type="number"
                min={0}
                max={100}
                step={1}
                value={calcCommission}
                onChange={(e) => setCalcCommission(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="mt-1 w-full rounded border border-border bg-elevated/50 px-2 py-1 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="analytics-calc-commission"
              />
            </div>
          </div>

          {/* Projected earnings */}
          <div className="rounded bg-elevated/50 p-3" data-testid="analytics-calc-result">
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Projected earnings</p>
            <p className="mt-1 font-display text-2xl font-medium tabular-nums text-success">
              {formatProjection(projectedEarnings)}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              at {formatImpressions(calcImpressions)} impressions · ${calcPrice} item · {calcCommission}% commission
            </p>
          </div>

          {/* Funnel CTA — only when no product ad exists yet */}
          {!hasProductAds && (
            <div className="flex items-center justify-between gap-3 rounded border border-dashed border-border p-3">
              <p className="text-xs text-muted-foreground">
                No product ad yet — add one to turn this projection into a real ad.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/monetize')}
                data-testid="analytics-calc-cta"
              >
                Add a product
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* The portfolio (Tier 4) — only when product ads exist. */}
      {!loading && !error && hasProductAds && (
        <div className="rounded border border-border bg-card p-5" data-testid="analytics-portfolio">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
              <Wallet className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg font-medium text-foreground">Portfolio</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The whole net — your catalog&apos;s projected value + what you&apos;ve actually logged.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded bg-elevated/50 p-3">
              <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Products</p>
              <p className="mt-1 font-display text-lg font-medium tabular-nums text-foreground">{portfolio.count}</p>
              <p className="text-[0.6875rem] text-muted-foreground">in your catalog</p>
            </div>
            <div className="rounded bg-elevated/50 p-3">
              <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Projected</p>
              <p className="mt-1 font-display text-lg font-medium tabular-nums text-foreground">
                {portfolio.hasProjection ? formatProjection(portfolio.projected) : '—'}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">per 100k each</p>
            </div>
            <div className="rounded bg-elevated/50 p-3">
              <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Actuals</p>
              <p className="mt-1 font-display text-lg font-medium tabular-nums text-foreground">
                {portfolio.actuals > 0 ? `$${portfolio.actuals.toLocaleString()}` : '—'}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">you logged</p>
            </div>
          </div>
        </div>
      )}

      {/* Performance (Tier 4) — the projection-vs-actual tell, only when product ads exist. */}
      {!loading && !error && hasProductAds && (
        <div className="rounded border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
              <BarChart3 className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg font-medium text-foreground">Performance</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your projection (the hypothesis) vs the actuals you log (the reality). The gap is the tell. Drag the slider to see the what-if.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {productAds.map((ad) => (
              <AnalyticsRow key={ad.doc.doc_id} ad={ad} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsRow({ ad }: { ad: AdItem }) {
  const p = ad.product!;
  // The what-if calculator (the deferred interactive projection): the operator
  // drags impressions and the projected $ moves live. Defaults to 100k (the
  // "100k impressions ~ $X" line). The CTR/conversion use the assumed rates
  // (the self-calibration overrides the conversion when set).
  const [impressions, setImpressions] = useState(100_000);
  const projection = projectEarnings(impressions, p, DEFAULT_RATES);
  const actuals = p.actuals;
  const tell = computeTell(projectEarnings(100_000, p, DEFAULT_RATES), actuals);

  return (
    <div className="rounded border border-border p-4" data-testid={`analytics-row-${ad.doc.doc_id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name || ad.text || 'Untitled product'}</span>
        {tell && <Badge variant={tell.variant}>{tell.label}</Badge>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded bg-elevated/50 p-3">
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Projection</p>
          <p className="mt-1 font-display text-lg font-medium tabular-nums text-foreground">{formatProjection(projection)}</p>
          <p className="text-[0.6875rem] text-muted-foreground">at {formatImpressions(impressions)} impressions</p>
        </div>
        <div className="rounded bg-elevated/50 p-3">
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Actuals</p>
          <p className="mt-1 font-display text-lg font-medium tabular-nums text-foreground">
            {actuals !== undefined ? `$${actuals.toLocaleString()}` : '—'}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">you logged</p>
        </div>
      </div>

      {/* The what-if slider — drag impressions, watch the $ move. */}
      <div className="mt-3" data-testid={`analytics-whatif-${ad.doc.doc_id}`}>
        <div className="flex items-center justify-between">
          <label htmlFor={`whatif-${ad.doc.doc_id}`} className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            <SlidersHorizontal className="h-3 w-3" strokeWidth={1.75} /> What-if impressions
          </label>
          <span className="text-[0.6875rem] tabular-nums text-foreground">{formatImpressions(impressions)}</span>
        </div>
        <input
          id={`whatif-${ad.doc.doc_id}`}
          type="range"
          min={10_000}
          max={1_000_000}
          step={10_000}
          value={impressions}
          onChange={(e) => setImpressions(Number(e.target.value))}
          className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-elevated accent-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`analytics-whatif-slider-${ad.doc.doc_id}`}
        />
      </div>

      {tell && <p className="mt-2 text-xs text-muted-foreground">{tell.note}</p>}
      {actuals === undefined && (
        <p className="mt-2 text-xs text-muted-foreground">
          Log the actuals in the ad form (the &ldquo;Actuals&rdquo; field) to see the tell.
        </p>
      )}
    </div>
  );
}