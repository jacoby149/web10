import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as posts from '../../data/posts';

// Mock wapi
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

describe('posts data layer', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createPost', () => {
    it('creates a post record (private by default)', async () => {
      const post = { text: 'Hello world', created_at: '2026-07-18T00:00:00Z' };
      const created = { _id: 'post1', ...post };
      mock.create.mockResolvedValue(created);

      const result = await posts.createPost(post);
      expect(mock.create).toHaveBeenCalledWith('private_posts', post);
      expect(result).toEqual(created);
    });

    it('creates a public post in public_posts service', async () => {
      const post = { text: 'Hello world', created_at: '2026-07-18T00:00:00Z', visibility: 'public' as const };
      const created = { _id: 'post2', ...post };
      mock.create.mockResolvedValue(created);

      const result = await posts.createPost(post);
      expect(mock.create).toHaveBeenCalledWith('public_posts', post);
      expect(result).toEqual(created);
    });
  });

  describe('readMyPosts', () => {
    it('reads all posts for the current user', async () => {
      const postsList = [
        { _id: 'p1', text: 'first', created_at: '2026-07-18T00:00:00Z' },
        { _id: 'p2', text: 'second', created_at: '2026-07-17T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(postsList);

      const result = await posts.readMyPosts();
      expect(mock.read).toHaveBeenCalledWith('posts');
      expect(result).toEqual(postsList);
    });

    it('adapts legacy posts (html/media/time → text/media_refs/created_at)', async () => {
      const legacyPosts = [
        { _id: 'lp1', html: '<p>Hello world</p>', media: [{ type: 'image', src: 'http://img1.jpg' }], time: '2025-06-01T00:00:00Z', web10: 'api.web10.app/alice' },
      ];
      const migratedPosts = [
        { _id: 'lp1', text: 'Hello world', media_refs: ['http://img1.jpg'], created_at: '2025-06-01T00:00:00Z' },
      ];
      mock.read.mockResolvedValueOnce(legacyPosts);
      mock.update.mockResolvedValueOnce(legacyPosts[0]);
      mock.read.mockResolvedValueOnce(migratedPosts);

      const result = await posts.readMyPosts();
      expect(mock.update).toHaveBeenCalledWith('posts', { _id: 'lp1' }, expect.objectContaining({
        $set: expect.objectContaining({
          text: 'Hello world',
          created_at: '2025-06-01T00:00:00Z',
        }),
      }));
      expect(result).toEqual(migratedPosts);
    });
  });

  describe('readUserPosts', () => {
    it('reads posts for a specific user', async () => {
      mock.read.mockResolvedValue([]);
      await posts.readUserPosts('bob', 'node.web10.app');
      expect(mock.read).toHaveBeenCalledWith('posts', {}, 'bob', 'node.web10.app');
    });
  });

  describe('readPost', () => {
    it('returns the post if found', async () => {
      const post = { _id: 'p1', text: 'hello', created_at: '2026-07-18T00:00:00Z' };
      mock.read.mockResolvedValue([post]);
      const result = await posts.readPost('p1');
      expect(result).toEqual(post);
    });

    it('returns null if not found', async () => {
      mock.read.mockResolvedValue([]);
      const result = await posts.readPost('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updatePost', () => {
    it('updates a post by ID', async () => {
      const updated = { _id: 'p1', text: 'updated', created_at: '2026-07-18T00:00:00Z' };
      mock.update.mockResolvedValue(updated);
      const result = await posts.updatePost('p1', { text: 'updated' });
      expect(mock.update).toHaveBeenCalledWith('posts', { _id: 'p1' }, { $set: { text: 'updated' } });
      expect(result).toEqual(updated);
    });
  });

  describe('deletePost', () => {
    it('deletes a post by ID', async () => {
      mock.delete.mockResolvedValue(undefined);
      await posts.deletePost('p1');
      expect(mock.delete).toHaveBeenCalledWith('posts', { _id: 'p1' });
    });
  });

  describe('resolveMediaRefs', () => {
    it('returns empty array for empty refs', async () => {
      const result = await posts.resolveMediaRefs([]);
      expect(result).toEqual([]);
    });

    it('reads media records for given refs', async () => {
      const mediaRecords = [
        { _id: 'm1', url: 'http://img1.jpg', created_at: '2026-07-18T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(mediaRecords);
      const result = await posts.resolveMediaRefs(['m1']);
      expect(mock.read).toHaveBeenCalledWith('media', { _id: { $in: ['m1'] } });
      expect(result).toEqual(mediaRecords);
    });
  });
});