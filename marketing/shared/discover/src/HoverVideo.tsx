import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from './utils';
import { IconBtn } from './ui';
import { sourceFromMedia } from './VideoPlayer';
import { API_ORIGIN } from './config';
import type { HlsInstance } from './hls';
import type { MediaItem } from './types';

const LOG = (...args: unknown[]) => console.log('[discover:hover-video]', ...args);

// ── The touch-dwell coordinator (the mobile analog of hover) ─────────────────
// A touch device has no hover — the YouTube mobile behavior instead: the
// preview plays when the finger STOPS over a tile (a scroll dwell), keeps
// playing while the tile stays in view + the finger is idle, and stops the
// moment the user scrolls away. At most ONE tile plays at a time: the most
// visible eligible tile wins (a wall of tiles scrolling by does not mint N
// live previews).
//
// The coordinator is module-level (one per page, shared by every tile):
//   - each tile registers with its element + win/lose callbacks;
//   - each tile reports its IntersectionObserver visibility ratio;
//   - a global scroll/touchmove/resize listener cancels the current preview
//     (the "the finger moved" signal) and arms the dwell timer;
//   - the timer (the "the finger stopped" signal) elects the most visible
//     eligible tile and hands it the win.
//
// The timer + the listener are created lazily on first registration and torn
// down when the last tile unregisters (a page with no tiles pays nothing).

const DWELL_THRESHOLD = 0.6; // a tile must be ≥60% visible to be eligible
const DWELL_MS = 300; // the finger must be still this long before the preview starts

interface DwellEntry {
  el: HTMLElement;
  ratio: number;
  onWin: () => void;
  onLose: () => void;
}

let dwellEntries = new Map<symbol, DwellEntry>();
let dwellWinner: symbol | null = null;
let dwellTimer: ReturnType<typeof setTimeout> | null = null;
let dwellListenersBound = false;

function dwellElect() {
  let best: symbol | null = null;
  let bestRatio = DWELL_THRESHOLD;
  dwellEntries.forEach((entry, id) => {
    if (entry.ratio >= bestRatio) {
      bestRatio = entry.ratio;
      best = id;
    }
  });
  const winner = best;
  if (winner === dwellWinner) return;
  if (dwellWinner !== null) dwellEntries.get(dwellWinner)?.onLose();
  dwellWinner = winner;
  if (winner !== null) {
    LOG('dwell → win (ratio', bestRatio.toFixed(2) + ')');
    dwellEntries.get(winner)?.onWin();
  } else {
    LOG('dwell → no eligible tile, preview off');
  }
}

function dwellActivity() {
  // The finger moved: the current preview loses immediately (no timer — the
  // user is scrolling away) and the next win waits for a fresh dwell.
  if (dwellTimer !== null) {
    clearTimeout(dwellTimer);
    dwellTimer = null;
  }
  if (dwellWinner !== null) {
    LOG('dwell → activity, preview off');
    dwellEntries.get(dwellWinner)?.onLose();
    dwellWinner = null;
  }
  dwellTimer = setTimeout(() => {
    dwellTimer = null;
    dwellElect();
  }, DWELL_MS);
}

function bindDwellListeners() {
  if (dwellListenersBound || typeof window === 'undefined') return;
  dwellListenersBound = true;
  window.addEventListener('scroll', dwellActivity, { passive: true });
  window.addEventListener('touchmove', dwellActivity, { passive: true });
  window.addEventListener('resize', dwellActivity, { passive: true });
}

function releaseDwellListeners() {
  if (!dwellListenersBound) return;
  dwellListenersBound = false;
  window.removeEventListener('scroll', dwellActivity);
  window.removeEventListener('touchmove', dwellActivity);
  window.removeEventListener('resize', dwellActivity);
}

function registerDwell(id: symbol, el: HTMLElement, onWin: () => void, onLose: () => void) {
  dwellEntries.set(id, { el, ratio: 0, onWin, onLose });
  bindDwellListeners();
}

function unregisterDwell(id: symbol) {
  const wasWinner = dwellWinner === id;
  dwellEntries.delete(id);
  if (wasWinner) {
    dwellWinner = null;
    // A new winner may exist among the remaining tiles (the wall re-elects).
    dwellElect();
  }
  if (dwellEntries.size === 0) {
    if (dwellTimer !== null) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
    releaseDwellListeners();
  }
}

