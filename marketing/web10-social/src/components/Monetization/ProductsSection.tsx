import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, ArrowUpRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/components/shared/Toast';
import { readMyCatalog, type AdItem } from '@/data/ads-catalog';
import { resolveMediaRefs } from '@/data';
import { projectEarnings, formatProjection, commissionPerSale, DEFAULT_RATES } from '@/data/ad-projection';
import type { MediaRecord } from '@/data';

// The Products section (ads-october focus #5) — the catalog of the ad's
// product attributes (the "product section" of the ads: name, price,
// commission, the link). The *private* management face of the storefront
// (focus #1): the public storefront is the shareable browsing face, this is
// the "what I'm selling" view. An ad that has a product shows here; a pure ad
// (no product) doesn't.
//
// Data: the owner's own catalog (readMyCatalog), filtered to product ads. The
// projection (focus #3) + the per-sale commission (focus #2) are computed from
// the product fields — no node surface (D60).
export function ProductsSection() {
  const [ads, setAds] = useState<AdItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ads } = await readMyCatalog();
      const products = ads.filter((a) => a.product);
      setAds(products);
      // Resolve the product pics / creative media to displayable URLs (one
      // batched read — the storefront grid needs the pictures).
      const refIds = new Set<string>();
      for (const ad of products) {
        const pic = ad.product?.pics?.[0];
        const creative = ad.media_refs?.[0];
        const first = pic || creative;
        if (typeof first === 'string') refIds.add(first);
      }
      if (refIds.size) {
        const media = await resolveMediaRefs([...refIds]);
        const map: Record<string, MediaRecord> = {};
        for (const m of media) if (m._id) map[m._id] = m;
        setMediaMap(map);
      }
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load your products');
      if (/403|not a member/i.test(msg)) setAds([]);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const productAds = useMemo(() => ads || [], [ads]);

  return (
    <div className="space-y-6" data-testid="products-section">
      <div className="rounded border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
            <Package className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-medium text-foreground">Your Products</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The things your ads sell — price, commission, and the link. This is your storefront&apos;s data; the public storefront is what your audience browses.
            </p>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="products-loading">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded border border-border p-4">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="mt-3 h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded border border-danger/40 bg-danger-muted/30 p-4" data-testid="products-error" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" strokeWidth={1.5} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Couldn&apos;t load your products</p>
                  <p className="mt-1 text-xs text-muted-foreground break-all">{error}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={load} data-testid="products-retry">
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              </div>
            </div>
          ) : productAds.length === 0 ? (
            <div className="rounded border border-dashed border-border p-8 text-center" data-testid="products-empty">
              <Package className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
              <p className="mt-3 text-sm font-medium text-foreground">No products yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Add a product to an ad (the &ldquo;Product&rdquo; section in the ad form) — its price + commission show here, and it becomes a tile in your storefront.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {productAds.map((ad) => (
                <ProductTile key={ad.doc.doc_id} ad={ad} mediaMap={mediaMap} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductTile({ ad, mediaMap }: { ad: AdItem; mediaMap: Record<string, MediaRecord> }) {
  const p = ad.product!;
  // The tile's picture: the first product pic, else the creative media.
  const picRef = p.pics?.[0] ?? ad.media_refs?.[0];
  const picId = typeof picRef === 'string' ? picRef : undefined;
  const media = picId ? mediaMap[picId] : undefined;
  const imgSrc = media?.thumbnail_url || media?.url;

  const perSale = commissionPerSale(p);
  const projection = formatProjection(projectEarnings(100_000, p, DEFAULT_RATES));

  return (
    <div className="overflow-hidden rounded border border-border bg-elevated/30" data-testid={`product-tile-${ad.doc.doc_id}`}>
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
          {p.commission !== undefined && (
            <Badge variant="outline" className="tabular-nums normal-case">
              {p.commission_is_percent !== false ? `${p.commission}%` : `$${p.commission}`} {p.commission_is_percent !== false ? 'commission' : 'per sale'}
            </Badge>
          )}
          {perSale !== undefined && (
            <Badge variant="brand" className="tabular-nums normal-case">${perSale.toFixed(2)}/sale</Badge>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[0.6875rem] text-muted-foreground">
            100k impressions ~ <span className="tabular-nums text-foreground">{projection}</span>
          </span>
          {ad.offer.link && (
            <a
              href={ad.offer.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[0.6875rem] text-brand-300 hover:underline"
              data-testid={`product-link-${ad.doc.doc_id}`}
            >
              {ad.offer.cta || 'View'} <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
