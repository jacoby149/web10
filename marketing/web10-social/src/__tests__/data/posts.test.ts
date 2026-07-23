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
    confirmUpload: vi.fn(),
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
    it('unions legacy `posts`, `public_posts` and `private_posts`', async () => {
      // Regression: the composer writes to public_posts/private_posts, so a
      // wall that read only `posts` dropped every newly composed post.
      const byService: Record<string, unknown[]> = {
        posts: [{ _id: 'p1', text: 'legacy', created_at: '2026-07-18T00:00:00Z' }],
        public_posts: [{ _id: 'p2', text: 'public', created_at: '2026-07-19T00:00:00Z' }],
        private_posts: [{ _id: 'p3', text: 'private', created_at: '2026-07-20T00:00:00Z' }],
      };
      mock.read.mockImplementation((service: string) => Promise.resolve(byService[service] || []));

      const result = await posts.readMyPosts();
      expect(mock.read).toHaveBeenCalledWith('posts');
      expect(mock.read).toHaveBeenCalledWith('public_posts');
      expect(mock.read).toHaveBeenCalledWith('private_posts');
      expect(result.map((p) => p._id)).toEqual(['p1', 'p2', 'p3']);
    });

    it('adapts legacy posts (html/media/time → text/media_refs/created_at)', async () => {
      const legacyPosts = [
        { _id: 'lp1', html: '<p>Hello world</p>', media: [{ type: 'image', src: 'http://img1.jpg' }], time: '2025-06-01T00:00:00Z', web10: 'api.web10.app/alice' },
      ];
      const migratedPosts = [
        { _id: 'lp1', text: 'Hello world', media_refs: ['http://img1.jpg'], created_at: '2025-06-01T00:00:00Z' },
      ];
      mock.read.mockResolvedValueOnce(legacyPosts); // read('posts') — detects legacy
      mock.update.mockResolvedValueOnce(legacyPosts[0]);
      mock.read.mockResolvedValueOnce(migratedPosts); // re-read('posts') after migration
      mock.read.mockResolvedValueOnce([]); // public_posts
      mock.read.mockResolvedValueOnce([]); // private_posts

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

  describe('uploadMedia', () => {
    // Regression: confirm previously read the raw JWT off the wrapper
    // (`wapi.token`, which is undefined), sending `token: undefined` and
    // failing auth — breaking profile pictures and image posts. It must go
    // through the wrapper's confirmUpload, keyed on the server objectKey.
    it('uploads then confirms via the wrapper using the objectKey', async () => {
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      mock.getUploadUrl.mockResolvedValue({
        uploadUrl: 'https://s3.local/bucket',
        fields: { key: 'alice/abc/pic.png' },
        objectKey: 'alice/abc/pic.png',
        contentType: 'image/png',
      });
      mock.confirmUpload.mockResolvedValue({ _id: 'm1', url: 'https://s3.local/bucket/alice/abc/pic.png' });

      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      const result = await posts.uploadMedia({ file });

      expect(mock.confirmUpload).toHaveBeenCalledWith({
        url: 'https://s3.local/bucket/alice/abc/pic.png',
        filename: 'pic.png',
        mimeType: 'image/png',
        sizeBytes: file.size,
      });
      expect(result._id).toBe('m1');

      vi.unstubAllGlobals();
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