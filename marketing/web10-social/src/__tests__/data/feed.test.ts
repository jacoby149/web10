import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as feed from '../../data/feed';

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

describe('feed data layer', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readFeed', () => {
    it('sorts newest first by default', async () => {
      const inbox = [
        { _id: 'i1', author_username: 'bob', author_provider: 'api.web10.app', post_id: 'p1', delivered_at: '2026-07-17T00:00:00Z' },
        { _id: 'i2', author_username: 'carol', author_provider: 'api.web10.app', post_id: 'p2', delivered_at: '2026-07-18T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(inbox);

      const result = await feed.readFeed('newest');
      expect(result[0]._id).toBe('i2');
      expect(result[1]._id).toBe('i1');
    });

    it('sorts oldest first when requested', async () => {
      const inbox = [
        { _id: 'i1', author_username: 'bob', author_provider: 'api.web10.app', post_id: 'p1', delivered_at: '2026-07-17T00:00:00Z' },
        { _id: 'i2', author_username: 'carol', author_provider: 'api.web10.app', post_id: 'p2', delivered_at: '2026-07-18T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(inbox);

      const result = await feed.readFeed('oldest');
      expect(result[0]._id).toBe('i1');
      expect(result[1]._id).toBe('i2');
    });

    it('sorts by reaction count when most_reacted', async () => {
      const inbox = [
        { _id: 'i1', author_username: 'bob', author_provider: 'api.web10.app', post_id: 'p1', delivered_at: '2026-07-18T00:00:00Z' },
        { _id: 'i2', author_username: 'carol', author_provider: 'api.web10.app', post_id: 'p2', delivered_at: '2026-07-18T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(inbox);
      mock.aggregate.mockResolvedValue([
        { _id: 'p1', count: 5 },
        { _id: 'p2', count: 10 },
      ]);

      const result = await feed.readFeed('most_reacted');
      expect(result[0]._id).toBe('i2'); // p2 has 10 reactions
      expect(result[1]._id).toBe('i1'); // p1 has 5 reactions
    });

    it('handles most_reacted with no reactions', async () => {
      const inbox = [
        { _id: 'i1', author_username: 'bob', author_provider: 'api.web10.app', post_id: 'p1', delivered_at: '2026-07-18T00:00:00Z' },
        { _id: 'i2', author_username: 'carol', author_provider: 'api.web10.app', post_id: 'p2', delivered_at: '2026-07-17T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(inbox);
      mock.aggregate.mockResolvedValue([]);

      const result = await feed.readFeed('most_reacted');
      expect(result.length).toBe(2);
    });
  });

  describe('markInboxRead', () => {
    it('marks an inbox item as read', async () => {
      mock.update.mockResolvedValue({} as any);
      await feed.markInboxRead('i1');
      expect(mock.update).toHaveBeenCalledWith('inbox', { _id: 'i1' }, { $set: { read: true } });
    });
  });

  describe('countUnread', () => {
    it('counts unread inbox items', async () => {
      mock.read.mockResolvedValue([
        { _id: 'i1', read: false },
        { _id: 'i2', read: false },
      ]);
      const count = await feed.countUnread();
      expect(count).toBe(2);
    });

    it('returns 0 when all read', async () => {
      mock.read.mockResolvedValue([]);
      const count = await feed.countUnread();
      expect(count).toBe(0);
    });
  });
});