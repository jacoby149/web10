import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from './utils';
import { IconBtn } from './ui';
import { sourceFromMedia } from './VideoPlayer';
import { API_ORIGIN } from './config';
import type { HlsInstance } from './hls';
import type { MediaItem } from './types';

const LOG = (...args: unknown[]) => console.log('[discover:hover-video]', ...args);

/**
 * The hover preview — the YouTube home-page behavior (the operator's ask,
 * 25.09.2026: "when you hover on youtube, the video starts playing … even has
 * that nice audio icon in the top right to toggle volume").
 *
 * The HomeCard's 16:9 thumbnail is a poster at rest. When the pointer enters
 * (a hover-capable device — touch devices never fire `mouseenter`, so they
 * keep the static thumbnail + the tap navigates), the video starts playing
 * **muted** (the browser's autoplay policy), `object-cover` in the same 16:9
 * frame. A speaker icon (top-right, the YouTube position) toggles the sound —
 * the user's explicit gesture, so un-muted playback is allowed. When the
 * pointer leaves, playback stops and the poster returns.
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
}

export function HoverVideo({ media, poster, testId, className }: HoverVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const attachedRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const source = sourceFromMedia(media);

  // ── Attach the source lazily (first hover) ────────────────────────────────
  useEffect(() => {
    if (!hovered || attachedRef.current) return;
    const el = videoRef.current;
    if (!el) return;
    attachedRef.current = true;
    setReady(false);

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

  // ── Ready signal (the poster → video crossfade) ───────────────────────────
  // Listens for the lifetime of the element: a hover that leaves before the
  // source is playable must not lose the signal (the attach effect runs once).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const markReady = () => {
      // `readyState >= CAN_PLAY` covers the cached case (canplay already
      // fired before we listened); the event covers the fetch case.
      if (el.readyState >= 3) setReady(true);
    };
    el.addEventListener('canplay', markReady);
    markReady();
    return () => el.removeEventListener('canplay', markReady);
  }, []);

  // ── Play while hovered, stop when the pointer leaves ──────────────────────
  // The source is stable for the card's lifetime (the post's media), so the
  // [hovered, muted, failed] deps drive the play/pause; `ready` is read via
  // the element's own state (play() on a not-yet-ready element is a no-op
  // that resolves once the source is playable).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (hovered && !failed) {
      el.muted = muted;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      el.pause();
    }
  }, [hovered, muted, failed]);

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
    e.stopPropagation();
    const el = videoRef.current;
    if (el) el.muted = !el.muted;
    setMuted((m) => !m);
    LOG('mute toggled →', !muted);
  };

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
      data-testid={testId}
      className={cn('group/hover-video absolute inset-0', className)}
      onMouseEnter={() => {
        LOG('pointer enter');
        setHovered(true);
      }}
      onMouseLeave={() => {
        LOG('pointer leave');
        setHovered(false);
      }}
    >
      {/* The poster — at rest, and the backdrop while the video loads. */}
      {poster && (
        <img
          src={poster}
          alt=""
          loading="lazy"
          className={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            hovered && ready ? 'opacity-0' : 'opacity-100',
          )}
        />
      )}

      {/* The preview — muted autoplay, cover-cropped into the 16:9 frame. */}
      <video
        ref={videoRef}
        data-testid={`${testId}-video`}
        poster={poster}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-200',
          hovered && ready ? 'opacity-100' : 'opacity-0',
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
