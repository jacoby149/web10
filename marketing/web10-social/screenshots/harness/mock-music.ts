import type { MusicTrack } from '../../src/data/musicTrack';
import type { CollectionRecord } from '../../src/data/saved';
import { MOCK_MUSIC_VIDEO_URL } from './mock-music-video';

function artwork(title: string, color: string, index: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#09090b"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="${200 + index * 30}" cy="240" r="160" fill="none" stroke="#c4b5fd" stroke-width="2"/><circle cx="300" cy="300" r="110" fill="#18181b"/><circle cx="300" cy="300" r="34" fill="${color}"/><path d="M0 450L600 180M0 490L600 220" stroke="#a78bfa" opacity=".4"/><text x="40" y="530" fill="#fafafa" font-family="sans-serif" font-size="30" letter-spacing="4">${title.toUpperCase()}</text><text x="42" y="565" fill="#c4b5fd" font-family="sans-serif" font-size="14" letter-spacing="6">LISTENING ROOM / 0${index + 1}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// One second of unsigned 8-bit PCM silence. No remote media or autoplay shim.
const samples = 8000;
const wav = new Uint8Array(44 + samples);
const header = new DataView(wav.buffer);
for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) {
  [...text].forEach((char, i) => { wav[offset + i] = char.charCodeAt(0); });
}
header.setUint32(4, 36 + samples, true);
header.setUint32(16, 16, true);
header.setUint16(20, 1, true);
header.setUint16(22, 1, true);
header.setUint32(24, samples, true);
header.setUint32(28, samples, true);
header.setUint16(32, 1, true);
header.setUint16(34, 8, true);
header.setUint32(40, samples, true);
wav.fill(128, 44);
const audio = `data:audio/wav;base64,${btoa(String.fromCharCode(...wav))}`;

// The six audio fixtures (the original wall).
const AUDIO_TRACKS: MusicTrack[] = [
  ['After Hours', 'Synthwave Sessions', 'nova', 'synthwave-sessions', '#4c1d95', 238],
  ['Slow Sunday', 'Lo-fi Study Room', 'kai', 'lofi-study-room', '#134e4a', 184],
  ['Violet Skyline', 'Northstar Studio', 'me', 'studio', '#312e81', 216],
  ['Last Train Home', 'Synthwave Sessions', 'nova', 'synthwave-sessions', '#701a75', 267],
  ['Blue Hour', 'Lo-fi Study Room', 'kai', 'lofi-study-room', '#1e3a8a', 193],
  ['First Light', 'Northstar Studio', 'me', 'studio', '#881337', 205],
].map(([title, artist, owner, slug, color, duration], index) => {
  const cover = artwork(String(title), String(color), index);
  return {
    post: {
      _id: `music-${index + 1}`, title: String(title),
      text: `${title}. An independent late-night session, recorded live in the studio.`,
      author_username: String(owner), author_provider: 'web10',
      author_key: `web10/groups/users/${owner}/${slug}`,
      group_identity: { name: String(artist) }, tags: ['music'],
      created_at: '2026-11-01T19:00:00Z', media_refs: [`music-audio-${index + 1}`],
    },
    media: {
      _id: `music-audio-${index + 1}`, url: audio, mime_type: 'audio/wav',
      created_at: '2026-11-01T19:00:00Z', duration_seconds: Number(duration),
      thumbnail_url: cover,
    },
    // The gate computes the shared cover precedence; the mock mirrors it.
    artworkUrl: cover,
  };
});

// music-7: a MUSIC VIDEO (music.md: a video CAN be a track — marked `music`).
// A real one-second H.264 file (a data URL) so the panel's video stage can
// actually decode it. The poster doubles as the track's album art.
const videoCover = artwork('Studio Session', '#1e1b4b', 6);
const VIDEO_TRACK: MusicTrack = {
  post: {
    _id: 'music-7', title: 'Studio Session',
    text: 'Studio Session. Filmed live in the studio, one take.',
    author_username: 'me', author_provider: 'web10',
    author_key: 'web10/groups/users/me/studio',
    group_identity: { name: 'Northstar Studio' }, tags: ['music'],
    created_at: '2026-11-01T19:00:00Z', media_refs: ['music-video-7'],
  },
  media: {
    _id: 'music-video-7', url: MOCK_MUSIC_VIDEO_URL, mime_type: 'video/mp4',
    created_at: '2026-11-01T19:00:00Z', duration_seconds: 1,
    thumbnail_url: videoCover, width: 160, height: 90,
  },
  artworkUrl: videoCover,
};

export const MUSIC_TRACKS: MusicTrack[] = [...AUDIO_TRACKS, VIDEO_TRACK];

