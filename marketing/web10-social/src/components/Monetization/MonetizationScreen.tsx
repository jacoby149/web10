import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CreatorMonetization } from './CreatorMonetization';
import { NodeMonetization } from './NodeMonetization';
import { useNodeAdmin } from './useNodeAdmin';

/**
 * The Monetization surface (D75) — the app-owned ad surface. Deep-linked at
 * `/monetize`; the URL holds the state (`?tab=creator` | `?tab=node`).
 *
 * - **Creator** (every signed-in user): the ad catalog + affiliate onboarding.
 * - **Node** (node admin only): the node-ad inventory + density. The tab is
 *   hidden from non-admins (the `useNodeAdmin` gate).
 */
export default function MonetizationScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: adminLoading } = useNodeAdmin();

  // The tab: `node` only when the node admin; default `creator`. If a
  // non-admin lands on `?tab=node` (a stale link), fall back to `creator`.
  const rawTab = searchParams.get('tab');
  const tab = rawTab === 'node' && isAdmin ? 'node' : 'creator';

  const setTab = (next: 'creator' | 'node') => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'creator') p.delete('tab');
      else p.set('tab', next);
      return p;
    }, { replace: false });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" data-testid="monetization-screen">
      <h1 className="font-display text-2xl font-medium text-foreground">Monetization</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your ads and the node&apos;s ad inventory — all made possible with web10.
      </p>

      {/* The tab switcher (URL holds the state). */}
      <div className="mt-5 flex gap-1 rounded-lg border border-border bg-elevated/40 p-1" data-testid="monetization-tabs">
        <TabButton
          label="Creator"
          active={tab === 'creator'}
          onClick={() => setTab('creator')}
          testId="monetization-tab-creator"
        />
        {isAdmin && (
          <TabButton
            label="Node"
            active={tab === 'node'}
            onClick={() => setTab('node')}
            testId="monetization-tab-node"
          />
        )}
      </div>

      <div className="mt-5">
        {tab === 'node' && isAdmin ? (
          <NodeMonetization />
        ) : (
          <CreatorMonetization />
        )}
      </div>

      {/* The admin check is still pending — the Node tab may appear. */}
      {adminLoading && tab === 'creator' && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="monetization-admin-checking">
          Checking node admin…
        </p>
      )}
    </div>
  );
}

function TabButton({ label, active, onClick, testId }: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
      data-testid={testId}
    >
      {label}
    </button>
  );
}
