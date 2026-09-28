import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Plus, Pause, Play, Trash2, AlertTriangle, RefreshCw, SlidersHorizontal, X, Pencil, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast, errorMessage } from '@/components/shared/Toast';
import {
  readNodeAds,
  getNodeConfig,
  saveNodeAdPercentage,
  saveNodeAdOverwrite,
  buildNodeAdBody,
  updateNodeAd,
  type AdItem,
} from '@/data/ads-catalog';
import { getV3Client, getDiscoverGroupId, uploadMedia, resolveMediaRefs, type AdOffer, type AdFormat, type MediaRecord } from '@/data';
import { processImage, generateThumbnail, captureVideoPoster, getVideoInfo } from '@/lib/mediaProcessing';

const OFFER_KINDS = ['none', 'affiliate', 'direct', 'own_store'] as const;
// Quick-pick CTA suggestions (parity with the creator's AdForm, ad-improvements.md).
const CTA_SUGGESTIONS = ['Check it out', 'Learn more', 'Shop now', 'Sign up', 'Book now', 'Get it'];

/**
 * The Node Monetization section (D57, D75) — the operator's ad inventory.
 * Visible only to the node admin (gated by the parent). The operator sells the
 * node's ad inventory to advertisers directly; this is where they set the
 * density (`node_ad_percentage`) and manage the node ads (create / pause /
 * resume / retire). A node ad is a doc on the discover group, tagged `ad` +
 * `node_ad`. The read attaches active node ads to posts at the percentage —
 * the creator's own ad (`doc.ad`) is never suppressed (both can render).
 */
