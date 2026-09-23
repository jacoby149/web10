import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Loader2, ArrowUpRight } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { API_ORIGIN, SOCIAL_ORIGIN } from '@/lib/origins';
import { trackFunnel } from '@/lib/analytics';

// ── The People subtab (M1, discover-reorg) ─────────────────────────────────
// The anon public people directory (D0): a paged, follower-ranked list of the
// users whose profile face the reader can read. Anon (no token) — the public
// subset. One round-trip (the node composes list_users + the I3 gate + profile
// faces + follower counts), so the client never fans out to N per-user reads.

const PAGE_SIZE = 24;

interface PeopleProfile {
  display_name?: string;
  bio?: string;
  avatar_ref?: string;
  banner_ref?: string;
}

interface PeopleEntry {
  username: string;
  follower_count: number;
  profile: PeopleProfile;
}

interface PeoplePage {
  users: PeopleEntry[];
  limit: number;
  offset: number;
}

async function fetchPeoplePage(limit: number, offset: number): Promise<PeoplePage> {
  const resp = await fetch(`${API_ORIGIN}/v3/users/directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, offset }),
  });
  if (!resp.ok) return { users: [], limit, offset };
  return resp.json();
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Deterministic rich gradient per entity — the fallback "face" when a person
// has no uploaded banner/avatar. Gradients read as designed, not as a flat
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

// ── Person card (the groups-tab shape, but with the person's own face) ───────

function PersonCard({ person }: { person: PeopleEntry }) {
  const name = person.profile?.display_name || person.username;
  const initial = name.charAt(0).toUpperCase();
  const gradient = hashToGradient(person.username);

  return (
    <a
      href={`${SOCIAL_ORIGIN}/u/${person.username}`}
      target="_blank"
      rel="noopener"
      data-testid="trending-person-card"
      aria-label={`View ${name}'s profile`}
      className="group relative w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_var(--color-glow-intense)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
    >
      {/* Banner — the person's real banner or their gradient */}
      <div className="h-24 w-full overflow-hidden" aria-hidden="true">
        <div className={`h-full w-full ${gradient}`} />
      </div>

      <div className="flex items-end gap-3 p-4 pt-0">
        {/* Avatar overlapping the banner — the profile pic preview */}
        <div className="shrink-0 -mt-8 rounded-full border-4 border-card">
          <Avatar className={`h-16 w-16 ${gradient}`}>
            <AvatarFallback className="text-foreground text-xl font-semibold">{initial}</AvatarFallback>
          </Avatar>
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <h3 className="truncate text-base font-semibold text-foreground">{name}</h3>
          <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <Users className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span data-testid="trending-person-followers">
              {formatCount(person.follower_count)} follower{person.follower_count === 1 ? '' : 's'}
            </span>
          </p>
        </div>

        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </a>
  );
}

function PersonCardSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-24 w-full" />
      <div className="flex items-end gap-3 p-4 pt-0">
        <div className="shrink-0 -mt-8 rounded-full border-4 border-card">
          <Skeleton className="h-16 w-16 rounded-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 pb-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

// ── The People subtab ────────────────────────────────────────────────────────

export function TrendingPeople() {
  const [people, setPeople] = useState<PeopleEntry[]>([]);
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
      const page = await fetchPeoplePage(PAGE_SIZE, offset);
      nextOffsetRef.current = offset + page.users.length;
      setPeople((prev) => (append ? [...prev, ...page.users] : page.users));
      // A full page means there may be another; a short page is the last one.
      setHasMore(page.users.length >= PAGE_SIZE);
    } catch {
      if (!append) setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0, false);
    trackFunnel('trending_people_view');
  }, [loadPage]);

  const isInitialLoad = loading && people.length === 0;

  return (
    <div data-testid="trending-people-view" className="mx-auto w-full max-w-2xl">
      {error ? (
        <div
          data-testid="trending-people-error"
          className="flex flex-col items-center justify-center py-16 px-8 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
            <Users className="h-8 w-8 text-danger" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">Couldn&apos;t load people</h2>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="trending-people-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <PersonCardSkeleton key={i} />
          ))}
        </div>
      ) : people.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="trending-people-grid">
            {people.map((p) => (
              <PersonCard key={p.username} person={p} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => loadPage(nextOffsetRef.current, true)}
                disabled={loadingMore}
                data-testid="trending-people-load-more"
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
          data-testid="trending-people-empty"
          className="flex flex-col items-center justify-center py-16 px-8 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
            <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">It&apos;s quiet here</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            This node is still finding its people. As more creators join and set up
            their profiles, they&apos;ll show up here.
          </p>
        </div>
      )}
    </div>
  );
}
