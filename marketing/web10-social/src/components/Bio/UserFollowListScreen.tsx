import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  listUserFollowing,
  listUserFollowers,
  readUserProfile,
  getFollowersCount,
  resolveMediaRefs,
  followUser,
  unfollowUser,
  readFollow,
  type PersonCard,
} from '@/data';
import { getWapi } from '@/data/wapi';
import { toast, errorMessage } from '@/components/shared/Toast';
import { ArrowLeft, Users, UserPlus, UserCheck, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:follow-list]', ...args);

// The page size for the "view more" increment.
const PAGE_SIZE = 20;

type FollowKind = 'followers' | 'following';

interface UserFollowListScreenProps {
  kind: FollowKind;
  onBack?: () => void;
}

function PersonCardSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-24 w-full rounded-none" />
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="h-12 w-12 rounded-full -mt-8 border-2 border-card" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

// Deterministic rich gradient per entity — the fallback "face" when a person
// has no uploaded banner/avatar (the same helper the People tab uses).
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
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface PersonRowProps {
  person: PersonCard;
  followLoading: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onOpen: () => void;
}

function PersonRow({ person, followLoading, onFollow, onUnfollow, onOpen }: PersonRowProps) {
  const name = person.display_name || person.username;
  const initial = name.charAt(0).toUpperCase();
  const gradient = hashToGradient(person.username);
  return (
    <div
      data-testid="follow-list-card"
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
        'group relative w-full overflow-hidden rounded-xl border border-border bg-card text-left cursor-pointer transition-all duration-200',
        'hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_var(--color-glow-intense)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transform-none',
      )}
    >
      <div className="h-24 w-full overflow-hidden" aria-hidden="true">
        {person.banner_url ? (
          <img src={person.banner_url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none" loading="lazy" />
        ) : (
          <div className={cn('h-full w-full', gradient)} />
        )}
      </div>
      <div className="flex items-end gap-3 px-3 pb-3">
        <div className="-mt-8">
          <Avatar className="h-14 w-14 border-2 border-card">
            {person.avatar_url ? (
              <AvatarImage src={person.avatar_url} alt="" />
            ) : (
              <AvatarFallback className={cn('text-lg font-bold text-white', gradient)}>{initial}</AvatarFallback>
            )}
          </Avatar>
        </div>
        <div className="flex-1 min-w-0 pb-1">
          <p className="truncate font-display font-semibold text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{formatCount(person.followers_count)} followers</p>
        </div>
        <Button
          variant={person.is_following ? 'outline' : 'brand'}
          size="sm"
          className={cn('gap-1.5 shrink-0', person.is_following && 'border-border hover:border-danger/50 hover:text-danger hover:bg-danger-muted')}
          data-testid={`follow-list-follow-${person.username}`}
          onClick={(e) => {
            e.stopPropagation();
            person.is_following ? onUnfollow() : onFollow();
          }}
          disabled={followLoading}
        >
          {followLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : person.is_following ? (
            <>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              Following
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Follow
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function UserFollowListScreen({ kind, onBack }: UserFollowListScreenProps) {
  const { username } = useParams();
  const navigate = useNavigate();
  const target = username!;
  const provider = getWapi().readToken()?.provider || '';

  const [people, setPeople] = useState<PersonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});
  const nextOffsetRef = useRef(0);
  const kindRef = useRef(kind);
  kindRef.current = kind;

  const isOwn = getWapi().readToken()?.username === target;

  const resolvePeople = useCallback(async (entries: { username: string; provider: string }[]): Promise<PersonCard[]> => {
    // The reader's follow set (for the Follow/Unfollow button state).
    let myFollowing = new Set<string>();
    if (!isOwn) {
      try {
        const fr = await readFollow(target, provider);
        if (fr?.status === 'active') myFollowing.add(target);
      } catch { /* degrade to no follows */ }
    }
    return Promise.all(entries.map(async (entry): Promise<PersonCard> => {
      const card: PersonCard = {
        username: entry.username,
        provider: entry.provider,
        display_name: entry.username,
        followers_count: 0,
        is_following: myFollowing.has(entry.username),
      };
      try {
        const profile = await readUserProfile(entry.username, entry.provider);
        if (profile) {
          card.display_name = profile.display_name || entry.username;
          card.bio = profile.bio;
          card.avatar_ref = profile.avatar_ref;
          card.banner_ref = profile.banner_ref;
        }
      } catch { /* no profile */ }
      try {
        card.followers_count = await getFollowersCount(entry.username);
      } catch { /* count unavailable */ }
      const refs = [card.avatar_ref, card.banner_ref].filter(Boolean) as string[];
      if (refs.length) {
        try {
          const media = await resolveMediaRefs(refs, { username: entry.username, provider: entry.provider }, 'public_media');
          for (const m of media) {
            if (m._id === card.avatar_ref) card.avatar_url = m.url;
            else if (m._id === card.banner_ref) card.banner_url = m.url;
          }
        } catch { /* face media failed */ }
      }
      return card;
    }));
  }, [isOwn, target, provider]);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(false);
    }
    LOG('loadPage —', kindRef.current, 'offset:', offset, 'append:', append);
    try {
      const entries =
        kindRef.current === 'following'
          ? await listUserFollowing(target, provider, { limit: PAGE_SIZE, offset })
          : await listUserFollowers(target, provider, { limit: PAGE_SIZE, offset });
      const resolved = await resolvePeople(entries);
      nextOffsetRef.current = offset + resolved.length;
      setPeople((prev) => (append ? [...prev, ...resolved] : resolved));
      setHasMore(resolved.length === PAGE_SIZE);
    } catch (e) {
      LOG('loadPage — failed:', e);
      if (!append) setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [target, provider, resolvePeople]);

  useEffect(() => {
    loadPage(0, false);
  }, [loadPage]);

  const handleFollow = useCallback(async (person: PersonCard) => {
    setFollowLoading((prev) => ({ ...prev, [person.username]: true }));
    try {
      await followUser(person.username, person.provider);
      setPeople((prev) => prev.map((p) => (p.username === person.username ? { ...p, is_following: true } : p)));
    } catch (e) {
      toast.error(errorMessage(e, `Could not follow ${person.username}.`));
    } finally {
      setFollowLoading((prev) => ({ ...prev, [person.username]: false }));
    }
  }, []);

  const handleUnfollow = useCallback(async (person: PersonCard) => {
    setFollowLoading((prev) => ({ ...prev, [person.username]: true }));
    try {
      await unfollowUser(person.username, person.provider);
      setPeople((prev) => prev.map((p) => (p.username === person.username ? { ...p, is_following: false } : p)));
    } catch (e) {
      toast.error(errorMessage(e, `Could not unfollow ${person.username}.`));
    } finally {
      setFollowLoading((prev) => ({ ...prev, [person.username]: false }));
    }
  }, []);

  const title = kind === 'followers' ? 'Followers' : 'Following';
  const backToProfile = () => navigate(`/u/${target}`);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header — back to the profile (the operator: "back to profile"). */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border" data-testid="follow-list-header">
        <button
          onClick={onBack ? onBack : backToProfile}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to profile"
          data-testid="follow-list-back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1">
          <h1 className="font-display text-lg font-bold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">
            {isOwn ? 'Your' : `${target}'s`} {title.toLowerCase()}
          </p>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums" data-testid="follow-list-count">
          {people.length}
        </span>
      </div>

      {/* List + states */}
      <div className="p-4 space-y-3" data-testid="follow-list-view">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center" data-testid="follow-list-error">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
              <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">Couldn't load {title.toLowerCase()}</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Something went wrong. Try again.</p>
            <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => loadPage(0, false)} data-testid="follow-list-retry">
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-3" data-testid="follow-list-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <PersonCardSkeleton key={i} />
            ))}
          </div>
        ) : people.length > 0 ? (
          <>
            <div className="space-y-3" data-testid="follow-list">
              {people.map((p) => (
                <PersonRow
                  key={p.username}
                  person={p}
                  followLoading={!!followLoading[p.username]}
                  onFollow={() => handleFollow(p)}
                  onUnfollow={() => handleUnfollow(p)}
                  onOpen={() => navigate(`/u/${p.username}`, { state: { provider: p.provider } })}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="follow-list-view-more"
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
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center" data-testid="follow-list-empty">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
              <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              {kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {kind === 'followers'
                ? 'When people follow, they\'ll show up here.'
                : 'When they follow someone, they\'ll show up here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