function reportDwellVisibility(id: symbol, ratio: number) {
  const entry = dwellEntries.get(id);
  if (!entry) return;
  entry.ratio = ratio;
  // The current winner was scrolled out of eligibility: it loses immediately
  // (no dwell wait — the user is moving away from it).
  if (dwellWinner === id && ratio < DWELL_THRESHOLD) {
    if (dwellTimer !== null) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
    entry.onLose();
    dwellWinner = null;
    return;
  }
  // A newly eligible tile while nothing plays: arm the dwell timer (the
  // finger-stopped signal) and elect.
  if (dwellWinner === null && ratio >= DWELL_THRESHOLD && dwellTimer === null) {
    dwellTimer = setTimeout(() => {
      dwellTimer = null;
      dwellElect();
    }, DWELL_MS);
  }
}

/** Test seam: the coordinator's live state (winner + each entry's ratio). */
export function __dwellState() {
  const ratios: Record<string, number> = {};
  dwellEntries.forEach((entry, id) => {
    ratios[entry.el.getAttribute('data-testid') || String(id)] = entry.ratio;
  });
  return {
    winner: dwellWinner !== null ? (dwellEntries.get(dwellWinner)?.el.getAttribute('data-testid') ?? null) : null,
    ratios,
  };
}

/** Test seam: reset the coordinator between tests. */
export function __resetDwellForTests() {
  if (dwellTimer !== null) clearTimeout(dwellTimer);
  dwellTimer = null;
  dwellWinner = null;
  dwellEntries = new Map();
  releaseDwellListeners();
}

/** True on a device without hover (touch phones / tablets). jsdom-safe. */
function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    const onChange = () => setTouch(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return touch;
}

/**
 * The hover preview — the YouTube home-page behavior (the operator's ask,
 * 25.09.2026: "when you hover on youtube, the video starts playing … even has
 * that nice audio icon in the top right to toggle volume").
 *
 * The HomeCard's 16:9 thumbnail is a poster at rest. When the pointer enters
 * (a hover-capable device) the video starts playing **muted** (the browser's
 * autoplay policy), `object-cover` in the same 16:9 frame. A speaker icon
 * (top-right, the YouTube position) toggles the sound — the user's explicit
 * gesture, so un-muted playback is allowed. A thin **progress bar** tracks
 * the preview's position along the bottom (the YouTube home behavior). When
 * the pointer leaves, playback stops and the poster returns.
 *
 * **Touch devices (the mobile analog of hover, the YouTube mobile behavior):**
 * a phone never fires `mouseenter`, so the pointer path is dead there.
 * Instead the preview plays on a **scroll dwell**: the tile is ≥60% in the
 * viewport (an IntersectionObserver) AND the finger has stopped moving
 * (a 300ms quiet window over the global scroll/touchmove/resize signal) →
 * the preview starts, **muted**, and keeps playing (looping) while the tile
 * stays in view + the finger is idle. The moment the user scrolls again the
 * preview stops (the poster returns), and it re-arms on the next dwell — the
 * "it detects again a little later" behavior. At most **one** tile plays at
 * a time: a module-level coordinator elects the most visible eligible tile,
 * so a wall of cards scrolling by does not mint N live previews. Both input
 * paths (pointer hover, touch dwell) drive the same `hovered` state, so the
 * play/pause effect, the lazy attach, the reveal, the scrubber, and the
 * speaker toggle are shared — one preview machine, two inputs.
 *
 * The video is revealed only once it is actually **playing** (frames on
 * screen) — `canplay` fires before the first frame renders (notably for
 * HLS), so keying the crossfade to it left a gray/black tile. The poster
 * stays as the backdrop the whole time, so the tile never flashes.
 *
 * The source follows the same rule as every other video surface
 * (`video-player.md`): a transcoded video (`status === 'done'` + a minted
 * `manifest_url`) plays through hls.js (native HLS on Safari); anything else
 * plays the direct file. The source attaches **lazily on first hover** — a
 * wall of cards does not mint/attach N players at rest.
 *
 * The frame is inert to the pointer: the card's `<a>` (the post's permalink)
 * owns the click — hovering plays, clicking navigates.
 */
