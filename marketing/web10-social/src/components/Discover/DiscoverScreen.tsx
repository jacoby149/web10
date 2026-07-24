import { useState, useEffect, useCallback, useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readDiscoverFeed,
  readProfile,
  readUserProfile,
  resolveMediaRefs,
  fetchSuggestedUsers,
  followUser,
  unfollowUser,
  readFollow,
} from '@/data';
import { getWapi } from '@/data/wapi';
import type {
  DiscoveryPost,
  MediaRecord,
  ProfileRecord,
  SuggestedUser,
} from '@/data';
import {
  Compass,
  Flame,
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
  Image as ImageIcon,
  Film,
  Music2,
  Users,
  UserPlus,
  UserX,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKETING_ORIGIN } from '@/lib/origins';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function hashToColor(str: string): string {
  const colors = [
    'bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500',
    'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
    'bg-teal-500', 'bg-red-500',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ── Heat glow tiers ────────────────────────────────────────────────────────
function heatTier(score: number, maxScore: number): 0 | 1 | 2 | 3 {
  if (!maxScore || score <= 0) return 0;
  const ratio = score / maxScore;
  if (ratio >= 0.66) return 3;
  if (ratio >= 0.33) return 2;
  return 1;
}

const HEAT_SHADOW: Record<number, string> = {
  0: '',
  1: 'shadow-[0_0_24px_-8px_var(--color-glow)]',
  2: 'shadow-[0_0_36px_-8px_var(--color-glow-intense)]',
  3: 'shadow-[0_0_52px_-6px_var(--color-glow-intense)]',
};

// ── Navigate to a user's profile (App listens for this) ──────────────────────

function navigateToUserProfile(username: string, provider: string) {
  window.dispatchEvent(
    new CustomEvent('navigate-user-profile', {
      detail: { username, provider },
    }),
  );
}

// ── Rank badge ─────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Badge
        variant="warning"
        data-testid="discover-rank-badge"
        className="border border-warning/40 bg-warning/15 text-warning normal-case tracking-normal"
        aria-label={`Rank ${rank}, number one`}
      >
        <Flame className="mr-1 h-3 w-3" strokeWidth={2} />
        #{rank}
      </Badge>
    );
  }
  if (rank <= 3) {
    return (
      <Badge
        variant="default"
        data-testid="discover-rank-badge"
        className="border border-border bg-elevated text-foreground normal-case tracking-normal"
        aria-label={`Rank ${rank}, top three`}
      >
        #{rank}
      </Badge>
    );
  }
  return (
    <Badge
      variant="brand"
      data-testid="discover-rank-badge"
      aria-label={`Rank ${rank}`}
    >
      #{rank}
    </Badge>
  );
}

// ── Media placeholder ──────────────────────────────────────────────────────

function MediaPlaceholder({ type }: { type: 'image' | 'video' | 'music' }) {
  if (type === 'video') {
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-elevated">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm">
            <Film className="h-5 w-5 text-foreground/60" />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
      </div>
    );
  }
  if (type === 'music') {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-elevated p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-brand-muted">
          <Music2 className="h-5 w-5 text-brand-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-2 w-24 rounded-full bg-muted-foreground/30" />
          <div className="mt-2 h-1 w-full rounded-full bg-muted-foreground/20">
            <div className="h-full w-2/5 rounded-full bg-brand" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="aspect-[4/3] w-full overflow-hidden bg-elevated">
      <div className="flex h-full w-full items-center justify-center">
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
      </div>
    </div>
  );
}

// ── Topic chips (derived from post tags, degrades gracefully when API returns []) ──

function buildTopics(tags: string[]): string[] {
  const unique = Array.from(new Set(tags)).sort();
  return unique.slice(0, 12);
}

// ── Suggested user card (People to follow rail) ──────────────────────────────

interface DiscoverUserCardProps {
  user: SuggestedUser;
  isFollowing: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onViewProfile: () => void;
  followLoading: boolean;
}

