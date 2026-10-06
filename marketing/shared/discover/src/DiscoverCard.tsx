import { useEffect, useState, type ReactNode } from 'react';
import { Image as ImageIcon, Film, Music2, Repeat2 } from 'lucide-react';
import { cn, hashToColor } from './utils';
import { Avatar, AvatarFallback, Skeleton } from './ui';
import { VideoPlayer, sourceFromMedia } from './VideoPlayer';
import { MediaCarousel } from './MediaCarousel';
import { PostActions, type ReactionKind } from './PostActions';
import type { DiscoverPost, MediaItem, ReadComments, ReadReplies, CreateComment, DiscoverAd, RepostOriginal, ReadRepostOriginal } from './types';

// The card's time-ago line — the social feed's `formatTimeAgo` (now / 42m / 3h /
// 5d / a date past a week), not the shared util's bare "2h". The discover board
// is the feed's PostCard now, so its chrome reads the same.
function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return '';
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

/**
 * The shared discover card (D73) — the one both apps' discover surfaces
 * compose. It renders the feed's PostCard shape (the X-style card: flat,
 * bottom-divided, full-bleed media, compact muted engagement row) — the social
 * app's Discover board runs the feed's PostCard, and the marketing /trending
 * card adopts the same shape. One source, two apps — the discover feature is
 * the same on both, so it can't drift.
 *
 * Two modes:
 *   interactive (web10-social, logged in) — full PostActions (like toggles,
 *     comment compose), author click navigates in-app.
 *   remote (marketing-ui, anon) — the like is display-only, the comment
 *     compose is a link-out to the post permalink, and author/post clicks
 *     open web10 social. The read side (video, counts, comment list) is
 *     identical — "see comments on both."
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
 * crops), full-bleed in the card (no letterbox gutters, no phone-width
 * column). Transcoded (hls) video gets the full control rack (`mode="full"`);
 * the direct-file fallback keeps the tap-to-play inline surface (with the same
 * rack, so both paths show controls). This is what makes a 9:16 clip on
 * Discover look like the same product as one in the feed — no borders, no
 * center-crop, controls on both.
 *
 * A portrait (9:16) clip is capped to a square-ish frame (`maxHeight`) and
 * centered in a black letterbox — a full-width 9:16 box is ~1.78× the card
 * tall, which in a card grid (marketing /trending) dwarfs the card and buries
 * the control rack at its bottom. The cap keeps the whole clip + the rack in
 * view. Absent (the social single-column feed) → full-bleed, unchanged.
 */
function DiscoverVideo({ media, maxHeight }: { media: MediaItem; maxHeight?: string }) {
  const source = sourceFromMedia(media);
  return (
    <VideoPlayer
      source={source}
      mode={source.type === 'hls' ? 'full' : 'inline'}
      fit="contain"
      maxHeight={maxHeight}
      testId="discover-media-video"
    />
  );
}

/**
 * The discover card's single photo — the feed's `MediaItem` image shape
 * (feed/discover are the same surface now): the frame is reserved at the
 * media's natural ratio (no layout shift), the photo FILLs it (`object-cover`),
 * and a portrait (9:16) photo is the "photobox" — centered in a FULL-WIDTH
 * BLACK box with black bars on the sides (the same shape the feed's portrait
 * photo + the video player's capped frame produce). A landscape photo is
 * full-width (no cap, no letterbox).
 */
