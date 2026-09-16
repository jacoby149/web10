import { useState, useEffect, useCallback } from 'react';
import { Megaphone, Plus, Pause, Play, Trash2, Pin, FolderPlus, AlertTriangle, RefreshCw, GraduationCap, ArrowUpRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast, errorMessage } from '@/components/shared/Toast';
import {
  readMyCatalog,
  ensureFollowersGroup,
  buildOfferBody,
  type AdsCatalogData,
  type AdItem,
  type AlbumItem,
  type PostItem,
} from '@/data/ads-catalog';
import { getV3Client, type AdOffer } from '@/data';

const OFFER_KINDS = ['affiliate', 'direct', 'own_store'] as const;
const EMPTY: AdsCatalogData = { ads: [], albums: [], posts: [] };

// The monetization bootcamp shortlist (KB: monetization-bootcamp.md). The
// "get started" pointer — sign up for the programs that match what you post,
// then make your first ad. External sign-up links (new tab).
interface AffiliateProgram {
  name: string;
  niche: string;
  commission: string;
  why: string;
  signupUrl: string;
}

const AFFILIATE_PROGRAMS: AffiliateProgram[] = [
  { name: 'Amazon Associates', niche: 'Universal e-commerce', commission: '1–10% per sale', why: 'The catalog is everything. Lowest bar to start — the tag is the whole setup.', signupUrl: 'https://affiliate-program.amazon.com/' },
  { name: 'Walmart Creator', niche: 'Retail, grocery, electronics', commission: 'Up to 4% per sale', why: 'Physical-retail trust, strong conversion on everyday items.', signupUrl: 'https://affiliates.walmart.com/' },
  { name: 'Target Partners', niche: 'Lifestyle, apparel, home', commission: 'Up to 8% per sale', why: '7-day cookie (vs Amazon’s 24h) — more credit for the click.', signupUrl: 'https://partners.target.com/' },
  { name: 'eBay Partner Network', niche: 'Used, vintage, refurbished', commission: '1–4% per sale', why: 'Inventory you can’t buy elsewhere — great for a “finds” niche.', signupUrl: 'https://partnernetwork.ebay.com/' },
  { name: 'Shopify Affiliate', niche: 'E-commerce software, business tools', commission: 'Up to 200% of monthly plan', why: 'High-value flat payouts for business / creator-economy traffic.', signupUrl: 'https://www.shopify.com/affiliate' },
  { name: 'Fiverr Affiliates', niche: 'Freelance, digital services', commission: '$15–$150 CPA', why: 'Dozens of service categories; fits a “how I run my business” angle.', signupUrl: 'https://www.fiverr.com/partnerships/affiliates' },
  { name: 'Semrush Affiliate', niche: 'SEO, marketing, SaaS', commission: '$200/sale + $10/trial', why: '120-day cookie; high-intent digital traffic converts.', signupUrl: 'https://www.semrush.com/affiliate-program/' },
  { name: 'HubSpot Affiliate', niche: 'B2B software, CRM', commission: '30% recurring for 1 year', why: 'Sticky software = predictable recurring payouts.', signupUrl: 'https://www.hubspot.com/affiliates' },
  { name: 'PartnerStack', niche: 'SaaS / B2B software marketplace', commission: 'Varies by program (often 20–50% recurring)', why: 'One signup, one dashboard, hundreds of SaaS programs — a catalog, like Amazon, but for software.', signupUrl: 'https://dash.partnerstack.com/marketplace' },
];

/**
 * The Creator Monetization section (D55, D75) — the creator's own ads + the
 * affiliate onboarding. The ad catalog is the creator's posts tagged `ad` in
 * their followers group (+ albums + the posts they're pinned to). Every
 * signed-in user sees it.
 */
