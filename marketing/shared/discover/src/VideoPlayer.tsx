import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Play, Pause, TriangleAlert } from 'lucide-react';
import { cn } from './utils';
import { HlsVideoPlayer } from './HlsVideoPlayer';
import { API_ORIGIN } from './config';
import type { HlsInstance } from './hls';
import type { MediaItem } from './types';

const LOG = (...args: unknown[]) => console.log('[discover:video]', ...args);

/**
 * The shared video surface (video-player.md) — the one both apps' discover
 * cards compose (D73).
 *
 * The rule: **no surface owns a `<video>` element.** Every surface composes
 * `<VideoPlayer>` and says *what* it wants (a source, a mode, a fit, a ratio)
 * — never *how* the pixels get there.
 *
 * Two axes:
 *   source  — where the bytes come from: `hls` (transcoded, D44) | `file`
 *             (direct <video>) | `youtube` (an <iframe> — the Shorts path).
 *   mode    — how it presents: `inline` (tap-to-play ambient) | `full`
 *             (the hls.js control rack).
 *
 * Plus a layout axis: `immersive` (default off). Off, the player reserves its
 * own box (the source's ratio). On, the video fills the frame the surface
 * gives it — and for the `hls` source no control rack (video only).
 */

export type VideoSource =
  | { type: 'hls'; manifestUrl: string; poster?: string; width?: number; height?: number }
  | { type: 'file'; url: string; poster?: string; width?: number; height?: number; durationSeconds?: number }
  | { type: 'youtube'; id: string };

/**
 * Build a VideoSource from a resolved MediaItem — the common case. A
 * transcoded video (status done + a minted manifest_url) plays through hls.js;
 * anything else (processing/failed/absent, the import path's raw MP4s) plays
 * the direct file.
 */
export function sourceFromMedia(media: MediaItem): VideoSource {
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
  /** inline = tap-to-play ambient (feed/discover); full = the hls.js rack. */
  mode?: 'inline' | 'full';
  /** contain = letterbox (never crops); cover = fill the frame (crops). */
  fit?: 'contain' | 'cover';
  /** Explicit w/h ratio (e.g. 16/9). Absent → the source's natural ratio. */
  ratio?: number;
  /** Cap the height (contain only) so a portrait clip can't blow up a card. */
  maxHeight?: string;
  /** Hide the inline duration badge (a surface that shows its own time badge). */
  showDuration?: boolean;
  /** Fill a parent frame (w-full h-full, no own aspect-ratio) — carousel slides. */
  fill?: boolean;
  /**
   * The video fills the frame the surface gives it (the Shorts slide): no own
   * aspect-ratio, and for the `hls` source no control rack (video only).
   */
  immersive?: boolean;
  /**
   * The ambient-autoplay seam (with `immersive`): the surface tells the player
   * when this is the active slide. Active → play muted; inactive → pause.
   */
  active?: boolean;
  /** testid for the outer container — surfaces keep their existing testids. */
  testId?: string;
  className?: string;
}

export function VideoPlayer({ source, mode = 'inline', fit = 'contain', ratio, maxHeight, showDuration = true, fill = false, immersive = false, active = false, testId, className }: VideoPlayerProps) {
  LOG('video player — source:', source.type, 'mode:', mode, 'fit:', fit, 'ratio:', ratio ?? 'natural', 'immersive:', immersive, 'active:', active);

  if (source.type === 'hls') {
    if (immersive) {
      return (
        <ImmersiveHls
          manifestUrl={source.manifestUrl}
          poster={source.poster}
          width={source.width}
          height={source.height}
          active={active}
          testId={testId}
          className={className}
        />
      );
    }
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

  if (source.type === 'youtube') {
    return <YouTubeEmbed id={source.id} ratio={ratio} testId={testId} className={className} />;
  }

  // file + full → native controls (the lightbox's non-transcoded path).
  if (mode === 'full') {
    return <NativeVideo url={source.url} poster={source.poster} testId={testId} className={className} />;
  }

  // file + inline → the shared tap-to-play (the feed/discover path).
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
      fill={fill}
      immersive={immersive}
      active={active}
      testId={testId}
      className={className}
    />
  );
}

/**
 * The designed "can't play" state — the same one HlsVideoPlayer renders on a
 * fatal hls.js error. The native/file paths had none: a failed load (a
 * 403/404/expired presigned URL, a codec the browser can't decode) left a
 * silent black box. Now every video surface degrades to this.
 */
