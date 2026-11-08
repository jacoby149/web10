import { audioArtwork } from '@web10/discover/audio-artwork';
import { mediaRefId, type PostRecord, type MediaRecord } from './types';

export interface MusicTrack {
  /** No home-node mutations/recovery for a track read from another source. */
  readOnlySource?: boolean;
  post: PostRecord;
  media: MediaRecord;
  /** The resolved cover for this track — the shared album-art precedence
   *  (the audio's own thumbnail, otherwise the post's supporting image,
   *  never the recording itself). Feeds every in-app player surface and the
   *  browser Media Session artwork (the phone's system media controls). */
  artworkUrl?: string;
}

export const musicTrackKey = (track: MusicTrack) => track.post.source_key || track.post._id;
export const musicTitle = (track: MusicTrack) => track.post.title || track.post.text?.slice(0, 60) || 'Untitled track';
export const musicArtist = (track: MusicTrack) => track.post.group_identity?.name || track.post.profile?.display_name || `@${track.post.author_username || 'Unknown artist'}`;

/** Shared attachment gate; audience authorization belongs to the read path. */
export function musicTrackFromPost(post: PostRecord, media: MediaRecord[]): MusicTrack | null {
  if (!post.tags?.includes('music') || !post.media_refs?.length) return null;
  const ids = new Set(post.media_refs.map(mediaRefId));
  if (ids.has('')) return null;
  const resolved = media.filter((m) => m._id && ids.has(m._id));
  if (![...ids].every((id) => resolved.some((m) => m._id === id))) return null;
  if (!resolved.every((m) => /^(audio|video|image)\//.test(m.mime_type || ''))) return null;
  const playable = resolved.filter((m) => /^(audio|video)\//.test(m.mime_type || ''));
  if (playable.length !== 1) return null;
  const track: MusicTrack = { post, media: playable[0] };
  // One shared selector keeps the in-app player and the phone's system media
  // controls on the same cover: the audio's own thumbnail, otherwise the
  // post's supporting image, never the recording URL.
  track.artworkUrl = audioArtwork(track.media, resolved);
  return track;
}
