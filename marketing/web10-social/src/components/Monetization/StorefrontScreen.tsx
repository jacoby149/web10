import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, UserPlus, AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/components/shared/Toast';
import { readUserAds, type AdItem } from '@/data/ads-catalog';
import { resolveMediaRefs, getV3Client } from '@/data';
import { projectEarnings, formatProjection, commissionPerSale, DEFAULT_RATES } from '@/data/ad-projection';
import type { MediaRecord } from '@/data';

// The public storefront (ads-october focus #1) — the "here's everything I
// recommend" destination. A deep-linkable, shareable page that renders the
// creator's product ads as a browsable grid (each tile = a product: picture +
// name + price + the offer CTA). The "Amazon storefront parity" — the thing
// Amazon gates behind a big following, web10 gives every creator.
//
// Data: a read of the creator's followers group (readUserAds), filtered to
// product ads. Access is group-gated (I3): the owner + the creator's followers
// can read it; an anon / non-follower read 403s → the "follow to browse" state
// (the web10 "public to your audience" model — no new grants, D60-clean).
export default function StorefrontScreen() {
  const { username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const provider = location.state?.provider || getV3Client().readToken()?.provider || '';

  const [ads, setAds] = useState<AdItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});

  const isOwn = getV3Client().readToken()?.username === username;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ads } = await readUserAds(username!, provider);
      const products = ads.filter((a) => a.product);
      setAds(products);
      const refIds = new Set<string>();
      for (const ad of products) {
        const first = ad.product?.pics?.[0] || ad.media_refs?.[0];
        if (typeof first === 'string') refIds.add(first);
      }
      if (refIds.size) {
        const media = await resolveMediaRefs([...refIds]);
        const map: Record<string, MediaRecord> = {};
        for (const m of media) if (m._id) map[m._id] = m;
        setMediaMap(map);
      }
    } catch (e) {
      // A 403 (not a member / anon on a private catalog) is the "follow to
      // browse" state, not an error.
      const msg = errorMessage(e, 'Failed to load the storefront');
      if (/403|not a member/i.test(msg)) setAds([]);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [username, provider]);

  useEffect(() => { load(); }, [load]);

  const products = ads || [];

  return (
    <div className="w-full">
      {/* Back (mobile) */}
      <div className="md:hidden px-3 py-2 border-b border-border">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="storefront-screen">
        <h1 className="font-display text-2xl font-medium text-foreground">
          @{username}&apos;s Storefront
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything they recommend — the link that pays them, delivered to you.
        </p>

        <div className="mt-5">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="storefront-loading">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded border border-border p-4">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="mt-3 h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded border border-danger/40 bg-danger-muted/30 p-4" data-testid="storefront-error" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" strokeWidth={1.5} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Couldn&apos;t load the storefront</p>
                  <p className="mt-1 text-xs text-muted-foreground break-all">{error}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={load} data-testid="storefront-retry">
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded border border-dashed border-border p-8 text-center" data-testid="storefront-empty">
              <Package className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
              <p className="mt-3 text-sm font-medium text-foreground">
                {isOwn ? 'No products yet' : 'No products to browse yet'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {isOwn
                  ? 'Add a product to an ad (the "Product" section in the ad form) and it shows up here.'
                  : 'Follow to see their recommendations as they add them.'}
              </p>
              {!isOwn && (
                <Button
                  variant="brand"
                  size="sm"
                  className="mt-4"
                  onClick={() => navigate(`/u/${username}`, { state: { provider } })}
                  data-testid="storefront-follow-cta"
                >
                  <UserPlus className="mr-1 h-4 w-4" /> View profile
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {products.map((ad) => (
                <StorefrontTile key={ad.doc.doc_id} ad={ad} mediaMap={mediaMap} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StorefrontTile({ ad, mediaMap }: { ad: AdItem; mediaMap: Record<string, MediaRecord> }) {
  const p = ad.product!;
  const picRef = p.pics?.[0] ?? ad.media_refs?.[0];
  const picId = typeof picRef === 'string' ? picRef : undefined;
  const media = picId ? mediaMap[picId] : undefined;
  const imgSrc = media?.thumbnail_url || media?.url;

  const perSale = commissionPerSale(p);
  const projection = formatProjection(projectEarnings(100_000, p, DEFAULT_RATES));

  return (
    <div className="overflow-hidden rounded border border-border bg-elevated/30" data-testid={`storefront-tile-${ad.doc.doc_id}`}>
      {imgSrc ? (
        <div className="aspect-square w-full overflow-hidden bg-elevated">
          <img src={imgSrc} alt={p.name || 'Product'} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-elevated text-muted-foreground">
          <Package className="h-8 w-8" strokeWidth={1.25} />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name || ad.text || 'Untitled product'}</span>
          {p.price !== undefined && (
            <span className="flex-shrink-0 font-display text-sm font-medium tabular-nums text-foreground">${p.price.toLocaleString()}</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {perSale !== undefined && (
            <Badge variant="brand" className="tabular-nums normal-case">${perSale.toFixed(2)}/sale</Badge>
          )}
          <Badge variant="outline" className="tabular-nums normal-case">~{projection}/100k</Badge>
        </div>
        {ad.offer.link && (
          <a
            href={ad.offer.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded-md bg-brand-muted px-3 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand/20"
            data-testid={`storefront-cta-${ad.doc.doc_id}`}
          >
            {ad.offer.cta || 'Check it out'}
          </a>
        )}
      </div>
    </div>
  );
}
