import { useEffect, useRef, useState } from 'react';
import { Play, Pause, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HlsVideoPlayer } from './HlsVideoPlayer';
import { API_ORIGIN } from '@/lib/origins';
import type { HlsInstance } from '@/types/hls';
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
 * Plus a layout axis: `immersive` (default off). Off, the player reserves its
 * own box (the source's ratio). On, the video fills the frame the surface
 * gives it (the slide IS the 9:16 frame on Shorts) — no own aspect-ratio, no
 * phone-width column, and for the `hls` source no control rack (video only).
 *
 * `hls` always renders the full rack (hls.js gives ABR/quality, and the rack
 * is built for it) — that is the existing `HlsVideoPlayer`, kept as-is —
 * EXCEPT in `immersive`, where the surface owns the frame + the overlay chrome
 * and the player is the video only (the Shorts slide, shorts.md).
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
  /** Fill a parent frame (w-full h-full, no own aspect-ratio) — for carousel slides. */
  fill?: boolean;
  /**
   * The video fills the frame the surface gives it (the slide IS the 9:16
   * frame on Shorts): no own aspect-ratio, no phone-width column, and for the
   * `hls` source no control rack (video only — the surface draws its own
   * overlay chrome on top). The surface owns the frame; the player fills it.
   */
  immersive?: boolean;
  /**
   * The ambient-autoplay seam (with `immersive`): the surface tells the player
   * when this is the active slide. Active → play muted; inactive → pause.
   * Ignored outside immersive (the inline tap-to-play owns its own state).
   */
  active?: boolean;
  /** testid for the outer container — surfaces keep their existing testids. */
  testId?: string;
  className?: string;
}

export function VideoPlayer({ source, mode = 'inline', fit = 'contain', ratio, maxHeight, showDuration = true, fill = false, immersive = false, active = false, testId, className }: VideoPlayerProps) {
  LOG('video player — source:', source.type, 'mode:', mode, 'fit:', fit, 'ratio:', ratio ?? 'natural', 'immersive:', immersive, 'active:', active);

  // hls → the full rack (the existing HlsVideoPlayer, kept as-is) — or, in
  // immersive, the video-only fill (the Shorts slide: the surface owns the
  // frame + the overlay chrome, so no rack, no phone-width column).
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

  // youtube → the Shorts path (a responsive iframe). Adding a YouTube post is
  // a source case, not a new component.
  if (source.type === 'youtube') {
    return <YouTubeEmbed id={source.id} ratio={ratio} testId={testId} className={className} />;
  }

  // file + full → native controls (the lightbox's non-transcoded path).
  if (mode === 'full') {
    return <NativeVideo url={source.url} poster={source.poster} testId={testId} className={className} />;
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

/**
 * The native <video> with controls (the lightbox's non-transcoded path).
 * Owns a failed state so a load error surfaces the designed error instead of
 * a silent black box — the gap that left iOS Safari users staring at nothing
 * when a direct file wouldn't play.
 */
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

/**
 * The immersive hls renderer (the Shorts slide, shorts.md): hls.js attached,
 * the video fills the frame the surface gives it (`absolute inset-0
 * object-cover`), muted + autoplay + loop — and NO control rack. The rack
 * (scrubber/quality/speed/fullscreen) is the `mode="full"`/lightbox surface;
 * on a Shorts slide it would collide with the author/caption overlay + the
 * like/comment/share rail the surface draws on top. The full-rack
 * `HlsVideoPlayer` stays exactly as-is for feed/lightbox; this is the
 * video-only sibling for the frame the surface owns.
 *
 * `active` is the ambient-autoplay seam: the slide is the active one → play
 * muted; off-screen → pause (the screen's IntersectionObserver is the source
 * of truth). A tap toggles in place and never escapes the slide.
 */
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

  // ── Attach the source (hls.js first, native HLS fallback — the same rule
  //    as HlsVideoPlayer, video-experience.md). ─────────────────────────────
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

  // ── The ambient loop: play muted while the slide is active, pause off-screen.
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
        // The inline invariant: a tap toggles play/pause in place and NEVER
        // escapes the slide (video-player.md).
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
          // The native-HLS path (iOS Safari — no MSE, so hls.js is skipped):
          // a failed manifest/segment load fires `error` on the <video>.
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
  /** The video fills the frame the surface gives it (the Shorts slide). */
  immersive?: boolean;
  /**
   * The ambient-autoplay seam (the Shorts slide): the surface tells the player
   * when the slide is the active one. Active → play muted (the browser's
   * autoplay policy); inactive → pause. A tap still toggles in place.
   */
  active?: boolean;
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
export function InlineVideo({ url, poster, width, height, durationSeconds, fit = 'contain', ratio, maxHeight, showDuration = true, fill = false, immersive = false, active = false, testId, className }: InlineVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tapped, setTapped] = useState(false);
  // The ambient loop (the Shorts slide): the slide is active AND the user has
  // not tapped to pause → play muted. Inactive → pause, always.
  const playing = (active && !tapped) || (!active && tapped);

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

  const cover = fit === 'cover' || immersive;
  // An explicit ratio wins; else the source's natural ratio; else 4/3.
  const effectiveRatio = ratio ?? (width && height ? width / height : 4 / 3);
  // 16:9 cover → the Tailwind aspect-video class (the discover/youtube tile);
  // everything else → an inline aspect-ratio (the feed's natural ratio).
  // `fill` (a carousel slide) + `immersive` (the Shorts slide) take their size
  // from the parent frame — no own aspect-ratio, just w-full h-full.
  const isAspectVideo = !fill && !immersive && cover && Math.abs(effectiveRatio - 16 / 9) < 0.001;
  const containerStyle: React.CSSProperties = fill || immersive ? {} : isAspectVideo ? {} : { aspectRatio: effectiveRatio, maxHeight };

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
        // The inline modality: a tap toggles play/pause in place and NEVER
        // reaches the card (the card's job is navigation + comments). This is
        // the invariant that kills the discover modal-yank (video-player.md).
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
