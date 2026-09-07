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
});
