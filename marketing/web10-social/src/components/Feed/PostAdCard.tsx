import { useEffect, useState } from 'react';
import { Megaphone, Radio, ExternalLink, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveMediaRefs, countReactions, readReactions, toggleReactionKind } from '@/data';
import { getWapi } from '@/data/wapi';
import type { AdRecord, MediaRecord } from '@/data/types';
import { cn } from '@/lib/utils';
import { toast, errorMessage } from '@/components/shared/Toast';

/**
 * The post-format ad (ad-improvements.md) — a full post-like card. Unlike the
 * compact `AdBlock` (inline format), a post ad "looks like a post": it carries
 * the creative media (image/video), the copy, the offer CTA (the link that
 * pays), the disclosure, the provenance badge (Ad / Sponsored), and a like.
 *
 * It is ATTACHED to a post at read time (the `ad_preference` / `attach_node_ads`
 * join) and rendered under that post — it is not a standalone feed post, so it
 * is never subject to ranking. It renders per its `variant` (creator = violet,
 * node = amber "Sponsored"), the same dressing as the inline `AdBlock`.
 */
export function PostAdCard({ ad, className }: { ad: AdRecord; className?: string }) {
  const isNode = ad.variant === 'node';
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
        <span className={cn('truncate text-[0.75rem] font-medium', isNode ? 'text-warning' : 'text-brand-300')} data-testid="post-ad-author">
          {isNode ? (ad.author_username || 'this node') : `@${ad.author_username || 'creator'}`}
        </span>
      </div>

      {/* The creative — the media leads (like a post). */}
      {media && <PostAdMedia media={media} />}

      {/* The copy. */}
      {ad.text && (
        <p className="px-3 pt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {ad.text}
        </p>
      )}

      {/* The offer — partner + CTA (the link that pays). */}
      {ad.offer?.link && (
        <div className="flex items-center gap-2 px-3 py-3">
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
      )}

      {/* The like + the disclosure (part of the object, never hidden). */}
      <div className="flex items-center gap-3 px-3 pb-3">
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
              {' '}· {isNode ? `by ${ad.author_username || 'this node'}` : `by @${ad.author_username || 'creator'}`}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/** The post ad's creative media — the first item, rendered like a post's media. */
function PostAdMedia({ media }: { media: MediaRecord }) {
  const isVideo = media.mime_type?.startsWith('video/');
  const [playing, setPlaying] = useState(false);
  const knownRatio = media.width && media.height ? media.width / media.height : null;
  const ratio = knownRatio ?? 16 / 9;
  const containerStyle: React.CSSProperties = { aspectRatio: `${ratio}`, maxHeight: '50vh' };

  if (isVideo) {
    return (
      <div
        className="bg-elevated overflow-hidden relative cursor-pointer group"
        style={containerStyle}
        onClick={() => setPlaying((p) => !p)}
        role="button"
        tabIndex={0}
        aria-label={playing ? 'Pause ad video' : 'Play ad video'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPlaying((p) => !p);
          }
        }}
        data-testid="post-ad-media-video"
      >
        <video
          src={media.url}
          poster={media.thumbnail_url}
          className="w-full h-full object-contain"
          preload="metadata"
          playsInline
          muted={!playing}
          loop
          autoPlay={playing}
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-background/80 backdrop-blur-sm">
              <Megaphone className="w-5 h-5 text-foreground ml-0.5" strokeWidth={2} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-elevated overflow-hidden relative" style={containerStyle} data-testid="post-ad-media-image">
      <img
        src={media.thumbnail_url || media.url}
        alt={media.alt_text || ''}
        className="w-full h-full object-contain"
        loading="lazy"
      />
    </div>
  );
}
