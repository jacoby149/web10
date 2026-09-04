import { useEffect, useRef, useState } from 'react';
import { Megaphone, Play, Pause, ExternalLink, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveMediaRefs } from '@/data';
import type { AdRecord, MediaRecord } from '@/data';
import { cn } from '@/lib/utils';

/**
 * The ad block — renders a post's carried ad as a self-contained "ad-as-a-post"
 * card (ads.md: the creative is data, the HTML is the app's).
 *
 * Two provenances, two dressings (the "slightly different color scheme"):
 * - **creator** (tagged `ad`) — the web10 account's own monetization. Violet
 *   (brand) accent; the disclosure names the creator's web10 account.
 * - **node** (tagged `ad` + `node_ad`, D57) — the node operator's inventory.
 *   Amber (warning) accent; the disclosure names the node site.
 *
 * Three densities, picked from what the creative carries:
 * - **media** — the ad's image/video leads (rendered like a post's media),
 *   copy + offer below. The "whole video" case.
 * - **rich** — no media, but a full card (copy + offer + disclosure).
 * The disclosure (the FTC line) is part of the object, never hidden.
 */

type AdTheme = {
  /** the overline strip bg + border + text */
  strip: string;
  /** the small provenance badge */
  badge: string;
  /** the icon color */
  icon: string;
  /** the card's ambient ring/glow (subtle) */
  ring: string;
  /** the CTA button variant */
  cta: 'brand' | 'brand_subtle';
};

const CREATOR_THEME: AdTheme = {
  strip: 'bg-brand-muted/40 border-brand/20',
  badge: 'bg-brand-muted text-brand-300 border-brand/30',
  icon: 'text-brand-300',
  ring: 'ring-1 ring-brand/15',
  cta: 'brand',
};

const NODE_THEME: AdTheme = {
  strip: 'bg-warning/10 border-warning/25',
  badge: 'bg-warning/15 text-warning border-warning/30',
  icon: 'text-warning',
  ring: 'ring-1 ring-warning/15',
  cta: 'brand_subtle',
};

function nodeSiteName(ad: AdRecord): string {
  // The node ad is authored by the node operator (or a reserved `node` key).
  // The disclosure names the node site — the operator's web10 account is the
  // site's identity on the node.
  return ad.author_username || 'this node';
}

export function AdBlock({ ad, className }: { ad: AdRecord; className?: string }) {
  const isNode = ad.variant === 'node';
  const theme = isNode ? NODE_THEME : CREATOR_THEME;
  const { offer } = ad;
  const hasLink = !!offer?.link;

  // Resolve the ad's creative media (the API serves it pre-resolved on read;
  // resolveMediaRefs handles both resolved objects and bare doc_ids).
  const [mediaItems, setMediaItems] = useState<MediaRecord[]>([]);
  const mediaRefs = ad.media_refs;
  useEffect(() => {
    let live = true;
    if (!mediaRefs?.length) {
      setMediaItems([]);
      return;
    }
    resolveMediaRefs(mediaRefs)
      .then((m) => { if (live) setMediaItems(m); })
      .catch(() => { if (live) setMediaItems([]); });
    return () => { live = false; };
  }, [ad._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasMedia = mediaItems.length > 0;
  // The badge carries the type (Ad / Sponsored); the provenance is the *who* —
  // the web10 account that made the ad, or the node site.
  const provenance = isNode ? nodeSiteName(ad) : `@${ad.author_username || 'creator'}`;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface',
        theme.ring,
        className,
      )}
      data-testid="ad-block"
      data-ad-variant={isNode ? 'node' : 'creator'}
    >
      {/* The identity strip — who made it + the provenance badge. */}
      <div className={cn('flex items-center gap-2 px-3 py-2 border-b', theme.strip)}>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide',
            theme.badge,
          )}
          data-testid="ad-provenance-badge"
        >
          {isNode ? <Radio className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" /> : <Megaphone className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />}
          {isNode ? 'Sponsored' : 'Ad'}
        </span>
        <span className={cn('truncate text-[0.75rem] font-medium', theme.icon)} data-testid="ad-provenance">
          {provenance}
        </span>
      </div>

      {/* The creative — media leads (like a post), then the copy. */}
      {hasMedia && <AdMedia media={mediaItems[0]} />}
      {ad.text && (
        <p className="px-3 pt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {ad.text}
        </p>
      )}

      {/* The offer row — partner + CTA (the link that pays). */}
      <div className="flex items-center gap-2 px-3 py-3">
        {offer?.partner && !isNode && (
          <span className="text-xs font-medium text-muted-foreground truncate" data-testid="ad-partner">
            {offer.partner}
          </span>
        )}
        {hasLink && (
          <Button
            asChild
            variant={theme.cta}
            size="sm"
            className={cn('gap-1.5', !offer?.partner || isNode ? 'ml-auto' : '')}
            data-testid="ad-cta"
          >
            <a href={offer!.link} target="_blank" rel="noopener noreferrer">
              {offer!.cta || (isNode ? 'Learn more' : 'Get it')}
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>

      {/* The disclosure — part of the object, never hidden (D55). The FTC line
          plus who made it (the web10 account, or the node site). */}
      {offer?.disclosure && (
        <p className="px-3 pb-3 text-[0.6875rem] text-muted-foreground" data-testid="ad-disclosure">
          {offer.disclosure}
          <span className="text-muted-foreground/60">
            {' '}· {isNode ? `by ${nodeSiteName(ad)}` : `by @${ad.author_username || 'creator'}`}
          </span>
        </p>
      )}
    </div>
  );
}

/** The ad's creative media — the first item, rendered like a post's media
 *  (natural aspect ratio, capped, object-contain so it never crops). */
function AdMedia({ media }: { media: MediaRecord }) {
  const isVideo = media.mime_type?.startsWith('video/');
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [measuredRatio, setMeasuredRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!playing || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
    return () => { videoRef.current?.pause(); };
  }, [playing]);

  const knownRatio = media.width && media.height ? media.width / media.height : null;
  const ratio = knownRatio ?? measuredRatio ?? 16 / 9;
  const onMediaLoaded = (el: HTMLVideoElement | HTMLImageElement) => {
    if (knownRatio) return;
    const w = 'videoWidth' in el ? el.videoWidth : el.naturalWidth;
    const h = 'videoHeight' in el ? el.videoHeight : el.naturalHeight;
    if (w && h) setMeasuredRatio(w / h);
  };

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
        data-testid="ad-media-video"
      >
        <video
          ref={videoRef}
          src={media.url}
          poster={media.thumbnail_url}
          onLoadedMetadata={(e) => onMediaLoaded(e.currentTarget)}
          className="w-full h-full object-contain"
          preload="metadata"
          playsInline
          muted={!playing}
          loop
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-background/80 backdrop-blur-sm">
              <Play className="w-5 h-5 text-foreground ml-0.5" strokeWidth={2} />
            </div>
          </div>
        )}
        {playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Pause className="w-8 h-8 text-foreground/60 animate-pulse" strokeWidth={1.5} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-elevated overflow-hidden relative" style={containerStyle} data-testid="ad-media-image">
      <img
        src={media.thumbnail_url || media.url}
        alt={media.alt_text || ''}
        onLoad={(e) => onMediaLoaded(e.currentTarget)}
        className="w-full h-full object-contain"
        loading="lazy"
      />
    </div>
  );
}
