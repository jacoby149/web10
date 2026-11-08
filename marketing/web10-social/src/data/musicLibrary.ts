import { getV3Client } from './v3';
import { ensureFollowers, followersGroupId } from './groups';

export const PLAYLIST_BOOKMARK_SERVICE = 'web10-social-playlist-bookmarks';
export interface PlaylistBookmark { collectionId: string }

/** Capture the personal client. Never borrow the selected group actor. */
function ownerScope(assertCurrent?: () => void) {
  assertCurrent?.();
  const client = getV3Client();
  const token = client.readToken();
  if (!token || !client.isSignedIn()) throw new Error('Sign in to save playlists');
  const check = () => {
    assertCurrent?.();
    const now = client.readToken();
    if (getV3Client() !== client || !client.isSignedIn() || now?.username !== token.username || now?.provider !== token.provider || now?.expires !== token.expires) throw new Error('Music session changed');
  };
  return { client, token, check, group: followersGroupId(token.username, token.provider) };
}

async function bookmarkRows(scope: ReturnType<typeof ownerScope>) {
  const rows = [];
  let cursor: string | undefined;
  for (;;) {
    scope.check();
    const page = await scope.client.read(PLAYLIST_BOOKMARK_SERVICE, { groups: [scope.group], limit: 200, ...(cursor ? { cursor } : {}) });
    scope.check();
    rows.push(...page.filter(row => row.author_key === scope.token.username || row.author_key === `${scope.token.provider}/users/${scope.token.username}`));
    if (page.length < 200) return rows;
    const last = page[page.length - 1];
    const next = `${last.created_at}|${last.doc_id}`;
    if (next === cursor) throw new Error('Playlist bookmark paging did not advance');
    cursor = next;
  }
}

export async function readPlaylistBookmarks(): Promise<PlaylistBookmark[]> {
  const scope = ownerScope();
  console.log('[music-library] bookmarks read start');
  const rows = await bookmarkRows(scope);
  const ids = rows.map(row => row.body.collection_id).filter((id): id is string => typeof id === 'string' && id.includes('/groups/') && id.length <= 2048);
  console.log('[music-library] bookmarks read complete', { count: ids.length });
  return [...new Set(ids)].map(collectionId => ({ collectionId }));
}

export async function setPlaylistBookmarked(collectionId: string, saved: boolean, assertCurrent?: () => void): Promise<void> {
  if (!collectionId.includes('/groups/') || collectionId.length > 2048) throw new Error('Invalid playlist');
  const scope = ownerScope(assertCurrent);
  console.log('[music-library] bookmark mutation start', { saved });
  const rows = (await bookmarkRows(scope)).filter(row => row.body.collection_id === collectionId);
  if (!saved) {
    for (const row of rows) { scope.check(); await scope.client.delete(row.doc_id); scope.check(); }
  } else if (!rows.length) {
    await ensureFollowers(scope.token.username, scope.token.provider);
    scope.check();
    await scope.client.create(PLAYLIST_BOOKMARK_SERVICE, { collection_id: collectionId }, { groups: [scope.group] });
    scope.check();
  }
  console.log('[music-library] bookmark mutation complete', { saved });
}

/** No cached target metadata: a bookmark must not preserve a private title. */
export async function readPlaylistBookmarkName(collectionId: string): Promise<string | null> {
  const client = getV3Client();
  const docs = await client.read('web10-social-group-identity', { groups: [collectionId], limit: 1 });
  const face = docs[0]?.body;
  return face?.kind === 'saved' && typeof face.name === 'string' ? face.name : null;
}
