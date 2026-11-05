import { ReliableImage } from './ReliableImage';
import { hasMediaRecovery, recoverMediaUrl } from './mediaRecovery';
import { useMediaPlaybackBudget, useMediaVisibility } from './mediaVisibility';
import { createContext, useContext, useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Maximize2, TriangleAlert, Play, Pause, Volume2, VolumeX, Gauge, MonitorPlay } from 'lucide-react';
import { cn } from './utils';
import { IconBtn } from './ui';
import { API_ORIGIN } from './config';
import type { HlsInstance } from './hls';

/**
 * The control-rack menu (speed / quality) — a designed popover, not a native
 * <select>. The native select is OS-styled (a lopsided, non-token widget that
 * breaks the flagship bar), so the rack uses a button + a small menu of
 * options. `value` is the selected index into `options`; `onPick` fires with
 * the picked index. Closes on pick, on outside click, and on Escape.
 */
export function RackMenu({ label, value, options, onPick, testId, icon }: {
  label: string;
  value: number;
  options: string[];
  onPick: (i: number) => void;
  testId: string;
  /** The trigger icon — speed and quality need distinct glyphs (two identical
    *  dials read as one control). */
  icon: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const current = options[value] ?? options[0] ?? '';
  return (
    <div ref={ref} className="relative">
      <IconBtn
        aria-label={label}
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-8"
      >
        {icon}
      </IconBtn>
      {open && (
        <div
          data-testid={`${testId}-menu`}
          role="menu"
          aria-label={label}
          className="absolute bottom-full right-0 z-10 mb-1.5 min-w-20 overflow-hidden rounded-md border border-white/10 bg-black/85 py-1 backdrop-blur-md"
        >
          {options.map((opt, i) => (
            <button
              key={opt}
              type="button"
              role="menuitemradio"
              aria-checked={i === value}
              data-testid={`${testId}-option-${i}`}
              onClick={() => { onPick(i); setOpen(false); }}
              className={cn(
                'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors',
                i === value ? 'text-brand-300' : 'text-foreground/80 hover:bg-white/10 hover:text-foreground',
              )}
            >
              {opt}
              {i === value && <span aria-hidden className="text-brand-300">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LOG = (...args: unknown[]) => console.log('[discover:hls]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[discover:hls]', ...args);
export type ManifestRefresh = () => Promise<string | { url: string; isCurrent: () => boolean }>;
/** Each carrier supplies its own live read; the shared player owns no credentials. */
export const HlsRenewalContext = createContext<((manifest: string) => ReturnType<ManifestRefresh>) | undefined>(undefined);

interface HlsVideoPlayerProps {
  /** Path-only manifest URL minted by the read (10-min sig). */
  manifestUrl: string;
  /** Re-read the original carrier under current authority; never extend a sig. */
  refreshManifest?: ManifestRefresh;
  poster?: string;
  /** The source ratio (lowest variant's width/height) — the node preserves
    *  it across renditions, so the first variant IS the source ratio. */
  width?: number;
  height?: number;
  className?: string;
  /**
   * Cap the frame's width (the lightbox's portrait case). A 9:16 clip in the
   * lightbox reserves a full-width 9:16 frame — a box ~1.78× the viewport
   * tall, clipped by the modal, with the control rack stranded off-screen at
   * its bottom. Capping the frame (and centering it in a full-width black
   * letterbox) keeps the whole clip + the rack in view. Absent → full-width
   * (the feed/discover behavior, unchanged).
   */
  maxWidth?: string;
  /**
   * Cap the frame's height (the feed's portrait case, 3.34.0). A 9:16 clip
   * in the feed reserves a full-width 9:16 box — ~1.78× the card tall, which
   * buries the control rack below the fold. Capping the height (and centering
   * the shrunken frame in a full-width black letterbox) keeps the whole clip
   * + the rack in view. Only a portrait clip (`width < height`) is affected:
   * a landscape clip at a height cap is already shorter than full-width, so
   * the cap is a no-op for it. Absent → uncapped (unchanged).
   */
  maxHeight?: string;
  /** Fill a carousel's already-reserved frame without introducing a new ratio. */
  fill?: boolean;
  /** Seek to this time (seconds) once playback is ready (the watch page's
    *  `?t=`). Absent → start at 0 (unchanged). */
  initialTime?: number;
  /** Fired on every `timeupdate` with the current position (seconds) — the
    *  watch page's `?t=` write-back. Absent → no callback (unchanged). */
  onTimeUpdate?: (t: number) => void;
  /** Loop the clip (default `true` — the ambient feed behavior). The watch
    *  page plays once → passes `false`. */
  loop?: boolean;
}

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
 * The feed's HLS player (D44) — the media demo's player, React-ified.
 * hls.js first (the deterministic path everywhere — Chromium on macOS
 * reports native HLS via AVFoundation but can't actually play it), native
 * HLS the fallback for older Safari (video-experience.md player spec).
 *
 * The control surface is overlaid on the video (not a bar below it) and
 * auto-hides while playing + idle, so the feed stays a clean, media-forward
 * surface: tap the video to play/pause, hover/move to reveal the full rack —
 * play/pause, scrubber, time, volume, speed, quality, fullscreen. The same
 * component serves the feed card and the lightbox, so both surfaces get the
 * identical controls.
 */
export function HlsVideoPlayer({ manifestUrl, refreshManifest, poster, width, height, className, maxWidth, maxHeight, fill = false, initialTime, onTimeUpdate, loop = true }: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useMediaPlaybackBudget(videoRef);
  const hlsRef = useRef<HlsInstance | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const pauseIntentRef = useRef(0);
  const qualityRef = useRef(0);
  const speedRef = useRef(0);
  const seekIntentRef = useRef({ version: 0, time: 0 });
  // Whether the pointer is currently over the player. The auto-hide must never
  // fire while the pointer is here — reaching for a control (volume,
  // fullscreen) that sits near the edge of the video would otherwise hide the
  // rack mid-reach (the 9:16 discover bug: the cursor crossed the letterbox
  // border → mouseleave → the rack vanished before the click landed).
  const pointerOverRef = useRef(false);

  const [levels, setLevels] = useState<{ height: number }[]>([]);
  // Index into the quality options (0 = Auto, then each level). The menu is
  // index-driven; the effect below maps the index to hls.currentLevel.
  const [quality, setQuality] = useState(0);
  // Index into SPEEDS (0 = 1x, 1 = 1.5x, 2 = 2x).
  const [speed, setSpeed] = useState(0);
  const [failed, setFailed] = useState(false);
  const [explicit, setExplicit] = useState(false);
  const [autoplayAllowed, setAutoplayAllowed] = useState(!fill);
  const visible = useMediaVisibility(videoRef, failed);
  const eligible = visible || explicit;
  const resumePosition = useRef(0);
  // The poster→video reveal latch: the video fades in only once it has actually
  // played (frames on screen — the `playing` event, NOT `canplay`, which fires
  // before the first frame renders and left a gray/black box). Once revealed it
  // stays: a paused video keeps its current frame, it does not snap back to the
  // poster. The poster `<img>` below is the backdrop the whole time, so the
  // frame shows the thumbnail first, then the video (the no-gray idiom, 3.165.1).
  const [revealed, setRevealed] = useState(false);

  // Playback state (drives the overlay + the play/pause icon).
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(true);
  // Controls are visible on mount (the poster moment) and whenever the pointer
  // moves or the video is paused; they fade out after ~2.5s of playing + idle.
  const [controlsVisible, setControlsVisible] = useState(true);
  // True while the pointer is over the player. The rack is held visible for as
  // long as this is set, independent of the auto-hide timer (see pointerOverRef).
  const [pointerOver, setPointerOver] = useState(false);

  // The ratio comes from the lowest variant (the source ratio, preserved by
  // the node). The frame reserves this ratio and the video fills it
  // (object-contain) — a portrait clip is a tall full-width box, landscape is
  // full-width 16:9. No phone-width column: the video is full-bleed in the card.
  const ratio = width && height ? width / height : 16 / 9;
  const manifestHref = `${API_ORIGIN}${manifestUrl}`;
  const renewCarrier = useContext(HlsRenewalContext);
  const refreshRef = useRef(refreshManifest);
  refreshRef.current = refreshManifest ?? (hasMediaRecovery(manifestUrl) ? () => recoverMediaUrl(manifestUrl) : renewCarrier ? () => renewCarrier(manifestUrl) : undefined);
  useEffect(() => { setFailed(false); }, [manifestHref]);

  // ── Attach the source (hls.js first, native HLS fallback) ─────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !eligible || failed) return;
    LOG('hls player — attach');
    let disposed = false;
    let refreshing = false;
    let exhausted = false;
    let lastRecovery = -Infinity;
    let href = manifestHref;
    let restore: (() => void) | undefined;
    let hls: HlsInstance | undefined;
    const resumeMetadata = () => {
      if (resumePosition.current > 0) el.currentTime = resumePosition.current;
      el.playbackRate = parseFloat(SPEEDS[speedRef.current]);
    };
    el.addEventListener('loadedmetadata', resumeMetadata);
    // Unsigned metadata is a scheduling hint ONLY. The fresh read and node
    // manifest gate remain the authority; malformed hints use error recovery.
    const expiry = () => {
      try {
        const sig = new URL(href).searchParams.get('sig') || '';
        const part = sig.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const { exp, iat } = JSON.parse(atob(part));
        if (typeof exp !== 'number' || !Number.isFinite(exp)) return Infinity;
        const margin = typeof iat === 'number' && Number.isFinite(iat)
          ? Math.max(1000, Math.min(30_000, (exp - iat) * 100)) : 30_000;
        return exp * 1000 - margin;
      } catch { return Infinity; }
    };
    const renew = async () => {
      if (disposed || refreshing || exhausted || !refreshRef.current) return;
      refreshing = true;
      LOG('hls player — renewal read started');
      try {
        const result = await refreshRef.current();
        if (disposed) return;
        const fresh = typeof result === 'string' ? result : result.url;
        const isCurrent = typeof result === 'string' ? () => true : result.isCurrent;
        if (!isCurrent()) throw new Error('Playback session changed');
        const next = new URL(fresh, API_ORIGIN).href;
        if (next === href) throw new Error('Unchanged stream capability');
        const position = el.currentTime;
        const seekIntent = seekIntentRef.current.version;
        const rate = el.playbackRate;
        const speedIntent = speedRef.current;
        const resume = !el.paused;
        const pauseIntent = pauseIntentRef.current;
        href = next;
        if (restore) el.removeEventListener('loadedmetadata', restore);
        restore = () => {
          if (disposed) return;
          if (!isCurrent()) { exhausted = true; setFailed(true); return; }
          el.currentTime = seekIntent === seekIntentRef.current.version ? position : seekIntentRef.current.time;
          el.playbackRate = speedIntent === speedRef.current ? rate : parseFloat(SPEEDS[speedRef.current]);
          if (resume && pauseIntent === pauseIntentRef.current) void el.play().catch(() => {});
        };
        el.addEventListener('loadedmetadata', restore, { once: true });
        el.autoplay = false;
        if (hls) {
          hls.loadSource(href);
          hls.startLoad?.(position);
        } else {
          el.src = href;
          el.load();
        }
        LOG('hls player — renewal source installed');
      } catch {
        if (!disposed) {
          exhausted = true;
          LOG_ERR('hls player — renewal denied or unavailable');
          setFailed(true);
        }
      } finally { refreshing = false; }
    };
    const checkExpiry = () => {
      if (!el.paused && expiry() <= Date.now()) void renew();
    };
    const onNativeError = () => {
      LOG_ERR('hls player — native video error, code:', el.error?.code);
      recover();
    };
    // A pause from native/fullscreen controls is also intent. Conservatively
    // keep a replacement paused if the browser reports a pause while loading.
    const onPauseIntent = () => { pauseIntentRef.current++; el.autoplay = false; setAutoplayAllowed(false); };
    const recover = () => {
      if (disposed || refreshing || exhausted) return;
      if (!refreshRef.current || Date.now() - lastRecovery < 30_000) {
        exhausted = true;
        setFailed(true);
        return;
      }
      lastRecovery = Date.now();
      void renew();
    };
    el.addEventListener('play', checkExpiry);
    el.addEventListener('pause', onPauseIntent);
    el.addEventListener('timeupdate', checkExpiry);
    el.addEventListener('error', onNativeError);
    const detach = () => {
      disposed = true;
      resumePosition.current = el.currentTime || resumePosition.current;
      el.removeEventListener('play', checkExpiry);
      el.removeEventListener('pause', onPauseIntent);
      el.pause();
      el.removeEventListener('timeupdate', checkExpiry);
      el.removeEventListener('error', onNativeError);
      el.removeEventListener('loadedmetadata', resumeMetadata);
      if (restore) el.removeEventListener('loadedmetadata', restore);
      hls?.destroy();
      hlsRef.current = null;
      el.removeAttribute('src');
      el.load();
    };

    if (window.Hls && window.Hls.isSupported()) {
      const Hls = window.Hls;
      hls = new Hls();
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        LOG('hls player — manifest parsed, levels:', data.levels.map((l: { height: number }) => `${l.height}p`).join('/'));
        setLevels(data.levels);
        if (qualityRef.current > 0) hls!.currentLevel = qualityRef.current - 1;
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        LOG('hls player — switched to level', data.level);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        LOG_ERR('hls player — error, type:', data.type, 'details:', data.details, 'fatal:', data.fatal);
        if ((data.response?.code === 403 || data.fatal) && refreshRef.current) recover();
        else if (data.fatal) setFailed(true);
      });
      hls.loadSource(manifestHref);
      hls.attachMedia(el);
      return detach;
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      LOG('hls player — native HLS (Safari)');
      el.src = manifestHref;
      return detach;
    }

    LOG_ERR('hls player — no HLS support in this browser');
    setFailed(true);
    return detach;
  }, [manifestHref, eligible, failed]);

  // ── Seek to the initial time once playback is ready (the watch page's ?t=). ─
  // Applied on `seeked` (metadata + the seek landed) — setting currentTime
  // before the source is ready is a no-op. A one-shot per manifest.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || initialTime == null || initialTime <= 0 || resumePosition.current > 0) return;
    let applied = false;
    const onSeeked = () => {
      if (applied) return;
      applied = true;
      if (Math.abs(el.currentTime - initialTime) > 0.5) el.currentTime = initialTime;
      LOG('hls player — seeked to initial time', initialTime);
    };
    el.addEventListener('seeked', onSeeked);
    // Nudge the seek once the source is attached (hls.js attaches async).
    const t = setTimeout(() => {
      if (el.readyState >= 1 && Math.abs(el.currentTime - initialTime) > 0.5) {
        el.currentTime = initialTime;
      }
    }, 250);
    return () => {
      el.removeEventListener('seeked', onSeeked);
      clearTimeout(t);
    };
  }, [manifestHref, initialTime, failed]);

  // ── Surface timeupdate to the parent (the watch page's ?t= write-back). ────
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !onTimeUpdate) return;
    const onTime = () => onTimeUpdate(el.currentTime);
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [manifestHref, onTimeUpdate, failed]);

  // ── Keep the DOM in sync with playback events ─────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => { playingRef.current = true; setPlaying(true); showControls(); };
    const onPause = () => { playingRef.current = false; setPlaying(false); setControlsVisible(true); };
    // The poster→video reveal latch: fires only when frames are actually on
    // screen (the `playing` event, not `canplay`). Once set it never clears —
    // a paused video keeps its frame, it does not snap back to the poster.
    const onPlaying = () => setRevealed(true);
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onVol = () => { setVolume(el.volume); setMuted(el.muted); };
    const onEnd = () => setControlsVisible(true);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('volumechange', onVol);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('volumechange', onVol);
      el.removeEventListener('ended', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  // ── Speed works on every path (video-experience.md player spec). ──────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    speedRef.current = speed;
    el.playbackRate = parseFloat(SPEEDS[speed]);
    LOG('hls player — speed set to', el.playbackRate);
  }, [speed]);

  // ── Manual quality selection (the YouTube gear menu): index 0 = auto (ABR). ─
  useEffect(() => {
    const hls = hlsRef.current;
    qualityRef.current = quality;
    if (!hls) return;
    const el = videoRef.current;
    // Index 0 = Auto (ABR, -1); index i = level i-1.
    hls.currentLevel = quality === 0 ? -1 : quality - 1;
    LOG('hls player — quality set to level', hls.currentLevel, '(0 = auto)');
    // A mid-playback level switch re-buffers the new rendition's segments. If
    // the current buffer drains before the new level's first segment lands, the
    // <video> stalls and never resumes on its own (the "changing resolution in
    // the middle of playing is broken" bug). Nudge it: resume if it was
    // playing, and make sure hls.js is actively loading (a paused-then-switched
    // player can leave autoStartLoad disengaged).
    if (el && !el.paused) el.play().catch(() => {});
    if (typeof (hls as unknown as { startLoad?: unknown }).startLoad === 'function') {
      const h = hls as unknown as { autoStartLoad?: boolean; startLoad: () => void };
      if (h.autoStartLoad === false) h.startLoad();
    }
  }, [quality]);

  // ── Auto-hide the controls while playing + idle ───────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // Only hide while actively playing AND the pointer has left the player.
      // A paused video keeps its controls; a video the pointer is still over
      // keeps them too (reaching for a control must not hide the rack).
      // Read the refs (not state) so the timer never races a stale closure.
      if (playingRef.current && !pointerOverRef.current) setControlsVisible(false);
    }, 2500);
  }, []);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  // ── Control handlers ──────────────────────────────────────────────────────
  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    LOG('hls player — play/pause toggled');
    setAutoplayAllowed(el.paused);
    if (el.paused) el.play().catch(() => {});
    else { pauseIntentRef.current++; el.pause(); }
    showControls();
  }

  function seek(e: ChangeEvent<HTMLInputElement>) {
    const el = videoRef.current;
    if (!el) return;
    const t = parseFloat(e.target.value);
    seekIntentRef.current = { version: seekIntentRef.current.version + 1, time: t };
    el.currentTime = t;
    setCurrent(t);
    LOG('hls player — seek to', t);
    showControls();
  }

  function changeVolume(e: ChangeEvent<HTMLInputElement>) {
    const el = videoRef.current;
    if (!el) return;
    const v = parseFloat(e.target.value);
    el.volume = v;
    el.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
    showControls();
  }

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    showControls();
  }

  function toggleFullscreen() {
    const el = videoRef.current;
    if (!el) return;
    LOG('hls player — fullscreen toggled');
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => LOG_ERR('hls player — exit fullscreen failed:', err.message));
    } else {
      el.requestFullscreen().catch((err) => LOG_ERR('hls player — fullscreen failed:', err.message));
    }
  }

  if (failed) {
    return (
      <div
        data-testid="hls-player-error"
        className={cn('bg-elevated flex flex-col items-center justify-center gap-2 py-10 px-4 text-center', className)}
      >
        <TriangleAlert className="w-6 h-6 text-warning" strokeWidth={1.75} />
        <p className="text-sm text-muted-foreground">Video unavailable. Check your connection or try again.</p>
        <button type="button" className="min-h-11 rounded px-3 text-sm text-brand-300 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setExplicit(true); setFailed(false); }}>Retry video</button>
      </div>
    );
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  // A height cap only bites for a portrait clip (ratio < 1): a landscape clip
  // at full width is already shorter than the cap, so the cap is a no-op for
  // it (no centering, no visual change). A portrait clip's frame shrinks to
  // fit the capped height and is centered in the full-width black letterbox —
  // the same shape the maxWidth cap produces (the feed's "looks great" ref).
  const heightCapped = !!maxHeight && ratio < 1;

  return (
    <div
      data-testid="hls-video-player"
      onPointerDown={() => setExplicit(true)}
      onKeyDown={() => setExplicit(true)}
      className={cn('relative overflow-hidden bg-black', fill && 'h-full w-full', className)}
      onMouseEnter={() => { pointerOverRef.current = true; setPointerOver(true); showControls(); }}
      onMouseMove={showControls}
      onMouseLeave={() => {
        // The pointer left the whole player (video + letterbox): drop the hold,
        // then arm the idle window so a playing video's rack fades out on its
        // own (a paused one keeps it). The handlers live on the OUTER box so
        // reaching across the letterbox border (a capped portrait frame) never
        // hides the rack mid-reach.
        pointerOverRef.current = false;
        setPointerOver(false);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
          if (playingRef.current && !pointerOverRef.current) setControlsVisible(false);
        }, 2500);
      }}
    >
      <div
        className={cn('group relative w-full', fill && 'h-full', (maxWidth || heightCapped) && 'mx-auto')}
        style={fill ? undefined : { aspectRatio: ratio, maxWidth, ...(heightCapped ? { maxHeight } : {}) }}
      >
        {/* The poster — always the backdrop (the thumbnail-first face). It
            shows while the manifest + first segment load, then the video fades
            in over it once frames are on screen (the no-gray idiom, 3.165.1).
            Both are `absolute inset-0` so they occupy the SAME box (stacked) —
            the video overlays the poster, never flows below it. */}
        {poster && (
          <ReliableImage
            src={poster}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
        <video
          ref={videoRef}
          data-testid="hls-video"
          className={cn(
            'absolute inset-0 w-full h-full object-contain transition-opacity duration-200',
            revealed ? 'opacity-100' : 'opacity-0',
          )}
          muted
          autoPlay={!fill && eligible && autoplayAllowed}
          loop={loop}
          playsInline
          preload="none"
          onPlay={() => { hlsRef.current?.startLoad?.(); }}
          onPause={() => { hlsRef.current?.stopLoad?.(); }}
          onPointerDown={() => setExplicit(true)}
          onClick={togglePlay}
        />

        {/* Tap / hover reveals the rack; it fades out while playing + idle. */}
        <div
          data-testid="player-controls"
          className={cn(
            'absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-3 pb-2.5 pt-8 transition-opacity duration-200',
            'bg-gradient-to-t from-black/80 via-black/30 to-transparent',
            controlsVisible || pointerOver ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          {/* Scrubber — full-width, the only horizontal element. */}
          <div className="group/scrub relative flex h-4 items-center">
            <div className="absolute inset-x-0 h-1 rounded-full bg-white/25" />
            <div
              className="absolute h-1 rounded-full bg-brand"
              style={{ width: `${progress}%` }}
              aria-hidden
            />
            <input
              type="range"
              data-testid="scrubber"
              aria-label="Seek"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={seek}
              className="relative w-full cursor-pointer appearance-none bg-transparent
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground
                [&::-webkit-slider-thumb]:opacity-0 group-hover/scrub:[&::-webkit-slider-thumb]:opacity-100 group-hover:[&::-webkit-slider-thumb]:opacity-100
                [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground"
            />
          </div>

          {/* The control row — one line, evenly spaced, no text labels. */}
          <div className="flex items-center gap-1">
            <IconBtn
              aria-label={playing ? 'Pause' : 'Play'}
              data-testid="play-pause-button"
              onClick={togglePlay}
              className="h-8 w-8"
            >
              {playing ? (
                <Pause className="w-4 h-4" strokeWidth={2} />
              ) : (
                <Play className="w-4 h-4 ml-0.5" strokeWidth={2} fill="currentColor" />
              )}
            </IconBtn>

            <IconBtn
              aria-label={muted ? 'Unmute' : 'Mute'}
              data-testid="volume-toggle"
              onClick={toggleMute}
              className="h-8 w-8"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4" strokeWidth={2} />
              ) : (
                <Volume2 className="w-4 h-4" strokeWidth={2} />
              )}
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
              className="hidden w-12 cursor-pointer accent-brand sm:block"
            />

            <span
              data-testid="time-display"
              className="ml-1 text-xs font-mono tabular-nums text-foreground/90"
            >
              {fmtTime(current)}
              <span className="text-foreground/50"> / {fmtTime(duration)}</span>
            </span>

            <div className="ml-auto flex items-center gap-1">
              <RackMenu
                label="Playback speed"
                testId="speed-select"
                value={speed}
                options={[...SPEEDS]}
                onPick={setSpeed}
                icon={<Gauge className="w-4 h-4" strokeWidth={2} />}
              />
              <RackMenu
                label="Quality"
                testId="quality-select"
                value={quality}
                options={['Auto', ...levels.map((l) => `${l.height}p`)]}
                onPick={setQuality}
                icon={<MonitorPlay className="w-4 h-4" strokeWidth={2} />}
              />
              <IconBtn
                aria-label="Fullscreen"
                data-testid="fullscreen-button"
                onClick={toggleFullscreen}
                className="h-8 w-8"
              >
                <Maximize2 className="w-4 h-4" strokeWidth={2} />
              </IconBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
