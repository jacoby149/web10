import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CreatorMonetization } from './CreatorMonetization';
import { NodeMonetization } from './NodeMonetization';
import { useNodeAdmin } from './useNodeAdmin';

// The Monetization surface (D75) — the app-owned ad surface. Deep-linked at
// `/monetize`; the URL holds the section (`?tab=node` | default creator).
//
// The nav deep-links here; the in-page tab row is the section switcher.
//
// - **My Ads** (every signed-in user): the creator's ad catalog + affiliate
//   onboarding. The node admin's ad form also offers a "Node ad" scope (run an
//   ad as a personal ad OR a node ad from one surface).
// - **Node Ads** (node admin only): the node-ad inventory + density + the
//   overwrite knob. A non-admin on a stale `?tab=node` link falls back to
//   My Ads.
type MonetizationTab = 'creator' | 'node';

function tabFromParam(raw: string | null): MonetizationTab {
  return raw === 'node' ? 'node' : 'creator';
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

  // The section: `node` only when the node admin; default `creator`. If a
  // non-admin lands on `?tab=node` (a stale link), fall back to `creator`.
  const rawTab = searchParams.get('tab');
  const isNode = rawTab === 'node' && isAdmin;
  const tab: MonetizationTab = isNode ? 'node' : 'creator';

  const setTab = (next: MonetizationTab) => {
    if (next === 'node' && !isAdmin) return; // the Node tab is admin-only
    const params = new URLSearchParams(searchParams);
    if (next === 'node') params.set('tab', 'node');
    else params.delete('tab');
    setSearchParams(params);
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* The tab row — My Ads | Node Ads (the node admin only). The URL holds
          the tab (?tab=node), so refresh restores it + it's deep-linkable.
          My Ads is the default (the bare URL). A non-admin never sees the row
          (one section, no switcher). */}
      {isAdmin && (
        <div
          className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-md"
          role="tablist"
          aria-label="Monetization"
          data-testid="monetization-tabs"
        >
          <div className="mx-auto flex max-w-2xl">
            <TabButton
              active={tab === 'creator'}
              onClick={() => setTab('creator')}
              testId="monetization-tab-creator"
              label="My Ads"
            />
            <TabButton
              active={tab === 'node'}
              onClick={() => setTab('node')}
              testId="monetization-tab-node"
              label="Node Ads"
            />
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="monetization-screen">
        <h1 className="font-display text-2xl font-medium text-foreground">Monetization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your ads and the node&apos;s ad inventory — all made possible with web10.
        </p>

        <div className="mt-5">
          {isNode ? (
            <NodeMonetization />
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
