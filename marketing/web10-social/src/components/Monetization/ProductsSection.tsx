import { useState, useEffect, useCallback, useRef } from 'react';
import { Package, AlertTriangle, RefreshCw, Plus, Pencil, X, ImagePlus, ArrowUpRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast, errorMessage } from '@/components/shared/Toast';
import { readMyCatalog, createProduct, updateProduct, deleteProduct, type ProductItem } from '@/data/ads-catalog';
import { resolveMediaRefs, type MediaRecord, type AdProduct } from '@/data';
import { projectEarnings, formatProjection, commissionPerSale, DEFAULT_RATES } from '@/data/ad-projection';
import { uploadAdMedia } from './CreatorMonetization';

// The Products section (D89) — the **product maker**. The creator's products
// (the first-class entities — a `posts` doc tagged `product` in the followers
// group), the master of the affiliate link / price / commission / pics. The
// ads reference a product by `product_id` (the variable thing — the creative).
// This is the private management face of the storefront: create/edit the
// products (the master); the public storefront is what the audience browses.
//
// Data: `readMyCatalog` split to the `product`-tagged docs. No node surface
// (D60). The projection (focus #3) + the per-sale commission (focus #2) are
// computed from the product fields.
const OFFER_KINDS = ['none', 'affiliate', 'direct', 'own_store'] as const;

