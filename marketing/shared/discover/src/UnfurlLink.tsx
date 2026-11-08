// The external-link unfurl renderers (D99 + the marketing second consumer).
//
// Ported from web10-social's `src/components/Feed/LinkEmbed.tsx` so the two
// apps' in-body link treatment cannot drift: the deterministic YouTube /
// Vimeo players (the url carries the id — no round-trip), the unfurl card /
// provider player (the server's card metadata, click-to-load), and the plain
// link (every failure state — one source so the fallback can never drift
// from "the link as it was before").
//
// The state machine: `undefined` = loading (the plain link, as today),
// `null` = does not unfurl (the plain link, as today), card = the rich
// render. A card arriving after first paint is a content-driven pop-in —
// the Facebook model; the server + client caches make repeat views instant.
import { ReliableImage } from './ReliableImage';
import { useEffect, useRef, useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import { cn } from './utils';
import type { EmbedInfo } from './linkEmbeds';
import { fetchUnfurl, unfurlEndpointHost, type UnfurlCard } from './unfurl';

export interface LinkEmbedProps {
  embed: EmbedInfo;
  className?: string;
}

/**
 * The plain external link — exactly the pre-unfurl rendering (the fallback
 * every unfurl state degrades to). One source so the fallback can never
 * drift from "the link as it was before."
 */
export function PlainExternalLink({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-300 underline underline-offset-2 break-words"
    >
      {children}
    </a>
  );
}

export function YouTubeEmbed({ embed }: { embed: EmbedInfo }) {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className="group relative w-full overflow-hidden rounded-lg bg-elevated cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ aspectRatio: '16/9' }}
        aria-label={`Play video from ${embed.domain}`}
        data-testid="youtube-embed-placeholder"
      >
        {embed.thumbnailUrl ? (
          <ReliableImage
            src={embed.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-brand-muted flex items-center justify-center" />
        )}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors duration-150 flex items-center justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-transform duration-150 group-hover:scale-110">
            <Play className="w-7 h-7 text-foreground ml-0.5" strokeWidth={2} fill="currentColor" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: '16/9' }}
      data-testid="youtube-embed-loaded"
    >
      <iframe
        src={`${embed.embedUrl}?rel=0&modestbranding=1`}
        title="YouTube video player"
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export function VimeoEmbed({ embed }: { embed: EmbedInfo }) {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className="group relative w-full overflow-hidden rounded-lg bg-elevated cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ aspectRatio: '16/9' }}
        aria-label={`Play video from ${embed.domain}`}
        data-testid="vimeo-embed-placeholder"
      >
        <div className="w-full h-full bg-gradient-to-br from-brand-muted to-elevated flex items-center justify-center">
          <span className="text-muted-foreground text-xs font-medium">vimeo.com</span>
        </div>
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors duration-150 flex items-center justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-transform duration-150 group-hover:scale-110">
            <Play className="w-7 h-7 text-foreground ml-0.5" strokeWidth={2} fill="currentColor" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: '16/9' }}
      data-testid="vimeo-embed-loaded"
    >
      <iframe
        src={`${embed.embedUrl}?autoplay=0&muted=1`}
        title="Vimeo video player"
        className="absolute inset-0 w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/**
 * The deterministic embed (YouTube / Vimeo) — the shared tail of the
 * social app's `LinkEmbed`: the provider's player, no round-trip. A
 * non-embeddable url is not this component's case (the unfurl or the plain
 * link owns it).
 */
export function DeterministicEmbed({ embed, className }: LinkEmbedProps) {
  if (embed.provider === 'youtube') {
    return <YouTubeEmbed embed={embed} />;
  }
  return <VimeoEmbed embed={embed} />;
}

/**
 * The external link unfurl. The link's card metadata is fetched from the
 * app's unfurl endpoint (web10-social: same-origin; the marketing site:
 * cross-origin — the preview server answers `Access-Control-Allow-Origin:
 * *`); this component renders it: a provider player (Spotify / SoundCloud /
 * TikTok / Bandcamp) or a rich preview card (article / reel / anything with
 * Open Graph). Every failure mode — network, blocked, rate-limited, no
 * metadata — renders the PLAIN link of today. Unfurling is read-side only:
 * it never touches posting.
 */
