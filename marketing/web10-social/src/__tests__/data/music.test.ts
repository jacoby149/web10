import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as saved from '../../data/saved';
import * as posts from '../../data/posts';
import * as v3 from '../../data/v3';
import * as groups from '../../data/groups';
import { findSavedMusicCollection, musicTrackFromPost, readMusicCollection, readMusicTrack, SAVED_MUSIC_SLUG, toggleSavedMusic } from '../../data/music';
import { readMusicPage, readDiscoverFeed } from '../../data/feed';
import type { PostRecord, MediaRecord } from '../../data/types';

vi.mock('../../data/saved');
vi.mock('../../data/posts', () => ({ readPostById: vi.fn(), resolveMediaRefs: vi.fn(), resolvePostAuthors: vi.fn(async (p) => p) }));

const post = (id = 'track'): PostRecord => ({ _id: id, tags: ['music'], media_refs: ['audio', 'art'], author_username: 'alice', author_provider: 'node', created_at: '' } as PostRecord);
const media = [{ _id: 'audio', mime_type: 'audio/mpeg', url: 'https://audio' }, { _id: 'art', mime_type: 'image/webp' }] as MediaRecord[];
const collection = { groupId: 'node/groups/users/alice/saved-saved-music', slug: 'saved-music', name: 'Renamed', visibility: 'private', itemCount: 0 } as saved.CollectionRecord;
let token: { provider: string; username: string } | null;
let client: { readToken: ReturnType<typeof vi.fn>; isSignedIn: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
  token = { provider: 'node', username: 'alice' };
  client = { readToken: vi.fn(() => token), isSignedIn: vi.fn(() => !!token), read: vi.fn().mockResolvedValue([]) };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(client as never);
  vi.mocked(posts.resolvePostAuthors).mockImplementation(async (p) => p);
  vi.mocked(saved.getMyCollections).mockResolvedValue([]);
  vi.mocked(saved.createCollection).mockResolvedValue(collection.groupId);
  vi.mocked(posts.resolveMediaRefs).mockResolvedValue(media);
});

