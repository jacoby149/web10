import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getV3Client } from '@/data/v3';
import { ensureFollowers } from '@/data/groups';
import { PLAYLIST_BOOKMARK_SERVICE as service, readPlaylistBookmarks, readPlaylistBookmarkName, setPlaylistBookmarked } from '@/data/musicLibrary';

vi.mock('@/data/v3', () => ({ getV3Client: vi.fn() }));
vi.mock('@/data/groups', () => ({ ensureFollowers: vi.fn(), followersGroupId: (user: string, provider: string) => `${provider}/groups/users/${user}/followers` }));
const target = 'node/groups/users/curator/saved-night';
let username = 'listener';
const client = { readToken: () => ({ username, provider: 'node' }), isSignedIn: () => true, read: vi.fn(), create: vi.fn(), delete: vi.fn() };
const row = (id: string, author = 'listener') => ({ doc_id: id, author_key: author, created_at: '2026-11-08', body: { collection_id: target } });
beforeEach(() => {
  vi.resetAllMocks(); username = 'listener';
  vi.mocked(getV3Client).mockReturnValue(client as never);
  client.read.mockResolvedValue([]); client.create.mockResolvedValue({}); client.delete.mockResolvedValue(undefined);
  vi.mocked(ensureFollowers).mockResolvedValue('node/groups/users/listener/followers');
});
describe('personal live playlist pointers', () => {
  it('reads and deduplicates only personal pointers without writes or copied content', async () => {
    client.read.mockResolvedValue([row('a'), row('b'), row('group', 'node/groups/users/listener/band'), { ...row('bad'), body: { collection_id: 'bad' } }]);
    expect(await readPlaylistBookmarks()).toEqual([{ collectionId: target }]);
    expect(client.read).toHaveBeenCalledWith(service, { groups: ['node/groups/users/listener/followers'], limit: 200 });
    expect(client.create).not.toHaveBeenCalled(); expect(ensureFollowers).not.toHaveBeenCalled();
  });
  it('first save stores only target ID in the private human scope; return save is idempotent', async () => {
    await setPlaylistBookmarked(target, true);
    expect(client.create).toHaveBeenCalledExactlyOnceWith(service, { collection_id: target }, { groups: ['node/groups/users/listener/followers'] });
    client.read.mockResolvedValue([row('a')]);
    await setPlaylistBookmarked(target, true);
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it('removes every matching duplicate but never someone else’s rows or source documents', async () => {
    client.read.mockResolvedValue([row('a'), row('b'), row('stranger', 'other')]);
    await setPlaylistBookmarked(target, false);
    expect(client.delete.mock.calls).toEqual([['a'], ['b']]);
    expect(client.create).not.toHaveBeenCalled(); expect(ensureFollowers).not.toHaveBeenCalled();
  });
  it('does not create after a failed list read, anonymous call or invalid ID', async () => {
    client.read.mockRejectedValueOnce(new Error('offline'));
    await expect(setPlaylistBookmarked(target, true)).rejects.toThrow('offline');
    vi.mocked(getV3Client).mockReturnValue({ ...client, isSignedIn: () => false } as never);
    await expect(setPlaylistBookmarked(target, true)).rejects.toThrow('Sign in');
    await expect(setPlaylistBookmarked('bad', true)).rejects.toThrow('Invalid');
    expect(client.create).not.toHaveBeenCalled();
  });
  it.each(['read', 'ensure'] as const)('stops after a pending %s crosses an account boundary', async boundary => {
    if (boundary === 'read') client.read.mockImplementationOnce(async () => { username = 'next'; return []; });
    else vi.mocked(ensureFollowers).mockImplementationOnce(async () => { username = 'next'; return 'g'; });
    await expect(setPlaylistBookmarked(target, true)).rejects.toThrow('session changed');
    expect(client.create).not.toHaveBeenCalled();
  });
  it('checks unmount generation before follow-on duplicate deletion', async () => {
    let active = true;
    client.read.mockResolvedValue([row('a'), row('b')]);
    client.delete.mockImplementationOnce(async () => { active = false; });
    await expect(setPlaylistBookmarked(target, false, () => { if (!active) throw new Error('unmounted'); })).rejects.toThrow('unmounted');
    expect(client.delete).toHaveBeenCalledExactlyOnceWith('a');
  });
  it('pages beyond 200 pointers and retains exact live target authorization for metadata', async () => {
    client.read.mockResolvedValueOnce(Array.from({ length: 200 }, (_, i) => row(`${i}`))).mockResolvedValueOnce([row('last')]);
    expect(await readPlaylistBookmarks()).toEqual([{ collectionId: target }]);
    expect(client.read.mock.calls[1][1].cursor).toBe('2026-11-08|199');
    client.read.mockResolvedValueOnce([{ body: { kind: 'saved', name: 'Live title' } }]);
    expect(await readPlaylistBookmarkName(target)).toBe('Live title');
    expect(client.read).toHaveBeenLastCalledWith('web10-social-group-identity', { groups: [target], limit: 1 });
    client.read.mockRejectedValueOnce(new Error('403'));
    await expect(readPlaylistBookmarkName(target)).rejects.toThrow('403');
  });
});
