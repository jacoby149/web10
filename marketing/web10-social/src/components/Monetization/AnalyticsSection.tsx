import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, AlertTriangle, RefreshCw, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/components/shared/Toast';
import { readMyCatalog, type AdItem } from '@/data/ads-catalog';
import { projectEarnings, formatProjection, DEFAULT_RATES } from '@/data/ad-projection';

// The Analytics section (ads-october focus #5) — the "how it's performing"
// view. The diagnostic (focus #4): the **projection** (the hypothesis — assumed
// rates, "100k impressions ~ $30") vs the **actuals** (the reality — the $ the
// operator logged from their affiliate dashboard). The gap between them is the
// tell: "hey analytics is projecting $$$ but making $$, this isnt good, whats
// up."
//
// The **click counter** is the D86 content-analytics engine (a separate lane,
// not built yet) — so this section shows the projection-vs-actual tell now and
// a "clicks coming soon" note for the measured half. The actuals box is
// human-in-the-loop (the operator logs the payout web10 can't see — no Stripe
// integration, the "organic" trade-off in focus.md).
//
// Data: the owner's own product ads (readMyCatalog). No node surface (D60).

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

export function AnalyticsSection() {
  const [ads, setAds] = useState<AdItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ads } = await readMyCatalog();
      setAds(ads.filter((a) => a.product));
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load your analytics');
      if (/403|not a member/i.test(msg)) setAds([]);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const productAds = useMemo(() => ads || [], [ads]);

  return (
    <div className="space-y-6" data-testid="analytics-section">
      {/* The click counter — the D86 engine (next narrowing). */}
      <div className="rounded border border-border bg-card p-5" data-testid="analytics-clicks-note">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
            <MousePointerClick className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-medium text-foreground">Clicks</h3>
              <Badge variant="outline">coming soon</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              The per-ad click counter (the measured half of the tell) is the content-analytics engine — it lands next. Until then, the tell below runs on your projection vs the actuals you log.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
            <BarChart3 className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-medium text-foreground">Performance</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your projection (the hypothesis) vs the actuals you log (the reality). The gap is the tell.
            </p>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="space-y-3" data-testid="analytics-loading">
              {[0, 1].map((i) => (
                <div key={i} className="rounded border border-border p-4">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                </div>
              ))}
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
          ) : productAds.length === 0 ? (
            <div className="rounded border border-dashed border-border p-8 text-center" data-testid="analytics-empty">
              <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
              <p className="mt-3 text-sm font-medium text-foreground">Nothing to measure yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Add a product to an ad (price + commission) to get a projection, then log the actuals from your affiliate dashboard to see the tell.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {productAds.map((ad) => (
                <AnalyticsRow key={ad.doc.doc_id} ad={ad} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalyticsRow({ ad }: { ad: AdItem }) {
  const p = ad.product!;
  const projection = projectEarnings(100_000, p, DEFAULT_RATES);
  const actuals = p.actuals;
  const tell = computeTell(projection, actuals);

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
          <p className="text-[0.6875rem] text-muted-foreground">per 100k impressions</p>
        </div>
        <div className="rounded bg-elevated/50 p-3">
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Actuals</p>
          <p className="mt-1 font-display text-lg font-medium tabular-nums text-foreground">
            {actuals !== undefined ? `$${actuals.toLocaleString()}` : '—'}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">you logged</p>
        </div>
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