describe('music composition', () => {
  it('matches reserved slug, not a display name, after the existing prefix strip', () => {
    expect(SAVED_MUSIC_SLUG).toBe('saved-saved-music');
    expect(findSavedMusicCollection([{ ...collection, slug: 'other', name: 'Saved Music' }, collection])).toBe(collection);
  });

  it('creates privately only on explicit first save, then saves the post', async () => {
    expect(await toggleSavedMusic('p', false)).toEqual({ groupId: collection.groupId });
    expect(saved.createCollection).toHaveBeenCalledWith('Saved Music', { slug: 'saved-music', assertCurrent: expect.any(Function) });
    expect(saved.savePostToCollection).toHaveBeenCalledWith(collection.groupId, 'p', undefined, expect.any(Function));
  });

  it('freshly lists and reuses the reserved collection for return save and remove', async () => {
    vi.mocked(saved.getMyCollections).mockResolvedValue([collection]);
    await toggleSavedMusic('p', false);
    await toggleSavedMusic('p', true);
    expect(saved.getMyCollections).toHaveBeenCalledTimes(2);
    expect(saved.createCollection).not.toHaveBeenCalled();
    expect(saved.removePostFromCollection).toHaveBeenCalledWith(collection.groupId, 'p', expect.any(Function));
  });

  it('never creates for an absent removal or anonymous mutation', async () => {
    await expect(toggleSavedMusic('p', true)).rejects.toThrow('not found');
    token = null;
    await expect(toggleSavedMusic('p', false)).rejects.toThrow('authenticated');
    expect(saved.createCollection).not.toHaveBeenCalled();
  });

  it('surfaces list/create/save/remove errors and can retry a failed save', async () => {
    vi.mocked(saved.getMyCollections).mockRejectedValueOnce(new Error('list'));
    await expect(toggleSavedMusic('p', false)).rejects.toThrow('list');
    vi.mocked(saved.createCollection).mockRejectedValueOnce(new Error('create'));
    await expect(toggleSavedMusic('p', false)).rejects.toThrow('create');
    vi.mocked(saved.getMyCollections).mockResolvedValue([collection]);
    vi.mocked(saved.savePostToCollection).mockRejectedValueOnce(new Error('save'));
    await expect(toggleSavedMusic('p', false)).rejects.toThrow('save');
    await toggleSavedMusic('p', false);
    vi.mocked(saved.removePostFromCollection).mockRejectedValueOnce(new Error('remove'));
    await expect(toggleSavedMusic('p', true)).rejects.toThrow('remove');
  });

  it('keeps creation local to each lifecycle rather than sharing a cancelled creation', async () => {
    let active = true;
    const guard = () => { if (!active) throw new Error('cancelled'); };
    vi.mocked(saved.createCollection).mockImplementationOnce(async () => { active = false; return collection.groupId; });
    await expect(toggleSavedMusic('a', false, guard)).rejects.toThrow('cancelled');
    await toggleSavedMusic('b', false, () => {});
    expect(saved.createCollection).toHaveBeenCalledTimes(2);
    expect(saved.getMyCollections).toHaveBeenCalledTimes(2);
    expect(saved.savePostToCollection).toHaveBeenCalledTimes(1);
  });

  it('blocks follow-on creation and save when the human changes', async () => {
    vi.mocked(saved.getMyCollections).mockImplementationOnce(async () => { token = { provider: 'node', username: 'bob' }; return []; });
    await expect(toggleSavedMusic('p', false)).rejects.toThrow('session changed');
    expect(saved.createCollection).not.toHaveBeenCalled();
    token = { provider: 'node', username: 'alice' };
    vi.mocked(saved.createCollection).mockImplementationOnce(async () => { token = null; return collection.groupId; });
    await expect(toggleSavedMusic('p', false)).rejects.toThrow('session changed');
    expect(saved.savePostToCollection).not.toHaveBeenCalled();
  });

  it('hydrates in existing collection order, skipping unavailable/nonmusic/partial refs without Discover intersection or writes', async () => {
    const records = [post('second'), null, { ...post('not-music'), tags: [] }, post('first'), { ...post('partial'), media_refs: ['missing'] }];
    vi.mocked(saved.readCollection).mockResolvedValue({ face: { name: 'Playlist' }, posts: records.map((p) => ({ post: p, unavailable: !p })), mediaMap: Object.fromEntries(media.map((m) => [m._id, m])) } as saved.CollectionContents);
    const result = await readMusicCollection('private-playlist');
    expect(result.tracks.map((t) => t.post._id)).toEqual(['second', 'first']);
    expect(result).toMatchObject({ skipped: 3, name: 'Playlist' });
    expect(saved.readCollection).toHaveBeenCalledWith('private-playlist');
    expect(client.read).not.toHaveBeenCalled();
    expect(saved.createCollection).not.toHaveBeenCalled();
  });

  it('rejects stale library reads and surfaces collection errors', async () => {
    vi.mocked(saved.readCollection).mockImplementationOnce(async () => { token = null; return {} as saved.CollectionContents; });
    await expect(readMusicCollection('g')).rejects.toThrow('session changed');
    vi.mocked(saved.readCollection).mockRejectedValueOnce(new Error('denied'));
    await expect(readMusicCollection('g')).rejects.toThrow('denied');
  });

  // The D42 anon-read asymmetry (the connected-acceptance finding,
  // 11.11.2026): a private/unknown collection reads as EMPTY for a logged-out
  // reader instead of 403ing (anon is exempt from the authenticated
  // access-failure branch). An empty face + zero items must therefore mean
  // NO ACCESS for anon — not "an empty public playlist".
  it('anon: an empty face + zero items is the no-access state (private or deleted), not an empty playlist', async () => {
    token = null;
    vi.mocked(saved.readCollection).mockResolvedValue({ face: {}, posts: [], mediaMap: {} } as saved.CollectionContents);
    await expect(readMusicCollection('g')).rejects.toThrow('This playlist is private or no longer available.');
  });

  it('anon: a NAMED face with zero items is an empty public playlist (no false unavailable)', async () => {
    token = null;
    vi.mocked(saved.readCollection).mockResolvedValue({ face: { name: 'Fresh public' }, posts: [], mediaMap: {} } as saved.CollectionContents);
    const result = await readMusicCollection('g');
    expect(result).toMatchObject({ tracks: [], name: 'Fresh public', visibility: 'private' });
  });

  it('signed-in: an empty face + zero items is NOT the anon no-access state (their 403s come from the saved read)', async () => {
    vi.mocked(saved.readCollection).mockResolvedValue({ face: {}, posts: [], mediaMap: {} } as saved.CollectionContents);
    const result = await readMusicCollection('g');
    expect(result).toMatchObject({ tracks: [], name: '' });
  });

  it('restores a track by original authorized post read and media resolution, never creating', async () => {
    vi.mocked(posts.readPostById).mockResolvedValue(post());
    expect((await readMusicTrack('track'))?.post._id).toBe('track');
    expect(posts.readPostById).toHaveBeenCalledWith('track');
    expect(posts.resolveMediaRefs).toHaveBeenCalledWith(['audio', 'art']);
    vi.mocked(posts.readPostById).mockResolvedValue(null);
    expect(await readMusicTrack('gone')).toBeNull();
    expect(saved.createCollection).not.toHaveBeenCalled();
  });

  it('uses the real shared attachment gate including object ref IDs and partial metadata', () => {
    expect(musicTrackFromPost(post(), media)?.media._id).toBe('audio');
    expect(musicTrackFromPost({ ...post(), media_refs: [{ doc_id: 'audio' }] } as PostRecord, media)).not.toBeNull();
    expect(musicTrackFromPost({ ...post(), tags: [] }, media)).toBeNull();
    expect(musicTrackFromPost(post(), media.slice(0, 1))).toBeNull();
    expect(musicTrackFromPost(post(), [media[0], { ...media[1], mime_type: undefined }])).toBeNull();
    expect(musicTrackFromPost(post(), [media[0], { ...media[1], mime_type: 'video/mp4' }])).toBeNull();
  });

  it('resolves album art with the shared cover precedence and never the recording itself', () => {
    // The audio's own resolved cover wins.
    const audioCover = { ...media[0], thumbnail_url: 'https://cover' } as MediaRecord;
    expect(musicTrackFromPost(post(), [audioCover, media[1]])?.artworkUrl).toBe('https://cover');
    // A legacy thumbnail that is the recording itself is not art; the supporting image is.
    const legacy = { ...media[0], thumbnail_url: 'https://audio' } as MediaRecord;
    const imageFile = { ...media[1], url: 'https://artfile' } as MediaRecord;
    expect(musicTrackFromPost(post(), [legacy, imageFile])?.artworkUrl).toBe('https://artfile');
    // A supporting image's own thumbnail beats its file URL.
    const imageThumb = { ...imageFile, thumbnail_url: 'https://art-thumb' } as MediaRecord;
    expect(musicTrackFromPost(post(), [media[0], imageThumb])?.artworkUrl).toBe('https://art-thumb');
    // No usable picture: no art, not an error.
    expect(musicTrackFromPost(post(), media)?.artworkUrl).toBeUndefined();
  });

  it('counts raw Music rows for paging even when ads/nonmusic are removed and retains Discover behavior', async () => {
    client.read.mockResolvedValue([
      { doc_id: 'ad', author_key: 'node/users/alice', tags: ['ad', 'music'], body: {}, created_at: '' },
      { doc_id: 'track', author_key: 'node/users/alice', tags: ['music'], body: { media_refs: ['audio', 'art'] }, created_at: '' },
    ]);
    const page = await readMusicPage(2, 8);
    expect(page).toMatchObject({ hasMore: true, nextOffset: 10 });
    expect(page.tracks.map((t) => t.post._id)).toEqual(['track']);
    client.read.mockRejectedValue(new Error('network'));
    await expect(readMusicPage()).rejects.toThrow('network');
    expect(await readDiscoverFeed()).toEqual([]);
  });
});