export function NodeMonetization() {
  const [ads, setAds] = useState<AdItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [percentage, setPercentage] = useState<number>(10);
  const [pctLoaded, setPctLoaded] = useState(false);
  const [pctSaving, setPctSaving] = useState(false);

  // The overwrite knob (ad-improvements.md): when on, a node ad replaces the
  // creator's ad on the same post (instead of both showing).
  const [overwrite, setOverwrite] = useState<boolean>(false);
  const [overwriteSaving, setOverwriteSaving] = useState(false);

  const [editingAd, setEditingAd] = useState<AdItem | null>(null);
  const [adFormOpen, setAdFormOpen] = useState(false);

  const openNewAd = () => { setEditingAd(null); setAdFormOpen(true); };
  const openEditAd = (ad: AdItem) => { setEditingAd(ad); setAdFormOpen(true); };
  const closeAdForm = () => { setAdFormOpen(false); setEditingAd(null); };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAds(await readNodeAds());
    } catch (e) {
      setError(errorMessage(e, 'Failed to load node ads'));
    } finally {
      setLoading(false);
    }
    // The percentage + overwrite: the effective node config (admin). A
    // non-admin gets a 403 — the controls degrade to read-only (the node ads
    // still load).
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

  const reload = () => load();

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

  const createNodeAd = async (
    offer: AdOffer,
    text: string,
    status: 'active' | 'paused',
    mediaRefs?: string[],
    format: AdFormat = 'inline',
  ) => {
    const w = getV3Client();
    await w.create('posts', buildNodeAdBody(offer, text, status, mediaRefs, format), { groups: [getDiscoverGroupId()] });
  };

  const editNodeAd = async (
    ad: AdItem,
    offer: AdOffer,
    text: string,
    status: 'active' | 'paused',
    mediaRefs?: string[],
    format: AdFormat = 'inline',
  ) => {
    await updateNodeAd(ad, offer, text, status, mediaRefs, format);
  };

  const setStatus = async (ad: AdItem, status: 'active' | 'paused') => {
    const w = getV3Client();
    await w.update(ad.doc.doc_id, { status });
  };

  const retireAd = async (ad: AdItem) => {
    const w = getV3Client();
    await w.delete(ad.doc.doc_id);
  };

  const run = (fn: () => Promise<void>, okMsg: string) => {
    fn()
      .then(() => {
        toast.success(okMsg);
        reload();
      })
      .catch((e) => toast.error(errorMessage(e, 'Failed')));
  };

  return (
    <div className="space-y-4" data-testid="node-monetization">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-warning">
          <Radio className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium text-foreground">Node Monetization</h3>
            <Badge variant="outline">node admin</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your node&apos;s ad inventory — the second layer. Node ads run on top of creators&apos; own ads; neither replaces the other.
          </p>
        </div>
        <Button variant="brand" size="sm" onClick={openNewAd} data-testid="node-ads-new" disabled={loading}>
          <Plus className="mr-1 h-4 w-4" /> New Node Ad
        </Button>
      </div>

      {adFormOpen && (
        <NodeAdForm
          initial={editingAd}
          onSubmit={(offer, text, status, mediaRefs, format) =>
            run(
              () =>
                editingAd
                  ? editNodeAd(editingAd, offer, text, status, mediaRefs, format)
                  : createNodeAd(offer, text, status, mediaRefs, format),
              editingAd ? 'Node ad updated' : 'Node ad created',
            )
          }
          onCancel={closeAdForm}
        />
      )}

      {/* The density control — the percentage of posts that get a node ad. */}
      <div className="rounded border border-border p-4" data-testid="node-ads-density">
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

      {/* The inventory — the node ads. */}
      <div>
        {loading ? (
          <NodeAdsSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : ads && ads.length === 0 ? (
          <EmptyState onNewAd={openNewAd} />
        ) : ads ? (
          <div className="space-y-3">
            {ads.map((ad) => (
              <NodeAdRow
                key={ad.doc.doc_id}
                ad={ad}
                onEdit={() => openEditAd(ad)}
                onPause={() => run(() => setStatus(ad, 'paused'), 'Node ad paused')}
                onResume={() => run(() => setStatus(ad, 'active'), 'Node ad active')}
                onRetire={() => run(() => retireAd(ad), 'Node ad retired')}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NodeAdsSkeleton() {
  return (
    <div className="space-y-3" data-testid="node-ads-loading">
      {[0, 1].map((i) => (
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

function NodeAdRow({ ad, onEdit, onPause, onResume, onRetire }: {
  ad: AdItem;
  onEdit: () => void;
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
            <Badge variant="outline">{ad.format === 'post' ? 'POST AD' : 'INLINE'}</Badge>
            {ad.offer.kind && <Badge variant="outline">{ad.offer.kind}</Badge>}
          </div>
          {ad.offer.partner && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {ad.offer.partner}{ad.offer.cta ? ` · ${ad.offer.cta}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onEdit} data-testid={`node-ads-edit-${ad.doc.doc_id}`} aria-label="Edit node ad">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
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

/**
 * The node ad form — create AND edit (parity with the creator's AdForm,
 * ad-improvements.md). Edit mode pre-fills from `initial`; the save keeps the
 * same doc_id (an update is a new version), so the read-time attach picks up
 * the new creative/offer/format on the next read. No albums (a node ad is the
 * operator's inventory, not a creator's catalog).
 */
function NodeAdForm({ initial, onSubmit, onCancel }: {
  initial: AdItem | null;
  onSubmit: (offer: AdOffer, text: string, status: 'active' | 'paused', mediaRefs: string[], format: AdFormat) => void;
  onCancel: () => void;
}) {
  const editing = !!initial;
  const [text, setText] = useState(initial?.text || '');
  const [kind, setKind] = useState<string>(initial?.offer.kind || 'direct');
  const [partner, setPartner] = useState(initial?.offer.partner || '');
  const [link, setLink] = useState(initial?.offer.link || '');
  const [cta, setCta] = useState(initial?.offer.cta || '');
  const [disclosure, setDisclosure] = useState(initial?.offer.disclosure || 'Sponsored');
  const [status, setStatus] = useState<'active' | 'paused'>(initial?.status || 'active');
  const [format, setFormat] = useState<AdFormat>(initial?.format || 'inline');
  const [saving, setSaving] = useState(false);

  // The ad's creative media — one item (image or video). `file` = a newly
  // picked file (uploaded on submit); `existingDocId` = the current media kept
  // (edit mode); `previewUrl` = what to show.
  const [media, setMedia] = useState<{
    file?: File;
    previewUrl?: string;
    isVideo?: boolean;
    existingDocId?: string;
  } | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Edit mode: resolve the existing media to a preview URL.
  useEffect(() => {
    let live = true;
    const refs = initial?.media_refs;
    if (refs && refs.length) {
      const first = refs[0];
      const docId = typeof first === 'string' ? first : (first as { doc_id?: string }).doc_id;
      if (docId) {
        setMedia({ existingDocId: docId, isVideo: false });
        resolveMediaRefs([docId])
          .then((m) => {
            if (!live) return;
            const rec = m[0];
            setMedia((prev) =>
              prev && prev.existingDocId === docId
                ? { ...prev, previewUrl: rec?.thumbnail_url || rec?.url, isVideo: rec?.mime_type?.startsWith('video/') }
                : prev,
            );
          })
          .catch(() => {});
      }
    }
    return () => { live = false; };
  }, [initial]);

  const pickMedia = (file: File) => {
    const isVideo = file.type.startsWith('video/');
    setMedia({ file, previewUrl: URL.createObjectURL(file), isVideo });
  };

  const submit = async () => {
    if (!link.trim()) return;
    setSaving(true);
    try {
      let mediaRefs: string[] = [];
      if (media?.file) {
        const record = await uploadNodeAdMedia(media.file);
        if (record._id) mediaRefs = [record._id];
      } else if (media?.existingDocId) {
        mediaRefs = [media.existingDocId];
      }
      const offer: AdOffer = { kind, partner: partner.trim(), link: link.trim(), cta: cta.trim(), disclosure: disclosure.trim() };
      onSubmit(offer, text.trim() || 'Untitled node ad', status, mediaRefs, format);
      onCancel();
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to upload media'));
      setSaving(false);
    }
  };

  return (
    <div className="rounded border border-border bg-elevated/30 p-4" data-testid={editing ? 'node-ad-edit-form' : 'node-ad-new-form'}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{editing ? 'Edit node ad' : 'New node ad'}</h4>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        A piece of content with the link that pays. The disclosure shows to your audience, always.
      </p>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="node-ad-text">Copy</Label>
          <Input id="node-ad-text" placeholder="Try the new workflow tool." value={text} onChange={(e) => setText(e.target.value)} data-testid="node-ad-text" />
        </div>

        {/* Format — inline (compact block) vs post (a full post). */}
        <div className="grid gap-1.5">
          <Label>Format</Label>
          <div className="flex gap-2" data-testid="node-ad-format-toggle">
            {(['inline', 'post'] as AdFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors',
                  format === f ? 'border-brand bg-brand-muted text-brand-300' : 'border-border text-muted-foreground hover:border-brand/50',
                )}
                data-testid={`node-ad-format-${f}`}
              >
                <span className="block font-medium capitalize">{f}</span>
                <span className="block text-[0.6875rem] opacity-80">
                  {f === 'inline' ? 'compact block under the post' : 'a full post (media, likes)'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Media — one image or video (the creative). */}
        <div className="grid gap-1.5">
          <Label>Media (image or video)</Label>
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickMedia(f); e.target.value = ''; }}
            data-testid="node-ad-media-input"
          />
          {media ? (
            <div className="relative overflow-hidden rounded-md border border-border" data-testid="node-ad-media-preview">
              {media.isVideo ? (
                <video src={media.previewUrl} className="max-h-48 w-full object-contain bg-elevated" muted playsInline />
              ) : (
                <img src={media.previewUrl} alt="" className="max-h-48 w-full object-contain bg-elevated" />
              )}
              <div className="absolute right-2 top-2 flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 bg-background/70" onClick={() => mediaInputRef.current?.click()} aria-label="Replace media" data-testid="node-ad-media-replace">
                  <ImagePlus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 bg-background/70 hover:text-danger" onClick={() => setMedia(null)} aria-label="Remove media" data-testid="node-ad-media-remove">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => mediaInputRef.current?.click()} data-testid="node-ad-media-add">
              <ImagePlus className="mr-1 h-3.5 w-3.5" /> Add media
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="node-ad-kind">Offer kind</Label>
            <select
              id="node-ad-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="node-ad-kind"
            >
              {OFFER_KINDS.map((k) => <option key={k} value={k}>{k === 'none' ? 'none (self-promo)' : k}</option>)}
            </select>
          </div>
          {kind !== 'none' && (
            <div className="grid gap-1.5">
              <Label htmlFor="node-ad-partner">Partner / sponsor</Label>
              <Input id="node-ad-partner" placeholder="e.g. WorkflowCo (optional)" value={partner} onChange={(e) => setPartner(e.target.value)} data-testid="node-ad-partner" />
            </div>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="node-ad-link">Link (the one that pays)</Label>
          <Input id="node-ad-link" placeholder="https://workflowco.com?ref=node" value={link} onChange={(e) => setLink(e.target.value)} data-testid="node-ad-link" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="node-ad-cta">CTA</Label>
          <Input id="node-ad-cta" placeholder="e.g. Learn more" value={cta} onChange={(e) => setCta(e.target.value)} data-testid="node-ad-cta" />
          <div className="flex flex-wrap gap-1.5">
            {CTA_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCta(s)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[0.6875rem] transition-colors',
                  cta === s ? 'border-brand bg-brand-muted text-brand-300' : 'border-border text-muted-foreground hover:border-brand/50',
                )}
                data-testid={`node-ad-cta-suggest-${s.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="node-ad-status">Status</Label>
            <select
              id="node-ad-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'paused')}
              className="h-9 w-full rounded-md border border-input bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="node-ad-status"
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="node-ad-disclosure">Disclosure</Label>
            <Input id="node-ad-disclosure" placeholder="Sponsored" value={disclosure} onChange={(e) => setDisclosure(e.target.value)} data-testid="node-ad-disclosure" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={submit} disabled={saving || !link.trim()} data-testid="node-ad-save">
          {saving ? 'Saving…' : editing ? 'Save Node Ad' : 'Create Node Ad'}
        </Button>
      </div>
    </div>
  );
}

/** Upload a node ad's creative media (image or video) → a MediaRecord. */
async function uploadNodeAdMedia(file: File): Promise<MediaRecord> {
  if (file.type.startsWith('video/')) {
    const info = await getVideoInfo(file);
    const poster = await captureVideoPoster(file);
    const posterFile = new File([poster.blob], `poster-${Date.now()}.webp`, { type: poster.mimeType });
    return uploadMedia({
      file,
      thumbnailFile: posterFile,
      width: info.width,
      height: info.height,
      durationSeconds: Math.round(info.duration * 100) / 100,
      service: 'public_media',
    });
  }
  const processed = await processImage(file);
  const processedFile = new File([processed.blob], file.name, { type: processed.mimeType });
  const thumb = await generateThumbnail(processedFile);
  const thumbFile = new File([thumb.blob], `thumb-${Date.now()}.webp`, { type: thumb.mimeType });
  return uploadMedia({
    file: processedFile,
    thumbnailFile: thumbFile,
    width: processed.width,
    height: processed.height,
    service: 'public_media',
  });
}
