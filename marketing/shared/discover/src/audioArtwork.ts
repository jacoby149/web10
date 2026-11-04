import type { MediaItem } from './types';

/** The shared album-art precedence (the 4.8.0 presentation contract): the
 * audio's own resolved thumbnail, otherwise the post's supporting image,
 * never the recording URL. One source for the feed cards, the music player
 * surfaces and the browser Media Session artwork (the phone's system media
 * controls). PURE — no React, no icons: the data layer imports this
 * subpath directly so a `vi.mock('@/data')` never drags in the React
 * barrel (same reason the `/face` subpath exists). */
export function audioArtwork(media: MediaItem, items: MediaItem[] = []): string | undefined {
  const image = items.find((item) => item.mime_type?.startsWith('image/'));
  return (media.thumbnail_url !== media.url ? media.thumbnail_url : undefined) || image?.thumbnail_url || image?.url || undefined;
}