function VideoError({ className }: { className?: string }) {
  return (
    <div
      data-testid="video-error"
      className={cn('bg-elevated flex flex-col items-center justify-center gap-2 py-10 px-4 text-center', className)}
    >
      <TriangleAlert className="w-6 h-6 text-warning" strokeWidth={1.75} />
      <p className="text-sm text-muted-foreground">This video can’t be played in your browser.</p>
    </div>
  );
}

function NativeVideo({ url, poster, testId, className }: { url: string; poster?: string; testId?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <VideoError className={className} />;
  return (
    <video
      key={url}
      src={url}
      poster={poster}
      controls
      playsInline
      onError={() => {
        LOG('video — native load failed, url:', url);
        setFailed(true);
      }}
      data-testid={testId}
      className={cn('w-full object-contain', className)}
    />
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function ImmersiveHls({ manifestUrl, poster, width, height, active = false, testId, className }: {
  manifestUrl: string;
  poster?: string;
  width?: number;
  height?: number;
  active?: boolean;
  testId?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const [failed, setFailed] = useState(false);
  const [tapped, setTapped] = useState(false);
  const playing = (active && !tapped) || (!active && tapped);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const manifestHref = `${API_ORIGIN}${manifestUrl}`;
    LOG('immersive hls — attach, manifest:', manifestHref);

    if (window.Hls && window.Hls.isSupported()) {
      const Hls = window.Hls;
      const hls = new Hls();
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        LOG('immersive hls — error, type:', data.type, 'details:', data.details, 'fatal:', data.fatal);
        if (data.fatal) setFailed(true);
      });
      hls.loadSource(manifestHref);
      hls.attachMedia(el);
      return () => {
        LOG('immersive hls — destroy');
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      LOG('immersive hls — native HLS (Safari)');
      el.src = manifestHref;
      return;
    }

    LOG('immersive hls — no HLS support in this browser');
    setFailed(true);
  }, [manifestUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      el.muted = true;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      el.pause();
    }
  }, [playing]);

  if (failed) {
    return <VideoError className={cn('h-full w-full', className)} />;
  }

  return (
    <div
      data-testid={testId}
      className={cn('bg-black overflow-hidden relative cursor-pointer h-full w-full', className)}
      onClick={(e) => {
        e.stopPropagation();
        setTapped((t) => !t);
      }}
      role="button"
      tabIndex={0}
      aria-label={playing ? 'Pause video' : 'Play video'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setTapped((t) => !t);
        }
      }}
    >
      <video
        ref={videoRef}
        data-testid="immersive-hls-video"
        poster={poster}
        width={width}
        height={height}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        onError={() => {
          LOG('immersive hls — native video error, code:', videoRef.current?.error?.code, 'msg:', videoRef.current?.error?.message);
          setFailed(true);
        }}
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
    </div>
  );
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
  fill?: boolean;
  immersive?: boolean;
  active?: boolean;
  testId?: string;
  className?: string;
}

export function InlineVideo({ url, poster, width, height, durationSeconds, fit = 'contain', ratio, maxHeight, showDuration = true, fill = false, immersive = false, active = false, testId, className }: InlineVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tapped, setTapped] = useState(false);
  const playing = (active && !tapped) || (!active && tapped);

  useEffect(() => {
    if (!playing || !videoRef.current) return;
    const p = videoRef.current.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return () => {
      videoRef.current?.pause();
    };
  }, [playing]);

  const cover = fit === 'cover' || immersive;
  const effectiveRatio = ratio ?? (width && height ? width / height : 4 / 3);
  const isAspectVideo = !fill && !immersive && cover && Math.abs(effectiveRatio - 16 / 9) < 0.001;
  const containerStyle: CSSProperties = fill || immersive ? {} : isAspectVideo ? {} : { aspectRatio: effectiveRatio, maxHeight };

  return (
    <div
      data-testid={testId}
      className={cn(
        'bg-elevated overflow-hidden group relative cursor-pointer',
        fill || immersive ? 'h-full w-full' : isAspectVideo && 'aspect-video',
        className,
      )}
      style={containerStyle}
      onClick={(e) => {
        e.stopPropagation();
        setTapped((t) => !t);
      }}
      role="button"
      tabIndex={0}
      aria-label={playing ? 'Pause video' : 'Play video'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setTapped((t) => !t);
        }
      }}
    >
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        className={cn(
          'w-full h-full',
          cover ? 'object-cover' : 'object-contain',
          immersive && 'absolute inset-0',
        )}
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
