import { useState, useEffect, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Flame, Heart, MessageCircle, Repeat2, Share2, Image as ImageIcon, Film, Music2, Send, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SOCIAL_ORIGIN, API_ORIGIN } from '@/lib/origins';
import { trackFunnel } from '@/lib/analytics';
import { getPublicMediaUrl, getPublicMediaThumbnailUrl, resolveMediaRef, clearMediaCache } from '@/lib/mediaPresign';

interface DiscoveryPost {
  author: string;
  service: string;
  post_id: string;
  body_text: string;
  tags: string[];
  created_at: string;
  engagement: {
    likes: number;
    comments: number;
    reposts: number;
  };
  engagement_score: number;
  // A17 media projection fields
  media_refs?: string[];
  has_media?: boolean;
  first_attachment_mime?: string;
}

interface FeedPost {
  id: string;
  name: string;
  handle: string;
  initial: string;
  avatarColor: string;
  time: string;
  content: string;
  media?: 'image' | 'video' | 'music';
  mediaRefs?: string[];
  firstAttachmentMime?: string;
  author?: string;
  likes: string;
  comments: string;
  reposts: string;
  engagementScore?: number;
  tags?: string[];
  // Raw numeric counts for client-side ranking (knobs)
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  createdAt: string;
}

const AVATAR_COLORS = [
  'bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-teal-500', 'bg-red-500',
];

function hashToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function parseCount(s: string): number {
  const num = parseFloat(s);
  if (isNaN(num)) return -1;
  if (s.includes('k')) return Math.round(num * 1000);
  return num;
}

function mapDiscoveryToFeedPost(d: DiscoveryPost): FeedPost {
  const name = d.author.replace(/[-_]/g, ' ');
  const tags = d.tags || [];
  // Prefer A17 media projection over tag-based detection.
  const mime = d.first_attachment_mime;
  const mediaType = mime
    ? mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'music' : undefined
    : tags.includes('video') ? 'video' : tags.includes('image') ? 'image' : tags.includes('music') ? 'music' : undefined;
  return {
    id: d.post_id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    handle: `@${d.author}`,
    initial: d.author.charAt(0).toUpperCase(),
    avatarColor: hashToColor(d.author),
    time: timeAgo(d.created_at),
    content: d.body_text || '',
    media: mediaType,
    mediaRefs: d.media_refs,
    firstAttachmentMime: mime,
    author: d.author,
    likes: formatCount(d.engagement.likes),
    comments: formatCount(d.engagement.comments),
    reposts: formatCount(d.engagement.reposts),
    engagementScore: d.engagement_score,
    tags,
    likesCount: d.engagement.likes ?? 0,
    commentsCount: d.engagement.comments ?? 0,
    repostsCount: d.engagement.reposts ?? 0,
    createdAt: d.created_at,
  };
}

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

// ── TrendingMedia: real media via public_media presign ──────────────────────
//
// Fetches the first media ref for a post, presigns it, and renders the
// actual image or an autoplaying muted video. Falls back to the
// MediaPlaceholder if presign fails or no media refs exist.
//
// Videos: autoPlay muted loop playsInline preload="metadata". Paused when
// scrolled out of view (IntersectionObserver). Tap unmutes / opens full
// view (Insta/TikTok pattern: sound opt-in, motion free). Respects
// prefers-reduced-motion (no autoplay, shows poster + play badge).
//
// Media-forward per design.md: reserve-space-from-aspect (no layout shift),
// hover zoom, "+N" overflow for multiple refs.

interface TrendingMediaProps {
  author: string;
  mediaRefs?: string[];
  mediaType?: 'image' | 'video' | 'music';
  firstAttachmentMime?: string;
  postId?: string;
}

