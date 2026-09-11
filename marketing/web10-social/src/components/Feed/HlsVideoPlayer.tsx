import { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Maximize2, TriangleAlert, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_ORIGIN } from '@/lib/origins';
import type { HlsInstance } from '@/types/hls';

const LOG = (...args: unknown[]) => console.log('[social:feed]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[social:feed]', ...args);

interface HlsVideoPlayerProps {
  /** Path-only manifest URL minted by the read (10-min sig). */
  manifestUrl: string;
  poster?: string;
  /** The source ratio (lowest variant's width/height) — the node preserves
   *  it across renditions, so the first variant IS the source ratio. */
  width?: number;
  height?: number;
  className?: string;
}

/** m:ss — the time readout (current / total). */
function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

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
export function HlsVideoPlayer({ manifestUrl, poster, width, height, className }: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);

  const [levels, setLevels] = useState<{ height: number }[]>([]);
  const [quality, setQuality] = useState('-1');
  const [speed, setSpeed] = useState('1');
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

  // The ratio comes from the lowest variant (the source ratio, preserved by
  // the node). Vertical (< 0.8) gets the phone-width column — the immersive
  // feed feel; landscape goes full width.
  const ratio = width && height ? width / height : 16 / 9;
  const isVertical = ratio < 0.8;
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
    el.playbackRate = parseFloat(speed);
    LOG('hls player — speed set to', el.playbackRate);
  }, [speed]);

  // ── Manual quality selection (the YouTube gear menu): -1 = auto (ABR). ────
  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = parseInt(quality, 10);
    LOG('hls player — quality set to level', hls.currentLevel, '(-1 = auto)');
  }, [quality]);

  // ── Auto-hide the controls while playing + idle ───────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // Only hide while actively playing — a paused video keeps its controls.
      // Read the ref (not state) so the timer never races a stale closure.
      if (playingRef.current) setControlsVisible(false);
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

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = videoRef.current;
    if (!el) return;
    const t = parseFloat(e.target.value);
    el.currentTime = t;
    setCurrent(t);
    LOG('hls player — seek to', t);
    showControls();
  }

  function changeVolume(e: React.ChangeEvent<HTMLInputElement>) {
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
    <div data-testid="hls-video-player" className={cn('bg-elevated', className)}>
      <div
        className={cn('group relative', isVertical && 'mx-auto max-w-[280px]')}
        style={{ aspectRatio: ratio }}
        onMouseMove={showControls}
        onMouseLeave={() => { if (playing) setControlsVisible(false); }}
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
            'absolute inset-x-0 bottom-0 flex flex-col gap-1 px-3 pb-2 pt-8 transition-opacity duration-200',
            'bg-gradient-to-t from-black/70 via-black/25 to-transparent',
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          {/* Scrubber */}
          <div className="relative flex h-4 items-center">
            {/* Track + played fill */}
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
                [&::-webkit-slider-thumb]:opacity-0 group-hover:[&::-webkit-slider-thumb]:opacity-100
                [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground"
            />
          </div>

          {/* Button row */}
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={playing ? 'Pause' : 'Play'}
              data-testid="play-pause-button"
              onClick={togglePlay}
              className="h-8 w-8 text-foreground hover:text-foreground hover:bg-white/10"
            >
              {playing ? (
                <Pause className="w-4 h-4" strokeWidth={2} />
              ) : (
                <Play className="w-4 h-4 ml-0.5" strokeWidth={2} />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={muted ? 'Unmute' : 'Mute'}
              data-testid="volume-toggle"
              onClick={toggleMute}
              className="h-8 w-8 text-foreground hover:text-foreground hover:bg-white/10"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4" strokeWidth={2} />
              ) : (
                <Volume2 className="w-4 h-4" strokeWidth={2} />
              )}
            </Button>

            <input
              type="range"
              data-testid="volume-slider"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={changeVolume}
              className="hidden w-14 cursor-pointer accent-brand sm:block"
            />

            <span
              data-testid="time-display"
              className="ml-1 text-[0.6875rem] font-mono tabular-nums text-foreground/90"
            >
              {fmtTime(current)} / {fmtTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[0.6875rem] text-foreground/70">speed</span>
              <Select
                data-testid="speed-select"
                aria-label="speed"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                className="h-7 w-auto min-w-14 rounded-sm border-white/20 bg-black/40 px-2 text-xs text-foreground"
              >
                <option value="1">1x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
              </Select>
              <span className="text-[0.6875rem] text-foreground/70">quality</span>
              <Select
                data-testid="quality-select"
                aria-label="quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="h-7 w-auto min-w-16 rounded-sm border-white/20 bg-black/40 px-2 text-xs text-foreground"
              >
                <option value="-1">Auto</option>
                {levels.map((l, i) => (
                  <option key={i} value={String(i)}>
                    {l.height}p
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fullscreen"
                data-testid="fullscreen-button"
                onClick={toggleFullscreen}
                className="h-8 w-8 text-foreground hover:text-foreground hover:bg-white/10"
              >
                <Maximize2 className="w-4 h-4" strokeWidth={2} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