function DiscoverUserCard({
  user,
  isFollowing,
  onFollow,
  onUnfollow,
  onViewProfile,
  followLoading,
}: DiscoverUserCardProps) {
  const name = user.display_name || user.username;
  const handleFollowToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFollowing) {
      onUnfollow();
    } else {
      onFollow();
    }
  };

  return (
    <div
      data-testid="discover-user-card"
      className={cn(
        'group relative flex w-44 shrink-0 flex-col items-center rounded-lg border border-border bg-card p-4 text-center cursor-pointer transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-brand/30 motion-reduce:transform-none',
        isFollowing && 'border-brand/30',
      )}
      onClick={onViewProfile}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewProfile();
        }
      }}
      aria-label={`View ${name}'s profile`}
    >
      <Avatar
        className={cn('h-16 w-16 ring-2 ring-transparent transition-all duration-150', hashToColor(user.username), isFollowing && 'ring-brand/40')}
        onClick={(e) => e.stopPropagation()}
      >
        <AvatarFallback className="text-foreground text-xl font-semibold">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <h3 className="mt-3 w-full truncate text-sm font-semibold text-foreground">{name}</h3>
      <p className="w-full truncate text-xs text-muted-foreground">@{user.username}</p>
      {typeof user.followers_count === 'number' && (
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {formatCount(user.followers_count)} followers
        </p>
      )}
      {user.bio && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{user.bio}</p>
      )}
      <Button
        variant={isFollowing ? 'outline' : 'brand'}
        size="sm"
        data-testid="discover-follow-button"
        onClick={handleFollowToggle}
        disabled={followLoading}
        className={cn(
          'mt-3 w-full gap-1.5',
          isFollowing && 'border-border hover:border-danger/50 hover:text-danger hover:bg-danger-muted',
        )}
      >
        {followLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : isFollowing ? (
          <>
            <UserX className="h-3.5 w-3.5" strokeWidth={1.75} />
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
  );
}

function SuggestedUserSkeleton() {
  return (
    <div className="flex w-44 shrink-0 flex-col items-center rounded-lg border border-border bg-card p-4">
      <Skeleton className="h-16 w-16 rounded-full" />
      <Skeleton className="mt-3 h-4 w-24" />
      <Skeleton className="mt-2 h-3 w-16" />
      <Skeleton className="mt-3 h-8 w-full rounded-md" />
    </div>
  );
}

// ── DiscoverCard (trending post) ─────────────────────────────────────────────

interface DiscoverCardProps {
  post: DiscoveryPost;
  rank: number;
  maxScore: number;
  authorName: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  onAuthorClick: () => void;
}

