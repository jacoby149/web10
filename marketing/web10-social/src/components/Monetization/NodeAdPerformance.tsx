import { useState, useEffect, useCallback } from 'react';
import { Eye, MousePointerClick, TrendingUp, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readNodeAdPerformance, type NodeAdPerformanceRow } from '@/data/ads-catalog';

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

/**
 * The node ad performance (D57) — live from the D86 engine, for the node
 * admin. The operator's revenue: impressions (delivery rows), clicks
 * (gated click rows), and CTR over the selected window, plus a per-ad
 * breakdown so each node ad in the inventory shows its own numbers.
 *
 * Sits in the Node Ads card of the Monetization Ads tab (the node admin's
 * ads surface) — the same place the ad is created, edited, and converted
 * between personal/node scope. A non-admin (or a node without node ads)
 * renders nothing.
 */
export function NodeAdPerformance({ adNames }: { adNames?: Map<string, string> }) {
  const [windowDays, setWindowDays] = useState<Window>(30);
  const [data, setData] = useState<{
    impressions: number;
    clicks: number;
    ctr: number;
    ads: NodeAdPerformanceRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (days: Window, refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const result = await readNodeAdPerformance(days);
    setData(result);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load(windowDays);
  }, [windowDays, load]);

  if (loading && !data) {
    return (
      <div className="space-y-3" data-testid="node-ads-performance-loading">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded border border-border bg-elevated/50" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="node-ads-performance-empty">
        No node ads on this node yet — create one above (Run as: Node ad) and its
        impressions and clicks will appear here, live.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="node-ads-performance">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Performance — live from the content analytics engine
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-elevated p-0.5" data-testid="node-ads-performance-window">
            {WINDOWS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d)}
                className={cn(
                  'rounded px-2 py-0.5 text-xs transition-colors',
                  windowDays === d ? 'bg-brand-muted text-brand-300' : 'text-muted-foreground hover:text-foreground',
                )}
                data-testid={`node-ads-performance-window-${d}`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => load(windowDays, true)}
            disabled={refreshing}
            aria-label="Refresh node ad performance"
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            data-testid="node-ads-performance-refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={Eye} label="Impressions" value={data.impressions} testId="node-ads-performance-impressions" />
        <StatTile icon={MousePointerClick} label="Clicks" value={data.clicks} testId="node-ads-performance-clicks" />
        <StatTile icon={TrendingUp} label="CTR" value={data.ctr} suffix="%" testId="node-ads-performance-ctr" />
      </div>

      {data.ads.length > 0 && (
        <div className="space-y-1.5" data-testid="node-ads-performance-ads">
          {data.ads.map((ad) => (
            <div
              key={ad.doc_id}
              className="flex items-center gap-3 rounded border border-border bg-elevated/40 px-3 py-2"
              data-testid={`node-ads-performance-ad-${ad.doc_id}`}
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {adNames?.get(ad.doc_id) || 'Node ad'}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
                <Eye className="h-3 w-3" strokeWidth={1.5} />
                {ad.impressions.toLocaleString()}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
                <MousePointerClick className="h-3 w-3" strokeWidth={1.5} />
                {ad.clicks.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, suffix, testId }: {
  icon: React.ElementType;
  label: string;
  value: number;
  suffix?: string;
  testId: string;
}) {
  return (
    <div className="rounded border border-border bg-elevated/40 p-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 font-display text-lg font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
        {suffix && <span className="ml-0.5 text-xs font-medium text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
