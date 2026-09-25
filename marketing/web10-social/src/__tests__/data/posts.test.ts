import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { readMyPosts, createRepost, readRepostCounts, readMyRepostedIds } from '../../data/posts';

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
    query: vi.fn(),
    getMyGroups: vi.fn(),
    confirmMediaUpload: vi.fn(),
    listMedia: vi.fn(),
    deleteMedia: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('posts v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createPost (v3: create in posts collection)', () => {
    it('creates a post document', async () => {
      const doc = { doc_id: 'p1', body: { text: 'Hello world' }, created_at: '2026-07-18T00:00:00Z' };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('posts', { text: 'Hello world' });
      expect(mock.create).toHaveBeenCalledWith('posts', { text: 'Hello world' });
      expect(result).toEqual(doc);
    });

    it('creates a public post in discover group', async () => {
      const doc = { doc_id: 'p2', body: { text: 'Hello world' }, created_at: '2026-07-18T00:00:00Z' };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('posts', { text: 'Hello world' }, { groups: ['web10.app/groups/web10/discover'] });
      expect(mock.create).toHaveBeenCalledWith('posts', { text: 'Hello world' }, { groups: ['web10.app/groups/web10/discover'] });
      expect(result).toEqual(doc);
    });
  });

  describe('createRepost (reposts.md: a real post doc referencing the original)', () => {
    it('creates a post with repost_of set to the original doc_id + the comment as text', async () => {
      const doc = { doc_id: 'rp1', author_key: 'web10.app/users/alice', body: { text: 'great take', repost_of: 'orig1' }, created_at: '2026-07-18T00:00:00Z' };
      mock.create.mockResolvedValue(doc);
      await createRepost({ _id: 'orig1' }, 'great take');
      // The body carries repost_of + the comment; a repost is a public post
      // (discover + the reposter's followers group).
      expect(mock.create).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ text: 'great take', repost_of: 'orig1', media_refs: [] }),
        expect.objectContaining({ groups: expect.arrayContaining(['web10.app/groups/web10/discover', 'web10.app/groups/users/alice/followers']) }),
      );
    });

    it('a plain repost (no comment) creates a post with empty text + repost_of', async () => {
      const doc = { doc_id: 'rp2', author_key: 'web10.app/users/alice', body: { repost_of: 'orig2' }, created_at: '2026-07-18T00:00:00Z' };
      mock.create.mockResolvedValue(doc);
      await createRepost({ _id: 'orig2' }, '   ');
      expect(mock.create).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ text: undefined, repost_of: 'orig2' }),
        expect.anything(),
      );
    });

    it('throws when the original has no id', async () => {
      await expect(createRepost({}, 'comment')).rejects.toThrow(/without an id/);
      expect(mock.create).not.toHaveBeenCalled();
    });
  });

  describe('readRepostCounts (reposts.md: count repost_of posts, not reactions)', () => {
    it('counts reposts as posts whose repost_of points at the post (I3-scoped query)', async () => {
      mock.query.mockResolvedValue({ rows: [{ repost_of: 'orig1', n: 3 }, { repost_of: 'orig2', n: 1 }] });
      const counts = await readRepostCounts(['orig1', 'orig2'], ['g1']);
      // The count is the number of `repost_of` posts (one per reposter) — the
      // feed query's I3-scoped join lifted to a surface read.
      expect(counts).toEqual({ orig1: 3, orig2: 1 });
      // The query counts DISTINCT doc_ids (a post in N readable groups is one
      // repost, not N) and filters on repost_of.
      expect(mock.query).toHaveBeenCalledWith(
        expect.stringContaining("count(DISTINCT doc_id)"),
        expect.objectContaining({ groups: ['g1'] }),
      );
      const sql = mock.query.mock.calls[0][0] as string;
      expect(sql).toContain("JSONExtractString(body, 'repost_of')");
      expect(sql).not.toContain("type') = 'repost'");
    });

    it('degrades to an empty map when the query fails', async () => {
      mock.query.mockRejectedValue(new Error('boom'));
      const counts = await readRepostCounts(['orig1'], ['g1']);
      expect(counts).toEqual({});
    });

    it('returns {} for no post ids (no query)', async () => {
      const counts = await readRepostCounts([], ['g1']);
      expect(counts).toEqual({});
      expect(mock.query).not.toHaveBeenCalled();
    });
  });

  describe('readMyRepostedIds (reposts.md: the "I reposted this" fill)', () => {
    it('returns the set of repost_of targets from the reader\'s own posts', async () => {
      mock.read.mockResolvedValue([
        { doc_id: 'rp1', author_key: 'web10.app/users/alice', body: { repost_of: 'orig1' } },
        { doc_id: 'rp2', author_key: 'web10.app/users/alice', body: { repost_of: 'orig2' } },
        { doc_id: 'p3', author_key: 'web10.app/users/alice', body: { text: 'a normal post' } },
      ]);
      const ids = await readMyRepostedIds();
      // The fill comes from the reader's own repost posts (the readFeedReactions
      // own-post read lifted to a surface read) — scoped to the reader's own
      // followers group.
      expect(ids).toEqual(new Set(['orig1', 'orig2']));
      expect(mock.read).toHaveBeenCalledWith('posts', {
        groups: ['web10.app/groups/users/alice/followers'],
      });
    });

    it('ignores other authors\' posts (username match)', async () => {
      mock.read.mockResolvedValue([
        { doc_id: 'rp1', author_key: 'web10.app/users/bob', body: { repost_of: 'orig1' } },
      ]);
      const ids = await readMyRepostedIds();
      expect(ids).toEqual(new Set());
    });

    it('returns an empty set when not signed in', async () => {
      mock.readToken.mockReturnValue(null);
      const ids = await readMyRepostedIds();
      expect(ids).toEqual(new Set());
      expect(mock.read).not.toHaveBeenCalled();
    });
  });

  describe('readMyPosts (v3: the owner\'s OWN posts only)', () => {
    it('reads from the owner\'s own followers + close-friends groups (not the feed)', async () => {
      const docs = [
        { doc_id: 'p1', author_key: 'web10.app/users/alice', body: { text: 'my public post' }, created_at: '2026-07-19T00:00:00Z' },
        { doc_id: 'p2', author_key: 'web10.app/users/alice', body: { text: 'my private post' }, created_at: '2026-07-20T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(docs);
      const result = await readMyPosts();
      // The owner's own posts live in the owner's OWN followers + close-friends
      // groups — NOT the feed groups (everyone they follow + communities + DMs).
      expect(mock.read).toHaveBeenCalledWith('posts', {
        groups: ['web10.app/groups/users/alice/followers', 'web10.app/groups/users/alice/close-friends'],
      });
      expect(result).toHaveLength(2);
    });

    it('returns [] when not signed in', async () => {
      mock.readToken.mockReturnValue(null);
      const result = await readMyPosts();
      expect(result).toEqual([]);
      expect(mock.read).not.toHaveBeenCalled();
    });
  });

  describe('deletePost (v3: delete post document)', () => {
    it('deletes a post by doc_id', async () => {
      mock.delete.mockResolvedValue({ doc_id: 'p1', status: 'deleted' });
      const result = await mock.delete('p1');
      expect(mock.delete).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ doc_id: 'p1', status: 'deleted' });
    });
  });

  describe('updatePost (v3: update post document)', () => {
    it('updates a post document', async () => {
      const updated = { doc_id: 'p1', body: { text: 'updated' }, updated_at: '2026-07-20T00:00:00Z' };
      mock.update.mockResolvedValue(updated);
      const result = await mock.update('p1', { text: 'updated' });
      expect(mock.update).toHaveBeenCalledWith('p1', { text: 'updated' });
      expect(result).toEqual(updated);
    });
  });

  describe('media upload flow (v3)', () => {
    it('confirms media upload', async () => {
      const doc = { doc_id: 'm1', body: { object_key: 'img.png' } };
      mock.confirmMediaUpload.mockResolvedValue(doc);
      const result = await mock.confirmMediaUpload({ object_key: 'img.png' });
      expect(result).toEqual(doc);
    });

    it('lists media', async () => {
      const docs = [{ doc_id: 'm1', body: { object_key: 'img.png' } }];
      mock.listMedia.mockResolvedValue(docs);
      const result = await mock.listMedia();
      expect(result).toEqual(docs);
    });

    it('deletes media', async () => {
      mock.deleteMedia.mockResolvedValue({ doc_id: 'm1', status: 'deleted' });
      const result = await mock.deleteMedia('m1');
      expect(result).toEqual({ doc_id: 'm1', status: 'deleted' });
    });
  });
});
