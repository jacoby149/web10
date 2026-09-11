import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HlsVideoPlayer } from './HlsVideoPlayer';
import type { MediaRecord } from '@/data/types';

const LOG = (...args: unknown[]) => console.log('[social:video]', ...args);

/**
 * The web10-social client's one shared video surface (video-player.md).
 *
 * The rule: **no surface owns a `<video>` element.** Every surface composes
 * `<VideoPlayer>` and says *what* it wants (a source, a mode, a fit, a ratio)
 * — never *how* the pixels get there. That single rule is what kills the
 * drift: the inline tap-to-play logic lives in one place (`InlineVideo`), so
 * when it changes, every surface (feed, discover, groups) gets it at once.
 *
 * Two axes:
 *   source  — where the bytes come from: `hls` (transcoded, D44) | `file`
 *             (direct <video>) | `youtube` (an <iframe> — the Shorts path).
 *   mode    — how it presents: `inline` (tap-to-play ambient) | `full`
 *             (the hls.js control rack).
 *
 * `hls` always renders the full rack (hls.js gives ABR/quality, and the rack
 * is built for it) — that is the existing `HlsVideoPlayer`, kept as-is.
 */

export type VideoSource =
  | { type: 'hls'; manifestUrl: string; poster?: string; width?: number; height?: number }
  | { type: 'file'; url: string; poster?: string; width?: number; height?: number; durationSeconds?: number }
  | { type: 'youtube'; id: string };

/**
 * Build a VideoSource from a resolved MediaRecord — the common case. A
 * transcoded video (status done + a minted manifest_url) plays through hls.js;
 * anything else (processing/failed/absent, the Phase-2 import path's raw MP4s)
 * plays the direct file.
 */
export function sourceFromMedia(media: MediaRecord): VideoSource {
  const ts = media.transcoding_settings;
  if (media.mime_type?.startsWith('video/') && ts?.status === 'done' && ts.manifest_url) {
    const v0 = ts.variants?.[0];
    return {
      type: 'hls',
      manifestUrl: ts.manifest_url,
      poster: media.thumbnail_url,
      width: v0?.width || media.width,
      height: v0?.height || media.height,
    };
  }
  return {
    type: 'file',
    url: media.url,
    poster: media.thumbnail_url,
    width: media.width,
    height: media.height,
    durationSeconds: media.duration_seconds,
  };
}

export interface VideoPlayerProps {
  source: VideoSource;
  /** inline = tap-to-play ambient (feed/discover/groups); full = the hls.js rack. */
  mode?: 'inline' | 'full';
  /** contain = letterbox (never crops); cover = fill the frame (crops). */
  fit?: 'contain' | 'cover';
  /** Explicit w/h ratio (e.g. 16/9). Absent → the source's natural ratio. */
  ratio?: number;
  /** Cap the height (contain only) so a portrait clip can't blow up a card. */
  maxHeight?: string;
  /** Hide the inline duration badge (a surface that shows its own time badge). */
  showDuration?: boolean;
  /** testid for the outer container — surfaces keep their existing testids. */
  testId?: string;
  className?: string;
}