export const SAVED_COLLECTIONS: CollectionRecord[] = [
  { groupId: 'web10/groups/users/me/saved-guitar-riffs', name: 'Guitar Riffs', visibility: 'private', itemCount: 3, slug: 'guitar-riffs', coverUrl: MUSIC_TRACKS[2].media.thumbnail_url },
  { groupId: 'web10/groups/users/me/saved-tour-sets', name: 'Tour Sets', visibility: 'public', itemCount: 5, slug: 'tour-sets', coverUrl: MUSIC_TRACKS[3].media.thumbnail_url },
  { groupId: 'web10/groups/users/me/saved-later', name: 'Watch Later', visibility: 'private', itemCount: 1, slug: 'later' },
  { groupId: 'web10/groups/users/me/saved-saved-music', name: 'Saved Music', visibility: 'private', itemCount: 3, slug: 'saved-music', coverUrl: MUSIC_TRACKS[0].media.thumbnail_url },
];
const items = new Map<string, string[]>([
  [SAVED_COLLECTIONS[0].groupId, ['fp-md', 'music-3', 'music-6']],
  [SAVED_COLLECTIONS[1].groupId, ['music-4', 'music-1', 'unavailable-track', 'nonmusic-post', 'music-5']],
  [SAVED_COLLECTIONS[2].groupId, ['nonmusic-post']],
  [SAVED_COLLECTIONS[3].groupId, ['music-1', 'music-2', 'music-5']],
]);
const publicPlaylist = 'web10/groups/users/nova/saved-synthwave-sessions-best-of';
items.set(publicPlaylist, ['music-4', 'music-1', 'music-5']);
const bookmarkedPlaylists = new Set<string>();
export async function readPlaylistBookmarks() { return [...bookmarkedPlaylists].map(collectionId => ({ collectionId })); }
export async function readPlaylistBookmarkName(id: string) { return id === publicPlaylist ? 'Best Of' : null; }
export async function setPlaylistBookmarked(id: string, saved: boolean, assertCurrent?: () => void) {
  assertCurrent?.();
  if (saved) bookmarkedPlaylists.add(id); else bookmarkedPlaylists.delete(id);
}
const songReactions = new Map<string, 'like' | 'dislike'>();
export async function readMusicReactions(id: string) {
  const type = songReactions.get(id);
  return type ? [{ _id: `reaction-${id}`, type, author_key: 'me', author_username: 'me', target_id: id }] : [];
}
export async function toggleMusicReaction(id: string, kind: 'like' | 'dislike') {
  if (songReactions.get(id) === kind) { songReactions.delete(id); return null; }
  songReactions.set(id, kind); return kind;
}
export async function readMusicPage(limit = 30, offset = 0) {
  const tracks = MUSIC_TRACKS.slice(offset, offset + limit);
  if (new URLSearchParams(window.location.search).has('music-regression') && offset === 0) {
    tracks[0] = { ...tracks[0], post: { ...tracks[0].post, title: undefined }, media: { ...tracks[0].media, url: '/music-regression/expired.mp3', thumbnail_url: '/music-regression/missing.webp' }, artworkUrl: '/music-regression/missing.webp' };
  }
  return { tracks, hasMore: offset + limit < MUSIC_TRACKS.length, nextOffset: offset + limit };
}
export async function readMusicTrack(postId: string) {
  // Opt-in capture fixture (5.16.1): the panel's designed loading state — the
  // home read is in flight forever, so the skeleton + "Loading your track…"
  // stays on screen. Keyed on the harness screen param (?screen=…), not the
  // in-app route (MemoryRouter). Never the default.
  if (new URLSearchParams(window.location.search).get('screen') === 'music-track-pending') return new Promise<never>(() => {});
  const track = MUSIC_TRACKS.find(track => track.post._id === postId) ?? null;
  if (track && new URLSearchParams(window.location.search).has('music-regression')) {
    return { ...track, post: { ...track.post, title: undefined }, media: { ...track.media, url: '/music-regression/fresh.mp3' } };
  }
  return track;
}
export function findSavedMusicCollection(collections: CollectionRecord[]) {
  return collections.find(collection => collection.slug === 'saved-music');
}
export async function readSavedPostIds(groupId: string) {
  return new Set(items.get(groupId) ?? []);
}
export async function readMusicCollection(groupId: string) {
  const ids = items.get(groupId) ?? [];
  const tracks = ids.flatMap(id => MUSIC_TRACKS.filter(track => track.post._id === id));
  const collection = SAVED_COLLECTIONS.find(c => c.groupId === groupId);
  // The face's visibility (D107: the open collection's replay state — a public
  // playlist reads for anyone, the private ones stay masked).
  const visibility = groupId === publicPlaylist || collection?.visibility === 'public' ? 'public' : 'private';
  return { tracks, skipped: ids.length - tracks.length, name: groupId === publicPlaylist ? 'Best Of' : collection?.name || '', visibility };
}
export async function savePostToCollection(groupId: string, postId: string) {
  const ids = items.get(groupId) ?? [];
  if (ids.includes(postId)) return false;
  items.set(groupId, [...ids, postId]);
  const collection = SAVED_COLLECTIONS.find(collection => collection.groupId === groupId);
  if (collection) collection.itemCount = ids.length + 1;
  return true;
}
export async function removePostFromCollection(groupId: string, postId: string) {
  const ids = (items.get(groupId) ?? []).filter(id => id !== postId);
  items.set(groupId, ids);
  const collection = SAVED_COLLECTIONS.find(collection => collection.groupId === groupId);
  if (collection) collection.itemCount = ids.length;
}
export async function createCollection(name: string, options?: { slug?: string }) {
  const slug = options?.slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const groupId = `web10/groups/users/me/saved-${slug}`;
  if (SAVED_COLLECTIONS.some(collection => collection.groupId === groupId)) throw new Error('Collection already exists');
  SAVED_COLLECTIONS.push({ groupId, name, slug, visibility: 'private', itemCount: 0 });
  items.set(groupId, []);
  return groupId;
}
export async function toggleSavedMusic(postId: string, saved: boolean) {
  if (!postId) throw new Error('Cannot save a post without an id');
  if (saved && !findSavedMusicCollection(SAVED_COLLECTIONS)) throw new Error('Saved Music collection not found');
  const groupId = findSavedMusicCollection(SAVED_COLLECTIONS)?.groupId
    || await createCollection('Saved Music', { slug: 'saved-music' });
  if (saved) await removePostFromCollection(groupId, postId);
  else await savePostToCollection(groupId, postId);
  return { groupId };
}