export function UnfurlLink({
  url,
  text,
  endpoint,
}: {
  url: string;
  text?: React.ReactNode;
  /** The unfurl endpoint (`<origin>/preview/unfurl`). */
  endpoint: string;
}) {
  const [card, setCard] = useState<UnfurlCard | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setCard(undefined);
    fetchUnfurl(url, endpoint, unfurlEndpointHost(endpoint)).then((result) => {
      if (active) setCard(result ?? null);
    });
    return () => {
      active = false;
    };
  }, [url, endpoint]);

  if (card === undefined || card === null) {
    return <PlainExternalLink href={url}>{text ?? url}</PlainExternalLink>;
  }
  const body = card.embed ? <PlayerEmbed card={card} /> : <RichLinkCard card={card} />;
  // The block wrapper mirrors the YouTube embed's (one content at N
  // densities — the card is a block, the link line is gone: the card's
  // title/description replace it, and the card itself is the link).
  return <span className="block my-2">{body}</span>;
}

// ── The provider player ─────────────────────────────────────────────────────
//
// Two presentation patterns (the operator's 08.11.2026 pass: the audio
// providers must not read as native web10 music posts):
//
// The PORTRAIT video player (TikTok) keeps the click-to-load poster pattern
// (the YouTube Shorts shape — a video, so a play affordance reads correctly).
//
// The AUDIO provider embeds (Spotify / SoundCloud / Bandcamp — the
// landscape players) show the PROVIDER'S PLAYER WITHOUT A CLICK: a fake
// play button that "just swaps in the embed" reads as a web10-native music
// post (the operator's exact complaint). Instead: the provider-identity
// chrome (the artwork + the title + the provider's domain — the player is
// about to arrive, nothing to press) and the iframe loads when the embed
// scrolls into view (the performance reason the old card existed — a feed
// can carry many embeds; the IntersectionObserver is that gate, not a
// click). No IntersectionObserver (the test env, very old engines) → the
// iframe loads immediately.

function PlayerEmbed({ card }: { card: UnfurlCard }) {
  const embed = card.embed!; // UnfurlLink gates on card.embed
  const portrait = Boolean(embed.width && embed.height > embed.width * 1.4);
  return portrait ? <PortraitPlayerEmbed card={card} embed={embed} /> : <AudioProviderEmbed card={card} embed={embed} />;
}

