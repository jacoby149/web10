import { getV3Client } from './v3';
import { readPostById, resolveMediaRefs } from './posts';
import { createCollection, getMyCollections, readCollection, savePostToCollection, removePostFromCollection, type CollectionRecord } from './saved';
import { musicTrackFromPost, type MusicTrack } from './musicTrack';
export { musicTrackFromPost } from './musicTrack';

/** Reserved group path segment. CollectionRecord.slug strips its first saved-. */
export const SAVED_MUSIC_SLUG = 'saved-saved-music';

export function findSavedMusicCollection(collections: CollectionRecord[]): CollectionRecord | undefined {
  return collections.find((collection) => `saved-${collection.slug}` === SAVED_MUSIC_SLUG);
}

function sessionCheck(assertCurrent?: () => void) {
  assertCurrent?.();
  const client = getV3Client();
  const token = client.readToken();
  const key = token ? JSON.stringify([token.provider, token.username]) : '';
  const expires = token?.expires;
  return { key, check: () => {
    assertCurrent?.();
    const current = getV3Client().readToken();
    if (getV3Client() !== client || (current ? JSON.stringify([current.provider, current.username]) : '') !== key || current?.expires !== expires) {
      throw new Error('Music session changed');
    }
  } };
}

export async function readMusicCollection(groupId: string): Promise<{ tracks: MusicTrack[]; skipped: number; name: string }> {
  const session = sessionCheck();
  console.log('[music-library] collection read start');
  const contents = await readCollection(groupId);
  session.check();
  const tracks: MusicTrack[] = [];
  for (const item of contents.posts) {
    if (item.unavailable || !item.post) continue;
    const track = musicTrackFromPost(item.post, Object.values(contents.mediaMap));
    if (track) tracks.push(track);
  }
  const skipped = contents.posts.length - tracks.length;
  console.log('[music-library] collection read complete', { tracks: tracks.length, skipped });
  return { tracks, skipped, name: contents.face.name || '' };
}

export async function readMusicTrack(postId: string): Promise<MusicTrack | null> {
  const session = sessionCheck();
  const post = await readPostById(postId);
  session.check();
  if (!post) return null;
  const media = await resolveMediaRefs(post.media_refs || []);
  session.check();
  return musicTrackFromPost(post, media);
}

/** saved is the CURRENT state: true removes; false saves. Caller serializes mutations
 * and supplies a mount/session-generation guard; no creation is shared across lifecycles. */
export async function toggleSavedMusic(postId: string, saved: boolean, assertCurrent?: () => void): Promise<{ groupId: string }> {
  if (!postId) throw new Error('cannot save a post without an id');
  const session = sessionCheck(assertCurrent);
  if (!session.key || !getV3Client().isSignedIn()) throw new Error('not authenticated');
  console.log('[music-library] mutation start', { remove: saved });
  const collections = await getMyCollections();
  session.check();
  let groupId = findSavedMusicCollection(collections)?.groupId;
  if (!groupId && !saved) {
    session.check();
    groupId = await createCollection('Saved Music', { slug: 'saved-music', assertCurrent: session.check });
    session.check();
  }
  if (!groupId) throw new Error('Saved Music collection not found');
  session.check();
  if (saved) await removePostFromCollection(groupId, postId, session.check);
  else await savePostToCollection(groupId, postId, undefined, session.check);
  session.check();
  console.log('[music-library] mutation complete', { remove: saved });
  return { groupId };
}
