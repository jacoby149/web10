import { useEffect, type RefObject } from 'react';
import { API_ORIGIN } from './origins';
import type { MediaRecord } from '@/data/types';

type HlsInstance = {
  loadSource: (url: string) => void;
  attachMedia: (el: HTMLVideoElement) => void;
  destroy: () => void;
  on: (event: string, cb: (event: string, data: Record<string, unknown>) => void) => void;
  currentLevel: number;
};

declare global {
  interface Window {
    /** The vendored hls.min.js (public/hls.min.js, loaded in index.html). */
    Hls?: (new () => HlsInstance) & {
      isSupported: () => boolean;
      Events: Record<string, string>;
    };
  }
}

/**
 * The manifest URL when the media is HLS-ready (transcode done + the read
 * minted a manifest for this reader), else null. The manifest_url is
 * path-only — this prepends the API origin.
 */
export function hlsSource(media: MediaRecord | null | undefined): string | null {
  const ts = media?.transcoding_settings;
  if (ts?.status === 'done' && ts.manifest_url) {
    return new URL(ts.manifest_url, API_ORIGIN).href;
  }
  return null;
}

/** Native HLS (older Safari) — probed on a detached element so the answer
 *  is stable across renders (no ref dependency). */
function nativeHlsSupported(): boolean {
  try {
    return document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '';
  } catch {
    return false;
  }
}

/**
 * True when this browser can play the manifest: hls.js (Chrome, Firefox,
 * modern Safari) or native HLS (older Safari).
 */
export function hlsEngineAvailable(): boolean {
  if (window.Hls?.isSupported?.()) return true;
  return nativeHlsSupported();
}

/**
 * Attach hls.js (or native HLS on older Safari) to a video element when the
 * media is HLS-ready (D44, video-experience.md player spec). Returns the
 * manifest URL when the engine owns the video's source (the element must
 * render WITHOUT a `src` prop), or null when the element should use its
 * direct `src` (the raw read_url).
 *
 * hls.js first — it works on Chrome, Firefox, AND modern Safari (MSE).
 * Native HLS is the fallback for older Safari only (Chromium on macOS
 * reports canPlayType('...mpegurl') as supported via AVFoundation but
 * headless Chromium can't actually play it — hls.js is the deterministic
 * path everywhere). If neither is available, the direct file plays
 * (the raw upload is a normal video file).
 */
export function useHlsVideo(
  videoRef: RefObject<HTMLVideoElement | null>,
  media: MediaRecord | null | undefined,
): string | null {
  const manifest = hlsSource(media);
  const el = videoRef.current;

  useEffect(() => {
    if (!el || !manifest) return;
    console.log('[hls] attaching player — manifest:', manifest);

    const Hls = window.Hls;
    if (Hls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(manifest);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        console.log('[hls] manifest parsed, levels:', (data.levels as { height: number }[]).map((l) => `${l.height}p`).join('/'));
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        console.log('[hls] switched to level', data.level);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        console.error('[hls] error — type:', data.type, 'details:', data.details, 'fatal:', data.fatal);
      });
      return () => {
        console.log('[hls] destroying instance');
        hls.destroy();
      };
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('[hls] native HLS (older Safari)');
      el.src = manifest;
      return () => {
        el.removeAttribute('src');
      };
    }

    console.warn('[hls] no HLS support in this browser — the direct file plays instead');
  }, [el, manifest]);

  // The engine owns the source only when it can actually play it; otherwise
  // the element keeps its direct `src` (the raw read_url).
  if (!manifest) return null;
  return hlsEngineAvailable() ? manifest : null;
}
