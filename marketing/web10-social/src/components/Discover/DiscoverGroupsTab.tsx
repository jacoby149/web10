import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readGroupDirectory,
  joinGroup,
  requestJoinGroup,
  type GroupDirectoryEntry,
} from '@/data';
import { toast, errorMessage } from '@/components/shared/Toast';
import {
  Users,
  UserPlus,
  UserCheck,
  Loader2,
  Lock,
  AlertTriangle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:groups-tab]', ...args);

// The page size for the D53 directory read (the "view more" increment). The
// directory is server-paged (limit/offset); a full page means there may be
// another, a short page is the last one.
const PAGE_SIZE = 20;

// Deterministic rich gradient per entity — the fallback "face" when a group
// has no uploaded avatar. Gradients read as designed, not as a flat color
// strip (design.md §1: the screenshot test).
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

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function JoinPolicyBadge({ policy }: { policy: string }) {
  const variant = policy === 'open' ? 'success' : policy === 'request' ? 'warning' : 'outline';
  const label = policy === 'open' ? 'Open' : policy === 'request' ? 'Request' : 'Invite only';
  return (
    <Badge variant={variant} data-testid="group-join-policy" className="normal-case tracking-normal">
      {label}
    </Badge>
  );
}

// ── Group card (the D53 directory card) ─────────────────────────────────────

type JoinState = 'idle' | 'joining' | 'joined' | 'requested';

interface DiscoverGroupCardProps {
  entry: GroupDirectoryEntry;
  joinState: JoinState;
  onJoin: () => void;
  onOpen: () => void;
}