function DiscoverCard({
  post,
  rank,
  maxScore,
  authorName,
  authorAvatar,
  mediaItems,
  onAuthorClick,
}: DiscoverCardProps) {
  const tier = heatTier(post.score ?? 0, maxScore);
  const displayName = authorName.charAt(0).toUpperCase() + authorName.slice(1);
  const initial = post.author.charAt(0).toUpperCase();
  const avatarColor = hashToColor(post.author);
  const hasMedia = mediaItems.length > 0;
  const mediaType = post.tags?.includes('video')
    ? 'video'
    : post.tags?.includes('music')
      ? 'music'
      : hasMedia
        ? 'image'
        : undefined;

  return (
    <article
      data-testid="discover-card"
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border bg-card transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-border/80',
        'focus-within:-translate-y-0.5 focus-within:border-border/80',
        'motion-reduce:transform-none',
        HEAT_SHADOW[tier],
      )}
    >
      <div className="p-4">
        {/* Header: rank + time */}
        <div className="flex items-center justify-between gap-2">
          <RankBadge rank={rank} />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {formatTimeAgo(post.created_at)}
          </span>
        </div>

        {/* Author row */}
        <div className="mt-3 flex items-start gap-3">
          <button
            type="button"
            onClick={onAuthorClick}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`View ${displayName}'s profile`}
          >
            <Avatar className={cn('h-9 w-9', avatarColor)}>
              {authorAvatar ? (
                <img src={authorAvatar} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <AvatarFallback className="text-foreground text-sm font-semibold">
                  {initial}
                </AvatarFallback>
              )}
            </Avatar>
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onAuthorClick}
              className="flex items-center gap-1.5 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
              <span className="truncate text-sm text-muted-foreground">@{post.author}</span>
            </button>
            {post.text && (
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-foreground">
                {post.text}
              </p>
            )}
          </div>
        </div>

        {/* Media */}
        {mediaType && (
          <div className="mt-3 overflow-hidden rounded-md">
            {mediaType === 'image' && mediaItems.length > 0 ? (
              <div className="aspect-[4/3] w-full overflow-hidden bg-elevated">
                <img
                  src={mediaItems[0].thumbnail_url || mediaItems[0].url}
                  alt={mediaItems[0].alt_text || ''}
                  className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            ) : (
              <MediaPlaceholder type={mediaType} />
            )}
          </div>
        )}

        {/* Tags */}
        {post.tags && post.tags.filter(t => !['image', 'video', 'music'].includes(t)).length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags
              .filter(t => !['image', 'video', 'music'].includes(t))
              .slice(0, 4)
              .map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full bg-brand-muted/60 text-brand-300 border border-brand/10"
                >
                  #{tag}
                </span>
              ))}
          </div>
        ) : null}

        {/* Engagement bar */}
        <div className="mt-3 flex items-center gap-6 border-t border-border pt-3">
          <span
            className="flex items-center gap-1.5 text-muted-foreground"
            aria-label={`${post.likes} likes`}
          >
            <Heart className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-xs tabular-nums">{formatCount(post.likes)}</span>
          </span>
          <span
            className="flex items-center gap-1.5 text-muted-foreground"
            aria-label={`${post.comments} comments`}
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-xs tabular-nums">{formatCount(post.comments)}</span>
          </span>
          <span
            className="flex items-center gap-1.5 text-muted-foreground"
            aria-label={`${post.reposts} reposts`}
          >
            <Repeat2 className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-xs tabular-nums">{formatCount(post.reposts)}</span>
          </span>
          <span className="ml-auto text-muted-foreground" aria-label="Share">
            <Share2 className="h-4 w-4" strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </article>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function DiscoverSkeleton() {
  return (
    <div
      data-testid="discover-skeleton"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-5/6" />
          </div>
        </div>
        <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-md">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="mt-3 flex gap-6 border-t border-border pt-3">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
        </div>
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function DiscoverEmptyState() {
  return (
    <div
      data-testid="discover-empty"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50 mb-4">
        <Compass className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">
        Nothing trending yet
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        The network is quiet. Follow some people or import your existing
        posts to get things moving.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
        <Button
          variant="brand"
          size="sm"
          data-testid="discover-empty-follow-cta"
          onClick={() => window.open(`${MARKETING_ORIGIN}/import`, '_blank', 'noopener,noreferrer')}
          className="gap-2"
        >
          <Users className="h-4 w-4" strokeWidth={1.75} />
          Import your posts
        </Button>
        <span className="text-xs text-muted-foreground">
          or follow personas to fill your feed
        </span>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const [posts, setPosts] = useState<DiscoveryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'recent' | 'trending'>('trending');
  const [profileMap, setProfileMap] = useState<Record<string, ProfileRecord>>({});
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord[]>>({});
  const [topic, setTopic] = useState<string>('All');

  // People-to-follow rail
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);
  const [followStates, setFollowStates] = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    try {
      const results = await readDiscoverFeed(sort, 30);
      setPosts(results);

      const token = getWapi().readToken();
      if (!token) {
        setLoading(false);
        return;
      }

      // Resolve profiles for authors
      const profiles: Record<string, ProfileRecord> = {};
      for (const post of results) {
        const key = `${post.author}@${post.provider}`;
        if (profiles[key]) continue;
        try {
          const profile = post.author === token.username
            ? await readProfile()
            : await readUserProfile(post.author, post.provider);
          if (profile) profiles[key] = profile;
        } catch {
          // Profile not available — use author name
        }
      }
      setProfileMap(profiles);

      // Resolve media for posts that have image/video tags
      const postsWithMedia = results.filter(p => p.tags?.some(t => ['image', 'video', 'music'].includes(t)));
      if (postsWithMedia.length) {
        try {
          const allMedia = await resolveMediaRefs(
            postsWithMedia.flatMap(() => {
              // Discovery posts don't carry media_refs directly, but we can
              // check the author's media service for recent uploads matching
              // the post's tags. For now, skip — media will show as placeholder.
              return [];
            }),
          );
          if (allMedia.length) {
            const mMap: Record<string, MediaRecord[]> = {};
            postsWithMedia.forEach((p, i) => {
              mMap[p.post_id] = allMedia.slice(i * 4, (i + 1) * 4);
            });
            setMediaMap(mMap);
          }
        } catch {
          // Media resolution failed — degrade gracefully
        }
      }
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [sort]);

  const loadSuggested = useCallback(async () => {
    setSuggestedLoading(true);
    try {
      const users = await fetchSuggestedUsers(20);
      setSuggested(users);

      const states: Record<string, boolean> = {};
      await Promise.all(
        users.map(async (user) => {
          const key = `${user.username}@${user.provider}`;
          try {
            const follow = await readFollow(user.username, user.provider);
            states[key] = follow?.status === 'active';
          } catch {
            states[key] = false;
          }
        }),
      );
      setFollowStates(states);
    } catch {
      setSuggested([]);
    } finally {
      setSuggestedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscover();
  }, [loadDiscover]);

  useEffect(() => {
    loadSuggested();
  }, [loadSuggested]);

  const handleFollow = useCallback(async (user: SuggestedUser) => {
    const key = `${user.username}@${user.provider}`;
    setFollowLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await followUser(user.username, user.provider);
      setFollowStates((prev) => ({ ...prev, [key]: true }));
    } catch {
      // Follow failed — leave state unchanged
    } finally {
      setFollowLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const handleUnfollow = useCallback(async (user: SuggestedUser) => {
    const key = `${user.username}@${user.provider}`;
    setFollowLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await unfollowUser(user.username, user.provider);
      setFollowStates((prev) => ({ ...prev, [key]: false }));
    } catch {
      // Unfollow failed — leave state unchanged
    } finally {
      setFollowLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const maxScore = useMemo(
    () => Math.max(1, ...posts.map(p => p.score ?? 0)),
    [posts],
  );

  const topics = useMemo(
    () => ['All', ...buildTopics(posts.flatMap(p => p.tags ?? []))],
    [posts],
  );

  const visiblePosts = useMemo(
    () => topic === 'All'
      ? posts
      : posts.filter(p => p.tags?.includes(topic) ?? false),
    [posts, topic],
  );

  const isInitialLoad = loading && posts.length === 0;
  const showSuggested = suggestedLoading || suggested.length > 0;

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
        <div className="flex items-center justify-between px-4 py-3 md:px-0">
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
            <h1 className="font-display text-lg font-bold text-foreground">Discover</h1>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'recent' | 'trending')}
            data-testid="discover-sort"
            className="h-8 text-xs w-28 rounded-full bg-elevated border-0 text-foreground px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="trending">Trending</option>
            <option value="recent">Recent</option>
          </select>
        </div>
      </div>

      {/* People to follow rail — creators worth an audience */}
      {showSuggested && (
        <section
          data-testid="discover-suggested"
          className="px-4 py-3 md:px-0"
          aria-label="People to follow"
        >
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-400" strokeWidth={1.75} />
            <h2 className="font-display text-sm font-semibold text-foreground">People to follow</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestedLoading
              ? Array.from({ length: 4 }).map((_, i) => <SuggestedUserSkeleton key={i} />)
              : suggested.map((user) => {
                  const key = `${user.username}@${user.provider}`;
                  return (
                    <DiscoverUserCard
                      key={key}
                      user={user}
                      isFollowing={!!followStates[key]}
                      followLoading={!!followLoading[key]}
                      onFollow={() => handleFollow(user)}
                      onUnfollow={() => handleUnfollow(user)}
                      onViewProfile={() => navigateToUserProfile(user.username, user.provider)}
                    />
                  );
                })}
          </div>
        </section>
      )}

      {/* Topic filter chips — only show when we have topics */}
      {topics.length > 1 && (
        <div className="px-4 py-3 md:px-0">
          <div
            className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Filter by topic"
          >
            {topics.map(t => {
              const active = t === topic;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid="discover-topic"
                  onClick={() => setTopic(t)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                      ? 'border-brand bg-brand-muted text-brand-300'
                      : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'All' ? 'All' : `#${t}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-4 py-4 md:px-0 md:max-w-2xl md:mx-auto">
        {isInitialLoad ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="discover-grid-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <DiscoverSkeleton key={i} />
            ))}
          </div>
        ) : visiblePosts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="discover-grid">
            {visiblePosts.map((post, i) => {
              const authorKey = `${post.author}@${post.provider}`;
              const profile = profileMap[authorKey];
              const mediaItems = mediaMap[post.post_id] || [];
              const authorName = profile?.display_name || post.author.replace(/[-_]/g, ' ');

              return (
                <DiscoverCard
                  key={post.post_id}
                  post={post}
                  rank={i + 1}
                  maxScore={maxScore}
                  authorName={authorName}
                  authorAvatar={
                    profile?.avatar_ref
                      ? mediaItems.find(m => m._id === profile.avatar_ref)?.url
                      : undefined
                  }
                  mediaItems={mediaItems}
                  onAuthorClick={() => navigateToUserProfile(post.author, post.provider)}
                />
              );
            })}
          </div>
        ) : (
          <DiscoverEmptyState />
        )}
      </div>
    </div>
  );
}
