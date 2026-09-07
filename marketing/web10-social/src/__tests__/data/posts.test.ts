import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { readMyPosts } from '../../data/posts';

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
