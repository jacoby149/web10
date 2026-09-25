import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  fetchPeoplePage,
  sortPeople,
  filterPeople,
  DEFAULT_PEOPLE_SORT,
  type PersonCard,
  type PeopleSort,
} from '@/data';
import { followUser, unfollowUser } from '@/data';
import { toast, errorMessage } from '@/components/shared/Toast';
import {
  Users,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// D74 / discover-ia-consistency C1: the person card is SHARED (one source,
// both apps). The social app renders it in interactive mode (follow + in-app
// open); the marketing Discover renders the same card in remote mode.
import { PersonCard as SharedPersonCard, PersonCardSkeleton as SharedPersonCardSkeleton, type DiscoverPerson } from '@web10/discover';

const LOG = (...args: unknown[]) => console.log('[social:people-tab]', ...args);

// The page size for the D0 directory read (the "view more" increment).
const PAGE_SIZE = 20;
// The "It's quiet here" threshold (discover-reorg.md): if the node has fewer
// than ~10 public people, show the designed quiet state instead of a
// degenerate ranked list.
const QUIET_THRESHOLD = 10;

const SORT_OPTIONS: [PeopleSort, string][] = [
  ['popular', 'Popular'],
  ['az', 'A–Z'],
];

// ── Person card (the SHARED card, interactive mode) ─────────────────────────
// The card is the shared @web10/discover PersonCard (the same one the
// marketing Discover renders). This wrapper adapts the social PersonCard data
// + the follow/open handlers to the shared card's interactive props.

interface PersonCardProps {
  person: PersonCard;
  followLoading: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onOpen: () => void;
}

export function PersonCardRow({ person, followLoading, onFollow, onUnfollow, onOpen }: PersonCardProps) {
  const shared: DiscoverPerson = {
    username: person.username,
    display_name: person.display_name,
    banner_url: person.banner_url,
    avatar_url: person.avatar_url,
    followers_count: person.followers_count,
    mutuals: person.mutuals,
    is_following: person.is_following,
  };
  return (
    <SharedPersonCard
      person={shared}
      onOpen={onOpen}
      onFollow={onFollow}
      onUnfollow={onUnfollow}
      followLoading={followLoading}
      testId="people-card"
    />
  );
}

export function PersonCardSkeleton() {
  return <SharedPersonCardSkeleton testId="people-card-skeleton" />;
}

// ── Error state ──────────────────────────────────────────────────────────────

function PeopleErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="people-error"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
        <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">Couldn't load people</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Something went wrong talking to the node. Check your connection and try again.
      </p>
      <Button variant="brand" size="sm" className="mt-6 gap-2" onClick={onRetry} data-testid="people-retry">
        <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
        Try again
      </Button>
    </div>
  );
}

// ── "It's quiet here" state (the node has fewer than ~10 public people) ──────

function PeopleQuietState() {
  return (
    <div
      data-testid="people-quiet"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
        <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">It's quiet here</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This node is still finding its people. As more creators join and set up
        their profiles, they'll show up here.
      </p>
    </div>
  );
}

// ── No-results state (a ?q= that matches no loaded people) ───────────────────

function PeopleNoResultsState({ query }: { query: string }) {
  return (
    <div
      data-testid="people-no-results"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
        <Search className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">No people found</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        No one here matches “{query}”. Try a different name or handle.
      </p>
    </div>
  );
}

// ── The People browser (the Discover/People subtab, discover-reorg D2) ───────
// The shell (DiscoverScreen) owns ?tab= and hands the active ?q= down as a
// prop. This browser owns ?sort= (deep-linkable) + the paged D0 read + the
// client-side ?q= filter. It has NO search field of its own (search is the top
// bar, S1/S2) — the query chip just shows + clears the active ?q=.

interface DiscoverPeopleTabProps {
  /** The active query from ?q= (set by the top bar's "see more people"). */
  query: string;
}