describe('actual collection mutation lifecycle boundaries', () => {
  const actual = () => vi.importActual<typeof saved>('../../data/saved');
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  }
  function guard() {
    const captured = v3.getV3Client();
    return () => { if (v3.getV3Client() !== captured) throw new Error('cancelled'); };
  }
  function switchClient() {
    vi.mocked(v3.getV3Client).mockReturnValue({ readToken: () => ({ username: 'bob', provider: 'node' }) } as never);
  }

  it('does not write a face after a deferred group creation switches clients', async () => {
    const api = await actual();
    const pending = deferred<{ group_id: string }>();
    const createGroup = vi.fn(() => pending.promise);
    Object.assign(client, { createGroup });
    const write = vi.spyOn(groups, 'writeGroupIdentity').mockResolvedValue();
    const result = api.createCollection('Playlist', { assertCurrent: guard() });
    expect(createGroup).toHaveBeenCalledTimes(1);
    switchClient();
    pending.resolve({ group_id: 'old-group' });
    await expect(result).rejects.toThrow('cancelled');
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it.each(['save', 'remove'] as const)('does not %s after a deferred saved-document read switches clients', async (operation) => {
    const api = await actual();
    const pending = deferred<never[]>();
    client.read.mockReturnValue(pending.promise);
    const create = vi.fn();
    const remove = vi.fn();
    Object.assign(client, { create, delete: remove });
    const result = operation === 'save'
      ? api.savePostToCollection('g', 'p', undefined, guard())
      : api.removePostFromCollection('g', 'p', guard());
    switchClient();
    pending.resolve(operation === 'save' ? [] : [{ doc_id: 'saved', ref_value: 'p' }] as never[]);
    await expect(result).rejects.toThrow('cancelled');
    expect(create).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not start cover reads after a deferred save switches clients', async () => {
    const api = await actual();
    const pending = deferred<void>();
    const create = vi.fn(() => pending.promise);
    Object.assign(client, { create });
    const face = vi.spyOn(groups, 'readGroupIdentity').mockResolvedValue({});
    const result = api.savePostToCollection('g', 'p', undefined, guard());
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    switchClient();
    pending.resolve();
    await expect(result).rejects.toThrow('cancelled');
    expect(face).not.toHaveBeenCalled();
    face.mockRestore();
  });

  it.each(['face', 'post'] as const)('does not continue cover work after the deferred %s read switches clients', async (boundary) => {
    const api = await actual();
    const pending = deferred<any>();
    Object.assign(client, { create: vi.fn().mockResolvedValue({}) });
    const face = vi.spyOn(groups, 'readGroupIdentity').mockImplementation(() => boundary === 'face' ? pending.promise : Promise.resolve({}));
    const write = vi.spyOn(groups, 'writeGroupIdentity').mockResolvedValue();
    vi.mocked(posts.readPostById).mockImplementation(() => boundary === 'post' ? pending.promise : Promise.resolve(post()));
    const result = api.savePostToCollection('g', 'p', undefined, guard());
    await vi.waitFor(() => expect(boundary === 'face' ? face : posts.readPostById).toHaveBeenCalled());
    switchClient();
    pending.resolve(boundary === 'face' ? {} : post());
    await expect(result).rejects.toThrow('cancelled');
    expect(write).not.toHaveBeenCalled();
    if (boundary === 'face') expect(posts.readPostById).not.toHaveBeenCalled();
    face.mockRestore();
    write.mockRestore();
  });

  it('keeps unguarded callers working and ordinary cover failures best-effort', async () => {
    const api = await actual();
    Object.assign(client, { create: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue(undefined) });
    const face = vi.spyOn(groups, 'readGroupIdentity').mockRejectedValue(new Error('cover unavailable'));
    await expect(api.savePostToCollection('g', 'p')).resolves.toBe(true);
    client.read.mockResolvedValue([{ doc_id: 'saved', ref_value: 'p' }]);
    await expect(api.removePostFromCollection('g', 'p')).resolves.toBeUndefined();
    face.mockRestore();
  });
});
