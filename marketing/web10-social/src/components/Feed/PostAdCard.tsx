import { useEffect, useState } from 'react';
import { Megaphone, Radio, ExternalLink, Heart } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { resolveMediaRefs, countReactions, readReactions, toggleReactionKind } from '@/data';
import { getWapi } from '@/data/wapi';
import type { AdRecord, MediaRecord } from '@/data/types';
import { cn } from '@/lib/utils';
import { toast, errorMessage } from '@/components/shared/Toast';
import { VideoPlayer, sourceFromMedia } from './VideoPlayer';

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

/**
 * The post-format ad (ad-improvements.md) — a full post-like card. Unlike the
 * compact `AdBlock` (inline format), a post ad "looks like a post": it carries
 * the creative media (image/video), the copy, the offer CTA (the link that
 * pays), the disclosure, the provenance badge (Ad / Sponsored), and a like.
 *
 * It is ATTACHED to a post at read time (the `ad_preference` / `attach_node_ads`
 * join) and is **never** a standalone ranked feed post. It renders per its
 * `variant` (creator = violet, node = amber "Sponsored"), the same dressing as
 * the inline `AdBlock`.
 *
 * Two renderings of the same attached ad:
 * - **standalone** (the default) — the ad is its own card in the stream,
 *   **next in line after the post it's attached to**: full feed-card chrome
 *   (the post header with the provenance badge + author + time, the media, the
 *   copy, the offer, the like + disclosure row). Nothing about it indicates it
 *   is pinned to another post — it reads as just another post that happens to
 *   be an ad (the Meta/Instagram "sponsored post" model).
 * - **attached** (`standalone={false}`) — the compact variant rendered inside
 *   the post it's attached to (the card's own ad slot): the provenance strip
 *   + media + copy + offer + like, wrapped in the attachment ring.
 */