export interface HoverVideoProps {
  /** The post's first media (the video). */
  media: MediaItem;
  /** The poster shown at rest (the video's thumbnail / first frame). */
  poster?: string;
  testId?: string;
  className?: string;
  /**
   * Reports the preview's live position as it plays (the `timeupdate` /
   * `loadedmetadata` / `durationchange` signal). The parent's time-lapse badge
   * keys off this — at rest the badge shows the clip's total length, while the
   * preview plays it counts up the elapsed position.
   */
  onTime?: (current: number, duration: number) => void;
  /** Fires when the preview starts/stops playing (the `playing` / `pause` signal). */
  onPlayingChange?: (playing: boolean) => void;
  /**
   * Prioritize the poster image (above-the-fold tiles). When true the poster
   * loads eagerly with `fetchPriority="high"` so the first-view thumbnails
   * paint fast instead of the dark frame showing through while a lazy image
   * is deferred. Below-the-fold tiles stay lazy (the default).
   */
  priority?: boolean;
}

export function HoverVideo({ media, poster, testId, className, onTime, onPlayingChange, priority = false }: HoverVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const attachedRef = useRef(false);
  // The tile's frame element (the touch-dwell IntersectionObserver target).
  const frameRef = useRef<HTMLDivElement>(null);
  // This tile's coordinator registration id (the touch-dwell path).
  const dwellIdRef = useRef<symbol | null>(null);
  // The scrubber's hit area — the pointer math (clientX → time) reads its rect.
  const trackRef = useRef<HTMLDivElement>(null);
  // The parent's live-position callbacks, kept in refs so the (empty-deps)
  // listener effect always calls the latest closure without re-binding.
  const onTimeRef = useRef(onTime);
  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => {
    onTimeRef.current = onTime;
    onPlayingChangeRef.current = onPlayingChange;
  });
  // The pointer's hover (a hover-capable device). The touch-dwell path
  // (below) is OR'd into the `hovered` value at render time.
  const [pointerHover, setPointerHover] = useState(false);
  const [muted, setMuted] = useState(true);
  // The video is only revealed once it is actually PLAYING (frames on
  // screen) — `canplay` fires before the first frame renders (notably for
  // HLS), so keying the crossfade to it left a gray/black tile.
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // The YouTube-style progress bar (the preview's position in the clip).
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  // ── The touch-dwell state (the mobile analog of hover) ────────────────────
  // `isTouch` — the device has no hover (a phone / tablet). `inView` — the
  // tile is ≥60% in the viewport (an IntersectionObserver). `dwell` — the
  // coordinator's win (the finger has stopped over the tile). The touch path
  // feeds the SAME `hovered` value the pointer path uses, computed at render
  // time (no derived-state effect — a state update from an effect is an
  // extra render hop that the effect chain below must not depend on):
  //   pointer hover on a hover-capable device, OR the scroll-dwell win on a
  //   touch device.
  const isTouch = useIsTouchDevice();
  const [inView, setInView] = useState(false);
  const [dwell, setDwell] = useState(false);
  const hovered = pointerHover || (isTouch && inView && dwell);

  const source = sourceFromMedia(media);

  // ── Attach the source lazily (first hover) ────────────────────────────────
  useEffect(() => {
    if (!hovered || attachedRef.current) return;
    const el = videoRef.current;
    if (!el) return;
    attachedRef.current = true;

    if (source.type === 'hls') {
      const manifestHref = `${API_ORIGIN}${source.manifestUrl}`;
      LOG('attach — hls, manifest:', manifestHref);
      if (window.Hls && window.Hls.isSupported()) {
        const Hls = window.Hls;
        const hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e, data) => {
          LOG('hls error, type:', data.type, 'details:', data.details, 'fatal:', data.fatal);
          if (data.fatal) setFailed(true);
        });
        hls.loadSource(manifestHref);
        hls.attachMedia(el);
      } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
        LOG('attach — native HLS (Safari)');
        el.src = manifestHref;
      } else {
        LOG('attach — no HLS support in this browser');
        setFailed(true);
      }
    } else if (source.type === 'file') {
      LOG('attach — file, url:', source.url);
      el.src = source.url;
    } else {
      // `sourceFromMedia` never yields a youtube source (the Shorts path is
      // not a hover-preview candidate) — degrade to the poster.
      LOG('attach — unsupported source type for a hover preview');
      setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered]);

  // ── Playing signal + progress (the poster → video crossfade) ─────────────
  // Listens for the lifetime of the element: a hover that leaves before the
  // source is playable must not lose the signal (the attach effect runs once).
  // `playing` is the reveal gate — it fires only when frames are actually on
  // screen, so the tile never shows a gray/black frame.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlaying = () => {
      setPlaying(true);
      onPlayingChangeRef.current?.(true);
    };
    const onPause = () => {
      setPlaying(false);
      onPlayingChangeRef.current?.(false);
    };
    const onTime = () => {
      setCurrent(el.currentTime);
      // Surface the live position to the parent (the time-lapse badge). The
      // state updates above are async, so report the element's raw values now.
      onTimeRef.current?.(el.currentTime, el.duration || 0);
    };
    const onMeta = () => {
      setDuration(el.duration || 0);
      onTimeRef.current?.(el.currentTime, el.duration || 0);
    };
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    return () => {
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
    };
  }, []);

  // ── Play while hovered, stop when the pointer leaves ──────────────────────
  // The source is stable for the card's lifetime (the post's media), so the
  // [hovered, muted, failed] deps drive the play/pause; the `playing` state
  // above (from the element's own events) drives the reveal.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (hovered && !failed) {
      el.muted = muted;
      // Un-muted playback is the user's explicit gesture (the speaker toggle)
      // — make sure it's actually audible, not just un-muted at zero volume.
      if (!muted && el.volume === 0) el.volume = 0.8;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      el.pause();
    }
  }, [hovered, muted, failed]);

  // ── Touch: the scroll-dwell preview (the mobile analog of hover) ──────────
  // A touch device never fires `mouseenter`, so the pointer path above is dead
  // on a phone. The YouTube mobile behavior instead: the preview plays when
  // the finger STOPS over the tile (a scroll dwell), keeps playing while the
  // tile stays in view + the finger is idle, and stops the moment the user
  // scrolls away. The module-level coordinator (above) arbitrates across the
  // wall — one preview at a time, the most visible eligible tile wins.
  //
  //   inView  — an IntersectionObserver on the frame (≥60% visible = eligible)
  //   dwell   — the coordinator's win/lose (the finger-stopped signal)
  //
  // Both feed the SAME `hovered` value the pointer path uses (computed at
  // render time, above), so the play/pause effect, the lazy attach, the
  // reveal, the scrubber, and the speaker toggle are all shared — one preview
  // machine, two input paths.
  useEffect(() => {
    if (!isTouch) return;
    const el = frameRef.current;
    if (!el) return;

    // Eligibility: the tile is ≥60% in the viewport. The ratio is reported to
    // the coordinator, which elects the winner (the most visible eligible
    // tile) and hands it the win after a dwell.
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            // `?? 1`: a firing observer that reports intersecting without a
            // ratio (some mocks / older engines) means "fully in view".
            const ratio = entry.isIntersecting ? (entry.intersectionRatio ?? 1) : 0;
            setInView(ratio >= DWELL_THRESHOLD);
            reportDwellVisibility(dwellIdRef.current, ratio);
          }
        },
        { threshold: [0, 0.25, DWELL_THRESHOLD, 1] },
      );
      io.observe(el);
    }

    // Registration with the coordinator: win → play, lose → stop. The entry
    // holds the element (the coordinator reads its testid for the state seam).
    const id = Symbol('hover-video-dwell');
    dwellIdRef.current = id;
    registerDwell(id, el, () => setDwell(true), () => setDwell(false));

    return () => {
      io?.disconnect();
      unregisterDwell(id);
      dwellIdRef.current = null;
      setInView(false);
      setDwell(false);
    };
    // The frame element is stable for the tile's lifetime; the coordinator
    // callbacks are state setters (stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTouch]);

  // ── Tear down on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        LOG('destroy');
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // The speaker toggle flips the element either way (a toggle while the
  // pointer is still over the card takes effect immediately).
  const toggleMute = (e: React.MouseEvent) => {
    // The speaker is a control, not the card link. `stopPropagation` stops the
    // React handler bubbling to the `<a>`; `preventDefault` cancels the browser's
    // native anchor-follow (the "clicking the speaker opens a new tab" bug —
    // stopPropagation alone does NOT cancel the default navigation).
    e.stopPropagation();
    e.preventDefault();
    const el = videoRef.current;
    if (el) {
      el.muted = !el.muted;
      if (!el.muted && el.volume === 0) el.volume = 0.8;
    }
    setMuted((m) => !m);
    LOG('mute toggled →', !muted);
  };

  // The scrubber: a click anywhere on the track seeks to that position (the
  // YouTube home behavior — the bar is a control, not decoration). The pointer
  // math uses the track's own rect, so it's correct at any card width.
  const seekTo = (clientX: number) => {
    const el = videoRef.current;
    const track = trackRef.current;
    if (!el || !track || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = frac * el.duration;
    el.currentTime = t;
    setCurrent(t);
    LOG('seek →', t.toFixed(2));
  };

  const onScrubClick = (e: React.MouseEvent) => {
    // The scrubber is a control, not the card link — stop the click from
    // navigating out of the tile.
    e.stopPropagation();
    e.preventDefault();
    seekTo(e.clientX);
  };

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  // A failed attach (a codec the browser can't decode, an expired sig) degrades
  // to the poster — the tile still works as a link, the preview is a bonus.
  if (failed) {
    return poster ? (
      <img
        data-testid={testId}
        src={poster}
        alt=""
        className={cn('h-full w-full object-cover', className)}
      />
    ) : (
      <div data-testid={testId} className={cn('h-full w-full bg-elevated', className)} />
    );
  }

  return (
    <div
      ref={frameRef}
      data-testid={testId}
      className={cn('group/hover-video absolute inset-0', className)}
      onMouseEnter={() => {
        LOG('pointer enter');
        setPointerHover(true);
      }}
      onMouseLeave={() => {
        LOG('pointer leave');
        setPointerHover(false);
      }}
    >
      {/* The poster — always the backdrop, pinned to the tile. It shows at
          rest AND while the video loads, so the tile never flashes gray/black:
          the video overlays it and fades in once it is actually playing. Both
          the poster and the video are `absolute inset-0` — they must occupy the
          SAME box (stacked), never flow one below the other (a flow layout
          pushed the video off-screen below the poster, so the audio played but
          the visible image stayed the thumbnail). */}
      {poster && (
        <img
          src={poster}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* The preview — muted autoplay, cover-cropped into the 16:9 frame.
          Overlays the poster (absolute inset-0); revealed only while playing
          (frames on screen). */}
      <video
        ref={videoRef}
        data-testid={`${testId}-video`}
        poster={poster}
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-200',
          playing ? 'opacity-100' : 'opacity-0',
        )}
        muted
        loop
        playsInline
        preload="none"
        onError={() => {
          LOG('video error, code:', videoRef.current?.error?.code, 'msg:', videoRef.current?.error?.message);
          setFailed(true);
        }}
      />

      {/* The scrubber — the YouTube home behavior: a thin track along the
          bottom of the tile, the played portion filled, click-to-seek. It is a
          real control (not `pointer-events-none`): a click anywhere on the
          track seeks to that position. `group-hover/hover-video` reveals a
          thicker track + a thumb while the pointer is over the tile. Only
          while the preview is live and the duration is known. */}
      {hovered && playing && duration > 0 && (
        <div
          ref={trackRef}
          data-testid={`${testId}-scrubber`}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          onClick={onScrubClick}
          className="group/scrub absolute inset-x-0 bottom-0 h-3 cursor-pointer"
        >
          {/* The track — thin at rest, thicker on hover. */}
          <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white/25 transition-all duration-150 group-hover/scrub:h-1" />
          {/* The played portion. */}
          <div
            data-testid={`${testId}-progress`}
            className="absolute bottom-0 left-0 h-0.5 rounded-full bg-white transition-all duration-150 group-hover/scrub:h-1"
            style={{ width: `${progress}%` }}
          />
          {/* The thumb — revealed on hover, at the played edge. */}
          <div
            className="absolute bottom-0 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground opacity-0 transition-opacity duration-150 group-hover/scrub:opacity-100"
            style={{ left: `${progress}%` }}
          />
        </div>
      )}

      {/* The speaker toggle — top-right, the YouTube position. Only while the
          preview is live (nothing to toggle at rest). */}
      {hovered && (
        <IconBtn
          aria-label={muted ? 'Unmute preview' : 'Mute preview'}
          data-testid={`${testId}-mute`}
          onClick={toggleMute}
          className="absolute right-2 top-2 h-8 w-8 rounded-full bg-background/70 backdrop-blur-sm hover:bg-background/90"
        >
          {muted ? (
            <VolumeX className="h-4 w-4 text-foreground" strokeWidth={2} />
          ) : (
            <Volume2 className="h-4 w-4 text-foreground" strokeWidth={2} />
          )}
        </IconBtn>
      )}
    </div>
  );
}
