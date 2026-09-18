import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
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

interface HlsVideoPlayerProps {
  /** Path-only manifest URL minted by the read (10-min sig). */
  manifestUrl: string;
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
export function HlsVideoPlayer({ manifestUrl, poster, width, height, className, maxWidth }: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
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

  // ── Attach the source (hls.js first, native HLS fallback) ─────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    LOG('hls player — attach, manifest:', manifestHref);

    if (window.Hls && window.Hls.isSupported()) {
      const Hls = window.Hls;
      const hls = new Hls();
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        LOG('hls player — manifest parsed, levels:', data.levels.map((l: { height: number }) => `${l.height}p`).join('/'));
        setLevels(data.levels);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        LOG('hls player — switched to level', data.level);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        LOG_ERR('hls player — error, type:', data.type, 'details:', data.details, 'fatal:', data.fatal);
        if (data.fatal) setFailed(true);
      });
      hls.loadSource(manifestHref);
      hls.attachMedia(el);
      return () => {
        LOG('hls player — destroy');
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      LOG('hls player — native HLS (Safari)');
      el.src = manifestHref;
      return;
    }

    LOG_ERR('hls player — no HLS support in this browser');
    setFailed(true);
  }, [manifestHref]);

  // ── Keep the DOM in sync with playback events ─────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => { playingRef.current = true; setPlaying(true); showControls(); };
    const onPause = () => { playingRef.current = false; setPlaying(false); setControlsVisible(true); };
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Speed works on every path (video-experience.md player spec). ──────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = parseFloat(SPEEDS[speed]);
    LOG('hls player — speed set to', el.playbackRate);
  }, [speed]);

  // ── Manual quality selection (the YouTube gear menu): index 0 = auto (ABR). ─
  useEffect(() => {
    const hls = hlsRef.current;
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
    if (el.paused) el.play().catch(() => {});
    else el.pause();
    showControls();
  }

  function seek(e: ChangeEvent<HTMLInputElement>) {
    const el = videoRef.current;
    if (!el) return;
    const t = parseFloat(e.target.value);
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
        <p className="text-sm text-muted-foreground">This video can’t be played in your browser.</p>
      </div>
    );
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      data-testid="hls-video-player"
      className={cn('relative overflow-hidden bg-black', className)}
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
        className={cn('group relative w-full', maxWidth && 'mx-auto')}
        style={{ aspectRatio: ratio, maxWidth }}
      >
        <video
          ref={videoRef}
          data-testid="hls-video"
          poster={poster}
          className="w-full h-full object-contain"
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          onClick={togglePlay}
          onError={() => {
            // The native-HLS path (iOS Safari — no MSE, so hls.js is skipped):
            // a failed manifest/segment load fires `error` on the <video>.
            // Without this the player sat as a silent black box.
            LOG_ERR('hls player — native video error, code:', videoRef.current?.error?.code, 'msg:', videoRef.current?.error?.message);
            setFailed(true);
          }}
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
