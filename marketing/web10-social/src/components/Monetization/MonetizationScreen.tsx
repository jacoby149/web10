import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CreatorMonetization } from './CreatorMonetization';
import { NodeMonetization } from './NodeMonetization';
import { useNodeAdmin } from './useNodeAdmin';
import { ProductsSection } from './ProductsSection';
import { AnalyticsSection } from './AnalyticsSection';

// The Monetization surface (D75) — the app-owned ad surface. Deep-linked at
// `/monetize`; the URL holds the section (`?tab=`), so refresh restores it +
// it's deep-linkable (the X/Threads tab-row idiom the Posts screen's
// Discover | Following row established).
//
// The creator's Monetization tab is **Ads | Products | Analytics** (the
// ads-october focus #5 restructure — the "stay" in one place: what's running,
// what they're selling, how it's performing). The **Node** tab (admin only) is
// the node operator's inventory — a different role, kept separate.
//
// - **Ads** (default): the creator's ad catalog + affiliate onboarding.
// - **Products**: the catalog of the ad's product attributes (the storefront's
//   data — the "what I'm selling" view).
// - **Analytics**: the projection-vs-actual tell (the "how it's performing"
//   view). The click counter is the D86 engine (next narrowing).
// - **Node** (node admin only): the node-ad inventory + density + overwrite.
type MonetizationTab = 'ads' | 'products' | 'analytics' | 'node';

function tabFromParam(raw: string | null, isAdmin: boolean): MonetizationTab {
  if (raw === 'node' && isAdmin) return 'node';
  if (raw === 'products') return 'products';
  if (raw === 'analytics') return 'analytics';
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

  // The section: the URL holds it. `node` only when the node admin; a non-admin
  // on a stale `?tab=node` falls back to `ads`.
  const rawTab = searchParams.get('tab');
  const tab: MonetizationTab = tabFromParam(rawTab, isAdmin);

  const setTab = (next: MonetizationTab) => {
    if (next === 'node' && !isAdmin) return; // the Node tab is admin-only
    const params = new URLSearchParams(searchParams);
    if (next === 'ads') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params);
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* The tab row — Ads | Products | Analytics (every signed-in user) +
          Node (the node admin only). The URL holds the tab (?tab=), so refresh
          restores it + it's deep-linkable. Ads is the default (the bare URL). */}
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
          {isAdmin && (
            <TabButton active={tab === 'node'} onClick={() => setTab('node')} testId="monetization-tab-node" label="Node" />
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="monetization-screen">
        <h1 className="font-display text-2xl font-medium text-foreground">Monetization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your ads, your products, and how they&apos;re performing — all made possible with web10.
        </p>

        <div className="mt-5">
          {tab === 'node' ? (
            <NodeMonetization />
          ) : tab === 'products' ? (
            <ProductsSection />
          ) : tab === 'analytics' ? (
            <AnalyticsSection />
          ) : (
            <CreatorMonetization isAdmin={isAdmin} />
          )}
        </div>

        {/* The admin check is still pending — the Node tab may appear. */}
        {adminLoading && !isAdmin && (
          <p className="mt-3 text-xs text-muted-foreground" data-testid="monetization-admin-checking">
            Checking node admin…
          </p>
        )}
      </div>
    </div>
  );
}