export function PostAdCard({ ad, className, standalone = true }: { ad: AdRecord; className?: string; standalone?: boolean }) {
  const isNode = ad.variant === 'node';
  // The horizontal rhythm: the standalone feed card aligns its offer + like
  // rows to the header/copy (px-4); the compact attached card keeps px-3.
  const padX = standalone ? 'px-4' : 'px-3';
  const [mediaItems, setMediaItems] = useState<MediaRecord[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);

  // Resolve the ad's creative media (the API serves it pre-resolved on read;
  // resolveMediaRefs handles both resolved objects and bare doc_ids).
  useEffect(() => {
    let live = true;
    if (!ad.media_refs?.length) {
      setMediaItems([]);
      return;
    }
    resolveMediaRefs(ad.media_refs)
      .then((m) => { if (live) setMediaItems(m); })
      .catch(() => { if (live) setMediaItems([]); });
    return () => { live = false; };
  }, [ad._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The like count + the reader's own like (a post ad is a `posts` doc, so
  // reactions work like any post).
  useEffect(() => {
    let live = true;
    if (!ad._id) return;
    countReactions('posts', ad._id)
      .then((n) => { if (live) setLikeCount(n); })
      .catch(() => {});
    readReactions('posts', ad._id)
      .then((rs) => {
        if (!live) return;
        const token = getWapi().readToken();
        setLiked(rs.some((r) => r.author_username === token?.username));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [ad._id]);

  const handleLike = async () => {
    if (!ad._id || liking) return;
    setLiking(true);
    try {
      await toggleReactionKind(ad._id, 'like', undefined, 'posts');
      const n = await countReactions('posts', ad._id);
      setLikeCount(n);
      const token = getWapi().readToken();
      const rs = await readReactions('posts', ad._id);
      setLiked(rs.some((r) => r.author_username === token?.username));
    } catch (e) {
      toast.error(errorMessage(e, 'Could not like this ad.'));
    } finally {
      setLiking(false);
    }
  };

  const media = mediaItems[0];
  const authorLabel = isNode ? (ad.author_username || 'this node') : `@${ad.author_username || 'creator'}`;

  // The provenance badge (Ad / Sponsored) — the one thing that marks it as an
  // ad. In standalone mode it sits in the post header (next to the author); in
  // attached mode it leads the compact strip.
  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide',
        isNode ? 'bg-warning/15 text-warning border-warning/30' : 'bg-brand-muted text-brand-300 border-brand/30',
      )}
      data-testid="post-ad-badge"
    >
      {isNode ? <Radio className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" /> : <Megaphone className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />}
      {isNode ? 'Sponsored' : 'Ad'}
    </span>
  );

  // The offer — partner + CTA (the link that pays).
  const offer = ad.offer?.link ? (
    <div className={cn('flex items-center gap-2 py-3', padX)}>
      {ad.offer.partner && !isNode && (
        <span className="text-xs font-medium text-muted-foreground truncate" data-testid="post-ad-partner">
          {ad.offer.partner}
        </span>
      )}
      <Button
        asChild
        variant={isNode ? 'brand_subtle' : 'brand'}
        size="sm"
        className={cn('gap-1.5', !ad.offer.partner || isNode ? 'ml-auto' : '')}
        data-testid="post-ad-cta"
      >
        <a href={ad.offer.link} target="_blank" rel="noopener noreferrer">
          {ad.offer.cta || 'Learn more'}
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
        </a>
      </Button>
    </div>
  ) : null;

  // The like + the disclosure (part of the object, never hidden).
  const likeRow = (
    <div className={cn('flex items-center gap-3 pb-3', padX)}>
      <button
        type="button"
        onClick={handleLike}
        disabled={liking}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
          liked ? 'text-danger' : 'text-muted-foreground hover:text-foreground',
        )}
        data-testid="post-ad-like"
        aria-label="Like this ad"
      >
        <Heart className={cn('w-4 h-4', liked && 'fill-current')} strokeWidth={2} />
        <span className="tabular-nums">{likeCount}</span>
      </button>
      {ad.offer?.disclosure && (
        <span className="text-[0.6875rem] text-muted-foreground" data-testid="post-ad-disclosure">
          {ad.offer.disclosure}
          <span className="text-muted-foreground/60">
            {' '}· {authorLabel}
          </span>
        </span>
      )}
    </div>
  );

  if (!standalone) {
    return (
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border bg-surface',
          isNode ? 'ring-1 ring-warning/15' : 'ring-1 ring-brand/15',
          className,
        )}
        data-testid="post-ad-card"
        data-ad-variant={isNode ? 'node' : 'creator'}
      >
        {/* The identity strip — the provenance badge + who made it. */}
        <div className={cn('flex items-center gap-2 px-3 py-2 border-b', isNode ? 'bg-warning/10 border-warning/25' : 'bg-brand-muted/40 border-brand/20')}>
          {badge}
          <span className={cn('truncate text-[0.75rem] font-medium', isNode ? 'text-warning' : 'text-brand-300')} data-testid="post-ad-author">
            {authorLabel}
          </span>
        </div>
        {media && <PostAdMedia media={media} />}
        {ad.text && (
          <p className="px-3 pt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {ad.text}
          </p>
        )}
        {offer}
        {likeRow}
      </div>
    );
  }

  // Standalone — the ad as its own card in the stream, next in line after the
  // post it's attached to. Full feed-card chrome; nothing indicates the pin.
  return (
    <article
      className={cn(
        'bg-card border-b border-border md:border md:rounded-lg md:mb-4 overflow-hidden',
        'glow-card transition-all duration-150',
        className,
      )}
      data-testid="post-ad-card"
      data-ad-variant={isNode ? 'node' : 'creator'}
      data-ad-standalone="true"
    >
      {/* The post header — the provenance badge + who made it (+ when, when the
          read carried the ad doc's created_at). */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className={cn('text-sm font-semibold', isNode ? 'bg-warning/15 text-warning' : 'bg-brand-muted text-brand-300')}>
            {authorLabel.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <span className={cn('font-medium text-sm truncate', isNode ? 'text-warning' : 'text-brand-300')} data-testid="post-ad-author">
            {authorLabel}
          </span>
          {ad.created_at && (
            <span className="text-[0.8125rem] text-muted-foreground shrink-0">· {formatTimeAgo(ad.created_at)}</span>
          )}
        </div>
        {badge}
      </div>

      {/* The creative — the media leads (like a post). */}
      {media && <PostAdMedia media={media} />}

      {/* The copy. */}
      {ad.text && (
        <div className="px-4 pt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {ad.text}
        </div>
      )}

      {offer}
      {likeRow}
    </article>
  );
}

/**
 * The post ad's creative media — rendered the SAME way the feed renders a
 * post's media (the "looks like a post" promise, ad-improvements.md). A video
 * rides the shared `<VideoPlayer>` (the hls.js rack for transcoded, the
 * tap-to-play inline surface otherwise) — the ad is a `posts` doc, so its
 * media is a normal media record. An image FILLS the frame (`object-cover`,
 * the same fill the discover card uses) so it reads as a polished creative —
 * never a letterboxed sliver in a wide card. The frame is the media's natural
 * ratio, capped so a portrait creative can't blow up the card.
 */
function PostAdMedia({ media }: { media: MediaRecord }) {
  const isVideo = media.mime_type?.startsWith('video/');

  if (isVideo) {
    const source = sourceFromMedia(media);
    return (
      <VideoPlayer
        source={source}
        mode={source.type === 'hls' ? 'full' : 'inline'}
        fit="contain"
        maxHeight="60vh"
        testId="post-ad-media-video"
      />
    );
  }

  const knownRatio = media.width && media.height ? media.width / media.height : null;
  const ratio = knownRatio ?? 16 / 9;
  const containerStyle: React.CSSProperties = { aspectRatio: `${ratio}`, maxHeight: '60vh' };
  return (
    <div className="w-full bg-elevated overflow-hidden relative" style={containerStyle} data-testid="post-ad-media-image">
      <img
        src={media.thumbnail_url || media.url}
        alt={media.alt_text || ''}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
}
