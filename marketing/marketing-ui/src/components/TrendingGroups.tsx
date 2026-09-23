import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Loader2, ArrowUpRight } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { API_ORIGIN, SOCIAL_ORIGIN } from '@/lib/origins';
import { trackFunnel } from '@/lib/analytics';

// ── The Groups subtab (M1, discover-reorg) ─────────────────────────────────
// The anon public group directory (D53): a paged list of discoverable groups.
// Anon (no token needed). Returns id, name (the slug), owner, join policy,
// member count (platform-computed, unhackable), and a permission summary.

const PAGE_SIZE = 24;

interface GroupEntry {
  group_id: string;
  name: string;
  owner: string;
  slug: string;
  join_policy: string;
  member_count: number;
  permission_summary: string;
}

interface GroupsPage {
  groups: GroupEntry[];
  limit: number;
  offset: number;
}

async function fetchGroupsPage(limit: number, offset: number): Promise<GroupsPage> {
  const resp = await fetch(
    `${API_ORIGIN}/v3/groups/directory?limit=${limit}&offset=${offset}`,
  );
  if (!resp.ok) return { groups: [], limit, offset };
  return resp.json();
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Deterministic rich gradient per entity — the fallback "face" when a group
// has no uploaded cover/avatar. Gradients read as designed, not as a flat
// color strip (design.md §1: the screenshot test).
function hashToGradient(str: string): string {
  const gradients = [
    'bg-gradient-to-br from-rose-600 to-pink-900',
    'bg-gradient-to-br from-sky-600 to-indigo-900',
    'bg-gradient-to-br from-amber-600 to-orange-900',
    'bg-gradient-to-br from-emerald-600 to-teal-900',
    'bg-gradient-to-br from-violet-600 to-purple-900',
    'bg-gradient-to-br from-pink-600 to-rose-900',
    'bg-gradient-to-br from-indigo-600 to-violet-900',
    'bg-gradient-to-br from-orange-600 to-red-900',
    'bg-gradient-to-br from-teal-600 to-cyan-900',
    'bg-gradient-to-br from-red-600 to-rose-900',
  ];
  let hash = 0;
  for (let i = 0; str.length > i; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function JoinPolicyBadge({ policy }: { policy: string }) {
  // The marketing-ui Badge supports brand | default | outline (no success/warning).
  // Map the join policy to the closest available variant.
  const variant = policy === 'open' ? 'default' : policy === 'request' ? 'brand' : 'outline';
  const label = policy === 'open' ? 'Open' : policy === 'request' ? 'Request' : 'Invite only';
  return (
    <Badge variant={variant} className="normal-case tracking-normal">
      {label}
    </Badge>
  );
}

// ── Group card (the D53 directory card) ─────────────────────────────────────

function GroupCard({ entry }: { entry: GroupEntry }) {
  const name = entry.name.charAt(0).toUpperCase() + entry.name.slice(1).replace(/[-_]/g, ' ');
  const initial = entry.name.charAt(0).toUpperCase();
  const gradient = hashToGradient(entry.group_id);

  return (
    <a
      href={`${SOCIAL_ORIGIN}/groups/${encodeURIComponent(entry.group_id)}`}
      target="_blank"
      rel="noopener"
      data-testid="trending-group-card"
      aria-label={`View ${name}`}
      className="group relative flex flex-col rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_var(--color-glow-intense)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
    >
      <div className="flex items-start gap-3">
        <Avatar className={`h-14 w-14 shrink-0 ${gradient}`}>
          <AvatarFallback className="text-foreground text-lg font-semibold">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground" data-testid="trending-group-name">
            {name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">by @{entry.owner}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <Users className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatCount(entry.member_count)} members
        </span>
        <span aria-hidden="true" className="text-muted-foreground/40">·</span>
        <JoinPolicyBadge policy={entry.join_policy} />
      </div>
    </a>
  );
}

function GroupCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}

// ── The Groups subtab ────────────────────────────────────────────────────────

export function TrendingGroups() {
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextOffsetRef = useRef(0);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(false);
    }
    try {
      const page = await fetchGroupsPage(PAGE_SIZE, offset);
      nextOffsetRef.current = offset + page.groups.length;
      setGroups((prev) => (append ? [...prev, ...page.groups] : page.groups));
      // A full page means there may be another; a short page is the last one.
      setHasMore(page.groups.length >= PAGE_SIZE);
    } catch {
      if (!append) setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0, false);
    trackFunnel('trending_groups_view');
  }, [loadPage]);

  const isInitialLoad = loading && groups.length === 0;

  return (
    <div data-testid="trending-groups-view" className="mx-auto w-full max-w-2xl">
      {error ? (
        <div
          data-testid="trending-groups-error"
          className="flex flex-col items-center justify-center py-16 px-8 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
            <Users className="h-8 w-8 text-danger" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">Couldn&apos;t load groups</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Something went wrong talking to the node. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => loadPage(0, false)}
            className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Try again
          </button>
        </div>
      ) : isInitialLoad ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="trending-groups-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <GroupCardSkeleton key={i} />
          ))}
        </div>
      ) : groups.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="trending-groups-grid">
            {groups.map((g) => (
              <GroupCard key={g.group_id} entry={g} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => loadPage(nextOffsetRef.current, true)}
                disabled={loadingMore}
                data-testid="trending-groups-load-more"
                className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand-muted px-6 py-2.5 text-sm font-medium text-brand-300 transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                View more
              </button>
            </div>
          )}
        </>
      ) : (
        <div
          data-testid="trending-groups-empty"
          className="flex flex-col items-center justify-center py-16 px-8 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
            <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">No groups listed yet</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Groups opt in to the directory. When a creator lists a group, it shows
            up here for everyone to find.
          </p>
        </div>
      )}
    </div>
  );
}
