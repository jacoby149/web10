import type { ReactNode } from 'react';
import { Share2, Image as ImageIcon, Film, Music2 } from 'lucide-react';
import { cn, hashToColor, timeAgo } from './utils';
import { Avatar, AvatarFallback, Badge } from './ui';
import { RankBadge, heatTier, HEAT_SHADOW } from './RankBadge';
import { VideoPlayer, sourceFromMedia } from './VideoPlayer';
import { MediaCarousel } from './MediaCarousel';
import { PostActions, type ReactionKind } from './PostActions';
import type { DiscoverPost, MediaItem, ReadComments, CreateComment } from './types';

/**
 * The shared discover card (D73) — the one both apps' discover surfaces
 * compose. The social app's DiscoverCard is the foundation (it's the better,
 * working one); the marketing /trending card adopts it. One source, two apps —
 * the discover feature is the same on both, so it can't drift.
 *
 * Two modes:
 *   interactive (web10-social, logged in) — full PostActions (like toggles,
 *     comment compose), author click navigates in-app.
 *   remote (marketing-ui, anon) — the like is display-only, the comment
 *     compose is a link-out to the post permalink, and author/post clicks
 *     open web10 social. The read side (video, counts, comment list, rank,
 *     glow) is identical — "see comments on both."
 *
 * The data layer is injected (readComments / createComment / onToggleReaction)
 * so the card runs on either app's data without the package knowing about it.
 */

interface MediaPlaceholderProps {
  type: 'image' | 'video' | 'music';
}

