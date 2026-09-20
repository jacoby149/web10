import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  fetchPeoplePage,
  sortPeople,
  type PersonCard,
  type PeopleSort,
} from '@/data';
import { followUser, unfollowUser } from '@/data';
import { toast, errorMessage } from '@/components/shared/Toast';
import { Users, UserPlus, UserCheck, Loader2, AlertTriangle, RefreshCw, MoonStar, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PersonCardRow, PersonCardSkeleton } from '@/components/People/PersonCard';

const LOG = (...args: unknown[]) => console.log('[social:discover-people]', ...args);

// The page size for the D0 read (the "view more" increment).
const PAGE_SIZE = 20;
// Below this many public people, the node is "quiet" — a degenerate ranked
// list reads as broken, so we set the expectation instead (discover-reorg D2).
const QUIET_THRESHOLD = 10;

const SORT_OPTIONS: [PeopleSort, string][] = [
  ['mutuals', 'Mutuals'],
  ['popular', 'Popular'],
  ['az', 'A–Z'],
];

interface DiscoverPeopleTabProps {
  /** The active query from ?q= (set by the top bar's "see more people"). */
  query: string;
}

/**
 * The Discover/People subtab (D2, discover-reorg) — the real People browser.
 * Replaces the D1 placeholder. The shell (DiscoverScreen) owns ?tab= and ?q=
 * and hands the query down as a prop; this tab owns ?sort= and the paging.
 *
 * Data source: the D0 node read (`fetchPeoplePage`) — a paged, follower-ranked
 * list of the users whose profile face the reader can read (I3). The three
 * sorts (?sort=) and the ?q= filter are client-side over the loaded cards;
 * "view more" appends the next D0 page.
 */
export default function DiscoverPeopleTab({ query }: DiscoverPeopleTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: active sort from ?sort= (refresh-safe, shareable). Mutuals is
  // the bare URL (the default).
  const sort: PeopleSort = useMemo(() => {
    const raw = searchParams.get('sort');
    return raw === 'popular' || raw === 'az' ? raw : 'mutuals';
  }, [searchParams]);
  const setSort = useCallback(
    (next: PeopleSort) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'mutuals') {
        params.delete('sort');
      } else {
        params.set('sort', next);
      }
      setSearchParams(params);
      LOG('sort —', next);
    },
    [searchParams, setSearchParams],
  );

  const [people, setPeople] = useState<PersonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(false);
    LOG('loadFirst — start');
    try {
      const cards = await fetchPeoplePage(0, PAGE_SIZE);
      LOG('loadFirst — got', cards.length, 'person(s)');
      setPeople(cards);
    } catch (e) {
      LOG('loadFirst — failed:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const next = await fetchPeoplePage(people.length, PAGE_SIZE);
      LOG('loadMore — got', next.length, 'more person(s)');
      // Dedupe by username (the D0 read is stable, but be defensive).
      setPeople((prev) => {
        const seen = new Set(prev.map((p) => p.username));
        return [...prev, ...next.filter((p) => !seen.has(p.username))];
      });
    } catch (e) {
      LOG('loadMore — failed:', e);
      toast.error(errorMessage(e, 'Could not load more people.'));
    } finally {
      setLoadingMore(false);
    }
  }, [people.length]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

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
    window.dispatchEvent(
      new CustomEvent('navigate-user-profile', {
        detail: { username: person.username, provider: person.provider },
      }),
    );
  }, []);

  const q = query.trim().toLowerCase();
  // The ?q= filter (name/handle) is client-side over the loaded cards.
  const filtered = useMemo(() => {
    if (!q) return people;
    return people.filter(
      (p) =>
        p.username.toLowerCase().includes(q) ||
        (p.display_name ?? '').toLowerCase().includes(q),
    );
  }, [people, q]);

  const visiblePeople = useMemo(() => sortPeople(filtered, sort), [filtered, sort]);

  const isInitialLoad = loading && people.length === 0;
  // "It's quiet here": the node has fewer than ~10 public people (the first
  // page, unfiltered, came back short). A degenerate ranked list reads as
  // broken, so we set the expectation instead.
  const isQuiet = !loading && !error && people.length > 0 && people.length < QUIET_THRESHOLD;
  const isExhausted = people.length < PAGE_SIZE; // the last page was < PAGE_SIZE

  return (
    <div className="flex flex-col min-h-full" data-testid="discover-people-tab">
      {/* Sort row — the three sorts (?sort=, mutuals is the bare URL) */}
      <div className="px-4 py-2 md:px-0" data-testid="discover-people-sort" role="tablist" aria-label="Sort people">
        <div className="flex items-center gap-1">
          {SORT_OPTIONS.map(([s, label]) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={sort === s}
              onClick={() => setSort(s)}
              data-testid={`discover-people-sort-${s}`}
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

      {/* List */}
      <div className="flex-1 px-4 py-3 md:px-0" data-testid="discover-people-view">
        {error ? (
          <PeopleErrorState onRetry={loadFirst} />
        ) : isInitialLoad ? (
          <div className="space-y-3" data-testid="discover-people-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <PersonCardSkeleton key={i} />
            ))}
          </div>
        ) : isQuiet ? (
          <QuietState />
        ) : visiblePeople.length > 0 ? (
          <>
            <div className="space-y-3" data-testid="discover-people-list">
              {visiblePeople.map((p) => (
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
            {!isExhausted && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={loadMore}
                  disabled={loadingMore}
                  data-testid="discover-people-view-more"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                  View more
                </Button>
              </div>
            )}
          </>
        ) : (
          <NoResultsState query={query} />
        )}
      </div>
    </div>
  );
}

// ── "It's quiet here" state (the node has fewer than ~10 public people) ──────

function QuietState() {
  return (
    <div
      data-testid="discover-people-quiet"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
        <MoonStar className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">It's quiet here</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        A small node — the people who've set up a profile will show up here as they arrive.
      </p>
    </div>
  );
}

// ── No-results state (the ?q= filter matched nothing) ────────────────────────

function NoResultsState({ query }: { query: string }) {
  return (
    <div
      data-testid="discover-people-no-results"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface border border-border">
        <SearchX className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">No people found</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {query.trim()
          ? `No one matches “${query.trim()}”. Try a different name or handle.`
          : 'No people to show yet.'}
      </p>
    </div>
  );
}

// ── Error state ──────────────────────────────────────────────────────────────

function PeopleErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="discover-people-error"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
        <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">Couldn't load people</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Something went wrong talking to the node. Check your connection and try again.
      </p>
      <Button variant="brand" size="sm" className="mt-6 gap-2" onClick={onRetry} data-testid="discover-people-retry">
        <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
        Try again
      </Button>
    </div>
  );
}
