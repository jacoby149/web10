import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as reactions from '../../data/reactions';
import type { ReactionRecord } from '../../data/types';

function mockWapi() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.web10.app', username: 'alice' })),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
    getUploadUrl: vi.fn(),
    initP2P: vi.fn(),
    sendP2P: vi.fn(),
  };
  vi.spyOn(wapi, 'getWapi').mockReturnValue(mock as any);
  return mock;
}

describe('reactions data layer', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readReactions', () => {
    it('reads reactions for a post', async () => {
      const list = [
        { _id: 'r1', target_service: 'posts', target_id: 'p1', type: 'like', created_at: '2026-07-18T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(list);
      const result = await reactions.readReactions('posts', 'p1');
      expect(mock.read).toHaveBeenCalledWith('reactions', { target_service: 'posts', target_id: 'p1' });
      expect(result).toEqual(list);
    });
  });

  describe('createReaction', () => {
    it('creates a reaction', async () => {
      const reaction: Omit<ReactionRecord, '_id'> = { target_service: 'posts', target_id: 'p1', type: 'like', created_at: '2026-07-18T00:00:00Z' };
      const created = { _id: 'r1', ...reaction };
      mock.create.mockResolvedValue(created);
      const result = await reactions.createReaction(reaction);
      expect(mock.create).toHaveBeenCalledWith('reactions', reaction);
      expect(result).toEqual(created);
    });
  });

  describe('toggleReaction', () => {
    it('adds reaction when not present', async () => {
      mock.read.mockResolvedValue([]);
      mock.create.mockResolvedValue({ _id: 'r1' });
      const result = await reactions.toggleReaction('posts', 'p1', 'like', 'alice', 'api.web10.app');
      expect(result).toBe(true);
      expect(mock.create).toHaveBeenCalled();
    });

    it('removes reaction when already present', async () => {
      mock.read.mockResolvedValue([
        { _id: 'r1', target_service: 'posts', target_id: 'p1', type: 'like', author_username: 'alice', author_provider: 'api.web10.app', created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.delete.mockResolvedValue(undefined);
      const result = await reactions.toggleReaction('posts', 'p1', 'like', 'alice', 'api.web10.app');
      expect(result).toBe(false);
      expect(mock.delete).toHaveBeenCalledWith('reactions', { _id: 'r1' });
    });
  });

  describe('deleteReaction', () => {
    it('deletes a reaction by ID', async () => {
      mock.delete.mockResolvedValue(undefined);
      await reactions.deleteReaction('r1');
      expect(mock.delete).toHaveBeenCalledWith('reactions', { _id: 'r1' });
    });
  });

  describe('countReactions', () => {
    it('returns the count of reactions', async () => {
      mock.read.mockResolvedValue([
        { _id: 'r1', type: 'like' },
        { _id: 'r2', type: 'love' },
      ]);
      const count = await reactions.countReactions('posts', 'p1');
      expect(count).toBe(2);
    });
  });

  describe('getReactionCounts', () => {
    it('returns counts grouped by type', async () => {
      mock.aggregate.mockResolvedValue([
        { _id: 'like', count: 5 },
        { _id: 'love', count: 3 },
      ]);
      const result = await reactions.getReactionCounts('posts', 'p1');
      expect(result).toEqual({ like: 5, love: 3 });
    });

    it('returns empty object when no reactions', async () => {
      mock.aggregate.mockResolvedValue([]);
      const result = await reactions.getReactionCounts('posts', 'p1');
      expect(result).toEqual({});
    });
  });
});