export function ProductsSection() {
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProductItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { products } = await readMyCatalog();
      setProducts(products);
      // Resolve the product pics to displayable URLs (one batched read — the
      // tiles need the pictures).
      const refIds = new Set<string>();
      for (const p of products) {
        const pic = p.product.pics?.[0];
        if (pic) refIds.add(pic);
      }
      if (refIds.size) {
        const media = await resolveMediaRefs([...refIds]);
        const map: Record<string, MediaRecord> = {};
        for (const m of media) if (m._id) map[m._id] = m;
        setMediaMap(map);
      }
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load your products');
      if (/403|not a member/i.test(msg)) setProducts([]);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const formOpen = creating || !!editing;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteProduct(deleting.doc);
      toast.success('Product deleted');
      setDeleting(null);
      await load();
    } catch (e) {
      console.error('Failed to delete product:', e);
      toast.error(errorMessage(e, 'Could not delete the product.'));
    } finally {
      setDeleteBusy(false);
    }
  };

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
              The things your ads sell — the affiliate link, the price, the commission. Make a product once, then run as many ads off it as you want.
            </p>
          </div>
          {!formOpen && (
            <Button size="sm" onClick={() => setCreating(true)} data-testid="product-new">
              <Plus className="mr-1 h-4 w-4" /> New product
            </Button>
          )}
        </div>

        <div className="mt-4">
          {formOpen ? (
            <ProductForm
              key={editing?.doc.doc_id || 'new'}
              initial={editing?.product ?? null}
              initialPicDocId={editing?.product.pics?.[0]}
              mediaMap={mediaMap}
              onSubmit={async (product) => {
                try {
                  if (editing) await updateProduct(editing.doc, product);
                  else await createProduct(product);
                  setCreating(false);
                  setEditing(null);
                  await load();
                } catch (e) {
                  setError(errorMessage(e, 'Failed to save the product'));
                }
              }}
              onCancel={() => { setCreating(false); setEditing(null); }}
            />
          ) : loading ? (
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
          ) : (products || []).length === 0 ? (
            <div className="rounded border border-dashed border-border p-8 text-center" data-testid="products-empty">
              <Package className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
              <p className="mt-3 text-sm font-medium text-foreground">No products yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Make a product (the affiliate link, the price, the commission) — then run as many ads off it as you want. It becomes a tile in your storefront.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(products || []).map((p) => (
                <ProductTile
                  key={p.doc.doc_id}
                  item={p}
                  mediaMap={mediaMap}
                  onEdit={() => { setCreating(false); setEditing(p); }}
                  onDelete={() => { setCreating(false); setEditing(null); setDeleting(p); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {deleting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="product-delete-dialog">
          <div className="absolute inset-0 bg-black/60" onClick={() => { if (!deleteBusy) setDeleting(null); }} />
          <div className="relative w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-lg">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Delete product</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              &ldquo;{deleting.product.name || 'Untitled product'}&rdquo; will be removed from your products and your storefront.
              Ads that use it keep their own link and keep running.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleting(null)} disabled={deleteBusy} data-testid="product-delete-cancel">
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteBusy} data-testid="product-delete-confirm">
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductTile({ item, mediaMap, onEdit, onDelete }: {
  item: ProductItem;
  mediaMap: Record<string, MediaRecord>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const p = item.product;
  // The tile's picture: the first product pic.
  const picId = p.pics?.[0];
  const media = picId ? mediaMap[picId] : undefined;
  const imgSrc = media?.thumbnail_url || media?.url;

  const perSale = commissionPerSale(p);
  const projection = formatProjection(projectEarnings(100_000, p, DEFAULT_RATES));

  return (
    <div className="overflow-hidden rounded border border-border bg-elevated/30" data-testid={`product-tile-${item.doc.doc_id}`}>
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
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name || 'Untitled product'}</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 flex-shrink-0 p-0" onClick={onEdit} aria-label="Edit product" data-testid={`product-edit-${item.doc.doc_id}`}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 flex-shrink-0 p-0 text-muted-foreground hover:text-danger" onClick={onDelete} aria-label="Delete product" data-testid={`product-delete-${item.doc.doc_id}`}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Button>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          {p.price !== undefined && (
            <span className="font-display text-sm font-medium tabular-nums text-foreground">${p.price.toLocaleString()}</span>
          )}
          {p.partner && <span className="truncate text-[0.6875rem] text-muted-foreground">{p.partner}</span>}
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
          {p.link && (
            <a
              href={p.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[0.6875rem] text-brand-300 hover:underline"
              data-testid={`product-link-${item.doc.doc_id}`}
            >
              View <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The product form (D89) — create or edit a product (the master). The fields:
 * the affiliate `link` / `partner` / `kind` (moved from the ad's `offer`), the
 * `name` / `price` / `commission` (the projection inputs), the `pics` (the base
 * layer), and the private business metrics (`actuals` / `calibration`).
 */
function ProductForm({
  initial,
  initialPicDocId,
  mediaMap,
  onSubmit,
  onCancel,
}: {
  initial: AdProduct | null;
  initialPicDocId?: string;
  mediaMap: Record<string, MediaRecord>;
  onSubmit: (product: AdProduct) => void;
  onCancel: () => void;
}) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial?.price !== undefined ? String(initial.price) : '');
  const [commission, setCommission] = useState(initial?.commission !== undefined ? String(initial.commission) : '');
  const [commissionPct, setCommissionPct] = useState(initial?.commission_is_percent !== false);
  const [link, setLink] = useState(initial?.link || '');
  const [partner, setPartner] = useState(initial?.partner || '');
  const [kind, setKind] = useState<string>(initial?.kind || 'affiliate');
  const [actuals, setActuals] = useState(initial?.actuals !== undefined ? String(initial.actuals) : '');
  const [calibration, setCalibration] = useState(initial?.calibration !== undefined ? String(initial.calibration) : '');
  const [saving, setSaving] = useState(false);

  // The product pic (the "base" layer — the product's own photo). `file` = new
  // (uploaded on submit); `existingDocId` = kept (edit mode); `previewUrl` =
  // what to show.
  const [pic, setPic] = useState<{ file?: File; previewUrl?: string; existingDocId?: string } | null>(
    initialPicDocId ? { existingDocId: initialPicDocId, previewUrl: mediaMap[initialPicDocId]?.thumbnail_url || mediaMap[initialPicDocId]?.url } : null,
  );
  const picInputRef = useRef<HTMLInputElement>(null);

  const liveProjection = formatProjection(projectEarnings(100_000, {
    price: price.trim() === '' ? undefined : Number(price),
    commission: commission.trim() === '' ? undefined : Number(commission),
    commission_is_percent: commissionPct,
    calibration: calibration.trim() === '' ? undefined : Number(calibration),
  }, DEFAULT_RATES));

  const pickPic = (file: File) => {
    setPic({ file, previewUrl: URL.createObjectURL(file) });
  };

  const submit = async () => {
    if (!link.trim()) return;
    setSaving(true);
    try {
      let pics: string[] | undefined;
      if (pic?.file) {
        const record = await uploadAdMedia(pic.file);
        if (record._id) pics = [record._id];
      } else if (pic?.existingDocId) {
        pics = [pic.existingDocId];
      }
      const p: AdProduct = {
        target: 'product',
        name: name.trim() || undefined,
        price: price.trim() === '' ? undefined : Number(price),
        commission: commission.trim() === '' ? undefined : Number(commission),
        commission_is_percent: commissionPct,
        link: link.trim(),
        partner: partner.trim() || undefined,
        kind,
        actuals: actuals.trim() === '' ? undefined : Number(actuals),
        calibration: calibration.trim() === '' ? undefined : Number(calibration),
        pics,
      };
      onSubmit(p);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded border border-border bg-elevated/30 p-4" data-testid="product-form">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-medium text-foreground">{editing ? 'Edit product' : 'New product'}</h4>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCancel} aria-label="Cancel" data-testid="product-form-cancel">
          <X className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-name">Name</Label>
          <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="The good coffee grinder" data-testid="product-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-link">Affiliate link</Label>
          <Input id="product-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://amzn.to/…?tag=me" data-testid="product-link" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-partner">Partner</Label>
          <Input id="product-partner" value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Amazon" data-testid="product-partner" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-kind">Kind</Label>
          <select
            id="product-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="product-kind"
          >
            {OFFER_KINDS.map((k) => (
              <option key={k} value={k}>{k === 'none' ? 'No offer' : k === 'own_store' ? 'Own store' : k.charAt(0).toUpperCase() + k.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-price">Price ($)</Label>
          <Input id="product-price" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="30" data-testid="product-price" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="product-commission">Commission</Label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={commissionPct} onChange={(e) => setCommissionPct(e.target.checked)} className="h-3.5 w-3.5 rounded border-input accent-[var(--color-brand)]" data-testid="product-commission-pct" />
              %
            </label>
          </div>
          <Input id="product-commission" type="number" min="0" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder={commissionPct ? '10' : '3'} data-testid="product-commission" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-actuals">Actuals ($ logged)</Label>
          <Input id="product-actuals" type="number" min="0" value={actuals} onChange={(e) => setActuals(e.target.value)} placeholder="22" data-testid="product-actuals" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-calibration">Calibration (% click→buy)</Label>
          <Input id="product-calibration" type="number" min="0" max="100" value={calibration} onChange={(e) => setCalibration(e.target.value)} placeholder="2" data-testid="product-calibration" />
        </div>
      </div>

      {/* The product pic (the "base" layer — the product's own photo). */}
      <div className="mt-4">
        <Label>Product photo</Label>
        {pic?.previewUrl ? (
          <div className="mt-1.5 flex items-center gap-3">
            <img src={pic.previewUrl} alt="Product" className="h-16 w-16 rounded object-cover" />
            <Button variant="outline" size="sm" onClick={() => setPic(null)} data-testid="product-pic-remove">Remove</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="mt-1.5" onClick={() => picInputRef.current?.click()} data-testid="product-pic-attach">
            <ImagePlus className="mr-1 h-4 w-4" /> Add photo
          </Button>
        )}
        <input ref={picInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPic(f); e.target.value = ''; }} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          100k impressions ~ <span className="tabular-nums text-foreground">{liveProjection}</span>
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} data-testid="product-form-cancel-btn">Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving || !link.trim()} data-testid="product-form-submit">
            {saving ? 'Saving…' : editing ? 'Save product' : 'Create product'}
          </Button>
        </div>
      </div>
    </div>
  );
}
