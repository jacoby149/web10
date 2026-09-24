import { Play, Film, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { cn, hashToColor, timeAgo } from './utils';
import { Avatar, AvatarFallback } from './ui';
import type { DiscoverPost, MediaItem } from './types';

/**
 * The Home card — the YouTube-style video card (the "Home" view, the default
 * view of the discover / trending surface). The operator's ask: "the youtube
 * view is preferable, less brainrot — the videos all have a good title, a
 * thumbnail, and the attribution of who put them up. Show the post text if it
 * is short enough, otherwise truncate to a char limit."
 *
 * Layout (top to bottom):
 *   1. a 16:9 thumbnail (the video's poster / first frame, `object-cover` —
 *      fills the frame, never letterboxes) with a play affordance + a duration
 *      badge;
 *   2. the title — the post text, truncated to `TITLE_LIMIT` chars with a
 *      trailing ellipsis (the "show it if it's short, else …" rule);
 *   3. the attribution — the author's avatar + display name + a relative time.
 *
 * Two modes (the same contract as DiscoverCard):
 *   interactive (web10-social, logged in) — the thumbnail + title link to the
 *     post's permalink (in-app), the author links to their profile, and a
 *     compact engagement row (like / comment / repost counts) is shown.
 *   remote (marketing-ui, anon) — the thumbnail + title link to the post on
 *     web10 social, the author links to their profile, and no engagement row
 *     (an anon visitor can't react).
 *
 * The data layer is injected (the app owns navigation) — the package is
 * presentational and knows nothing about wapi or the public ledger.
 */

/** The title's char limit (the "truncate to a certain char limit" rule). */
export const HOME_TITLE_LIMIT = 80;

/** Truncate a title to `limit` chars, adding a trailing ellipsis only when cut. */
export function truncateTitle(text: string, limit = HOME_TITLE_LIMIT): string {
  const t = (text ?? '').trim();
  if (t.length <= limit) return t;
  return `${t.slice(0, limit).trimEnd()}…`;
}

/** m:ss — the thumbnail's duration badge (the same shape the player uses). */
function formatDuration(seconds?: number): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface HomeCardProps {
  post: DiscoverPost;
  /** The author's avatar URL (the app resolves the profile's avatar ref). */
  authorAvatar?: string;
  /** The post permalink (the thumbnail + title link target). */
  postHref?: string;
  /** The author profile permalink (the attribution link target). */
  authorHref?: string;
  /** Interactive mode: the post-click handler (in-app navigation). */
  onPostClick?: () => void;
  /** Interactive mode: the author-click handler (in-app profile navigation). */
  onAuthorClick?: () => void;
  /** Remote (marketing) mode: anon, link-outs to web10 social. */
  remote?: boolean;
  /** A DOM id for the card. */
  id?: string;
  className?: string;
  /** The card's testid (the app keeps its own: `youtube-card`, …). */
  testId?: string;
  // ── Interactive engagement row (the social app wires these) ───────────────
  liked?: boolean;
  reposted?: boolean;
  onToggleReaction?: (kind: 'like' | 'dislike') => void;
  onToggleRepost?: () => void;
  onCommentClick?: () => void;
}

export function HomeCard({
  post,
  authorAvatar,
  postHref,
  authorHref,
  onPostClick,
  onAuthorClick,
  remote = false,
  id,
  className,
  testId = 'home-card',
  liked = false,
  reposted = false,
  onToggleReaction,
  onToggleRepost,
  onCommentClick,
}: HomeCardProps) {
  const username = post.author_username || post.author;
  const derivedName = username.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const displayName = post.display_name || derivedName;
  const initial = username.charAt(0).toUpperCase();
  const avatarColor = hashToColor(username);

  const title = truncateTitle(post.text || '') || displayName;

  const media: MediaItem | undefined = post.media?.[0];
  const isVideo = media?.mime_type?.startsWith('video/');
  const isImage = media?.mime_type?.startsWith('image/');
  const thumbSrc = media?.thumbnail_url || (isImage ? media?.url : undefined);
  const duration = isVideo ? formatDuration(media?.duration_seconds) : null;

  const interactive = !remote && !!onPostClick;
  const showEngagement = interactive && (
    (post.likes ?? 0) > 0 || (post.comments ?? 0) > 0 || (post.reposts ?? 0) > 0 ||
    !!onToggleReaction || !!onToggleRepost || !!onCommentClick
  );

  // The thumbnail + title open the post (the card's primary action). In
  // interactive mode the app navigates in-app; in remote mode it's a link-out.
  const openPost = (e: React.MouseEvent) => {
    if (interactive) {
      e.preventDefault();
      onPostClick?.();
    }
  };
  const postLinkProps = interactive
    ? { href: '#', onClick: openPost, 'aria-label': `Open post: ${title}` }
    : { href: postHref || '#', target: '_blank', rel: 'noopener', 'aria-label': `Open post: ${title}` };

  const openAuthor = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (interactive) onAuthorClick?.();
  };
  const authorLinkProps = interactive
    ? { href: '#', onClick: openAuthor, 'aria-label': `View ${displayName}'s profile` }
    : { href: authorHref || '#', target: '_blank', rel: 'noopener', 'aria-label': `View ${displayName}'s profile` };

  return (
    <article
      data-testid={testId}
      id={id}
      className={cn('group flex flex-col', className)}
    >
      {/* 1. The thumbnail — a 16:9 frame that fills the card width. */}
      <a
        {...postLinkProps}
        data-testid={`${testId}-thumb`}
        className="relative block aspect-video w-full overflow-hidden rounded-lg bg-elevated"
      >
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transform-none"
          />
        ) : isVideo ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-elevated to-background">
            <Film className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-elevated to-background" />
        )}

        {/* The play affordance (always visible — a thumbnail is a promise). */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/70 backdrop-blur-sm transition-transform duration-150 group-hover:scale-110 motion-reduce:transform-none">
              <Play className="ml-0.5 h-5 w-5 text-foreground" strokeWidth={2} fill="currentColor" />
            </div>
          </div>
        )}

        {/* The duration badge (bottom-right, the video's length). */}
        {duration && (
          <span
            data-testid={`${testId}-duration`}
            className="absolute bottom-1.5 right-1.5 rounded bg-background/85 px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums text-foreground"
          >
            {duration}
          </span>
        )}
      </a>

      {/* 2. The title — the post text, truncated to the char limit. The
          chunky YouTube scale: text-base (16px) bold, two lines. */}
      <a
        {...postLinkProps}
        data-testid={`${testId}-title`}
        className="mt-2.5 line-clamp-2 text-base font-semibold leading-snug text-foreground transition-colors hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        {title}
      </a>

      {/* 3. The attribution — the author's avatar + name + a relative time. */}
      <div className="mt-2 flex items-center gap-2.5">
        <a {...authorLinkProps} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className={cn('h-8 w-8', avatarColor)}>
            {authorAvatar ? (
              <img src={authorAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="text-xs font-semibold">{initial}</AvatarFallback>
            )}
          </Avatar>
        </a>
        <a
          {...authorLinkProps}
          className="min-w-0 flex-1 truncate text-sm text-foreground transition-colors hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          {displayName}
        </a>
        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
      </div>

      {/* 4. The compact engagement row (interactive mode only). */}
      {showEngagement && (
        <div className="mt-2.5 flex items-center gap-4 text-xs text-muted-foreground" data-testid={`${testId}-engagement`}>
          <button
            type="button"
            data-testid={`${testId}-like`}
            aria-label={liked ? 'Unlike' : 'Like'}
            onClick={(e) => { e.stopPropagation(); onToggleReaction?.('like'); }}
            className={cn('flex items-center gap-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded', liked && 'text-danger')}
          >
            <Heart className={cn('h-3.5 w-3.5', liked && 'fill-current')} strokeWidth={1.75} />
            {post.likes ?? 0}
          </button>
          <button
            type="button"
            data-testid={`${testId}-comment`}
            aria-label="Comment"
            onClick={(e) => { e.stopPropagation(); onCommentClick?.(); }}
            className="flex items-center gap-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
            {post.comments ?? 0}
          </button>
          <button
            type="button"
            data-testid={`${testId}-repost`}
            aria-label={reposted ? 'Remove repost' : 'Repost'}
            onClick={(e) => { e.stopPropagation(); onToggleRepost?.(); }}
            className={cn('flex items-center gap-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded', reposted && 'text-success')}
          >
            <Repeat2 className={cn('h-3.5 w-3.5', reposted && 'fill-current')} strokeWidth={1.75} />
            {post.reposts ?? 0}
          </button>
        </div>
      )}
    </article>
  );
}
