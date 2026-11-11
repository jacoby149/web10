import type { MediaItem } from './types';
import { resolveManifestHref } from './config';

// The manifest's final href (absolute capability URLs preserved, legacy
// paths bound to the app's API origin) — re-exported here so the music
// transport's hls attach uses the SAME resolution as every other video
// surface, from this pure subpath.
export { resolveManifestHref };

/**
 * The pure video-source selector (the `/face` seam pattern): how a resolved
 * media record becomes a playable source. No React, no icons, no hls.js — so
 * the DATA layer (and the music app's transport, `MusicContext`) imports this
 * subpath directly and a `vi.mock('@/data')` never drags in the React barrel
 * (the same reason `./audioArtwork` lives here).
 *
 * The `youtube` variant is the URL shape the Shorts wall derives (a post whose
 * media points at a watch URL); a media RECORD (this function's input) only
 * ever yields `hls` (a transcoded done video with a minted manifest) or
 * `file` (everything else — the import path's raw MP4s, a processing/failed
 * transcode, native).
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
