import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedSourceStore, normalizeFeedSource } from '@/data/feedSources';
const fixture = vi.hoisted(() => {
  class Denial extends Error { constructor(message: string, public status: number) { super(message); } }
  return { client: {} as Record<string, any>, Denial };
});
vi.mock('@/data/v3', () => ({ getV3Client: () => fixture.client, readTokenCookie: () => null, Web10Error: fixture.Denial }));
const group = 'home.example/groups/users/alice/feed-sources';
const home = 'https://api.web10.app';
beforeEach(() => {
  fixture.client = {
    state: { token: 'synthetic-session', apiOrigin: home }, readToken: () => ({ username: 'alice', provider: 'home.example' }),
    getGroup: vi.fn().mockResolvedValue({ group_id: group, join_policy: 'closed', discoverable: false, membership_visibility: 'hidden' }),
    getGroupMembers: vi.fn().mockResolvedValue([{ member_key: 'alice', role: 'owner' }]),
    read: vi.fn().mockResolvedValue([]), readById: vi.fn(),
    createGroup: vi.fn().mockResolvedValue({ group_id: group }), create: vi.fn().mockResolvedValue({ doc_id: 'catalog' }), update: vi.fn().mockResolvedValue({}),
  };
});
describe('personal feed source catalog', () => {
  it('defaults a missing group without writing and creates only a closed private group on save', async () => {
    const w = fixture.client;
    w.getGroup.mockRejectedValueOnce(new fixture.Denial('missing', 404));
    const store = createFeedSourceStore();
    expect(await store.read()).toEqual([{ origin: home, weight: 100 }]);
    expect(w.createGroup).not.toHaveBeenCalled();
    w.getGroup.mockRejectedValueOnce(new fixture.Denial('missing', 404));
    await store.write([{ origin: 'https://other.example', weight: 50 }]);
    expect(w.createGroup.mock.calls[0]).toMatchObject(['feed-sources', 'closed', expect.any(Array), [{ member_key: 'alice', role: 'owner' }], { discoverable: false, membership_visibility: 'hidden' }]);
    expect(w.create).toHaveBeenCalledWith('settings', { version: 1, sources: [{ origin: 'https://other.example', weight: 50 }] }, { groups: [group] });
  });
  it.each(['public', 'member', 'denied', 'duplicate'])('fails closed on %s instead of creating a replacement', async failure => {
    const w = fixture.client;
    if (failure === 'public') w.getGroup.mockResolvedValue({ group_id: group, join_policy: 'open' });
    if (failure === 'member') w.getGroupMembers.mockResolvedValue([{ member_key: 'anyone', role: 'owner' }]);
    if (failure === 'denied') w.getGroup.mockRejectedValue(new fixture.Denial('denied', 403));
    if (failure === 'duplicate') w.read.mockResolvedValue([{ doc_id: 'a' }, { doc_id: 'b' }]);
    await expect(createFeedSourceStore().write([])).rejects.toThrow();
    expect(w.create).not.toHaveBeenCalled(); expect(w.update).not.toHaveBeenCalled(); expect(w.createGroup).not.toHaveBeenCalled();
  });
  it('retains an intentionally empty list and denies another owner or public attachment', async () => {
    const w = fixture.client;
    w.read.mockResolvedValue([{ doc_id: 'catalog' }]);
    const doc = { doc_id: 'catalog', service: 'settings', author_key: 'alice', groups: [group], body: { version: 1, sources: [] } };
    w.readById.mockResolvedValue(doc);
    w.update.mockResolvedValue(doc);
    expect(await createFeedSourceStore().read()).toEqual([]);
    await createFeedSourceStore().write([]); expect(w.update).toHaveBeenCalledWith('catalog', { version: 1, sources: [] });
    for (const changed of [{ ...doc, author_key: 'mallory' }, { ...doc, groups: [group, 'public'] }]) {
      w.readById.mockResolvedValue(changed); await expect(createFeedSourceStore().write([])).rejects.toThrow();
    }
  });
  it('rejects a hidden external attachment revealed only by the author update response', async () => {
    const w = fixture.client;
    const doc = { doc_id: 'catalog', service: 'settings', author_key: 'alice', groups: [group], body: { version: 1, sources: [] } };
    w.read.mockResolvedValue([{ doc_id: 'catalog' }]); w.readById.mockResolvedValue(doc);
    w.update.mockResolvedValue({ ...doc, groups: [group, 'external/unreadable'] });
    await expect(createFeedSourceStore().read()).rejects.toThrow();
    await expect(createFeedSourceStore().write([{ origin: 'https://new.example', weight: 100 }])).rejects.toThrow();
    expect(w.update.mock.calls.every(([, body]: any[]) => Object.keys(body).length === 0)).toBe(true);
  });
  it('never continues a delayed read/write into another credential generation', async () => {
    const w = fixture.client;
    w.getGroup.mockImplementation(async () => { w.state.token = 'another-session'; return {}; });
    await expect(createFeedSourceStore().write([])).rejects.toThrow('Account changed');
    expect(w.read).not.toHaveBeenCalled(); expect(w.create).not.toHaveBeenCalled();
  });
  it.each(['http://other.example', 'https://user:password@other.example', 'https://other.example/path', 'https://other.example?token=x'])('rejects unsafe origin %s', origin => {
    expect(() => normalizeFeedSource(origin, home)).toThrow();
  });
});
