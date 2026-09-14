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
    it('creates reaction when none exists', async () => {
      mock.read.mockResolvedValue([]);
      mock.create.mockResolvedValue({ doc_id: 'r1', body: { target_id: 'p1', type: 'like' } });
      // No existing reaction → create
      const existing = await mock.read('reactions', { groups: ['me'] });
      expect(existing).toEqual([]);
      await mock.create('reactions', { target_id: 'p1', type: 'like' });
    });

    it('deletes reaction when already present', async () => {
      mock.read.mockResolvedValue([{ doc_id: 'r1', body: { target_id: 'p1', type: 'like' } }]);
      mock.delete.mockResolvedValue({ doc_id: 'r1', status: 'deleted' });
      const existing = await mock.read('reactions', { groups: ['me'] });
      expect(existing.length).toBe(1);
      await mock.delete('r1');
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

  // The one-reaction-per-user invariant (post-actions.md): like XOR dislike.
  // `setReaction` is the primitive; `toggleReactionKind` is the tap handler.
  // readReactions reads via w.read('reactions', { ref: targetId }) and maps
  // the docs — author comes from author_key, type from body.type.
  //
  // The author_key shape is the REAL v3 one (3.79.3 class): the node writes
  // `author_key = token.username` — a BARE username, no provider prefix.
  // `fromV3DocToReaction` therefore derives `author_provider` as the v2
  // fallback ('web10'), which never equals the token's real provider
  // ('web10.app' in this mock). The regression this pins: matching
  // "mine" on `author_provider === token.provider` made the user's own
  // reaction unfindable, so every tap CREATED a new reaction instead of
  // toggling (the 28-likes bug). Seeding the v2 shape
  // ('web10.app/users/alice') is what let the bug through — the provider
  // compare happened to match.
  function seedMine(type: 'like' | 'dislike' | null, docId = 'r-mine') {
    const docs = type
      ? [{ doc_id: docId, author_key: 'alice', body: { target_id: 'p1', type } }]
      : [];
    // a stranger's reaction must never be touched by the swap
    docs.push({ doc_id: 'r-bob', author_key: 'bob', body: { target_id: 'p1', type: 'like' } });
    mock.read.mockResolvedValue(docs);
    mock.create.mockResolvedValue({ doc_id: 'r-new', author_key: 'alice', body: { target_id: 'p1', type: 'like' } });
    mock.delete.mockResolvedValue({ status: 'deleted' });
  }

  describe('setReaction (like XOR dislike)', () => {
    it('none → like: creates the like, deletes nothing', async () => {
      seedMine(null);
      const { setReaction } = await import('../../data/reactions');
      const result = await setReaction('p1', 'like');
      expect(result).toBe('like');
      expect(mock.delete).not.toHaveBeenCalled();
      expect(mock.create).toHaveBeenCalledWith(
        'reactions',
        expect.objectContaining({ type: 'like', target_id: 'p1' }),
        expect.anything(),
      );
    });

    it('none → dislike: creates the dislike', async () => {
      seedMine(null);
      const { setReaction } = await import('../../data/reactions');
      const result = await setReaction('p1', 'dislike');
      expect(result).toBe('dislike');
      expect(mock.delete).not.toHaveBeenCalled();
      expect(mock.create).toHaveBeenCalledWith(
        'reactions',
        expect.objectContaining({ type: 'dislike', target_id: 'p1' }),
        expect.anything(),
      );
    });

    it('like → dislike: deletes the like, creates the dislike (the swap)', async () => {
      seedMine('like');
      const { setReaction } = await import('../../data/reactions');
      const result = await setReaction('p1', 'dislike');
      expect(result).toBe('dislike');
      expect(mock.delete).toHaveBeenCalledWith('r-mine');
      expect(mock.create).toHaveBeenCalledWith(
        'reactions',
        expect.objectContaining({ type: 'dislike', target_id: 'p1' }),
        expect.anything(),
      );
    });

    it('dislike → like: deletes the dislike, creates the like (the swap)', async () => {
      seedMine('dislike');
      const { setReaction } = await import('../../data/reactions');
      const result = await setReaction('p1', 'like');
      expect(result).toBe('like');
      expect(mock.delete).toHaveBeenCalledWith('r-mine');
      expect(mock.create).toHaveBeenCalledWith(
        'reactions',
        expect.objectContaining({ type: 'like', target_id: 'p1' }),
        expect.anything(),
      );
    });

    it('like → like: idempotent no-op (no delete, no create)', async () => {
      seedMine('like');
      const { setReaction } = await import('../../data/reactions');
      const result = await setReaction('p1', 'like');
      expect(result).toBe('like');
      expect(mock.delete).not.toHaveBeenCalled();
      expect(mock.create).not.toHaveBeenCalled();
    });

    it('like → null: deletes the like, creates nothing', async () => {
      seedMine('like');
      const { setReaction } = await import('../../data/reactions');
      const result = await setReaction('p1', null);
      expect(result).toBeNull();
      expect(mock.delete).toHaveBeenCalledWith('r-mine');
      expect(mock.create).not.toHaveBeenCalled();
    });

    it('dislike → null: deletes the dislike', async () => {
      seedMine('dislike');
      const { setReaction } = await import('../../data/reactions');
      const result = await setReaction('p1', null);
      expect(result).toBeNull();
      expect(mock.delete).toHaveBeenCalledWith('r-mine');
      expect(mock.create).not.toHaveBeenCalled();
    });

    it('never touches a stranger\'s reaction on the same post', async () => {
      seedMine('like');
      const { setReaction } = await import('../../data/reactions');
      await setReaction('p1', 'dislike');
      // only the user's own doc (r-mine) is deleted — bob's r-bob is intact
      expect(mock.delete).toHaveBeenCalledTimes(1);
      expect(mock.delete).toHaveBeenCalledWith('r-mine');
    });

    it('throws when signed out', async () => {
      mock.readToken.mockReturnValue(null);
      const { setReaction } = await import('../../data/reactions');
      await expect(setReaction('p1', 'like')).rejects.toThrow('not authenticated');
    });
  });

  describe('toggleReactionKind (the tap handler)', () => {
    it('none → tap like → like', async () => {
      seedMine(null);
      const { toggleReactionKind } = await import('../../data/reactions');
      await expect(toggleReactionKind('p1', 'like')).resolves.toBe('like');
    });

    it('like → tap like → null (the active one clears)', async () => {
      seedMine('like');
      const { toggleReactionKind } = await import('../../data/reactions');
      await expect(toggleReactionKind('p1', 'like')).resolves.toBeNull();
      expect(mock.delete).toHaveBeenCalledWith('r-mine');
      expect(mock.create).not.toHaveBeenCalled();
    });

    it('like → tap dislike → dislike (the swap)', async () => {
      seedMine('like');
      const { toggleReactionKind } = await import('../../data/reactions');
      await expect(toggleReactionKind('p1', 'dislike')).resolves.toBe('dislike');
    });

    it('dislike → tap like → like (the swap)', async () => {
      seedMine('dislike');
      const { toggleReactionKind } = await import('../../data/reactions');
      await expect(toggleReactionKind('p1', 'like')).resolves.toBe('like');
    });

    it('dislike → tap dislike → null (the active one clears)', async () => {
      seedMine('dislike');
      const { toggleReactionKind } = await import('../../data/reactions');
      await expect(toggleReactionKind('p1', 'dislike')).resolves.toBeNull();
    });

    it('the 28-likes regression: repeated taps toggle, never stack', async () => {
      // The operator's report: 28 heart taps → the count read 28. The root
      // was the v2 provider compare (author_provider 'web10' fallback vs the
      // token's real provider) — "mine" was never found, so every tap
      // created a new reaction doc. Tap 5 times against the real v3 shape
      // (bare-username author_key, seeded above): the net must be ONE
      // reaction, not five.
      const { toggleReactionKind } = await import('../../data/reactions');
      // tap 1: none → like (create)
      seedMine(null);
      await expect(toggleReactionKind('p1', 'like')).resolves.toBe('like');
      expect(mock.create).toHaveBeenCalledTimes(1);
      expect(mock.delete).not.toHaveBeenCalled();
      // tap 2: like → null (delete the doc tap 1 created)
      seedMine('like', 'r-tap1');
      await expect(toggleReactionKind('p1', 'like')).resolves.toBeNull();
      expect(mock.delete).toHaveBeenCalledTimes(1);
      expect(mock.delete).toHaveBeenLastCalledWith('r-tap1');
      expect(mock.create).toHaveBeenCalledTimes(1); // no second create
      // tap 3: none → like again (the 0 → 1 → 0 → 1 oscillation)
      seedMine(null);
      await expect(toggleReactionKind('p1', 'like')).resolves.toBe('like');
      expect(mock.create).toHaveBeenCalledTimes(2);
      expect(mock.delete).toHaveBeenCalledTimes(1);
      // after 5 taps the user holds exactly one reaction
      seedMine('like', 'r-tap3');
      await expect(toggleReactionKind('p1', 'like')).resolves.toBeNull();
      seedMine(null);
      await expect(toggleReactionKind('p1', 'like')).resolves.toBe('like');
      expect(mock.create).toHaveBeenCalledTimes(3);
      expect(mock.delete).toHaveBeenCalledTimes(2);
    });

    it('a v2-shaped author_key (provider/username) still matches by username', async () => {
      // Federation-era docs carry the prefixed key; the username is the
      // last segment either way, so the username-only rule covers both.
      const docs = [
        { doc_id: 'r-v2', author_key: 'web10.app/users/alice', body: { target_id: 'p1', type: 'like' } },
      ];
      mock.read.mockResolvedValue(docs);
      mock.delete.mockResolvedValue({ status: 'deleted' });
      const { toggleReactionKind } = await import('../../data/reactions');
      await expect(toggleReactionKind('p1', 'like')).resolves.toBeNull();
      expect(mock.delete).toHaveBeenCalledWith('r-v2');
      expect(mock.create).not.toHaveBeenCalled();
    });
  });
});