function MediaPlaceholder({ type }: MediaPlaceholderProps) {
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

/**
 * The discover card's single-video media — rendered the SAME way the feed
 * renders a video (video-player.md): natural ratio, `object-contain` (never
 * crops), capped so a portrait clip can't blow up the card. Transcoded (hls)
 * video gets the full control rack (`mode="full"`); the direct-file fallback
 * keeps the tap-to-play inline surface. This is what makes a 9:16 clip on
 * Discover look like the same product as one in the feed — no letterbox
 * borders, no center-crop.
 */
function DiscoverVideo({ media }: { media: MediaItem }) {
  const source = sourceFromMedia(media);
  return (
    <VideoPlayer
      source={source}
      mode={source.type === 'hls' ? 'full' : 'inline'}
      fit="contain"
      maxHeight="60vh"
      testId="discover-media-video"
    />
  );
}

export interface DiscoverCardProps {
  post: DiscoverPost;
  rank: number;
  maxScore: number;
  authorAvatar?: string;
  /** Remote (marketing) mode: anon, click-through to web10 social. */
  remote?: boolean;
  /** The post permalink on web10 social (remote mode's link-out target). */
  postHref?: string;
  /** The author profile permalink on web10 social (remote mode). */
  authorHref?: string;
  /** Interactive mode: the reaction writer (like/dislike). */
  onToggleReaction?: (kind: ReactionKind) => void;
  /** Interactive mode: the reader's own like state. */
  liked?: boolean;
  disliked?: boolean;
  /** Interactive mode: the reader's own repost state (the repeat icon fills). */
  reposted?: boolean;
  /** Interactive mode: the repost writer (reposts.md — independent of like). */
  onToggleRepost?: () => void;
  /** The comment reader (injected — the data seam). */
  readComments?: ReadComments;
  /** The comment writer (injected; absent in remote mode). */
  createComment?: CreateComment;
  /** Error sink (the app wires its toast). */
  onError?: (message: string) => void;
  /** The group the post lives in (group posts). */
  groups?: string[];
  /** The post service (default 'posts'). */
  postService?: string;
  /** Interactive mode: the author-click handler (in-app profile navigation).
   *  In remote mode the author is a link-out to web10 social instead. */
  onAuthorClick?: () => void;
  /** A DOM id for the card (the marketing page uses it for card ordering). */
  id?: string;
  className?: string;
  testId?: string;
}

export function DiscoverCard({
  post,
  rank,
  maxScore,
  authorAvatar,
  remote = false,
  postHref,
  authorHref,
  onToggleReaction,
  liked = false,
  disliked = false,
  reposted = false,
  onToggleRepost,
  readComments,
  createComment,
  onError,
  groups,
  postService = 'posts',
  onAuthorClick,
  id,
  className,
  testId = 'discover-card',
}: DiscoverCardProps) {
  const tier = heatTier(post.score ?? 0, maxScore);
  const derivedName = (post.author_username || post.author).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const displayName = post.display_name || derivedName;
  const initial = (post.author_username || post.author).charAt(0).toUpperCase();
  const avatarColor = hashToColor(post.author_username || post.author);

  const mediaItems: MediaItem[] = post.media || [];
  const firstMedia = mediaItems[0];
  const isVideoMedia = firstMedia?.mime_type?.startsWith('video/');
  const mediaType = post.tags?.includes('video')
    ? 'video'
    : post.tags?.includes('music')
      ? 'music'
      : mediaItems.length > 0
        ? (isVideoMedia ? 'video' : 'image')
        : undefined;

  // The author + post are click-throughs in remote mode (open web10 social);
  // in interactive mode the surface wires onAuthorClick (in-app navigation).
  const authorIsLink = remote && !!authorHref;
  const postIsLink = remote && !!postHref;

  const authorInner = (
    <>
      <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
      <span className="truncate text-sm text-muted-foreground">@{post.author_username || post.author}</span>
    </>
  );

  return (
    <article
      data-testid={testId}
      id={id}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border bg-card transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-border/80',
        'focus-within:-translate-y-0.5 focus-within:border-border/80',
        'motion-reduce:transform-none',
        HEAT_SHADOW[tier],
        className,
      )}
    >
      <div className="p-4">
        {/* Header: rank + time */}
        <div className="flex items-center justify-between gap-2">
          <RankBadge rank={rank} />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {timeAgo(post.created_at)}
          </span>
        </div>

        {/* Author row */}
        <div className="mt-3 flex items-start gap-3">
          {authorIsLink ? (
            <a
              href={authorHref}
              target="_blank"
              rel="noopener"
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`View ${displayName}'s profile`}
            >
              <Avatar className={cn('h-9 w-9', avatarColor)}>
                {authorAvatar ? (
                  <img src={authorAvatar} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="text-sm font-semibold">{initial}</AvatarFallback>
                )}
              </Avatar>
            </a>
          ) : onAuthorClick ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAuthorClick(); }}
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`View ${displayName}'s profile`}
            >
              <Avatar className={cn('h-9 w-9', avatarColor)}>
                {authorAvatar ? (
                  <img src={authorAvatar} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="text-sm font-semibold">{initial}</AvatarFallback>
                )}
              </Avatar>
            </button>
          ) : (
            <Avatar className={cn('h-9 w-9', avatarColor)}>
              {authorAvatar ? (
                <img src={authorAvatar} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <AvatarFallback className="text-sm font-semibold">{initial}</AvatarFallback>
              )}
            </Avatar>
          )}
          <div className="min-w-0 flex-1">
            {authorIsLink ? (
              <a
                href={authorHref}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-1.5 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {authorInner}
              </a>
            ) : onAuthorClick ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAuthorClick(); }}
                className="flex items-center gap-1.5 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {authorInner}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 truncate text-left">{authorInner}</div>
            )}
            {post.text && (
              postHref ? (
                // Remote mode: the post text is a link-out to the post on web10
                // social (clicking the post takes you there — the anon visitor
                // can't interact, so the card is a preview + link-out).
                <a
                  href={postHref}
                  target="_blank"
                  rel="noopener"
                  className="mt-1 block line-clamp-3 text-sm leading-relaxed text-foreground transition-colors hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {post.text}
                </a>
              ) : (
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-foreground">
                  {post.text}
                </p>
              )
            )}
          </div>
        </div>

        {/* Media */}
        {mediaType && (
          <div className="mt-3 overflow-hidden rounded-md">
            {mediaItems.length > 1 ? (
              <MediaCarousel
                items={mediaItems}
                fit="cover"
                ratio={16 / 9}
                testId="discover-media-carousel"
              />
            ) : isVideoMedia && firstMedia?.url ? (
              <DiscoverVideo media={firstMedia} />
            ) : mediaType === 'image' && mediaItems.length > 0 ? (
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
        {post.tags && post.tags.filter((t) => !['image', 'video', 'music'].includes(t)).length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags
              .filter((t) => !['image', 'video', 'music'].includes(t))
              .slice(0, 4)
              .map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full bg-brand-muted/60 text-brand-300 border border-brand/10"
                >
                  #{tag}
                </span>
              ))}
          </div>
        ) : null}
      </div>

      {/* Engagement bar (post-actions.md): the shared row + Discover's own
          repost/share signal (trailing). Interactive mode (web10-social): the
          board takes live reactions (the like/dislike pair, the same way of
          reacting as the feed). Remote mode (marketing-ui, anon): the like is
          display-only (an anon visitor can't like) + no dislike. Outside the
          p-4 wrapper so the bar's divider spans the card. */}
      <PostActions
        postId={post.id}
        liked={liked}
        disliked={disliked}
        reactionCount={post.likes ?? 0}
        dislikeCount={post.dislikes ?? 0}
        commentCount={post.comments ?? 0}
        like={remote ? 'display' : 'interactive'}
        dislike={remote ? 'none' : 'interactive'}
        repost="interactive"
        reposted={reposted}
        repostCount={post.reposts ?? 0}
        onToggleRepost={onToggleRepost}
        layout="bar"
        testId="discover-post-actions"
        postAuthor={post.author_username || post.author}
        postService={postService}
        groups={groups}
        readComments={readComments}
        createComment={createComment}
        remote={remote}
        remoteHref={postHref}
        onError={onError}
        onToggleReaction={onToggleReaction}
        trailing={
          <span className="ml-auto text-muted-foreground" aria-label="Share">
            <Share2 className="h-4 w-4" strokeWidth={1.5} />
          </span>
        }
      />
    </article>
  );
}
