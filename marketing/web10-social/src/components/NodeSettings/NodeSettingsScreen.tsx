import { useSearchParams } from 'react-router-dom';
import { Shield, Users, Link2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNodeAdmin } from '@/components/Monetization/useNodeAdmin';
import { ModerationTab } from './ModerationTab';
import { PeopleTab } from './PeopleTab';
import { LinkTab } from './LinkTab';

const TABS = [
  { id: 'moderation', label: 'Moderation', icon: Shield },
  { id: 'people', label: 'People', icon: Users },
  { id: 'link', label: 'Link', icon: Link2 },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * The Node Settings surface — the node owner's moderation controls, in the
 * social app (not the authenticator — it's social-related). Gated by
 * `useNodeAdmin` (the node owner). Deep-linked at `/node-settings`; the URL
 * holds the tab (`?tab=people` | `?tab=link` | default `moderation`).
 *
 * Three levers (all built on existing node primitives, D59):
 *   - **Moderation** — the sensitive-words blocklist + auto-hide toggles + the
 *     review queue (ported from the authenticator's Node Config card).
 *   - **People** — search the node's people, see their posts, hide a user.
 *   - **Link** — paste a web10 permalink, pull up the post + user, hide either.
 *
 * KB: knowledge/knowledge-base/web10-v3/social/content-moderation.md
 */
export default function NodeSettingsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: adminLoading } = useNodeAdmin();

  const rawTab = searchParams.get('tab');
  const tab: TabId = rawTab === 'people' || rawTab === 'link' ? rawTab : 'moderation';

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'moderation') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: false });
  };

  // The admin gate — the surface is node-owner-only. A non-admin (or a stale
  // link) must NOT learn the surface exists: while the check is in flight we
  // show a neutral loading state (no "Node Settings" heading), and once it
  // resolves to non-admin we show a generic not-found — the same as any unknown
  // route — so a non-admin can't tell Node Settings is a thing. The nav items
  // are already `isNodeAdmin`-gated (Layout), so this is the deep-link case.
  if (adminLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6" data-testid="node-settings-screen">
        <div className="mt-8 flex justify-center py-16" data-testid="node-settings-loading">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" strokeWidth={1.5} />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6" data-testid="node-settings-screen">
        <div
          className="mt-8 flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16 px-8 text-center"
          data-testid="node-settings-not-found"
        >
          <p className="text-sm font-medium text-foreground">Page not found</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            This page doesn&apos;t exist on the node. It may have been moved or deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6" data-testid="node-settings-screen">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-foreground" strokeWidth={1.75} />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Node Settings</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Content moderation for this node — the sensitive-words filter, the people
        you&apos;re hiding, and a way to act on a specific post or user by link.
      </p>

      {/* The tab row — deep-linkable (?tab=), the app's idiom. */}
      <div className="mt-5 flex gap-1 rounded-lg bg-elevated p-1" role="tablist" data-testid="node-settings-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`node-settings-tab-${id}`}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150',
              tab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="w-4 h-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'moderation' && <ModerationTab />}
        {tab === 'people' && <PeopleTab />}
        {tab === 'link' && <LinkTab />}
      </div>
    </div>
  );
}
