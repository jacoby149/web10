import React from 'react';
import axios from 'axios';
import { Radio, Plus, Pause, Play, Trash2, AlertTriangle, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  discoverGroupId,
  splitNodeAds,
  buildNodeAdBody,
  type AdItem,
  type AdOffer,
} from './ads-data';

interface AdInventoryCardProps {
  I: Record<string, any>;
  onStatus: (msg: string) => void;
}

const OFFER_KINDS = ['affiliate', 'direct', 'own_store'] as const;

/**
 * The Ad Inventory card — the node operator's ad layer (D57, the second layer
 * of the two-layer ad model). The operator sells the node's ad inventory to
 * advertisers directly; this card is where they set the density
 * (`node_ad_percentage`) and manage the node ads (create / pause / resume /
 * retire). A node ad is a `posts` doc on the discover group, tagged `ad` +
 * `node_ad`. The read attaches active node ads to posts at the percentage —
 * the creator's own ad (`doc.ad`) is never suppressed (both can render on the
 * same post).
 */
export function AdInventoryCard({ I, onStatus }: AdInventoryCardProps) {
  const [ads, setAds] = React.useState<AdItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [percentage, setPercentage] = React.useState<number>(10);
  const [pctLoaded, setPctLoaded] = React.useState(false);
  const [pctSaving, setPctSaving] = React.useState(false);

  const [showNewAd, setShowNewAd] = React.useState(false);

  const decoded = () => I.v3?.readToken?.() || null;
  const discoverGroup = () => discoverGroupId(decoded()?.provider);

  // Node config access — the percentage lives in node_config. The card talks
  // to the admin config endpoints directly (the same seam ConfigPage uses).
  const nodePost = async (path: string, body: Record<string, any>) => {
    const provider = decoded()?.provider;
    const protocol = window.location.protocol;
    return axios.post(`${protocol}//${provider}${path}`, body, {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The node ads: read the discover group, filter for the node_ad tag.
      // (The operator's node ads are a small, bounded, recent set — the house
      // client-side filter pattern, like the creator's catalog.)
      const docs = await I.v3.read('posts', { groups: [discoverGroup()], limit: 200 });
      setAds(splitNodeAds(docs || []));
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
    // The percentage: the effective node config (admin). A non-admin gets a
    // 403 — the slider degrades to read-only (the node ads still load).
    try {
      const resp = await nodePost('/config', { token: I.v3.state.token });
      const pct = Number(resp.data?.node_ad_percentage ?? 10);
      setPercentage(Number.isFinite(pct) ? pct : 10);
      setPctLoaded(true);
    } catch {
      setPctLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [I]);

  React.useEffect(() => {
    load();
  }, [load]);

  const reload = () => { load(); };

  // ── actions ──

  const savePercentage = async (pct: number) => {
    setPctSaving(true);
    try {
      await nodePost('/config/update', {
        token: { token: I.v3.state.token },
        update: { node_ad_percentage: pct },
      });
      setPctLoaded(true);
      onStatus(`Node ads on ${pct}% of posts`);
    } catch (e: any) {
      onStatus(e?.response?.data?.detail || e?.message || 'Failed to save the percentage');
    } finally {
      setPctSaving(false);
    }
  };

  const createNodeAd = async (offer: AdOffer, text: string, status: 'active' | 'paused') => {
    await I.v3.create('posts', buildNodeAdBody(offer, text, status), { groups: [discoverGroup()] });
  };

  const setStatus = async (ad: AdItem, status: 'active' | 'paused') => {
    await I.v3.update(ad.doc.doc_id, { status });
  };

  const retireAd = async (ad: AdItem) => {
    await I.v3.delete(ad.doc.doc_id);
  };

  const run = (fn: () => Promise<void>, okMsg: string) => {
    fn()
      .then(() => { onStatus(okMsg); reload(); })
      .catch((e: any) => onStatus(e?.response?.data?.detail || e?.message || String(e)));
  };

  // ── render ──

  return (
    <div className="rounded border border-border bg-card p-5" data-testid="node-ads-card">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-warning">
          <Radio className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium text-foreground">Ad Inventory</h3>
            <Badge variant="outline">node</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your node&apos;s ad inventory — the second layer. Node ads run on top of creators&apos; own ads; neither replaces the other.
          </p>
        </div>
        <Button variant="brand" size="sm" onClick={() => setShowNewAd(true)} data-testid="node-ads-new" disabled={loading}>
          <Plus className="mr-1 h-4 w-4" /> New Node Ad
        </Button>
      </div>

      {/* The density control — the percentage of posts that get a node ad. */}
      <div className="mt-4 rounded border border-border p-4" data-testid="node-ads-density">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-sm font-medium text-foreground">Ad density</span>
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
          onChange={e => setPercentage(Number(e.target.value))}
          onPointerUp={() => pctLoaded && savePercentage(percentage)}
          onKeyUp={e => { if (pctLoaded && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) savePercentage(percentage); }}
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

      {/* The inventory — the node ads. */}
      <div className="mt-4">
        {loading ? (
          <NodeAdsSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : ads && ads.length === 0 ? (
          <EmptyState onNewAd={() => setShowNewAd(true)} />
        ) : ads ? (
          <div className="space-y-3">
            {ads.map(ad => (
              <NodeAdRow
                key={ad.doc.doc_id}
                ad={ad}
                onPause={() => run(() => setStatus(ad, 'paused'), 'Node ad paused')}
                onResume={() => run(() => setStatus(ad, 'active'), 'Node ad active')}
                onRetire={() => run(() => retireAd(ad), 'Node ad retired')}
              />
            ))}
          </div>
        ) : null}
      </div>

      <NewNodeAdDialog
        open={showNewAd}
        onOpenChange={setShowNewAd}
        onSubmit={(offer, text, status) =>
          run(() => createNodeAd(offer, text, status), 'Node ad created')
        }
      />
    </div>
  );
}

// ── States ──

function NodeAdsSkeleton() {
  return (
    <div className="space-y-3" data-testid="node-ads-loading">
      {[0, 1].map(i => (
        <div key={i} className="rounded border border-border p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded border border-danger/40 bg-danger-muted/30 p-4" data-testid="node-ads-error" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" strokeWidth={1.5} />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Couldn&apos;t load your node ads</p>
          <p className="mt-1 text-xs text-muted-foreground break-all">{message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry} data-testid="node-ads-retry">
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNewAd }: { onNewAd: () => void }) {
  return (
    <div className="rounded border border-dashed border-border p-8 text-center" data-testid="node-ads-empty">
      <Radio className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
      <p className="mt-3 text-sm font-medium text-foreground">No node ads yet</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        Create a node ad — a piece of content with a sponsor&apos;s link — and it runs across your node&apos;s feed at the density you set.
      </p>
      <Button variant="brand" size="sm" className="mt-4" onClick={onNewAd} data-testid="node-ads-empty-cta">
        <Plus className="mr-1 h-4 w-4" /> Create your first node ad
      </Button>
    </div>
  );
}

// ── Inventory rows ──

function NodeAdRow({ ad, onPause, onResume, onRetire }: {
  ad: AdItem;
  onPause: () => void;
  onResume: () => void;
  onRetire: () => void;
}) {
  const active = ad.status === 'active';
  return (
    <div
      className={cn('rounded border p-4 transition-colors', active ? 'border-border' : 'border-border opacity-70')}
      data-testid={`node-ads-row-${ad.doc.doc_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{ad.text || 'Untitled node ad'}</span>
            <Badge variant={active ? 'success' : 'default'}>{active ? 'ACTIVE' : 'PAUSED'}</Badge>
            {ad.offer.partner && <Badge variant="outline">{ad.offer.partner}</Badge>}
          </div>
          {ad.offer.cta && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {ad.offer.cta}
              {ad.offer.link ? ` · ${ad.offer.link}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {active ? (
            <Button variant="ghost" size="sm" onClick={onPause} aria-label="Pause node ad" data-testid={`node-ads-pause-${ad.doc.doc_id}`}>
              <Pause className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onResume} aria-label="Resume node ad" data-testid={`node-ads-resume-${ad.doc.doc_id}`}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetire}
            aria-label="Retire node ad"
            className="text-muted-foreground hover:text-danger"
            data-testid={`node-ads-retire-${ad.doc.doc_id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Dialogs ──

function NewNodeAdDialog({ open, onOpenChange, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (offer: AdOffer, text: string, status: 'active' | 'paused') => void;
}) {
  const [text, setText] = React.useState('');
  const [kind, setKind] = React.useState<string>('direct');
  const [partner, setPartner] = React.useState('');
  const [link, setLink] = React.useState('');
  const [cta, setCta] = React.useState('');
  const [disclosure, setDisclosure] = React.useState('Sponsored');
  const [status, setStatus] = React.useState<'active' | 'paused'>('active');
  const [saving, setSaving] = React.useState(false);

  const reset = () => {
    setText(''); setKind('direct'); setPartner(''); setLink(''); setCta('');
    setDisclosure('Sponsored'); setStatus('active');
  };

  const submit = () => {
    if (!link.trim()) return;
    setSaving(true);
    const offer: AdOffer = { kind, partner: partner.trim(), link: link.trim(), cta: cta.trim(), disclosure: disclosure.trim() };
    Promise.resolve(onSubmit(offer, text.trim() || 'Untitled node ad', status))
      .catch(() => {})
      .finally(() => { setSaving(false); reset(); onOpenChange(false); });
  };

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New node ad</DialogTitle>
          <DialogDescription>
            A piece of content with a sponsor&apos;s link. It runs across your node&apos;s feed at the density you set — on top of creators&apos; own ads, never replacing them.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="node-ad-text">Copy</Label>
            <Input id="node-ad-text" placeholder="Try the new workflow tool." value={text} onChange={e => setText(e.target.value)} data-testid="node-ad-text" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="node-ad-kind">Offer kind</Label>
            <select
              id="node-ad-kind"
              value={kind}
              onChange={e => setKind(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="node-ad-kind"
            >
              {OFFER_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="node-ad-partner">Partner / sponsor</Label>
            <Input id="node-ad-partner" placeholder="e.g. WorkflowCo" value={partner} onChange={e => setPartner(e.target.value)} data-testid="node-ad-partner" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="node-ad-link">Link (the one that pays)</Label>
            <Input id="node-ad-link" placeholder="https://workflowco.com?ref=node" value={link} onChange={e => setLink(e.target.value)} data-testid="node-ad-link" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="node-ad-cta">CTA</Label>
              <Input id="node-ad-cta" placeholder="Learn more" value={cta} onChange={e => setCta(e.target.value)} data-testid="node-ad-cta" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="node-ad-status">Status</Label>
              <select
                id="node-ad-status"
                value={status}
                onChange={e => setStatus(e.target.value as 'active' | 'paused')}
                className="h-9 w-full rounded-md border border-input bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="node-ad-status"
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="node-ad-disclosure">Disclosure</Label>
            <Input id="node-ad-disclosure" placeholder="Sponsored" value={disclosure} onChange={e => setDisclosure(e.target.value)} data-testid="node-ad-disclosure" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="brand" onClick={submit} disabled={saving || !link.trim()} data-testid="node-ad-save">
            {saving ? 'Creating…' : 'Create Node Ad'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
