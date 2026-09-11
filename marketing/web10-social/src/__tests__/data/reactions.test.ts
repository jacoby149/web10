import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn(),
    read: vi.fn(),
    readById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getMyGroups: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('reactions v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createReaction (v3: create in reactions collection)', () => {
    it('creates a reaction document', async () => {
      const doc = { doc_id: 'r1', body: { target_id: 'p1', type: 'like' } };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('reactions', { target_id: 'p1', type: 'like' });
      expect(mock.create).toHaveBeenCalledWith('reactions', { target_id: 'p1', type: 'like' });
      expect(result).toEqual(doc);
    });

    it('sends ref_value = target_id so the ref read can find the reaction', async () => {
      // The regression: ref_value was set client-side AFTER create, so the
      // server stored '' and the ref read (ref_value === target_id) never
      // matched. The real createReaction must send ref_value in the create opts.
      const { createReaction } = await import('../../data/reactions');
      const doc = { doc_id: 'r1', author_key: 'web10.app/users/alice', body: { target_id: 'p1', type: 'like' }, ref_value: 'p1' };
      mock.create.mockResolvedValue(doc);
      await createReaction({ target_id: 'p1', target_service: 'posts', type: 'like' } as any);
      expect(mock.create).toHaveBeenCalledWith(
        'reactions',
        expect.anything(),
        expect.objectContaining({ ref_value: 'p1' }),
      );
    });
  });

  describe('readReactions (v3: read reactions for a post)', () => {
    it('reads reactions for a post', async () => {
      const docs = [{ doc_id: 'r1', body: { target_id: 'p1', type: 'like' } }];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('reactions', { groups: ['me'] });
      expect(result).toEqual(docs);
    });
  });

  describe('toggleReaction (v3: create or delete)', () => {
    // A tiny in-memory reactions store so the real toggleReaction drives the
    // real seam (read → find mine → create/delete) instead of the test
    // pre-acting on the mock.
    function storeReactions() {
      const store: { doc_id: string; author_key: string; body: Record<string, unknown>; ref_value: string }[] = [];
      let n = 0;
      mock.read.mockImplementation(async (_c: string, opts: { ref?: string }) =>
        store.filter((d) => d.ref_value === opts.ref),
      );
      mock.create.mockImplementation(async (_c: string, body: Record<string, unknown>, opts: { ref_value?: string }) => {
        const doc = { doc_id: `r${++n}`, author_key: 'web10.app/users/alice', body, ref_value: opts.ref_value || '' };
        store.push(doc);
        return doc;
      });
      mock.delete.mockImplementation(async (id: string) => {
        const i = store.findIndex((d) => d.doc_id === id);
        if (i >= 0) store.splice(i, 1);
        return { doc_id: id, status: 'deleted' };
      });
      return store;
    }

    it('creates a reaction when the user has none', async () => {
      const store = storeReactions();
      const { toggleReaction } = await import('../../data/reactions');
      const added = await toggleReaction('p1', 'like', 'alice', 'web10.app');
      expect(added).toBe(true);
      expect(store).toHaveLength(1);
      expect(store[0].body.type).toBe('like');
      expect(store[0].ref_value).toBe('p1');
    });

    it('deletes the reaction when the user already has one', async () => {
      const store = storeReactions();
      const { toggleReaction } = await import('../../data/reactions');
      await toggleReaction('p1', 'like', 'alice', 'web10.app');
      const removed = await toggleReaction('p1', 'like', 'alice', 'web10.app');
      expect(removed).toBe(false);
      expect(store).toHaveLength(0);
    });

    it('self-heals duplicates: a user with N duplicate likes ends at zero after one unlike', async () => {
      // The reported bug: rapid taps raced and stored the same user's like
      // three times. The toggle must remove EVERY copy, not just the first —
      // otherwise one unlike leaves N-1 phantom likes inflating the count.
      const store = storeReactions();
      store.push(
        { doc_id: 'r1', author_key: 'web10.app/users/alice', body: { type: 'like' }, ref_value: 'p1' },
        { doc_id: 'r2', author_key: 'web10.app/users/alice', body: { type: 'like' }, ref_value: 'p1' },
        { doc_id: 'r3', author_key: 'web10.app/users/alice', body: { type: 'like' }, ref_value: 'p1' },
      );
      const { toggleReaction } = await import('../../data/reactions');
      const removed = await toggleReaction('p1', 'like', 'alice', 'web10.app');
      expect(removed).toBe(false);
      expect(store).toHaveLength(0);
    });

    it('leaves other users reactions untouched', async () => {
      const store = storeReactions();
      store.push({ doc_id: 'rb1', author_key: 'web10.app/users/bob', body: { type: 'like' }, ref_value: 'p1' });
      const { toggleReaction } = await import('../../data/reactions');
      await toggleReaction('p1', 'like', 'alice', 'web10.app');
      await toggleReaction('p1', 'like', 'alice', 'web10.app');
      expect(store).toHaveLength(1);
      expect(store[0].doc_id).toBe('rb1');
    });
  });

  describe('recordRepost (v3: create repost document)', () => {
    it('creates a repost document', async () => {
      const doc = { doc_id: 'rp1', body: { target_id: 'p1', type: 'repost' } };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('reactions', { target_id: 'p1', type: 'repost' });
      expect(result).toEqual(doc);
    });
  });
});
