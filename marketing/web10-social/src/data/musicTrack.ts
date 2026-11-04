import { mediaRefId, type PostRecord, type MediaRecord } from './types';

export interface MusicTrack {
  post: PostRecord;
  media: MediaRecord;
}

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
  return playable.length === 1 ? { post, media: playable[0] } : null;
}
