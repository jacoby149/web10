import { useEffect, useRef, useState } from 'react';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Maximize2, TriangleAlert } from 'lucide-react';
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

/**
 * The feed's HLS player (D44) — the media demo's player, React-ified.
 * hls.js first (the deterministic path everywhere — Chromium on macOS
 * reports native HLS via AVFoundation but can't actually play it), native
 * HLS the fallback for older Safari (video-experience.md player spec):
 * muted autoplay, manual quality (Auto + each level), speed, fullscreen,
 * vertical videos in a phone-width column.
 */
export function HlsVideoPlayer({ manifestUrl, poster, width, height, className }: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const [levels, setLevels] = useState<{ height: number }[]>([]);
  const [quality, setQuality] = useState('-1');
  const [speed, setSpeed] = useState('1');
  const [failed, setFailed] = useState(false);

  // The ratio comes from the lowest variant (the source ratio, preserved by
  // the node). Vertical (< 0.8) gets the phone-width column — the immersive
  // feed feel; landscape goes full width.
  const ratio = width && height ? width / height : 16 / 9;
  const isVertical = ratio < 0.8;
  const manifestHref = `${API_ORIGIN}${manifestUrl}`;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    LOG('hls player — attach, manifest:', manifestHref);

    // hls.js first — it works on Chrome, Firefox, AND modern Safari (MSE).
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

    // Native HLS — older Safari only.
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      LOG('hls player — native HLS (Safari)');
      el.src = manifestHref;
      return;
    }

    LOG_ERR('hls player — no HLS support in this browser');
    setFailed(true);
  }, [manifestHref]);

  // Speed works on every path (video-experience.md player spec).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = parseFloat(speed);
    LOG('hls player — speed set to', el.playbackRate);
  }, [speed]);

  // Manual quality selection (the YouTube gear menu): -1 = auto (ABR),
  // otherwise the level index.
  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = parseInt(quality, 10);
    LOG('hls player — quality set to level', hls.currentLevel, '(-1 = auto)');
  }, [quality]);

  function toggleFullscreen() {
    const el = videoRef.current;
    if (!el) return;
    LOG('hls player — fullscreen toggled');
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((e) => LOG_ERR('hls player — exit fullscreen failed:', e.message));
    } else {
      el.requestFullscreen().catch((e) => LOG_ERR('hls player — fullscreen failed:', e.message));
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

  return (
    <div data-testid="hls-video-player" className={cn('bg-elevated', className)}>
      <div className={cn(isVertical && 'mx-auto max-w-[280px]')} style={{ aspectRatio: ratio }}>
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
        />
      </div>
      <div
        data-testid="player-controls"
        className={cn('flex items-center gap-2 px-3 py-2 border-t border-border', isVertical && 'mx-auto max-w-[280px]')}
      >
        <span className="text-[0.6875rem] text-muted-foreground">quality</span>
        <Select
          data-testid="quality-select"
          aria-label="quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          className="h-7 w-auto min-w-16 text-xs px-2"
        >
          <option value="-1">Auto</option>
          {levels.map((l, i) => (
            <option key={i} value={String(i)}>
              {l.height}p
            </option>
          ))}
        </Select>
        <span className="text-[0.6875rem] text-muted-foreground">speed</span>
        <Select
          data-testid="speed-select"
          aria-label="speed"
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
          className="h-7 w-auto min-w-14 text-xs px-2"
        >
          <option value="1">1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fullscreen"
          data-testid="fullscreen-button"
          onClick={toggleFullscreen}
          className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}
