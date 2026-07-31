import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Search,
  X,
  Grid3X3,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKETING_ORIGIN } from '@/lib/origins';
import { rankPosts, PRESETS, getPreset, type PresetId, type KnobState, defaultKnobState } from '@/lib/powerMean';
import { KnobRack } from './KnobRack';

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

// ── Topic chips ────────────────────────────────────────────────────────────

function buildTopics(tags: string[]): string[] {
  const unique = Array.from(new Set(tags)).sort();
  return unique.slice(0, 12);
}

// ── Suggested user card ────────────────────────────────────────────────────

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

// ── Signals helper for powerMean ranking ────────────────────────────────────

function postToSignals(post: DiscoveryPost) {
  return {
    ageMs: Date.now() - new Date(post.created_at).getTime(),
    likes: post.likes,
    comments: post.comments,
    reposts: post.reposts,
  };
}

// ── View toggle (D-trending-views bite b: Discover parity) ──────────────────

type DiscoverView = 'grid' | 'youtube';

function postHasMedia(post: DiscoveryPost): boolean {
  return !!(post.tags?.includes('video') || post.tags?.includes('image') || post.media_refs?.length);
}

// ── YouTubeCard (Discover parity with marketing-ui YouTubeCard) ─────────────

interface DiscoverYouTubeCardProps {
  post: DiscoveryPost;
  rank: number;
  authorName: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  onAuthorClick: () => void;
}

