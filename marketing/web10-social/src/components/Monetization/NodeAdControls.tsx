import { useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast, errorMessage } from '@/components/shared/Toast';
import { getNodeConfig, saveNodeAdPercentage, saveNodeAdOverwrite } from '@/data/ads-catalog';

/**
 * The node-ad controls (D57) — the operator's two knobs, extracted from the
 * retired Node tab so they live in the Ads tab (the node admin's ads surface).
 *
 * - **Ad density** — `node_ad_percentage` (0-100): how often node ads attach
 *   to posts.
 * - **Overwrite the creator's ad?** — `node_ad_overwrite` (default off): when
 *   on, a node ad replaces the creator's ad on the same post.
 *
 * Reads the effective node config (admin). A non-admin gets a 403 → the
 * controls degrade to read-only (the values show, the controls disable).
 */
export function NodeAdControls() {
  const [percentage, setPercentage] = useState<number>(10);
  const [pctLoaded, setPctLoaded] = useState(false);
  const [pctSaving, setPctSaving] = useState(false);

  const [overwrite, setOverwrite] = useState<boolean>(false);
  const [overwriteSaving, setOverwriteSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const cfg = await getNodeConfig();
      const pct = Number((cfg as Record<string, unknown>)?.node_ad_percentage ?? 10);
      setPercentage(Number.isFinite(pct) ? pct : 10);
      setOverwrite(Boolean((cfg as Record<string, unknown>)?.node_ad_overwrite ?? false));
      setPctLoaded(true);
    } catch {
      setPctLoaded(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const savePercentage = async (pct: number) => {
    setPctSaving(true);
    try {
      await saveNodeAdPercentage(pct);
      setPctLoaded(true);
      toast.success(`Node ads on ${pct}% of posts`);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to save the percentage'));
    } finally {
      setPctSaving(false);
    }
  };

  const saveOverwrite = async (value: boolean) => {
    setOverwriteSaving(true);
    try {
      await saveNodeAdOverwrite(value);
      setOverwrite(value);
      toast.success(value ? 'Node ads overwrite the creator\'s ad' : 'Node ads and the creator\'s ad both show');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to save the overwrite setting'));
    } finally {
      setOverwriteSaving(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="node-ad-controls">
      {/* The density control — the percentage of posts that get a node ad. */}
      <div className="rounded border border-border p-4" data-testid="node-ads-density">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-sm font-medium text-foreground">Node ad density</span>
          </div>
          <span className="font-mono text-sm tabular-nums text-foreground" data-testid="node-ads-pct-value">
            {percentage}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percentage}
          disabled={!pctLoaded || pctSaving}
          onChange={(e) => setPercentage(Number(e.target.value))}
          onPointerUp={() => pctLoaded && savePercentage(percentage)}
          onKeyUp={(e) => {
            if (pctLoaded && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) savePercentage(percentage);
          }}
          className="mt-3 w-full accent-brand disabled:opacity-50"
          data-testid="node-ads-pct-slider"
          aria-label="Percentage of posts that get a node ad"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>0% = off</span>
          <span data-testid="node-ads-pct-status">
            {!pctLoaded ? 'admin only' : pctSaving ? 'saving…' : 'saved'}
          </span>
          <span>100% = every post</span>
        </div>
      </div>

      {/* The overwrite knob (ad-improvements.md): does a node ad replace the
          creator's ad on the same post, or do both show? */}
      <div className="rounded border border-border p-4" data-testid="node-ads-overwrite">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Overwrite the creator&apos;s ad?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {overwrite
                ? 'On — a node ad replaces the creator\u2019s ad on the same post (only the node ad shows).'
                : 'Off — the node ad and the creator\u2019s ad both show; the creator\u2019s monetization is never suppressed.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={overwrite}
            aria-label="Overwrite the creator's ad"
            disabled={!pctLoaded || overwriteSaving}
            onClick={() => saveOverwrite(!overwrite)}
            className={cn(
              'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50',
              overwrite ? 'bg-brand' : 'bg-elevated border border-border',
            )}
            data-testid="node-ads-overwrite-toggle"
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-foreground transition-all',
                overwrite ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
