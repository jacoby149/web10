import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  fetchPeople,
  sortPeople,
  type PersonCard,
  type PeopleSort,
} from '@/data';
import { followUser, unfollowUser } from '@/data';
import { toast, errorMessage } from '@/components/shared/Toast';
import { Users, AlertTriangle, RefreshCw, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PersonCardRow, PersonCardSkeleton } from './PersonCard';

const LOG = (...args: unknown[]) => console.log('[social:people]', ...args);

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

// ── Empty state ──────────────────────────────────────────────────────────────

function PeopleEmptyState({ onGoDiscover }: { onGoDiscover: () => void }) {
  return (
    <div
      data-testid="people-empty"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
        <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">No one to show yet</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Follow a few people or join a group and the people you have in common will show up here.
      </p>
      <Button
        variant="brand"
        size="sm"
        className="mt-6 gap-2"
        onClick={onGoDiscover}
        data-testid="people-empty-cta"
      >
        <Compass className="h-4 w-4" strokeWidth={1.75} />
        Discover content
      </Button>
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

const SORT_OPTIONS: [PeopleSort, string][] = [
  ['mutuals', 'Mutuals'],
  ['popular', 'Popular'],
  ['az', 'A–Z'],
];

export default function PeopleScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: active sort from ?sort= (refresh-safe, shareable).
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
  const [error, setError] = useState(false);
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError(false);
    LOG('loadPeople — start');
    try {
      const cards = await fetchPeople(20);
      LOG('loadPeople — got', cards.length, 'person(s)');
      setPeople(cards);
    } catch (e) {
      LOG('loadPeople — failed:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

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

  const openProfile = useCallback(
    (person: PersonCard) => {
      LOG('open profile —', person.username);
      // Same in-app navigation the feed/discover author clicks use.
      window.dispatchEvent(
        new CustomEvent('navigate-user-profile', {
          detail: { username: person.username, provider: person.provider },
        }),
      );
    },
    [],
  );

  const visiblePeople = useMemo(() => sortPeople(people, sort), [people, sort]);
  const isInitialLoad = loading && people.length === 0;

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="md:max-w-2xl md:mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
          <div className="flex items-center justify-between px-4 py-3 md:px-0 gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Users className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
              <h1 className="font-display text-lg font-bold text-foreground">People</h1>
            </div>
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
        </div>

        {/* List */}
        <div className="flex-1 px-4 py-4 md:px-0" data-testid="people-view">
          {error ? (
            <PeopleErrorState onRetry={loadPeople} />
          ) : isInitialLoad ? (
            <div className="space-y-3" data-testid="people-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <PersonCardSkeleton key={i} />
              ))}
            </div>
          ) : visiblePeople.length > 0 ? (
            <div className="space-y-3" data-testid="people-list">
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
          ) : (
            <PeopleEmptyState onGoDiscover={() => navigate('/discover')} />
          )}
        </div>
      </div>
    </div>
  );
}