function TrendingMedia({ author, mediaRefs, mediaType, firstAttachmentMime, postId }: TrendingMediaProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const resolvedType = mediaType || (firstAttachmentMime?.startsWith('video/') ? 'video' : firstAttachmentMime?.startsWith('image/') ? 'image' : undefined);
  const isVideo = resolvedType === 'video';
  const mediaCount = (mediaRefs?.length || 0);
  const hasOverflow = mediaCount > 1;

  // Video autoplay state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // prefers-reduced-motion: no autoplay
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ).current;

  useEffect(() => {
    if (!mediaRefs?.length || !author) return;
    let cancelled = false;
    getPublicMediaUrl(author, mediaRefs[0]).then(url => {
      if (cancelled || !url) return;
      setImageUrl(url);
      if (isVideo) {
        resolveMediaRef(author, mediaRefs[0]).then(record => {
          if (cancelled || !record) return;
          getPublicMediaThumbnailUrl(author, record).then(thumb => {
            if (!cancelled && thumb) setThumbUrl(thumb);
          }).catch(() => {});
        }).catch(() => {});
      }
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, [author, mediaRefs, isVideo]);

  // IntersectionObserver: pause video when offscreen, resume when visible
  useEffect(() => {
    if (!isVideo || prefersReducedMotion || !videoRef.current) return;
    const el = videoRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.play().catch(() => {});
            setIsPaused(false);
          } else {
            el.pause();
            setIsPaused(true);
          }
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVideo, prefersReducedMotion]);

  // Tap handler: unmute on first tap, open full view on second
  const handleVideoTap = useCallback(() => {
    if (isMuted) {
      const video = videoRef.current;
      if (video) {
        video.muted = false;
        video.volume = 1;
        video.play().catch(() => {});
        setIsMuted(false);
      }
    } else if (postId) {
      window.open(`${SOCIAL_ORIGIN}/u/${encodeURIComponent(author)}/p/${encodeURIComponent(postId)}`, '_blank');
    }
  }, [isMuted, postId, author]);

  // Loading state: skeleton with reserved aspect
  if (!imageUrl && !error) {
    return (
      <div
        className={`w-full overflow-hidden bg-elevated ${isVideo ? 'aspect-video' : 'aspect-[4/3]'}`}
        data-testid="trending-media-skeleton"
      >
        <div className="h-full w-full animate-shimmer bg-gradient-to-r from-elevated via-muted to-elevated bg-[length:200%_100%]" />
      </div>
    );
  }

  // Error / fallback: show the old placeholder
  if (error || !imageUrl) {
    return <MediaPlaceholder type={resolvedType || 'image'} />;
  }

  const handleLoad = () => setLoaded(true);

  // Video with autoplay muted
  if (isVideo) {
    if (prefersReducedMotion) {
      // Reduced motion: poster + play badge (no autoplay)
      return (
        <div
          className="group/media relative w-full overflow-hidden aspect-video bg-elevated"
          data-testid="trending-media"
        >
          <img
            src={thumbUrl || imageUrl}
            alt=""
            loading="lazy"
            onLoad={handleLoad}
            className={`h-full w-full object-cover transition-transform duration-150 ease-out group-hover/media:scale-105 motion-reduce:transform-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
          {!loaded && (
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-elevated via-muted to-elevated bg-[length:200%_100%]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground/15 backdrop-blur-sm transition-transform duration-150 ease-out group-hover/media:scale-110 motion-reduce:transform-none">
              <Play className="ml-1 h-6 w-6 text-foreground" fill="currentColor" />
            </div>
          </div>
          {hasOverflow && (
            <div className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground backdrop-blur-sm">
              +{mediaCount - 1}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className="group/media relative w-full overflow-hidden aspect-video bg-elevated cursor-pointer"
        data-testid="trending-media"
        onClick={handleVideoTap}
        role="button"
        tabIndex={0}
        aria-label={isMuted ? 'Video (muted). Tap to unmute.' : 'Video (sound on). Tap to open full view.'}
      >
        <video
          ref={videoRef}
          src={imageUrl}
          poster={thumbUrl || undefined}
          autoPlay
          muted={isMuted}
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onLoad={() => setLoaded(true)}
        />
        {!loaded && (
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-elevated via-muted to-elevated bg-[length:200%_100%]" />
        )}
        {isMuted && (
          <div className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 backdrop-blur-sm transition-opacity duration-150 ease-out group-hover/media:opacity-0">
            <VolumeX className="h-3.5 w-3.5 text-foreground" />
          </div>
        )}
        {!isMuted && (
          <div className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 backdrop-blur-sm">
            <Volume2 className="h-3.5 w-3.5 text-foreground" />
          </div>
        )}
        {hasOverflow && (
          <div className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground backdrop-blur-sm">
            +{mediaCount - 1}
          </div>
        )}
        {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground/15 backdrop-blur-sm">
              <Play className="ml-1 h-6 w-6 text-foreground" fill="currentColor" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Image (unchanged)
  return (
    <div
      className={`group/media relative w-full overflow-hidden aspect-[4/3] bg-elevated`}
      data-testid="trending-media"
    >
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        onLoad={handleLoad}
        className={`h-full w-full object-cover transition-transform duration-150 ease-out group-hover/media:scale-105 motion-reduce:transform-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
      {!loaded && (
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-elevated via-muted to-elevated bg-[length:200%_100%]" />
      )}
      {hasOverflow && (
        <div className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground backdrop-blur-sm">
          +{mediaCount - 1}
        </div>
      )}
    </div>
  );
}

// ── TrendingCard (D-trending-card) ──────────────────────────────────────────
//
// Media-forward ranked card for the /trending grid. Heat glow is the
// screen's one decorative glow (design.md §4 marketing: one per screen)
// expressed as tiered violet halos keyed to engagement_score. Rank tiers:
// #1 gold (warning), #2-3 silver (neutral metallic), #4+ brand. All colors
// come through tokens; the heat tiers are arbitrary Tailwind shadow
// utilities that reference the glow color variables (§13 judgement).

function heatTier(score: number | undefined, maxScore: number): 0 | 1 | 2 | 3 {
  if (!score || !maxScore || score <= 0) return 0;
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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Badge
        variant="default"
        data-testid="trending-rank"
        className="border border-warning/40 bg-warning/15 text-warning"
        aria-label={`Rank ${rank}, trending number one`}
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
        data-testid="trending-rank"
        className="border border-border bg-elevated text-foreground"
        aria-label={`Rank ${rank}, trending top three`}
      >
        #{rank}
      </Badge>
    );
  }
  return (
    <Badge
      variant="brand"
      data-testid="trending-rank"
      aria-label={`Rank ${rank}, trending`}
    >
      #{rank}
    </Badge>
  );
}

interface TrendingCardProps {
  post: FeedPost;
  rank: number;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onRepost: (postId: string) => void;
  onShare?: (postId: string) => void;
  maxScore: number;
  featured?: boolean;
  readOnly?: boolean;
  className?: string;
  cardRef?: (el: HTMLElement | null) => void;
}

// ── Inline comment panel (anon read, auth-gated compose) ────────────────────

const COMMENT_API = import.meta.env.VITE_API_URL || 'https://api.web10.app';

interface LedgerComment {
  _id: string;
  payload: {
    action: string;
    text: string;
    author_username?: string;
    author_provider?: string;
    target?: string;
  };
  author: string;
  created_at: string;
}

function commentTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

async function fetchComments(postId: string, postAuthor?: string, postService?: string): Promise<LedgerComment[]> {
  const target = postAuthor && postService
    ? `${postAuthor}/${postService}/${postId}`
    : `posts:${postId}`;
  const resp = await fetch(`${COMMENT_API}/public/entries`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: { target, limit: 50 },
    }),
  });
  if (!resp.ok) return [];
  const entries: LedgerComment[] = await resp.json();
  return entries.filter(e => e.payload?.action === 'comment');
}