function DiscoverYouTubeCard({
  post,
  rank,
  authorName,
  authorAvatar,
  mediaItems,
  onAuthorClick,
}: DiscoverYouTubeCardProps) {
  const displayName = authorName.charAt(0).toUpperCase() + authorName.slice(1);
  const initial = post.author.charAt(0).toUpperCase();
  const avatarColor = hashToColor(post.author);
  const hasImage = mediaItems.length > 0 && mediaItems[0].url;
  const isVideo = post.tags?.includes('video');

  return (
    <div
      data-testid="discover-youtube-card"
      className="group/yt cursor-pointer"
    >
      {/* 16:9 thumbnail */}
      <div className="relative overflow-hidden rounded-xl bg-elevated">
        {hasImage ? (
          <img
            src={mediaItems[0].thumbnail_url || mediaItems[0].url}
            alt={mediaItems[0].alt_text || ''}
            className="aspect-video w-full object-cover transition-transform duration-150 group-hover/yt:scale-105"
            loading="lazy"
          />
        ) : isVideo ? (
          <div className="aspect-video w-full flex items-center justify-center bg-elevated">
            <Film className="h-8 w-8 text-muted-foreground/40" />
          </div>
        ) : (
          <div className="aspect-video w-full flex items-center justify-center bg-elevated">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        {/* Time badge */}
        <div className="absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-sm">
          {formatTimeAgo(post.created_at)}
        </div>
        {rank !== undefined && rank <= 3 && (
          <div className="absolute top-2 left-2">
            <RankBadge rank={rank} />
          </div>
        )}
      </div>

      {/* Metadata row: avatar + title + author + engagement */}
      <div className="mt-2.5 flex gap-2.5">
        <button
          type="button"
          onClick={onAuthorClick}
          className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          aria-label={`View ${displayName}'s profile`}
        >
          <Avatar className={cn(avatarColor, 'h-9 w-9')}>
            {authorAvatar ? (
              <img src={authorAvatar} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="text-foreground">{initial}</AvatarFallback>
            )}
          </Avatar>
        </button>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover/yt:text-brand-400">
            {post.text || `${displayName}'s post`}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <button
              type="button"
              onClick={onAuthorClick}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {displayName}
            </button>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{formatTimeAgo(post.created_at)} ago</span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" strokeWidth={1.5} />
              {formatCount(post.likes)}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" strokeWidth={1.5} />
              {formatCount(post.comments)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoverYouTubeSkeleton() {
  return (
    <div data-testid="discover-youtube-skeleton">
      <div className="overflow-hidden rounded-xl bg-elevated">
        <Skeleton className="aspect-video w-full" />
      </div>
      <div className="mt-2.5 flex gap-2.5">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

// ── YouTube empty state ────────────────────────────────────────────────────

function DiscoverYouTubeEmptyState({ onSwitchToGrid }: { onSwitchToGrid: () => void }) {
  return (
    <div
      data-testid="discover-youtube-empty"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50 mb-4">
        <Video className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">
        No media posts yet
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        The YouTube view shows posts with videos and images.
        Switch to the grid view to see all trending posts.
      </p>
      <Button
        variant="outline"
        size="sm"
        data-testid="discover-youtube-empty-cta"
        onClick={onSwitchToGrid}
        className="mt-6 gap-2"
      >
        <Grid3X3 className="h-4 w-4" strokeWidth={1.75} />
        Switch to grid view
      </Button>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const [posts, setPosts] = useState<DiscoveryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileRecord>>({});
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord[]>>({});

  // Deep-link: active tag from ?tag= (refresh-safe, shareable)
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTag = searchParams.get('tag') || '';
  const [activeTag, setActiveTag] = useState<string>(urlTag || 'All');

  // Deep-link: search query from ?q= (refresh-safe, shareable)
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState<string>(urlQuery);

  // Deep-link: view toggle from ?view= (refresh-safe, shareable)
  const [view, setView] = useState<DiscoverView>(() => {
    return (searchParams.get('view') as DiscoverView) || 'grid';
  });

  const setViewUrl = useCallback((v: DiscoverView) => {
    setView(v);
    const params = new URLSearchParams(searchParams);
    if (v === 'youtube') {
      params.set('view', 'youtube');
    } else {
      params.delete('view');
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Sync activeTag with ?tag= search param
  useEffect(() => {
    const current = searchParams.get('tag') || 'All';
    if (activeTag !== current) {
      setActiveTag(current);
    }
  }, [searchParams]);

  // Sync searchQuery with ?q= search param
  useEffect(() => {
    const current = searchParams.get('q') || '';
    if (searchQuery !== current) {
      setSearchQuery(current);
    }
  }, [searchParams]);

  // Sync view with ?view= search param
  useEffect(() => {
    const current = (searchParams.get('view') as DiscoverView) || 'grid';
    if (view !== current) {
      setView(current);
    }
  }, [searchParams]);

  // Knob state — starts at Balanced preset, knobs re-rank client-side live
  const [knobState, setKnobState] = useState<KnobState>(defaultKnobState());
  const [activePreset, setActivePreset] = useState<PresetId | null>('balanced');

  // People-to-follow rail
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);
  const [followStates, setFollowStates] = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch a large set from the API (both trending + recent merged)
      // so client-side re-ranking has material to work with.
      const results = await readDiscoverFeed('trending', 50);
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
      const postsWithMedia = results.filter(p => p.media_refs?.length || p.tags?.some(t => ['image', 'video', 'music'].includes(t)));
      if (postsWithMedia.length) {
        try {
          const byAuthor = new Map<string, { posts: typeof postsWithMedia; refs: string[] }>();
          for (const p of postsWithMedia) {
            const key = `${p.author}@${p.provider}`;
            const entry = byAuthor.get(key);
            if (entry) {
              entry.posts.push(p);
              if (p.media_refs?.length) {
                entry.refs.push(...p.media_refs);
              }
            } else {
              byAuthor.set(key, {
                posts: [p],
                refs: p.media_refs || [],
              });
            }
          }
          const mMap: Record<string, MediaRecord[]> = {};
          for (const [key, entry] of byAuthor) {
            const [username, provider] = key.split('@');
            const isOwn = username === token.username && provider === token.provider;
            const uniqueRefs = [...new Set(entry.refs)];
            if (!uniqueRefs.length) continue;
            const media = await resolveMediaRefs(
              uniqueRefs,
              { username, provider },
              isOwn ? 'media' : 'public_media',
            );
            for (const p of entry.posts) {
              if (p.media_refs?.length) {
                mMap[p.post_id] = media.filter(m => p.media_refs?.includes(m._id || ''));
              }
            }
          }
          if (Object.keys(mMap).length) {
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
  }, []);

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

  // Knob change handler — clears active preset (custom tuning)
  const handleKnobChange = useCallback((key: keyof KnobState, value: number) => {
    setKnobState(prev => ({ ...prev, [key]: value }));
    setActivePreset(null);
  }, []);

  // Preset handler — updates knob state to preset defaults
  const handlePreset = useCallback((id: PresetId) => {
    const presetDef = getPreset(id);
    if (presetDef) {
      setKnobState(presetDef.state);
      setActivePreset(id);
    }
  }, []);

  // Client-side re-ranking via knob state (zero network calls per twist)
  const rankedPosts = useMemo(() => {
    return rankPosts(posts, postToSignals, knobState);
  }, [posts, knobState]);

  const maxScore = useMemo(
    () => Math.max(1, ...rankedPosts.map(p => p.score ?? 0)),
    [rankedPosts],
  );

  const topics = useMemo(
    () => ['All', ...buildTopics(rankedPosts.flatMap(p => p.tags ?? []))],
    [rankedPosts],
  );

  const visiblePosts = useMemo(() => {
    let filtered = rankedPosts;
    if (activeTag && activeTag !== 'All') {
      filtered = filtered.filter(p => p.tags?.includes(activeTag) ?? false);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        (p.text ?? '').toLowerCase().includes(q) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(q)) ||
        (p.author ?? '').toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [rankedPosts, activeTag, searchQuery]);

  // YouTube view: media posts only (video + image)
  const mediaPosts = useMemo(
    () => visiblePosts.filter(p => postHasMedia(p)),
    [visiblePosts],
  );

  const isInitialLoad = loading && posts.length === 0;
  const showSuggested = suggestedLoading || suggested.length > 0;

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchQuery(val);
    const params = new URLSearchParams(searchParams);
    if (val.trim()) {
      params.set('q', val.trim());
    } else {
      params.delete('q');
    }
    setSearchParams(params);
  }

  function handleSearchClear() {
    setSearchQuery('');
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="md:max-w-xl md:mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
        <div className="flex items-center justify-between px-4 py-3 md:px-0 gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Compass className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
            <h1 className="font-display text-lg font-bold text-foreground">Discover</h1>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search posts…"
              data-testid="discover-search"
              className="w-full h-8 pl-8 pr-7 rounded-full border border-input bg-surface text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleSearchClear}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-elevated transition-colors duration-150"
                aria-label="Clear search"
                data-testid="discover-search-clear"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Controls: presets + knobs */}
      <div className="px-4 py-3 md:px-0">
        <KnobRack
          state={knobState}
          activePreset={activePreset}
          onChange={handleKnobChange}
          onPreset={handlePreset}
        />
      </div>

      {/* People to follow rail */}
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

      {/* Topic filter chips */}
      {topics.length > 1 && (
        <div className="px-4 py-3 md:px-0">
          <div
            className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Filter by topic"
          >
            {topics.map(t => {
              const active = t === activeTag;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid="discover-topic"
                  onClick={() => {
                    setActiveTag(t);
                    const params = new URLSearchParams(searchParams);
                    if (t === 'All') {
                      params.delete('tag');
                    } else {
                      params.set('tag', t);
                    }
                    setSearchParams(params);
                  }}
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

      {/* View toggle — YouTube-style, below topics */}
      {!isInitialLoad && posts.length > 0 && (
        <div className="border-b border-border bg-surface/50">
          <div className="px-4 md:px-0">
            <div className="flex items-center gap-1 py-2" data-testid="discover-view-toggle">
              {([
                ['grid', 'Grid', Grid3X3],
                ['youtube', 'YouTube', Video],
              ] as [DiscoverView, string, typeof Grid3X3][]).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewUrl(v)}
                  data-testid={`discover-view-toggle-${v}`}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    view === v
                      ? 'bg-brand-muted text-brand-300'
                      : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-4 py-4 md:px-0">
        {isInitialLoad ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="discover-grid-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <DiscoverSkeleton key={i} />
            ))}
          </div>
        ) : view === 'youtube' ? (
          /* YouTube view — media posts only, 16:9 thumbnails */
          mediaPosts.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="discover-youtube-grid">
              {mediaPosts.map((post, i) => {
                const authorKey = `${post.author}@${post.provider}`;
                const profile = profileMap[authorKey];
                const mediaItems = mediaMap[post.post_id] || [];
                const authorName = profile?.display_name || post.author.replace(/[-_]/g, ' ');

                return (
                  <DiscoverYouTubeCard
                    key={post.post_id}
                    post={post}
                    rank={i + 1}
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
            <DiscoverYouTubeEmptyState onSwitchToGrid={() => setViewUrl('grid')} />
          )
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
    </div>
  );
}