// The portrait click-to-load (the TikTok shape — unchanged by the audio pass).
function PortraitPlayerEmbed({ card, embed }: { card: UnfurlCard; embed: NonNullable<UnfurlCard['embed']> }) {
  const [loaded, setLoaded] = useState(false);
  const allow = embed.allow || 'autoplay; encrypted-media';
  // A portrait player is capped at the provider's width and centered — a
  // full-width 578px-tall iframe would eat the card.
  const frameClass = 'mx-auto w-[325px] max-w-full';

  if (!loaded) {
    // The poster (the reel's og:image) full-bleed + the centered play
    // button — the exact YouTube Shorts placeholder shape.
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className={cn(
          'group relative block overflow-hidden rounded-lg bg-elevated cursor-pointer',
          frameClass,
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
        style={{ aspectRatio: `${embed.width}/${embed.height}` }}
        aria-label={`Play video from ${card.domain}`}
        data-testid="unfurl-player-placeholder"
      >
        {card.image ? (
          <ReliableImage
            src={card.image}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-brand-muted">
            <span className="text-xs font-medium text-muted-foreground">{card.domain}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors duration-150 flex items-center justify-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-transform duration-150 group-hover:scale-110">
            <Play className="w-6 h-6 text-foreground ml-0.5" strokeWidth={2} fill="currentColor" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-lg bg-black', frameClass)} data-testid="unfurl-player">
      <iframe
        src={embed.src}
        title={card.title || card.domain}
        className="block w-full border-0"
        style={{ height: embed.height }}
        allow={allow}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

// The audio provider embed (Spotify / SoundCloud / Bandcamp): the
// provider-identity chrome until the embed scrolls into view, then the
// provider's own iframe (its own artwork, title, controls — no click).
function AudioProviderEmbed({ card, embed }: { card: UnfurlCard; embed: NonNullable<UnfurlCard['embed']> }) {
  const allow = embed.allow || 'autoplay; encrypted-media';
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  // The performance gate: load the iframe when the embed scrolls into view
  // (200px ahead, so a player at the viewport edge is ready by the time it
  // is seen). The gate is the SCROLL, not a click — the provider's player
  // must be reachable without one (08.11.2026 pass). No IntersectionObserver
  // (the test env / very old engines) → load immediately.
  useEffect(() => {
    if (loaded) return;
    const el = ref.current;
    if (typeof IntersectionObserver === 'undefined' || !el) {
      setLoaded(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setLoaded(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loaded]);

  const favicon = `https://www.google.com/s2/favicons?domain=${card.domain}&sz=32`;

  if (!loaded) {
    // The provider-identity chrome: the square artwork, the title +
    // description, and the provider's domain (favicon row) — it says "the
    // player is from spotify.com", never "this is a web10 track with a play
    // button" (there is no button: the player arrives without a click).
    return (
      <div
        ref={ref}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-3"
        data-testid="unfurl-player-chrome"
      >
        {card.image ? (
          <ReliableImage
            src={card.image}
            alt=""
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-elevated">
            <span className="text-xs font-medium text-muted-foreground">{card.domain}</span>
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground" data-testid="unfurl-player-title">
            {card.title || card.domain}
          </span>
          {card.description ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground" data-testid="unfurl-player-subtitle">
              {card.description}
            </span>
          ) : null}
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {/* The favicon is decorative (the domain text is the content) —
                the documented local-only exception (media-surface-inventory). */}
            <img
              src={favicon}
              alt=""
              loading="lazy"
              className="h-3.5 w-3.5 shrink-0 rounded-sm"
              data-testid="unfurl-chrome-favicon"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <span data-testid="unfurl-player-provider">{card.domain}</span>
          </span>
        </span>
      </div>
    );
  }

  return (
    <div ref={ref} className="w-full overflow-hidden rounded-lg bg-black" data-testid="unfurl-player">
      <iframe
        src={embed.src}
        title={card.title || card.domain}
        className="block w-full border-0"
        style={{ height: embed.height }}
        allow={allow}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

// ── The rich preview card (article / reel / og pages) ──────────────────────

function RichLinkCard({ card }: { card: UnfurlCard }) {
  const favicon = `https://www.google.com/s2/favicons?domain=${card.domain}&sz=32`;
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'block overflow-hidden rounded-lg border border-border bg-surface transition-colors duration-150 hover:border-brand/40',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
      aria-label={card.title || card.domain}
      data-testid="unfurl-card"
    >
      {card.image ? (
        <div className="aspect-video w-full overflow-hidden bg-elevated">
          <ReliableImage
            src={card.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            data-testid="unfurl-card-image"
          />
        </div>
      ) : null}
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {/* The favicon is decorative (the domain text is the content): a
              raw img that hides on failure — no broken-image icon, and no
              media-recovery box for a 14px chip (the documented local-only
              exception in media-surface-inventory). */}
          <img
            src={favicon}
            alt=""
            loading="lazy"
            className="h-3.5 w-3.5 shrink-0 rounded-sm"
            data-testid="unfurl-card-favicon"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="truncate" data-testid="unfurl-card-domain">
            {card.domain}
          </span>
          <ExternalLink className="ml-auto h-3 w-3 shrink-0" strokeWidth={2} />
        </div>
        {card.title ? (
          <h3 className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground" data-testid="unfurl-card-title">
            {card.title}
          </h3>
        ) : null}
        {card.description ? (
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground" data-testid="unfurl-card-description">
            {card.description}
          </p>
        ) : null}
      </div>
    </a>
  );
}