export function VideoPlayer({ source, mode = 'inline', fit = 'contain', ratio, maxHeight, showDuration = true, testId, className }: VideoPlayerProps) {
  LOG('video player — source:', source.type, 'mode:', mode, 'fit:', fit, 'ratio:', ratio ?? 'natural');

  // hls → the full rack (the existing HlsVideoPlayer, kept as-is).
  if (source.type === 'hls') {
    return (
      <HlsVideoPlayer
        manifestUrl={source.manifestUrl}
        poster={source.poster}
        width={source.width}
        height={source.height}
        className={className}
      />
    );
  }

  // youtube → the Shorts path (a responsive iframe). Adding a YouTube post is
  // a source case, not a new component.
  if (source.type === 'youtube') {
    return <YouTubeEmbed id={source.id} ratio={ratio} testId={testId} className={className} />;
  }

  // file + full → native controls (the lightbox's non-transcoded path).
  if (mode === 'full') {
    return (
      <video
        key={source.url}
        src={source.url}
        poster={source.poster}
        controls
        playsInline
        data-testid={testId}
        className={cn('w-full object-contain', className)}
      />
    );
  }

  // file + inline → the shared tap-to-play (the feed/discover/groups path).
  return (
    <InlineVideo
      url={source.url}
      poster={source.poster}
      width={source.width}
      height={source.height}
      durationSeconds={source.durationSeconds}
      fit={fit}
      ratio={ratio}
      maxHeight={maxHeight}
      showDuration={showDuration}
      testId={testId}
      className={className}
    />
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

interface InlineVideoProps {
  url: string;
  poster?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fit?: 'contain' | 'cover';
  ratio?: number;
  maxHeight?: string;
  showDuration?: boolean;
  testId?: string;
  className?: string;
}

/**
 * The shared inline tap-to-play video — the one that used to be copy-pasted
 * across the feed, discover, and groups (and had drifted: discover's copy was
 * missing stopPropagation, which is the modal-yank bug). Now it lives here,
 * once, and the invariant is a property of the component: **a tap toggles
 * play/pause in place and never reaches the card.**
 */
export function InlineVideo({ url, poster, width, height, durationSeconds, fit = 'contain', ratio, maxHeight, showDuration = true, testId, className }: InlineVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || !videoRef.current) return;
    // jsdom's play() is unimplemented (returns undefined, not a Promise) —
    // guard so the inline-play toggle is testable headless.
    const p = videoRef.current.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return () => {
      videoRef.current?.pause();
    };
  }, [playing]);

  const cover = fit === 'cover';
  // An explicit ratio wins; else the source's natural ratio; else 4/3.
  const effectiveRatio = ratio ?? (width && height ? width / height : 4 / 3);
  // 16:9 cover → the Tailwind aspect-video class (the discover/youtube tile);
  // everything else → an inline aspect-ratio (the feed's natural ratio).
  const isAspectVideo = cover && Math.abs(effectiveRatio - 16 / 9) < 0.001;
  const containerStyle: React.CSSProperties = isAspectVideo ? {} : { aspectRatio: effectiveRatio, maxHeight };

  return (
    <div
      data-testid={testId}
      className={cn(
        'bg-elevated overflow-hidden group relative cursor-pointer',
        isAspectVideo && 'aspect-video',
        className,
      )}
      style={containerStyle}
      onClick={(e) => {
        // The inline modality: a tap toggles play/pause in place and NEVER
        // reaches the card (the card's job is navigation + comments). This is
        // the invariant that kills the discover modal-yank (video-player.md).
        e.stopPropagation();
        setPlaying((p) => !p);
      }}
      role="button"
      tabIndex={0}
      aria-label={playing ? 'Pause video' : 'Play video'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setPlaying((p) => !p);
        }
      }}
    >
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        className={cn('w-full h-full', cover ? 'object-cover' : 'object-contain')}
        preload="metadata"
        playsInline
        muted={!playing}
        loop
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-background/80 backdrop-blur-sm">
            <Play className="w-6 h-6 text-foreground ml-0.5" strokeWidth={2} fill="currentColor" />
          </div>
        </div>
      )}
      {playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Pause className="w-8 h-8 text-foreground/60 animate-pulse" strokeWidth={1.5} />
        </div>
      )}
      {showDuration && durationSeconds && (
        <div className="absolute bottom-1.5 right-1.5 bg-background/80 rounded px-1.5 text-[0.625rem] font-mono tabular-nums text-foreground">
          {formatDuration(durationSeconds)}
        </div>
      )}
    </div>
  );
}

/** The Shorts path — a responsive YouTube iframe. A new source case, not a new component. */
function YouTubeEmbed({ id, ratio, testId, className }: { id: string; ratio?: number; testId?: string; className?: string }) {
  const ar = ratio ?? 16 / 9;
  return (
    <div
      data-testid={testId}
      className={cn('bg-elevated overflow-hidden relative', className)}
      style={{ aspectRatio: ar }}
    >
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        title="YouTube video"
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