export default function DiscoverPeopleTab({ query }: DiscoverPeopleTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: active sort from ?sort= (refresh-safe, shareable). `popular` is
  // the bare URL (the server's follower ranking); only `az` is written.
  const sort: PeopleSort = useMemo(() => {
    const raw = searchParams.get('sort');
    return raw === 'az' ? 'az' : DEFAULT_PEOPLE_SORT;
  }, [searchParams]);
  const setSort = useCallback(
    (next: PeopleSort) => {
      const params = new URLSearchParams(searchParams);
      if (next === DEFAULT_PEOPLE_SORT) {
        params.delete('sort');
      } else {
        params.set('sort', next);
      }
      setSearchParams(params);
      LOG('sort —', next);
    },
    [searchParams, setSearchParams],
  );

  // Clear the active ?q= (the query chip's X). The shell re-reads ?q= and
  // re-renders with an empty query.
  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
    LOG('query cleared');
  }, [searchParams, setSearchParams]);

  const [people, setPeople] = useState<PersonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // The first page's count — drives the "It's quiet here" state (the node has
  // fewer than ~10 public people). Captured on the initial load only.
  const [firstPageCount, setFirstPageCount] = useState<number | null>(null);
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});
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
      const { people: page, hasMore: more } = await fetchPeoplePage({
        limit: PAGE_SIZE,
        offset,
      });
      nextOffsetRef.current = offset + page.length;
      setPeople((prev) => (append ? [...prev, ...page] : page));
      setHasMore(more);
      if (!append) setFirstPageCount(page.length);
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

  const handleFollow = useCallback(
    async (person: PersonCard) => {
      setFollowLoading((prev) => ({ ...prev, [person.username]: true }));
      try {
        LOG('follow —', person.username);
        await followUser(person.username, person.provider);
        setPeople((prev) =>
          prev.map((p) => (p.username === person.username ? { ...p, is_following: true } : p)),
        );
      } catch (e) {
        LOG('follow — failed:', e);
        toast.error(errorMessage(e, `Could not follow ${person.username}.`));
      } finally {
        setFollowLoading((prev) => ({ ...prev, [person.username]: false }));
      }
    },
    [],
  );

  const handleUnfollow = useCallback(
    async (person: PersonCard) => {
      setFollowLoading((prev) => ({ ...prev, [person.username]: true }));
      try {
        LOG('unfollow —', person.username);
        await unfollowUser(person.username, person.provider);
        setPeople((prev) =>
          prev.map((p) => (p.username === person.username ? { ...p, is_following: false } : p)),
        );
      } catch (e) {
        LOG('unfollow — failed:', e);
        toast.error(errorMessage(e, `Could not unfollow ${person.username}.`));
      } finally {
        setFollowLoading((prev) => ({ ...prev, [person.username]: false }));
      }
    },
    [],
  );

  const openProfile = useCallback((person: PersonCard) => {
    LOG('open profile —', person.username);
    // Same in-app navigation the feed/discover author clicks use.
    window.dispatchEvent(
      new CustomEvent('navigate-user-profile', {
        detail: { username: person.username, provider: person.provider },
      }),
    );
  }, []);

  // The display order: sort the accumulated loaded pages, then apply the ?q=
  // filter (name/handle). The D0 read is server-paged + follower-ranked; the
  // sort + filter are client-side over the loaded pages.
  const sorted = useMemo(() => sortPeople(people, sort), [people, sort]);
  const filtered = useMemo(() => filterPeople(sorted, query), [sorted, query]);

  const isInitialLoad = loading && people.length === 0;
  const quietHere = firstPageCount !== null && firstPageCount < QUIET_THRESHOLD;
  const noResults = query.trim() !== '' && !quietHere && filtered.length === 0;

  return (
    <div data-testid="discover-people-tab" className="flex flex-col">
      {/* The active ?q= filter (from the top bar's "see more people") — a
          chip that shows the query + clears it. No search field of its own. */}
      {query.trim() !== '' && (
        <div className="px-4 pt-3 md:px-0">
          <span
            data-testid="discover-people-tab-query"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-muted/40 px-3 py-1 text-xs text-brand-300"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            {query.trim()}
            <button
              type="button"
              onClick={clearQuery}
              data-testid="discover-people-tab-query-clear"
              aria-label="Clear search"
              className="ml-0.5 -mr-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-muted transition-colors duration-150"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </span>
        </div>
      )}

      {/* Sort toggle */}
      <div className="px-4 py-3 md:px-0">
        <div className="flex items-center gap-1" data-testid="people-sort-toggle" role="tablist" aria-label="Sort people">
          {SORT_OPTIONS.map(([s, label]) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={sort === s}
              onClick={() => setSort(s)}
              data-testid={`people-sort-${s}`}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                sort === s
                  ? 'bg-brand-muted text-brand-300'
                  : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List + states */}
      <div className="flex-1 px-4 pb-4 md:px-0" data-testid="people-view">
        {error ? (
          <PeopleErrorState onRetry={() => loadPage(0, false)} />
        ) : isInitialLoad ? (
          <div className="space-y-3" data-testid="people-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <PersonCardSkeleton key={i} />
            ))}
          </div>
        ) : quietHere ? (
          <PeopleQuietState />
        ) : noResults ? (
          <PeopleNoResultsState query={query.trim()} />
        ) : (
          <>
            <div className="space-y-3" data-testid="people-list">
              {filtered.map((p) => (
                <PersonCardRow
                  key={p.username}
                  person={p}
                  followLoading={!!followLoading[p.username]}
                  onFollow={() => handleFollow(p)}
                  onUnfollow={() => handleUnfollow(p)}
                  onOpen={() => openProfile(p)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="people-view-more"
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
