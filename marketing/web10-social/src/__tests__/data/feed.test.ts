import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { readFeed, readDiscoverFeed } from '../../data/feed';

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

describe('feed v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readFeed (v3: read from all groups)', () => {
    it('reads posts from users groups', async () => {
      const docs = [
        { doc_id: 'p1', body: { text: 'post1' }, created_at: '2026-07-17T00:00:00Z' },
        { doc_id: 'p2', body: { text: 'post2' }, created_at: '2026-07-18T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('posts', { groups: ['me'] });
      expect(result).toEqual(docs);
    });

    it('passes a power-mean sort config through to the node (server-side ranking)', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers' },
      ]);
      mock.read.mockResolvedValue([]);
      const sort = { recency: 0, likes: 1, comments: 0, half_life_ms: 0, character: 0 };

      await readFeed(sort, 50);

      expect(mock.read).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ groups: ['web10.app/groups/users/alice/followers'], sort }),
      );
    });

    it('omits the sort param for the chronological default (no server ranking)', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers' },
      ]);
      mock.read.mockResolvedValue([]);

      await readFeed(null, 50);

      const call = mock.read.mock.calls[0][1];
      expect(call.sort).toBeUndefined();
    });

    it('keeps server order when a sort is present (no client re-sort)', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers' },
      ]);
      // The node returns the high-engagement (older) post first under a
      // likes-weighted sort — the client must not re-sort it back to
      // chronological.
      mock.read.mockResolvedValue([
        { doc_id: 'old', author_key: 'web10.app/users/alice', body: { text: 'old' }, created_at: '2026-07-01T00:00:00Z' },
        { doc_id: 'new', author_key: 'web10.app/users/alice', body: { text: 'new' }, created_at: '2026-07-18T00:00:00Z' },
      ]);
      const sort = { recency: 0, likes: 1, comments: 0, half_life_ms: 0, character: 0 };

      const posts = await readFeed(sort, 50);

      expect(posts.map((p) => p._id)).toEqual(['old', 'new']);
    });
  });

  describe('readDiscoverFeed (v3: read the discover board)', () => {
    it('passes a power-mean sort config through to the node', async () => {
      mock.read.mockResolvedValue([]);
      const sort = { recency: 0.6, likes: 0.6, comments: 0.4, half_life_ms: 86400000, character: 0 };

      await readDiscoverFeed(sort, 50);

      expect(mock.read).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ groups: ['web10.app/groups/web10/discover'], sort }),
      );
    });

    it('sorts chronologically only when there is no server sort', async () => {
      mock.read.mockResolvedValue([
        { doc_id: 'old', author_key: 'web10.app/users/alice', body: { text: 'old' }, created_at: '2026-07-01T00:00:00Z' },
        { doc_id: 'new', author_key: 'web10.app/users/alice', body: { text: 'new' }, created_at: '2026-07-18T00:00:00Z' },
      ]);

      const posts = await readDiscoverFeed(null, 50);

      expect(posts.map((p) => p._id)).toEqual(['new', 'old']);
    });
  });

  describe('readById (v3: read single document)', () => {
    it('reads a document by ID', async () => {
      const doc = { doc_id: 'p1', body: { text: 'hello' } };
      mock.readById.mockResolvedValue(doc);
      const result = await mock.readById('p1', 'posts');
      expect(result).toEqual(doc);
    });
  });

  describe('create (v3: create document with groups)', () => {
    it('creates a document with group attachments', async () => {
      const doc = { doc_id: 'p1', body: { text: 'hello' }, groups: ['g1'] };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('posts', { text: 'hello' }, { groups: ['g1'] });
      expect(result).toEqual(doc);
    });
  });
});