export function CreatorMonetization() {
  const [data, setData] = useState<AdsCatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewAd, setShowNewAd] = useState(false);
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [pinAd, setPinAd] = useState<AdItem | null>(null);
  const [filterAlbum, setFilterAlbum] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await readMyCatalog());
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load your ads');
      // A fresh creator has no followers group yet — the read 403s (not a
      // member). That's the empty state, not an error.
      if (/403|not a member/i.test(msg)) {
        setData(EMPTY);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reload = () => load();

  const username = () => getV3Client().readToken()?.username || '';
  const provider = () => getV3Client().readToken()?.provider;

  const createAd = async (offer: AdOffer, text: string, status: 'active' | 'paused', albumIds: string[]) => {
    const w = getV3Client();
    const group = await ensureFollowersGroup(username(), provider());
    await w.create('posts', buildOfferBody(offer, text, status, albumIds), { groups: [group] });
  };

  const createAlbum = async (name: string) => {
    const w = getV3Client();
    const group = await ensureFollowersGroup(username(), provider());
    await w.create('posts', { name, tags: ['ad_album'] }, { groups: [group] });
  };

  const setStatus = async (ad: AdItem, status: 'active' | 'paused') => {
    await getV3Client().update(ad.doc.doc_id, { status });
  };

  const retireAd = async (ad: AdItem) => {
    await getV3Client().delete(ad.doc.doc_id);
  };

  const addAdToAlbum = async (ad: AdItem, album: AlbumItem) => {
    const tag = `album:${album.doc.doc_id}`;
    const tags = ad.doc.tags || [];
    if (!tags.includes(tag)) {
      await getV3Client().update(ad.doc.doc_id, { tags: [...tags, tag] });
    }
  };

  const pinToPost = async (ad: AdItem, post: PostItem) => {
    await getV3Client().update(post.doc.doc_id, {}, { ad_preference: { mode: 'pinned', target: ad.doc.doc_id } });
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
    <div className="space-y-6" data-testid="creator-monetization">
      {/* The affiliate onboarding — "get started". */}
      <div className="rounded border border-border bg-card p-5" data-testid="affiliate-programs-card">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
            <GraduationCap className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-medium text-foreground">Affiliate Programs</h3>
              <Badge variant="brand">START HERE</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign up for the programs that match what you post — then make your first ad below. The link pays you; web10 just delivers it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">No audience minimum</Badge>
              <Badge variant="outline">You keep 100%</Badge>
              <Badge variant="outline">Pays you, not the node</Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {AFFILIATE_PROGRAMS.map((program) => (
            <ProgramRow key={program.name} program={program} />
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Rates and cookie windows shift — confirm on the program&apos;s page before you pitch a brand off them.
        </p>
      </div>

      {/* The ad catalog. */}
      <div className="rounded border border-border bg-card p-5" data-testid="ads-catalog-card">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
            <Megaphone className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-medium text-foreground">Your Ads</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your ads, albums, and the posts they run on. Pin an ad to a post and it shows with that post, every time.
            </p>
          </div>
          <Button variant="brand" size="sm" onClick={() => setShowNewAd((v) => !v)} data-testid="ads-new-ad" disabled={loading}>
            <Plus className="mr-1 h-4 w-4" /> New Ad
          </Button>
        </div>

        {showNewAd && (
          <div className="mt-4">
            <NewAdForm
              albums={data?.albums || []}
              onSubmit={(offer, text, status, albumIds) => run(() => createAd(offer, text, status, albumIds), 'Ad created')}
              onCancel={() => setShowNewAd(false)}
            />
          </div>
        )}

        <div className="mt-4">
          {loading ? (
            <CatalogSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : data && data.ads.length === 0 && data.albums.length === 0 ? (
            <EmptyState onNewAd={() => setShowNewAd(true)} />
          ) : data ? (
            <>
              <CatalogSection
                ads={data.ads}
                albums={data.albums}
                filterAlbum={filterAlbum}
                onFilterAlbum={setFilterAlbum}
                onPin={(ad) => setPinAd(ad)}
                onPause={(ad) => run(() => setStatus(ad, 'paused'), 'Ad paused')}
                onResume={(ad) => run(() => setStatus(ad, 'active'), 'Ad active')}
                onRetire={(ad) => run(() => retireAd(ad), 'Ad retired')}
              />
              <AlbumsSection
                albums={data.albums}
                ads={data.ads}
                onNewAlbum={() => setShowNewAlbum((v) => !v)}
                onAddAd={(ad, album) => run(() => addAdToAlbum(ad, album), 'Added to album')}
              />
            </>
          ) : null}
        </div>

        {showNewAlbum && (
          <NewAlbumForm onSubmit={(name) => run(() => createAlbum(name), 'Album created')} onCancel={() => setShowNewAlbum(false)} />
        )}

        {pinAd && (
          <PinForm
            ad={pinAd}
            posts={data?.posts || []}
            onCancel={() => setPinAd(null)}
            onSubmit={(post) => run(() => pinToPost(pinAd, post), 'Ad pinned to post')}
          />
        )}
      </div>
    </div>
  );
}

function ProgramRow({ program }: { program: AffiliateProgram }) {
  return (
    <a
      href={program.signupUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex items-start justify-between gap-3 rounded border border-border bg-elevated/40 p-3 transition-colors',
        'hover:border-brand/60 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      data-testid={`affiliate-program-${program.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      aria-label={`Sign up for ${program.name}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{program.name}</span>
          <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-brand-300" strokeWidth={1.75} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{program.niche}</p>
        <p className="mt-1 text-xs tabular-nums text-foreground">{program.commission}</p>
        <p className="mt-1 text-xs text-muted-foreground">{program.why}</p>
      </div>
    </a>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-3" data-testid="ads-loading">
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
    <div className="rounded border border-danger/40 bg-danger-muted/30 p-4" data-testid="ads-error" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" strokeWidth={1.5} />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Couldn&apos;t load your ads</p>
          <p className="mt-1 text-xs text-muted-foreground break-all">{message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry} data-testid="ads-retry">
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNewAd }: { onNewAd: () => void }) {
  return (
    <div className="rounded border border-dashed border-border p-8 text-center" data-testid="ads-empty">
      <Megaphone className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
      <p className="mt-3 text-sm font-medium text-foreground">No ads yet</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        Create an ad — a piece of content with the link that pays — then pin it to a post. It shows with that post, every time.
      </p>
      <Button variant="brand" size="sm" className="mt-4" onClick={onNewAd} data-testid="ads-empty-cta">
        <Plus className="mr-1 h-4 w-4" /> Create your first ad
      </Button>
    </div>
  );
}

function CatalogSection({
  ads,
  albums,
  filterAlbum,
  onFilterAlbum,
  onPin,
  onPause,
  onResume,
  onRetire,
}: {
  ads: AdItem[];
  albums: AlbumItem[];
  filterAlbum: string | null;
  onFilterAlbum: (albumId: string | null) => void;
  onPin: (ad: AdItem) => void;
  onPause: (ad: AdItem) => void;
  onResume: (ad: AdItem) => void;
  onRetire: (ad: AdItem) => void;
}) {
  const visible = filterAlbum ? ads.filter((ad) => ad.albums.includes(filterAlbum)) : ads;
  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Catalog</h4>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={filterAlbum === null} onClick={() => onFilterAlbum(null)} count={ads.length} />
          {albums.map((album) => (
            <FilterChip
              key={album.doc.doc_id}
              label={album.name}
              active={filterAlbum === album.doc.doc_id}
              onClick={() => onFilterAlbum(album.doc.doc_id)}
              count={album.adCount}
            />
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {filterAlbum ? 'No ads in this album yet.' : 'No ads yet.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((ad) => (
            <AdRow
              key={ad.doc.doc_id}
              ad={ad}
              onPin={() => onPin(ad)}
              onPause={() => onPause(ad)}
              onResume={() => onResume(ad)}
              onRetire={() => onRetire(ad)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick, count }: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active ? 'border-brand bg-brand-muted text-brand-300' : 'border-border text-muted-foreground hover:border-brand/50',
      )}
      data-testid={`ads-filter-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function AdRow({ ad, onPin, onPause, onResume, onRetire }: {
  ad: AdItem;
  onPin: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetire: () => void;
}) {
  const active = ad.status === 'active';
  return (
    <div
      className={cn('rounded border p-4 transition-colors', active ? 'border-border' : 'border-border opacity-70')}
      data-testid={`ads-row-${ad.doc.doc_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{ad.text || 'Untitled ad'}</span>
            <Badge variant={active ? 'success' : 'default'}>{active ? 'ACTIVE' : 'PAUSED'}</Badge>
            {ad.offer.kind && <Badge variant="outline">{ad.offer.kind}</Badge>}
          </div>
          {ad.offer.partner && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {ad.offer.partner}{ad.offer.cta ? ` · ${ad.offer.cta}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onPin} data-testid={`ads-pin-${ad.doc.doc_id}`} aria-label="Pin ad to a post">
            <Pin className="h-3.5 w-3.5" /> Pin
          </Button>
          {active ? (
            <Button variant="ghost" size="sm" onClick={onPause} aria-label="Pause ad" data-testid={`ads-pause-${ad.doc.doc_id}`}>
              <Pause className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onResume} aria-label="Resume ad" data-testid={`ads-resume-${ad.doc.doc_id}`}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetire}
            aria-label="Retire ad"
            className="text-muted-foreground hover:text-danger"
            data-testid={`ads-retire-${ad.doc.doc_id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AlbumsSection({ albums, ads, onNewAlbum, onAddAd }: {
  albums: AlbumItem[];
  ads: AdItem[];
  onNewAlbum: () => void;
  onAddAd: (ad: AdItem, album: AlbumItem) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Albums — {albums.length} {albums.length === 1 ? 'album' : 'albums'}
        </h4>
        <Button variant="outline" size="sm" onClick={onNewAlbum} data-testid="ads-new-album">
          <FolderPlus className="mr-1 h-3.5 w-3.5" /> New Album
        </Button>
      </div>
      {albums.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No albums yet. Group your ads into albums to organize them (an ad can be in a few).
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {albums.map((album) => (
            <AlbumRow key={album.doc.doc_id} album={album} ads={ads} onAddAd={onAddAd} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumRow({ album, ads, onAddAd }: {
  album: AlbumItem;
  ads: AdItem[];
  onAddAd: (ad: AdItem, album: AlbumItem) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const notInAlbum = ads.filter((a) => !a.albums.includes(album.doc.doc_id));
  return (
    <div className="rounded border border-border p-4" data-testid={`ads-album-${album.doc.doc_id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{album.name}</span>
        <Badge variant="outline" className="tabular-nums">{album.adCount} {album.adCount === 1 ? 'ad' : 'ads'}</Badge>
      </div>
      {notInAlbum.length > 0 && (
        <div className="mt-3">
          {showPicker ? (
            <div className="space-y-1">
              {notInAlbum.map((ad) => (
                <button
                  key={ad.doc.doc_id}
                  type="button"
                  onClick={() => {
                    onAddAd(ad, album);
                    setShowPicker(false);
                  }}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-elevated"
                  data-testid={`ads-album-add-${album.doc.doc_id}-${ad.doc.doc_id}`}
                >
                  + {ad.text || 'Untitled ad'}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-elevated"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowPicker(true)} data-testid={`ads-album-pick-${album.doc.doc_id}`}>
              + Add an ad
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function NewAdForm({ albums, onSubmit, onCancel }: {
  albums: AlbumItem[];
  onSubmit: (offer: AdOffer, text: string, status: 'active' | 'paused', albumIds: string[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<string>('affiliate');
  const [partner, setPartner] = useState('');
  const [link, setLink] = useState('');
  const [cta, setCta] = useState('');
  const [disclosure, setDisclosure] = useState('');
  const [status, setStatus] = useState<'active' | 'paused'>('active');
  const [albumIds, setAlbumIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = () => {
    if (!link.trim()) return;
    setSaving(true);
    const offer: AdOffer = { kind, partner: partner.trim(), link: link.trim(), cta: cta.trim(), disclosure: disclosure.trim() };
    Promise.resolve(onSubmit(offer, text.trim() || 'Untitled ad', status, albumIds))
      .catch(() => {})
      .finally(() => {
        setSaving(false);
        setText(''); setKind('affiliate'); setPartner(''); setLink(''); setCta('');
        setDisclosure(''); setStatus('active'); setAlbumIds([]);
        onCancel();
      });
  };

  return (
    <div className="rounded border border-border bg-elevated/30 p-4" data-testid="ad-new-form">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">New ad</h4>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        A piece of content with the link that pays. The disclosure shows to your audience, always.
      </p>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ad-text">Copy</Label>
          <Input id="ad-text" placeholder="Everything I use, linked." value={text} onChange={(e) => setText(e.target.value)} data-testid="ad-text" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ad-kind">Offer kind</Label>
            <select
              id="ad-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="ad-kind"
            >
              {OFFER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ad-partner">Partner</Label>
            <Input id="ad-partner" placeholder="e.g. Amazon" value={partner} onChange={(e) => setPartner(e.target.value)} data-testid="ad-partner" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ad-link">Link (the one that pays)</Label>
          <Input id="ad-link" placeholder="https://amzn.to/abc?tag=you-20" value={link} onChange={(e) => setLink(e.target.value)} data-testid="ad-link" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ad-cta">CTA</Label>
            <Input id="ad-cta" placeholder="Get it" value={cta} onChange={(e) => setCta(e.target.value)} data-testid="ad-cta" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ad-status">Status</Label>
            <select
              id="ad-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'paused')}
              className="h-9 w-full rounded-md border border-input bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="ad-status"
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ad-disclosure">Disclosure</Label>
          <Input id="ad-disclosure" placeholder="I may earn a commission." value={disclosure} onChange={(e) => setDisclosure(e.target.value)} data-testid="ad-disclosure" />
        </div>
        {albums.length > 0 && (
          <div className="grid gap-1.5">
            <Label>Albums</Label>
            <div className="flex flex-wrap gap-2">
              {albums.map((album) => {
                const checked = albumIds.includes(album.doc.doc_id);
                return (
                  <button
                    key={album.doc.doc_id}
                    type="button"
                    onClick={() => setAlbumIds((prev) => (checked ? prev.filter((id) => id !== album.doc.doc_id) : [...prev, album.doc.doc_id]))}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      checked ? 'border-brand bg-brand-muted text-brand-300' : 'border-border text-muted-foreground hover:border-brand/50',
                    )}
                    data-testid={`ad-album-${album.doc.doc_id}`}
                  >
                    {album.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={submit} disabled={saving || !link.trim()} data-testid="ad-save">
          {saving ? 'Creating…' : 'Create Ad'}
        </Button>
      </div>
    </div>
  );
}

function NewAlbumForm({ onSubmit, onCancel }: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = () => {
    if (!name.trim()) return;
    setSaving(true);
    Promise.resolve(onSubmit(name.trim())).catch(() => {}).finally(() => {
      setSaving(false);
      setName('');
      onCancel();
    });
  };
  return (
    <div className="mt-4 rounded border border-border bg-elevated/30 p-4" data-testid="album-new-form">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">New album</h4>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="album-name">Name</Label>
        <Input
          id="album-name"
          placeholder="e.g. Summer 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="album-name"
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={submit} disabled={saving || !name.trim()} data-testid="album-save">
          {saving ? 'Creating…' : 'Create Album'}
        </Button>
      </div>
    </div>
  );
}

function PinForm({ ad, posts, onCancel, onSubmit }: {
  ad: AdItem;
  posts: PostItem[];
  onCancel: () => void;
  onSubmit: (post: PostItem) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = () => {
    const post = posts.find((p) => p.doc.doc_id === selected);
    if (!post) return;
    setSaving(true);
    Promise.resolve(onSubmit(post)).catch(() => {}).finally(() => {
      setSaving(false);
      onCancel();
    });
  };

  return (
    <div className="mt-4 rounded border border-border bg-elevated/30 p-4" data-testid="ads-pin-form">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Pin to a post</h4>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        &ldquo;{ad.text || 'Untitled ad'}&rdquo; will show with the post you pick, every time.
      </p>
      {posts.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          You have no posts to pin to yet. Make a post, then pin this ad to it.
        </p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {posts.map((post) => (
            <button
              key={post.doc.doc_id}
              type="button"
              onClick={() => setSelected(post.doc.doc_id)}
              className={cn(
                'flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm transition-colors',
                selected === post.doc.doc_id ? 'border-brand bg-brand-muted text-foreground' : 'border-border text-foreground hover:bg-elevated',
              )}
              data-testid={`ads-pin-post-${post.doc.doc_id}`}
            >
              <span className="min-w-0 flex-1 truncate">{post.text || 'Untitled post'}</span>
              {post.pinnedAdTarget && <Badge variant="outline">pinned</Badge>}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={submit} disabled={saving || !selected || posts.length === 0} data-testid="ads-pin-confirm">
          {saving ? 'Pinning…' : 'Pin Ad'}
        </Button>
      </div>
    </div>
  );
}
