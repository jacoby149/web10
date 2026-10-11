import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CreatorMonetization } from './CreatorMonetization';
import { useNodeAdmin } from './useNodeAdmin';
import { ProductsSection } from './ProductsSection';
import { AnalyticsSection } from './AnalyticsSection';

// The Monetization surface (D75) — the app-owned ad surface. Deep-linked at
// `/monetize`; the URL holds the section (`?tab=`), so refresh restores it +
// it's deep-linkable (the X/Threads tab-row idiom the Posts screen's
// Discover | Following row established).
//
// The Monetization tab is **Ads | Products | Analytics** for every signed-in
// user (the ads-october focus #5 restructure — the "stay" in one place:
// what's running, what they're selling, how it's performing). There is no
// separate **Node** tab: a node admin's node-ad inventory (the density +
// overwrite knobs + the node ads) lives INSIDE the Ads tab, where the ad list
// is unified (regular ads + node ads, filtered by scope).
//
// - **Ads** (default): the ad catalog + affiliate onboarding. For a node
//   admin, the node-ad controls (density + overwrite) + the node ads are
//   folded in (the scope filter: All | Regular | Node).
// - **Products**: the catalog of the ad's product attributes (the storefront's
//   data — the "what I'm selling" view).
// - **Analytics**: the projection-vs-actual tell (the "how it's performing"
//   view). The click counter is the D86 engine (next narrowing).
type MonetizationTab = 'ads' | 'products' | 'analytics';

function tabFromParam(raw: string | null): MonetizationTab {
  if (raw === 'products') return 'products';
  if (raw === 'analytics') return 'analytics';
  // `node` (the retired Node tab) falls back to Ads — the node inventory now
  // lives in the Ads tab, so a stale `?tab=node` deep link lands there.
  return 'ads';
}

function TabButton({
  active,
  onClick,
  testId,
  label,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'relative flex flex-1 items-center justify-center gap-2 py-3.5 text-[0.9375rem] transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
      )}
    >
      <span>{label}</span>
      {active && (
        <span
          aria-hidden="true"
          className="absolute -bottom-px left-1/2 h-[3px] w-14 -translate-x-1/2 rounded-full bg-brand"
        />
      )}
    </button>
  );
}

export default function MonetizationScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: adminLoading } = useNodeAdmin();

  // The section: the URL holds it. The Node tab is retired — the node admin's
  // node-ad inventory lives in the Ads tab — so `?tab=node` falls back to ads.
  const rawTab = searchParams.get('tab');
  const tab: MonetizationTab = tabFromParam(rawTab);

  const setTab = (next: MonetizationTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'ads') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params);
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* The tab row — Ads | Products | Analytics (every signed-in user). The
          URL holds the tab (?tab=), so refresh restores it + it's deep-linkable.
          Ads is the default (the bare URL). The node admin's node-ad inventory
          is folded into the Ads tab (no separate Node tab). */}
      <div
        className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-md"
        role="tablist"
        aria-label="Monetization"
        data-testid="monetization-tabs"
      >
        <div className="mx-auto flex max-w-2xl">
          <TabButton active={tab === 'ads'} onClick={() => setTab('ads')} testId="monetization-tab-ads" label="Ads" />
          <TabButton active={tab === 'products'} onClick={() => setTab('products')} testId="monetization-tab-products" label="Products" />
          <TabButton active={tab === 'analytics'} onClick={() => setTab('analytics')} testId="monetization-tab-analytics" label="Analytics" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="monetization-screen">
        <h1 className="font-display text-2xl font-medium text-foreground">Monetization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your ads, your products, and how they&apos;re performing — all made possible with web10.
        </p>

        <div className="mt-5">
          {tab === 'products' ? (
            <ProductsSection />
          ) : tab === 'analytics' ? (
            <AnalyticsSection />
          ) : (
            <CreatorMonetization isAdmin={isAdmin} />
          )}
        </div>

        {/* The admin check is still pending — the Ads tab's node-ad controls
            (density + overwrite + the node ads) may appear once it resolves. */}
        {adminLoading && !isAdmin && (
          <p className="mt-3 text-xs text-muted-foreground" data-testid="monetization-admin-checking">
            Checking node admin…
          </p>
        )}
      </div>
    </div>
  );
}