function DiscoverGroupCard({ entry, joinState, onJoin, onOpen }: DiscoverGroupCardProps) {
  const initial = entry.name.charAt(0).toUpperCase();
  const canJoin = entry.join_policy !== 'invite_only';
  const gradient = hashToGradient(entry.group_id);

  return (
    <div
      data-testid="groups-discover-card"
      className={cn(
        'group relative flex flex-col rounded-xl border border-border bg-card p-4 transition-all duration-200',
        'hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_var(--color-glow-intense)]',
        'motion-reduce:transform-none',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View ${entry.name}`}
        >
          <Avatar className={cn('h-14 w-14', gradient)}>
            <AvatarFallback className="text-foreground text-lg font-semibold">{initial}</AvatarFallback>
          </Avatar>
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            data-testid="groups-discover-card-name"
          >
            {entry.name}
          </button>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">by @{entry.owner}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <Users className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatCount(entry.member_count)} members
        </span>
        <span aria-hidden="true" className="text-muted-foreground/40">·</span>
        <JoinPolicyBadge policy={entry.join_policy} />
      </div>

      {(entry.tags ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags!.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-brand/10 bg-brand-muted/60 px-2.5 py-1 text-xs text-brand-300"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant={joinState === 'joined' ? 'outline' : 'brand_subtle'}
          size="sm"
          className={cn('flex-1 gap-1.5', joinState === 'joined' && 'border-border text-muted-foreground')}
          disabled={!canJoin || joinState === 'joining' || joinState === 'joined' || joinState === 'requested'}
          onClick={onJoin}
          data-testid="groups-join-button"
        >
          {joinState === 'joining' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              Joining…
            </>
          ) : joinState === 'joined' ? (
            <>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              Joined
            </>
          ) : joinState === 'requested' ? (
            <>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              Requested
            </>
          ) : entry.join_policy === 'invite_only' ? (
            <>
              <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
              Invite only
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
              {entry.join_policy === 'request' ? 'Request' : 'Join'}
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpen}
          className="shrink-0 gap-1 text-muted-foreground hover:text-foreground"
          aria-label={`View ${entry.name}`}
          data-testid="groups-discover-card-open"
        >
          View
        </Button>
      </div>
    </div>
  );
}

function DiscoverGroupCardSkeleton() {
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
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 w-14 rounded-md" />
      </div>
    </div>
  );
}

// ── Error state ─────────────────────────────────────────────────────────────

function GroupsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="groups-error"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
        <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">Couldn't load groups</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Something went wrong talking to the node. Check your connection and try again.
      </p>
      <Button variant="brand" size="sm" className="mt-6 gap-2" onClick={onRetry} data-testid="groups-retry">
        <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
        Try again
      </Button>
    </div>
  );
}

// ── Empty state (no discoverable groups on the node) ────────────────────────

function GroupsEmptyState() {
  return (
    <div
      data-testid="groups-discover-empty"
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
  );
}

// ── No-results state (a ?q= / ?tag= that matches no loaded groups) ──────────

function GroupsNoResultsState() {
  return (
    <div
      data-testid="groups-discover-no-results"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
        <Search className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">No groups match</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        No listed groups match your search or topic filter. Try a different
        search or clear the filter.
      </p>
    </div>
  );
}

// ── The Groups browser (the Discover/Groups subtab, discover-reorg D3) ──────
// The shell (DiscoverScreen) owns ?tab= and hands the active ?q= down as a
// prop. This browser owns ?tag= (deep-linkable) + the paged D53 directory read
// ("view more" threads the offset) + the client-side ?q= filter (name/owner/
// tags). It has NO search field of its own (search is the top bar, S1/S2) — the
// query chip just shows + clears the active ?q=.

interface DiscoverGroupsTabProps {
  /** The active query from ?q= (set by the top bar's "see more groups"). */
  query: string;
}

export default function DiscoverGroupsTab({ query }: DiscoverGroupsTabProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: active tag from ?tag= (refresh-safe, shareable).
  const activeTag = searchParams.get('tag') || '';
  const handleTagToggle = useCallback(
    (t: string) => {
      const params = new URLSearchParams(searchParams);
      if (activeTag === t) {
        params.delete('tag');
      } else {
        params.set('tag', t);
      }
      setSearchParams(params);
      LOG('tag —', t);
    },
    [searchParams, setSearchParams, activeTag],
  );

  // Clear the active ?q= (the query chip's X). The shell re-reads ?q= and
  // re-renders with an empty query.
  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
    LOG('query cleared');
  }, [searchParams, setSearchParams]);

  const [groups, setGroups] = useState<GroupDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [joinStates, setJoinStates] = useState<Record<string, JoinState>>({});
  // The next offset to fetch (the "view more" cursor). A ref so the stable
  // loadPage callback reads the latest without a stale closure.
  const nextOffsetRef = useRef(0);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(false);
    }
    LOG('loadPage — offset:', offset, 'append:', append);
    try {
      const page = await readGroupDirectory(PAGE_SIZE, offset);
      LOG('loadPage — got', page.length, 'group(s)');
      nextOffsetRef.current = offset + page.length;
      setGroups((prev) => (append ? [...prev, ...page] : page));
      // A full page means there may be another; a short page is the last one.
      setHasMore(page.length >= PAGE_SIZE);
    } catch (e) {
      LOG('loadPage — failed:', e);
      if (!append) setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0, false);
  }, [loadPage]);

  const handleJoin = useCallback(async (entry: GroupDirectoryEntry) => {
    setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'joining' }));
    try {
      if (entry.join_policy === 'open') {
        LOG('join —', entry.group_id);
        await joinGroup(entry.group_id);
        setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'joined' }));
      } else {
        LOG('request join —', entry.group_id);
        await requestJoinGroup(entry.group_id);
        setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'requested' }));
      }
    } catch (e) {
      LOG('join — failed:', e);
      toast.error(errorMessage(e, 'Could not join the group.'));
      setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'idle' }));
    }
  }, []);

  const openGroup = useCallback(
    (groupId: string) => {
      LOG('open group —', groupId);
      navigate(`/groups/${encodeURIComponent(groupId)}`);
    },
    [navigate],
  );

  // Topic chips from the loaded directory's tags (D78: the directory carries
  // the platform tags). As you page, more tags surface.
  const topics = useMemo(() => {
    const all = new Set<string>();
    for (const g of groups) for (const t of g.tags ?? []) all.add(t);
    return Array.from(all).sort();
  }, [groups]);

  // The display set: the server's directory order, filtered by ?tag= + ?q=
  // (name/owner/tags). The directory is server-paged; the filters are
  // client-side over the loaded pages — "view more" reveals more.
  const filtered = useMemo(() => {
    let result = groups;
    if (activeTag) {
      result = result.filter((g) => (g.tags ?? []).includes(activeTag));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.owner.toLowerCase().includes(q) ||
          (g.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [groups, activeTag, query]);

  const isInitialLoad = loading && groups.length === 0;
  const hasFilter = query.trim() !== '' || activeTag !== '';

  return (
    <div data-testid="discover-groups-tab" className="flex flex-col">
      {/* The active ?q= filter (from the top bar's "see more groups") — a
          chip that shows the query + clears it. No search field of its own. */}
      {query.trim() !== '' && (
        <div className="px-4 pt-3 md:px-0">
          <span
            data-testid="discover-groups-tab-query"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-muted/40 px-3 py-1 text-xs text-brand-300"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            {query.trim()}
            <button
              type="button"
              onClick={clearQuery}
              data-testid="discover-groups-tab-query-clear"
              aria-label="Clear search"
              className="ml-0.5 -mr-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-muted transition-colors duration-150"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </span>
        </div>
      )}

      {/* Tag filter chips (?tag=, deep-linkable) */}
      {topics.length > 0 && (
        <div className="px-4 py-3 md:px-0">
          <div
            className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Filter by topic"
          >
            {topics.map((t) => {
              const active = t === activeTag;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid="groups-discover-topic"
                  onClick={() => handleTagToggle(t)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                      ? 'border-brand bg-brand-muted text-brand-300'
                      : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                  )}
                >
                  #{t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid + states */}
      <div className="flex-1 px-4 py-4 md:px-0" data-testid="groups-discover-view">
        {error ? (
          <GroupsErrorState onRetry={() => loadPage(0, false)} />
        ) : isInitialLoad ? (
          <div className="grid grid-cols-1 gap-4" data-testid="groups-discover-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <DiscoverGroupCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {filtered.length > 0 ? (
              <div className="grid grid-cols-1 gap-4" data-testid="groups-discover-grid">
                {filtered.map((entry) => (
                  <DiscoverGroupCard
                    key={entry.group_id}
                    entry={entry}
                    joinState={joinStates[entry.group_id] || 'idle'}
                    onJoin={() => handleJoin(entry)}
                    onOpen={() => openGroup(entry.group_id)}
                  />
                ))}
              </div>
            ) : hasFilter ? (
              <GroupsNoResultsState />
            ) : (
              <GroupsEmptyState />
            )}
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="groups-view-more"
                  onClick={() => loadPage(nextOffsetRef.current, true)}
                  disabled={loadingMore}
                  className="gap-2"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                  View more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
