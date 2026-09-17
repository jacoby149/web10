import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchPeople,
  sortPeople,
  type PersonCard,
  type PeopleSort,
} from '@/data';
import { followUser, unfollowUser } from '@/data';
import { toast, errorMessage } from '@/components/shared/Toast';
import { Users, UserPlus, UserCheck, Loader2, AlertTriangle, RefreshCw, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:people]', ...args);

// ── Helpers ──────────────────────────────────────────────────────────────────

// Same deterministic accent the group cards use — each person wears their own
// color when they haven't set a banner yet (kept local, mirroring the
// Groups/Discover convention).
function hashToColor(str: string): string {
  const colors = [
    'bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500',
    'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
    'bg-teal-500', 'bg-red-500',
  ];
  let hash = 0;
  for (let i = 0; str.length > i; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Person card (the groups-tab shape, but with the person's own face) ───────

interface PersonCardProps {
  person: PersonCard;
  followLoading: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onOpen: () => void;
}

function PersonCardRow({ person, followLoading, onFollow, onUnfollow, onOpen }: PersonCardProps) {
  const name = person.display_name || person.username;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      data-testid="people-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`View ${name}'s profile`}
      className={cn(
        'group relative w-full overflow-hidden rounded-lg border border-border bg-card text-left cursor-pointer transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_0_24px_-8px_var(--color-glow)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transform-none',
      )}
    >
      {/* Banner — the person's real banner, or their accent when unset */}
      <div className="h-20 w-full overflow-hidden" aria-hidden="true">
        {person.banner_url ? (
          <img
            src={person.banner_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className={cn('h-full w-full opacity-50', hashToColor(person.username))} />
        )}
      </div>

      <div className="flex items-end gap-3 p-3 pt-0">
        {/* Avatar overlapping the banner — the profile pic preview */}
        <div className="shrink-0 -mt-7 rounded-full border-4 border-card">
          <Avatar className={cn('h-14 w-14', !person.avatar_url && hashToColor(person.username))}>
            {person.avatar_url ? (
              <AvatarImage src={person.avatar_url} alt={`${name}'s profile picture`} />
            ) : (
              <AvatarFallback className="text-foreground text-lg font-semibold">{initial}</AvatarFallback>
            )}
          </Avatar>
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
          <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <span data-testid="people-mutuals">
              {person.mutuals} mutual{person.mutuals === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatCount(person.followers_count)} followers</span>
          </p>
        </div>

        <Button
          variant={person.is_following ? 'outline' : 'brand_subtle'}
          size="sm"
          data-testid="people-follow-button"
          disabled={followLoading}
          onClick={(e) => {
            e.stopPropagation();
            if (person.is_following) {
              onUnfollow();
            } else {
              onFollow();
            }
          }}
          className={cn(
            'shrink-0 gap-1.5',
            person.is_following && 'border-border text-muted-foreground hover:border-danger/50 hover:text-danger hover:bg-danger-muted',
          )}
          aria-label={person.is_following ? `Unfollow ${name}` : `Follow ${name}`}
        >
          {followLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : person.is_following ? (
            <>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Following</span>
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Follow</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function PersonCardSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-card">
      <Skeleton className="h-20 w-full" />
      <div className="flex items-end gap-3 p-3 pt-0">
        <div className="shrink-0 -mt-7 rounded-full border-4 border-card">
          <Skeleton className="h-14 w-14 rounded-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 pb-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
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
