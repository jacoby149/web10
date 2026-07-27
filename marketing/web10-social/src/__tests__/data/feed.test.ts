import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as feed from '../../data/feed';

function mockWapi() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.web10.app', username: 'alice', site: 'site-token-abc' })),
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

  describe('createPublicEntry', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => ({ _id: 'le-1', schema_id: 'web10.reaction', target: 'posts:p1', payload: {} }),
      } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('sends body shape matching public.py Token model: {token, query: {schema_id, target, payload}}', async () => {
      await feed.createPublicEntry({
        schema_id: 'web10.reaction',
        target: 'posts:p1',
        payload: { action: 'like', author_username: 'alice' },
      });

      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(callBody).toEqual({
        token: 'site-token-abc',
        query: {
          schema_id: 'web10.reaction',
          target: 'posts:p1',
          payload: { action: 'like', author_username: 'alice' },
        },
      });
    });

    it('returns the server response on success', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => ({ _id: 'le-42', schema_id: 'web10.follow', target: 'follow:bob@api.web10.app', payload: { action: 'follow' } }),
      } as Response);

      const result = await feed.createPublicEntry({
        schema_id: 'web10.follow',
        target: 'follow:bob@api.web10.app',
        payload: { action: 'follow', target_username: 'bob' },
      });

      expect(result._id).toBe('le-42');
    });

    it('returns a local stub when the endpoint is unavailable', async () => {
      fetchSpy.mockRejectedValue(new Error('network error'));

      const result = await feed.createPublicEntry({
        schema_id: 'web10.comment',
        target: 'posts:p99',
        payload: { action: 'comment', text: 'hello' },
      });

      expect(result._id).toMatch(/^local-/);
      expect(result.schema_id).toBe('web10.comment');
      expect(result.payload).toEqual({ action: 'comment', text: 'hello' });
    });

    it('returns a local stub when the endpoint returns non-ok', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 422 } as Response);

      const result = await feed.createPublicEntry({
        schema_id: 'web10.comment',
        target: 'posts:p99',
        payload: { action: 'comment', text: 'hi' },
      });

      expect(result._id).toMatch(/^local-/);
    });
  });

  describe('registerDefaultSchemas', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      feed.clearSchemaCache();
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => ({ _id: 'web10.schema', name: 'Reaction', schema: {} }),
      } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
      feed.clearSchemaCache();
    });

    it('registers default schemas and caches them', async () => {
      let callIndex = 0;
      const schemaResponses = [
        { _id: 'web10.reaction', name: 'Reaction', schema: {} },
        { _id: 'web10.comment', name: 'Comment', schema: {} },
        { _id: 'web10.follow', name: 'Follow', schema: {} },
      ];
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => schemaResponses[callIndex++],
        } as Response),
      );

      const schemas = await feed.registerDefaultSchemas();
      expect(schemas).toHaveLength(3);
      expect(schemas[0]._id).toBe('web10.reaction');
      expect(schemas[1]._id).toBe('web10.comment');
      expect(schemas[2]._id).toBe('web10.follow');

      // Cached — second call should not hit network again
      callIndex = 99; // will fail if called
      fetchSpy.mockRejectedValue(new Error('should not be called'));
      const cached = await feed.registerDefaultSchemas();
      expect(cached).toHaveLength(3);
      expect(callIndex).toBe(99); // unchanged
    });

    it('returns empty array when not authenticated', async () => {
      mock.readToken.mockReturnValue(null);
      const schemas = await feed.registerDefaultSchemas();
      expect(schemas).toEqual([]);
    });

    it('skips schema registration failures without throwing', async () => {
      fetchSpy.mockRejectedValue(new Error('no schema registry'));
      const schemas = await feed.registerDefaultSchemas();
      expect(schemas).toEqual([]);
    });
  });
});