function DiscoverImage({ media, maxHeight }: { media: MediaItem; maxHeight?: string }) {
  const ratio = media.width && media.height ? media.width / media.height : 4 / 3;
  const heightCapped = !!maxHeight && ratio < 1;
  const frame = (
    <div
      className={cn('bg-elevated overflow-hidden relative', heightCapped && 'mx-auto')}
      style={{ aspectRatio: `${ratio}`, maxHeight }}
      data-testid="discover-media-image"
    >
      <img
        src={media.thumbnail_url || media.url}
        alt={media.alt_text || ''}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
  if (heightCapped) {
    return (
      <div className="w-full bg-black">
        {frame}
      </div>
    );
  }
  return frame;
}

/**
 * The embedded original post inside a repost card (reposts.md) — the X/Twitter
 * quote-tweet layout, shared by both apps' discover surfaces. Fetches the
 * original by `repost_of` doc_id through the injected `readRepostOriginal` seam
 * and renders it as a nested, read-only block (author, text, media). I3: the
 * reader must be able to read the original — a post the reader can't read
 * degrades to an "unavailable" placeholder (a repost never grants access to the
 * original). Absent `readRepostOriginal` (a surface that doesn't resolve
 * reposts) → nothing renders.
 */
function RepostEmbed({
  repostOf,
  readRepostOriginal,
  onAuthorClick,
}: {
  repostOf: string;
  readRepostOriginal?: ReadRepostOriginal;
  onAuthorClick?: (username: string, provider?: string) => void;
}) {
  const [original, setOriginal] = useState<RepostOriginal | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    if (!readRepostOriginal) {
      setState('unavailable');
      return;
    }
    let cancelled = false;
    setState('loading');
    readRepostOriginal(repostOf)
      .then((o) => {
        if (cancelled) return;
        setOriginal(o);
        setState(o ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [repostOf, readRepostOriginal]);

  if (state === 'loading') {
    return (
      <div className="mt-3 rounded-lg border border-border bg-elevated/40 p-3" data-testid="repost-embed-loading">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </div>
    );
  }

  if (state === 'unavailable' || !original) {
    return (
      <div
        className="mt-3 rounded-lg border border-border bg-elevated/40 px-3 py-2.5 text-sm text-muted-foreground"
        data-testid="repost-embed-unavailable"
      >
        Original post unavailable
      </div>
    );
  }

  const username = original.author_username || '';
  const derivedName = username.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const displayName = original.display_name || derivedName;
  const initial = (username || '?').charAt(0).toUpperCase();
  const avatarColor = hashToColor(username || '?');
  const media = original.media || [];
  const first = media[0];
  const isVideo = first?.mime_type?.startsWith('video/');

  return (
    <div className="mt-3 rounded-lg border border-border bg-elevated/30 overflow-hidden" data-testid="repost-embed">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar className={`h-8 w-8 ${avatarColor}`}>
          {original.avatar_url ? (
            <img src={original.avatar_url} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <AvatarFallback className="text-xs font-semibold">{initial}</AvatarFallback>
          )}
        </Avatar>
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          {username && onAuthorClick ? (
            <button
              type="button"
              className="truncate text-sm font-semibold text-foreground hover:text-brand-300 transition-colors duration-150"
              onClick={() => onAuthorClick(username)}
              aria-label={`View ${displayName}'s profile`}
              data-testid="repost-embed-author-link"
            >
              {displayName}
            </button>
          ) : (
            <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
          )}
          {original.created_at && (
            <span className="shrink-0 text-xs text-muted-foreground">· {formatTimeAgo(original.created_at)}</span>
          )}
        </div>
      </div>
      {original.text ? (
        <div className="px-3 pb-2.5 text-sm text-foreground line-clamp-6">{original.text}</div>
      ) : null}
      {media.length > 0 && (
        <div className="pb-2">
          {media.length > 1 ? (
            <MediaCarousel items={media} fit="cover" ratio={16 / 9} testId="repost-embed-carousel" />
          ) : isVideo && first?.url ? (
            <DiscoverVideo media={first} />
          ) : first?.url ? (
            <div className="aspect-[4/3] w-full overflow-hidden rounded-md">
              <img
                src={first.thumbnail_url || first.url}
                alt={first.alt_text || ''}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export interface DiscoverCardProps {
  post: DiscoverPost;
  /** The post's rank on the board (kept for the card's identity / deep links;
   *  the board's Top 10 rail carries the visible rank, not the card). */
  rank?: number;
  /** The board's max score (the heat-glow tier was retired with the card's
   *  floating shape — the rank lives in the rail now). */
  maxScore?: number;
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
  /** The comment reader (injected — the data seam). Paged (comments.md). */
  readComments?: ReadComments;
  /** The reply reader for "view more replies" (injected; paged). */
  readReplies?: ReadReplies;
  /** The comment writer (injected; absent in remote mode). */
  createComment?: CreateComment;
  /** The repost-embed original reader (injected; absent → no repost embed).
   *  Resolves `post.repost_of` to the original's author / text / media. */
  readRepostOriginal?: ReadRepostOriginal;
  /** Error sink (the app wires its toast). */
  onError?: (message: string) => void;
  /** The group the post lives in (group posts). */
  groups?: string[];
  /** The post service (default 'posts'). */
  postService?: string;
  /** Interactive mode: the author-click handler (in-app profile navigation).
   *  In remote mode the author is a link-out to web10 social instead. */
  onAuthorClick?: () => void;
  /** The comment-author-click handler (in-app profile navigation) — a comment's
   *  author is a tappable profile link, distinct from the card's own author. */
  onCommentAuthorClick?: (username: string, provider?: string) => void;
  /**
   * The attached-ad renderer (ad-improvements.md). When present, the card
   * renders the post's attached ads (`post.ad` / `post.node_ad`) via this seam,
   * each per its `format` (the app decides inline block vs full post). Absent
   * (e.g. marketing-ui's anon surface) → no ads render. The shared package is
   * presentational and doesn't know the app's ad components.
   */
  renderAd?: (ad: DiscoverAd) => ReactNode;
  /** A DOM id for the card (the marketing page uses it for card ordering). */
  id?: string;
  className?: string;
  testId?: string;
  /**
   * Cap a portrait (9:16) media frame's height (the card-grid case). A full-
   * width 9:16 box is ~1.78× the card tall and buries the video's control
   * rack; the cap centers a square-ish frame in a black letterbox (the
   * "photobox"). The social single-column feed leaves this unset (full-bleed,
   * unchanged). Applies to a single video AND a single portrait photo.
   */
  mediaMaxHeight?: string;
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
  readReplies,
  createComment,
  readRepostOriginal,
  onError,
  groups,
  postService = 'posts',
  onAuthorClick,
  onCommentAuthorClick,
  renderAd,
  id,
  className,
  testId = 'discover-card',
  mediaMaxHeight,
}: DiscoverCardProps) {
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

  // The media's portrait cap: a single video or a single portrait photo is
  // capped to a square-ish frame (centered in a black letterbox) when the
  // surface sets `mediaMaxHeight` (the card-grid case). A multi-item carousel
  // is capped by its frame's natural ratio (the first item's) — the same rule.
  const isPortrait = (m: MediaItem) => !!m.width && !!m.height && m.width < m.height;
  const mediaCap = (m: MediaItem) =>
    mediaMaxHeight && isPortrait(m) ? mediaMaxHeight : undefined;

  return (
    <article
      data-testid={testId}
      id={id}
      className={cn(
        'bg-card border-b border-border overflow-hidden',
        className,
      )}
    >
      {/* Header: avatar + name + time + repost tell (the feed's PostCard row). */}
      <div className="flex items-center gap-2.5 px-4 py-3">
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
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          {authorIsLink ? (
            <a
              href={authorHref}
              target="_blank"
              rel="noopener"
              className="truncate text-sm font-medium text-foreground transition-colors duration-150 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {displayName}
            </a>
          ) : onAuthorClick ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAuthorClick(); }}
              className="truncate text-sm font-medium text-foreground transition-colors duration-150 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {displayName}
            </button>
          ) : (
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          )}
          <span className="shrink-0 text-[0.8125rem] text-muted-foreground">
            · {formatTimeAgo(post.created_at)}
          </span>
          {/* Repost (reposts.md): the "reposted" tell in the header (the feed's
              PostCard puts it here, not under the name). */}
          {post.repost_of && (
            <span
              className="flex shrink-0 items-center gap-1 text-[0.8125rem] text-brand-300"
              data-testid="repost-badge"
            >
              <Repeat2 className="h-3.5 w-3.5" strokeWidth={2} />
              reposted
            </span>
          )}
        </div>
      </div>

      {/* Repost (reposts.md): the reposter's comment (the quote) sits above the
          embedded original — the X/Twitter quote-tweet layout. A repost carries
          no media of its own; the original's media lives in the embed. */}
      {post.repost_of && post.text ? (
        <div className="px-4 pt-3 text-sm text-foreground">
          <p className="leading-relaxed">{post.text}</p>
        </div>
      ) : null}
      {post.repost_of && (
        <RepostEmbed
          repostOf={post.repost_of}
          readRepostOriginal={readRepostOriginal}
          onAuthorClick={onAuthorClick ? () => onAuthorClick() : undefined}
        />
      )}

      {/* Media — full-bleed (no rounded wrapper, no card padding), the feed's
          PostCard shape. A single video / portrait photo is capped to a square
          frame in a black letterbox when `mediaMaxHeight` is set. */}
      {mediaType && (
        mediaItems.length > 1 ? (
          <MediaCarousel
            items={mediaItems}
            fit="cover"
            maxHeight={mediaMaxHeight}
            testId="discover-media-carousel"
          />
        ) : isVideoMedia && firstMedia?.url ? (
          <DiscoverVideo media={firstMedia} maxHeight={mediaCap(firstMedia)} />
        ) : mediaType === 'image' && mediaItems.length > 0 ? (
          <DiscoverImage media={firstMedia} maxHeight={mediaCap(firstMedia)} />
        ) : (
          <div className="p-4">
            <MediaPlaceholder type={mediaType} />
          </div>
        )
      )}

      {/* Title + caption (D82) — the feed's PostCard order (title heading, then
          caption). A repost's caption is the quote (shown above the embed).
          Remote mode: the caption is a link-out to the post on web10 social. */}
      {(post.title || (post.text && !post.repost_of)) && (
        <div className="px-4 pt-3">
          {post.title && (
            <h3 className="mb-1 text-base font-semibold leading-snug text-foreground" data-testid="discover-card-title">
              {post.title}
            </h3>
          )}
          {post.text && !post.repost_of ? (
            postHref ? (
              <a
                href={postHref}
                target="_blank"
                rel="noopener"
                className="block text-sm leading-relaxed text-foreground transition-colors hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {post.text}
              </a>
            ) : (
              <p className="text-sm leading-relaxed text-foreground">{post.text}</p>
            )
          ) : null}
        </div>
      )}

      {/* Tags */}
      {post.tags && post.tags.filter((t) => !['image', 'video', 'music'].includes(t)).length ? (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
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

      {/* Attached ads (ad-improvements.md): the creator's pinned ad + the node's
          ad, each rendered per its format via the injected seam. `post`-format
          ads are SKIPPED here — they render as their own card in the stream.
          Absent `renderAd` → no ads (marketing). */}
      {renderAd && (
        (post.ad && post.ad.format !== 'post') ||
        (post.node_ad && post.node_ad.format !== 'post')
      ) && (
        <div className="px-4 pt-3 space-y-2" data-testid="discover-card-ads">
          {post.ad && post.ad.format !== 'post' && renderAd(post.ad)}
          {post.node_ad && post.node_ad.format !== 'post' && renderAd(post.node_ad)}
        </div>
      )}

      {/* Engagement row (post-actions.md): the feed's compact X-style row.
          Remote mode (marketing-ui, anon): the like is display-only (an anon
          visitor can't like) + no dislike. The comment thread mounts below the
          row, full-width (the feed's PostCard shape). */}
      <div className="flex items-center px-1 py-1">
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
          layout="compact"
          testId="discover-post-actions"
          postAuthor={post.author_username || post.author}
          postService={postService}
          groups={groups}
          readComments={readComments}
          readReplies={readReplies}
          createComment={createComment}
          remote={remote}
          remoteHref={postHref}
          onError={onError}
          onToggleReaction={onToggleReaction}
          onAuthorClick={onCommentAuthorClick}
        />
      </div>
    </article>
  );
}
