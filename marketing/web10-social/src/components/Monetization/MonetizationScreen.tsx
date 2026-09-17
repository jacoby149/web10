import { useSearchParams } from 'react-router-dom';
import { CreatorMonetization } from './CreatorMonetization';
import { NodeMonetization } from './NodeMonetization';
import { useNodeAdmin } from './useNodeAdmin';

/**
 * The Monetization surface (D75) — the app-owned ad surface. Deep-linked at
 * `/monetize`; the URL holds the section (`?tab=node` | default creator).
 *
 * There is no in-page tab switcher — the nav IS the switcher. The "Monetization"
 * entry deep-links to the Creator section, the "Node Monetization" entry (node
 * admin only) deep-links to the Node section; each nav row highlights on its
 * own section. The screen just renders whichever section the URL points at.
 *
 * - **Creator** (every signed-in user): the ad catalog + affiliate onboarding.
 * - **Node** (node admin only): the node-ad inventory + density. Rendered only
 *   for the node admin (the `useNodeAdmin` gate); a non-admin on a stale
 *   `?tab=node` link falls back to Creator.
 */
export default function MonetizationScreen() {
  const [searchParams] = useSearchParams();
  const { isAdmin, loading: adminLoading } = useNodeAdmin();

  // The section: `node` only when the node admin; default `creator`. If a
  // non-admin lands on `?tab=node` (a stale link), fall back to `creator`.
  const rawTab = searchParams.get('tab');
  const isNode = rawTab === 'node' && isAdmin;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" data-testid="monetization-screen">
      <h1 className="font-display text-2xl font-medium text-foreground">Monetization</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your ads and the node&apos;s ad inventory — all made possible with web10.
      </p>

      <div className="mt-5">
        {isNode ? (
          <NodeMonetization />
        ) : (
          <CreatorMonetization />
        )}
      </div>

      {/* The admin check is still pending — the Node section may appear. */}
      {adminLoading && !isNode && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="monetization-admin-checking">
          Checking node admin…
        </p>
      )}
    </div>
  );
}