function InlineCommentPanel({ postId, postAuthor, postService }: { postId: string; postAuthor?: string; postService?: string }) {
  const [comments, setComments] = useState<LedgerComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchComments(postId, postAuthor, postService)
      .then(c => { if (!cancelled) { setComments(c); setLoading(false); } })
      .catch(() => { if (!cancelled) { setComments([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [postId, postAuthor, postService]);

  const handleCompose = () => {
    trackFunnel('trending_comment_attempt', { post_id: postId });
    if (postAuthor) {
      window.open(`${SOCIAL_ORIGIN}/u/${encodeURIComponent(postAuthor)}/p/${encodeURIComponent(postId)}`, '_blank');
    } else {
      window.open(SOCIAL_ORIGIN, '_blank');
    }
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div
      className="mt-3 border-t border-border pt-3"
      data-testid="comment-panel"
    >
      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-elevated" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex gap-2">
                    <div className="h-3 w-16 rounded bg-elevated" />
                    <div className="h-3 w-8 rounded bg-elevated" />
                  </div>
                  <div className="h-3 w-full rounded bg-elevated" />
                </div>
              </div>
            ))}
          </>
        ) : comments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No comments yet.
          </p>
        ) : (
          comments.map(c => {
            const author = c.payload.author_username || c.author || 'anonymous';
            const initial = author.charAt(0).toUpperCase();
            const color = hashToColor(author);
            const commentUrl = `${SOCIAL_ORIGIN}/u/${encodeURIComponent(postAuthor || 'unknown')}/p/${encodeURIComponent(postId)}?comment=${encodeURIComponent(c._id)}`;
            return (
              <a
                key={c._id}
                href={commentUrl}
                target="_blank"
                rel="noopener"
                data-testid="comment-entry"
                className="flex gap-2 transition-colors hover:bg-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Avatar className={color}>
                  <AvatarFallback className="text-foreground">{initial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {author.replace(/[-_]/g, ' ')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {commentTimeAgo(c.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-foreground">
                    {c.payload.text}
                  </p>
                </div>
              </a>
            );
          })
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Textarea
          ref={textareaRef}
          placeholder="Add a comment…"
          value={text}
          onChange={e => setText(e.target.value)}
          className="min-h-[60px] flex-1 resize-none text-sm"
          rows={2}
        />
        <Button
          type="button"
          variant="brand"
          size="icon"
          className="shrink-0 self-end"
          onClick={handleCompose}
          aria-label="Post comment"
        >
          <Send className="h-4 w-4" strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}

function TrendingCard({
  post,
  rank,
  onLike,
  onComment,
  onRepost,
  onShare,
  maxScore,
  featured = false,
  readOnly = false,
  className,
  cardRef,
}: TrendingCardProps) {
  const [copied, setCopied] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const tier = heatTier(post.engagementScore, maxScore);
  const postPermalink = post.author
    ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(post.author)}/p/${encodeURIComponent(post.id)}`
    : SOCIAL_ORIGIN;
  const authorPermalink = post.author
    ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(post.author)}`
    : SOCIAL_ORIGIN;
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onShare) {
      onShare(post.id);
      return;
    }
    if (navigator.share) {
      navigator.share({ title: post.name, url: postPermalink }).catch(() => {
        copyUrl();
      });
    } else {
      copyUrl();
    }
    function copyUrl() {
      navigator.clipboard.writeText(postPermalink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };
  const handleCommentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCommentOpen(v => !v);
  };
  return (
    <Card
      data-testid="trending-card"
      id={`trending-card-${post.id}`}
      ref={cardRef as React.Ref<HTMLDivElement>}
      className={[
        'group relative scroll-mt-24 overflow-hidden bg-surface transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-within:-translate-y-0.5 motion-reduce:transform-none',
        HEAT_SHADOW[tier],
        featured ? 'sm:col-span-2' : '',
        className ?? '',
      ].join(' ')}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <RankBadge rank={rank} />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {post.time}
          </span>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <Avatar className={post.avatarColor}>
            <AvatarFallback className="text-foreground">{post.initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate">
              <a href={authorPermalink} target="_blank" rel="noopener" className="truncate text-sm font-semibold text-foreground transition-colors hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                {post.name}
              </a>
              <span className="truncate text-sm text-muted-foreground">{post.handle}</span>
            </div>
            <a
              href={postPermalink}
              target="_blank"
              rel="noopener"
              className="mt-1 block line-clamp-3 text-sm leading-relaxed text-foreground transition-colors hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {post.content}
            </a>
          </div>
        </div>
        {post.media && (
          <div className="mt-3">
            {post.author && post.mediaRefs ? (
              <TrendingMedia
                author={post.author}
                mediaRefs={post.mediaRefs}
                mediaType={post.media}
                firstAttachmentMime={post.firstAttachmentMime}
                postId={post.id}
              />
            ) : (
              <MediaPlaceholder type={post.media} />
            )}
          </div>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.filter(t => !['image', 'video', 'music'].includes(t)).slice(0, 4).map(tag => (
              <a
                key={tag}
                href={`${SOCIAL_ORIGIN}/discover?tag=${encodeURIComponent(tag)}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs transition-colors hover:border-border/80 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                #{tag}
              </a>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-6 border-t border-border pt-3">
          {readOnly ? (
            <>
              <span className="flex items-center gap-1.5 text-muted-foreground" aria-label={`Like, ${post.likes} likes`}>
                <Heart className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs tabular-nums">{post.likes}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground" aria-label={`Comment, ${post.comments} comments`}>
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs tabular-nums">{post.comments}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground" aria-label={`Repost, ${post.reposts} reposts`}>
                <Repeat2 className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs tabular-nums">{post.reposts}</span>
              </span>
              <span className="ml-auto text-muted-foreground" aria-label="Share">
                <Share2 className="h-4 w-4" strokeWidth={1.5} />
              </span>
            </>
          ) : (
            <>
              <button
                onClick={() => onLike(post.id)}
                className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-rose-400 focus-visible:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`Like, ${post.likes} likes`}
              >
                <Heart className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs tabular-nums">{post.likes}</span>
              </button>
              <button
                onClick={handleCommentClick}
                className={`flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${commentOpen ? 'text-sky-400' : 'text-muted-foreground hover:text-sky-400 focus-visible:text-sky-400'}`}
                aria-label={`Comment, ${post.comments} comments`}
              >
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs tabular-nums">{post.comments}</span>
              </button>
              <button
                onClick={() => onRepost(post.id)}
                className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-emerald-400 focus-visible:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`Repost, ${post.reposts} reposts`}
              >
                <Repeat2 className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs tabular-nums">{post.reposts}</span>
              </button>
              <button
                onClick={handleShare}
                className="ml-auto relative text-muted-foreground transition-colors hover:text-brand-400 focus-visible:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={copied ? 'Copied!' : 'Share'}
              >
                <Share2 className="h-4 w-4" strokeWidth={1.5} />
                {copied && (
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-elevated px-2 py-0.5 text-[10px] font-medium text-foreground shadow-lg">
                    Copied
                  </span>
                )}
              </button>
            </>
          )}
        </div>
        {commentOpen && !readOnly && <InlineCommentPanel postId={post.id} postAuthor={post.author} postService={'public_posts'} />}
      </div>
    </Card>
  );
}

function TrendingSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <Card
      data-testid="trending-skeleton"
      className={['bg-surface', featured ? 'sm:col-span-2' : ''].join(' ')}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-5/6" />
            <Skeleton className="mt-1.5 h-4 w-3/4" />
          </div>
        </div>
        <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg">
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
    </Card>
  );
}

async function fetchDiscoverFeed(sort: 'recent' | 'trending', limit = 6): Promise<DiscoveryPost[]> {
  const resp = await fetch(`${API_ORIGIN}/discover/posts`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { sort, limit, services: 'public_posts' } }),
  });
  if (!resp.ok) return [];
  return resp.json();
}

// ── YouTubeCard (D-trending-views) ──────────────────────────────────────────
//
// YouTube-style card: 16:9 thumbnail, title + author + meta row below.
// Used in the YouTube view of /trending — media posts only.

interface YouTubeCardProps {
  post: FeedPost;
  rank?: number;
}

function YouTubeCard({ post, rank }: YouTubeCardProps) {
  const hasMedia = post.media && post.author && post.mediaRefs;
  const postPermalink = post.author
    ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(post.author)}/p/${encodeURIComponent(post.id)}`
    : SOCIAL_ORIGIN;
  const authorPermalink = post.author
    ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(post.author)}`
    : SOCIAL_ORIGIN;

  return (
    <a
      data-testid="youtube-card"
      id={`youtube-card-${post.id}`}
      href={postPermalink}
      target="_blank"
      rel="noopener"
      className="group/yt"
    >
      {/* 16:9 thumbnail */}
      <div className="relative overflow-hidden rounded-xl bg-elevated">
        {hasMedia ? (
          <TrendingMedia
            author={post.author}
            mediaRefs={post.mediaRefs}
            mediaType={post.media}
            firstAttachmentMime={post.firstAttachmentMime}
            postId={post.id}
          />
        ) : (
          <div className="aspect-video w-full flex items-center justify-center bg-elevated">
            {post.media === 'video' ? (
              <Film className="h-8 w-8 text-muted-foreground/40" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
            )}
          </div>
        )}
        {/* Duration badge (shows post age as a time-like badge — YouTube pattern) */}
        <div className="absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-sm">
          {post.time}
        </div>
        {rank !== undefined && rank <= 3 && (
          <div className="absolute top-2 left-2">
            <RankBadge rank={rank} />
          </div>
        )}
      </div>

      {/* Metadata row: avatar + title + channel info */}
      <div className="mt-2.5 flex gap-2.5">
        <Avatar className={cn(post.avatarColor, 'h-9 w-9')}>
          <AvatarFallback className="text-foreground">{post.initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover/yt:text-brand-400">
            {post.content || `${post.name}'s post`}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="text-xs text-muted-foreground transition-colors group-hover/yt:text-foreground">
              {post.name}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{post.time} ago</span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" strokeWidth={1.5} />
              {post.likes}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" strokeWidth={1.5} />
              {post.comments}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}

function YouTubeSkeleton() {
  return (
    <div data-testid="youtube-skeleton">
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

export { TrendingCard, TrendingSkeleton, YouTubeCard, YouTubeSkeleton, fetchDiscoverFeed, mapDiscoveryToFeedPost, formatCount, parseCount, type FeedPost, type DiscoveryPost };