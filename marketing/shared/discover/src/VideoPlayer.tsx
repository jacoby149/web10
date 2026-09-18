import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import { Play, Pause, TriangleAlert, Volume2, VolumeX, Maximize2, Gauge } from 'lucide-react';
import { cn } from './utils';
import { HlsVideoPlayer, RackMenu } from './HlsVideoPlayer';
import { IconBtn } from './ui';
import { API_ORIGIN } from './config';
import type { HlsInstance } from './hls';
import type { MediaItem } from './types';

const LOG = (...args: unknown[]) => console.log('[discover:video]', ...args);

/** m:ss — the time readout (current / total). */
function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** The playback-speed options (the rack's speed menu). Index → rate. */
const SPEEDS = ['1x', '1.5x', '2x'] as const;

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
  /** Cap the frame width (the lightbox's portrait case) — a 9:16 clip in a
    *  wide modal reserves a box ~1.78× the viewport tall; capping + centering
    *  it in a black letterbox keeps the whole clip + the rack in view. */
  maxWidth?: string;
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

export function VideoPlayer({ source, mode = 'inline', fit = 'contain', ratio, maxHeight, maxWidth, showDuration = true, fill = false, immersive = false, active = false, testId, className }: VideoPlayerProps) {
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
        maxWidth={maxWidth}
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
      maxWidth={maxWidth}
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
  /** Cap the frame width (the portrait case) + center it in a black letterbox. */
  maxWidth?: string;
  showDuration?: boolean;
  fill?: boolean;
  immersive?: boolean;
  active?: boolean;
  testId?: string;
  className?: string;
}

export function InlineVideo({ url, poster, width, height, durationSeconds, fit = 'contain', ratio, maxHeight, maxWidth, showDuration = true, fill = false, immersive = false, active = false, testId, className }: InlineVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tapped, setTapped] = useState(false);
  const playing = (active && !tapped) || (!active && tapped);

  // ── Control-rack state (the file path gets the same rack as the hls path) ──
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const pointerOverRef = useRef(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [pointerOver, setPointerOver] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(true);
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    if (!playing || !videoRef.current) return;
    const p = videoRef.current.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return () => {
      videoRef.current?.pause();
    };
  }, [playing]);

  // Keep the DOM in sync with playback events + drive the rack's auto-hide.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const show = () => {
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        if (playingRef.current && !pointerOverRef.current) setControlsVisible(false);
      }, 2500);
    };
    const onPlay = () => { playingRef.current = true; show(); };
    const onPause = () => { playingRef.current = false; setControlsVisible(true); };
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onVol = () => { setVolume(el.volume); setMuted(el.muted); };
    const onEnd = () => setControlsVisible(true);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('volumechange', onVol);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('volumechange', onVol);
      el.removeEventListener('ended', onEnd);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = parseFloat(SPEEDS[speed]);
  }, [speed]);

  function togglePlay() {
    setTapped((t) => !t);
  }
  function seek(e: ChangeEvent<HTMLInputElement>) {
    const el = videoRef.current;
    if (!el) return;
    const t = parseFloat(e.target.value);
    el.currentTime = t;
    setCurrent(t);
  }
  function changeVolume(e: ChangeEvent<HTMLInputElement>) {
    const el = videoRef.current;
    if (!el) return;
    const v = parseFloat(e.target.value);
    el.volume = v;
    el.muted = v === 0;
  }
  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
  }
  function toggleFullscreen() {
    const el = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  }

  const cover = fit === 'cover' || immersive;
  const effectiveRatio = ratio ?? (width && height ? width / height : 4 / 3);
  const isAspectVideo = !fill && !immersive && cover && Math.abs(effectiveRatio - 16 / 9) < 0.001;
  const capped = !fill && !immersive && !!maxWidth;
  const containerStyle: CSSProperties = fill || immersive ? {} : isAspectVideo ? {} : { aspectRatio: effectiveRatio, maxHeight, ...(capped ? { maxWidth } : {}) };
  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const rackVisible = controlsVisible || pointerOver;

  return (
    <div
      data-testid={testId}
      className={cn(
        'overflow-hidden group relative cursor-pointer bg-black',
        fill || immersive ? 'h-full w-full' : isAspectVideo && 'aspect-video',
        capped && 'mx-auto',
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
      onMouseEnter={() => { pointerOverRef.current = true; setPointerOver(true); setControlsVisible(true); }}
      onMouseMove={() => { setControlsVisible(true); if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => { if (playingRef.current && !pointerOverRef.current) setControlsVisible(false); }, 2500); }}
      onMouseLeave={() => { pointerOverRef.current = false; setPointerOver(false); if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => { if (playingRef.current && !pointerOverRef.current) setControlsVisible(false); }, 2500); }}
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
      {playing && !rackVisible && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Pause className="w-8 h-8 text-foreground/60 animate-pulse" strokeWidth={1.5} />
        </div>
      )}
      {/* The control rack — the same surface as the hls path (consistency). */}
      {playing && (
        <div
          data-testid="player-controls"
          className={cn(
            'absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-3 pb-2.5 pt-8 transition-opacity duration-200',
            'bg-gradient-to-t from-black/80 via-black/30 to-transparent',
            rackVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          <div className="group/scrub relative flex h-4 items-center">
            <div className="absolute inset-x-0 h-1 rounded-full bg-white/25" />
            <div className="absolute h-1 rounded-full bg-brand" style={{ width: `${progress}%` }} aria-hidden />
            <input
              type="range"
              data-testid="scrubber"
              aria-label="Seek"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={seek}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full cursor-pointer appearance-none bg-transparent
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground
                [&::-webkit-slider-thumb]:opacity-0 group-hover/scrub:[&::-webkit-slider-thumb]:opacity-100
                [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground"
            />
          </div>
          <div className="flex items-center gap-1">
            <IconBtn aria-label={playing ? 'Pause' : 'Play'} data-testid="play-pause-button" onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="h-8 w-8">
              {playing ? <Pause className="w-4 h-4" strokeWidth={2} /> : <Play className="w-4 h-4 ml-0.5" strokeWidth={2} fill="currentColor" />}
            </IconBtn>
            <IconBtn aria-label={muted ? 'Unmute' : 'Mute'} data-testid="volume-toggle" onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="h-8 w-8">
              {muted || volume === 0 ? <VolumeX className="w-4 h-4" strokeWidth={2} /> : <Volume2 className="w-4 h-4" strokeWidth={2} />}
            </IconBtn>
            <input
              type="range"
              data-testid="volume-slider"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={changeVolume}
              onClick={(e) => e.stopPropagation()}
              className="hidden w-12 cursor-pointer accent-brand sm:block"
            />
            <span data-testid="time-display" className="ml-1 text-xs font-mono tabular-nums text-foreground/90">
              {fmtTime(current)}<span className="text-foreground/50"> / {fmtTime(duration)}</span>
            </span>
            <div className="ml-auto flex items-center gap-1">
              <RackMenu label="Playback speed" testId="speed-select" value={speed} options={[...SPEEDS]} onPick={setSpeed} icon={<Gauge className="w-4 h-4" strokeWidth={2} />} />
              <IconBtn aria-label="Fullscreen" data-testid="fullscreen-button" onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="h-8 w-8">
                <Maximize2 className="w-4 h-4" strokeWidth={2} />
              </IconBtn>
            </div>
          </div>
        </div>
      )}
      {showDuration && durationSeconds && !playing && (
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
