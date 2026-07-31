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
    getReadUrl: vi.fn(),
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
    it('unions public_posts and private_posts (the two real tiers)', async () => {
      // D19 Phase A: the wall is owner-only-private + anon-read-public only.
      // Surfacing legacy `posts` (anon-readable) on the wall would re-publish
      // whatever the old auto-publish bug wrote. Staged imports live in
      // `staging_posts` and surface in the staging/review UI, NOT the wall.
      const byService: Record<string, unknown[]> = {
        public_posts: [{ _id: 'p2', text: 'public', created_at: '2026-07-19T00:00:00Z' }],
        private_posts: [{ _id: 'p3', text: 'private', created_at: '2026-07-20T00:00:00Z' }],
      };
      mock.read.mockImplementation((service: string) => Promise.resolve(byService[service] || []));

      const result = await posts.readMyPosts();
      expect(mock.read).toHaveBeenCalledWith('public_posts');
      expect(mock.read).toHaveBeenCalledWith('private_posts');
      expect(mock.read).not.toHaveBeenCalledWith('posts');
      expect(mock.read).not.toHaveBeenCalledWith('staging_posts');
      expect(result.map((p) => p._id)).toEqual(['p2', 'p3']);
    });

    it('regression: does NOT surface the legacy anon-readable `posts` collection', async () => {
      // The legacy bug read `posts` (anon-readable by its sir) on the wall,
      // which re-published any auto-imported content. Phase A removes that
      // read entirely. If a future change re-adds it, this test fails.
      mock.read.mockImplementation((service: string) =>
        Promise.resolve(
          service === 'posts'
            ? [{ _id: 'LEGACY', text: 'old auto-publish', created_at: '2025-01-01T00:00:00Z' }]
            : service === 'public_posts'
              ? [{ _id: 'pub', text: 'p', created_at: '2026-07-19T00:00:00Z' }]
              : service === 'private_posts'
                ? [{ _id: 'priv', text: 'p', created_at: '2026-07-20T00:00:00Z' }]
                : [],
        ),
      );
      const result = await posts.readMyPosts();
      expect(mock.read).not.toHaveBeenCalledWith('posts');
      expect(result.find((p) => p._id === 'LEGACY')).toBeUndefined();
    });

    it('regression: does NOT surface staging_posts on the wall', async () => {
      // Staged imports await triage in the staging UI (Phase C); a peek here
      // would re-publish them (the bug we are undoing). readMyPosts must not
      // read staging_posts.
      mock.read.mockImplementation((service: string) =>
        Promise.resolve(
          service === 'staging_posts'
            ? [{ _id: 'STAGED', text: 'awaiting triage', created_at: '2026-07-21T00:00:00Z' }]
            : [],
        ),
      );
      const result = await posts.readMyPosts();
      expect(mock.read).not.toHaveBeenCalledWith('staging_posts');
      expect(result.find((p) => p._id === 'STAGED')).toBeUndefined();
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
        width: null,
        height: null,
        durationSeconds: null,
        thumbnailUrl: null,
        altText: null,
        service: undefined,
      });
      expect(result._id).toBe('m1');

      vi.unstubAllGlobals();
    });

    it('D35: passes service=public_media through to confirmUpload', async () => {
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      mock.getUploadUrl.mockResolvedValue({
        uploadUrl: 'https://s3.local/bucket',
        fields: { key: 'alice/abc/pic.png' },
        objectKey: 'alice/abc/pic.png',
        contentType: 'image/png',
      });
      mock.confirmUpload.mockResolvedValue({ _id: 'm2', url: 'https://s3.local/bucket/alice/abc/pic.png' });

      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      await posts.uploadMedia({ file, service: 'public_media' });

      expect(mock.confirmUpload).toHaveBeenCalledWith(
        expect.objectContaining({ service: 'public_media' }),
      );
      vi.unstubAllGlobals();
    });

    it('D35: passes service=media through to confirmUpload', async () => {
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      mock.getUploadUrl.mockResolvedValue({
        uploadUrl: 'https://s3.local/bucket',
        fields: { key: 'alice/abc/pic.png' },
        objectKey: 'alice/abc/pic.png',
        contentType: 'image/png',
      });
      mock.confirmUpload.mockResolvedValue({ _id: 'm3', url: 'https://s3.local/bucket/alice/abc/pic.png' });

      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      await posts.uploadMedia({ file, service: 'media' });

      expect(mock.confirmUpload).toHaveBeenCalledWith(
        expect.objectContaining({ service: 'media' }),
      );
      vi.unstubAllGlobals();
    });

    it('D35: thumbnail upload inherits the parent service', async () => {
      // When a thumbnail is uploaded alongside a main file, the thumbnail's
      // confirm should carry the same service as the parent.
      const file = new File(['x'], 'video.mp4', { type: 'video/mp4' });
      const thumbFile = new File(['t'], 'thumb.webp', { type: 'image/webp' });
      let callCount = 0;
      mock.getUploadUrl.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          uploadUrl: 'https://s3.local/bucket',
          fields: { key: callCount === 1 ? 'alice/abc/thumb.webp' : 'alice/abc/video.mp4' },
          objectKey: callCount === 1 ? 'alice/abc/thumb.webp' : 'alice/abc/video.mp4',
          contentType: callCount === 1 ? 'image/webp' : 'video/mp4',
        });
      });
      mock.confirmUpload.mockImplementation((params: { url: string; service?: string }) =>
        Promise.resolve({ _id: params.service === 'public_media' ? 'tm' : 'vm', url: params.url }),
      );
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      await posts.uploadMedia({ file, thumbnailFile: thumbFile, service: 'public_media' });

      // Both the thumbnail and the main upload should carry public_media
      expect(mock.confirmUpload).toHaveBeenCalledTimes(2);
      expect(mock.confirmUpload).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ service: 'public_media' }),
      );
      expect(mock.confirmUpload).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ service: 'public_media' }),
      );
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
    it('deletes a public post from public_posts', async () => {
      mock.delete.mockResolvedValue(undefined);
      await posts.deletePost('p1', 'public');
      expect(mock.delete).toHaveBeenCalledWith('public_posts', { _id: 'p1' });
    });

    it('deletes a private post from private_posts', async () => {
      mock.delete.mockResolvedValue(undefined);
      await posts.deletePost('p2', 'private');
      expect(mock.delete).toHaveBeenCalledWith('private_posts', { _id: 'p2' });
    });

    it('regression: does NOT delete from the legacy `posts` service', async () => {
      // D30 split: posts live in public_posts/private_posts. The old
      // deletePost hardcoded 'posts' which matched nothing.
      mock.delete.mockResolvedValue(undefined);
      await posts.deletePost('p3', 'public');
      expect(mock.delete).not.toHaveBeenCalledWith('posts', expect.anything());
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
      mock.getReadUrl.mockRejectedValue(new Error('no presign in legacy test'));
      const result = await posts.resolveMediaRefs(['m1']);
      expect(mock.read).toHaveBeenCalledWith('media', { _id: { $in: ['m1'] } }, undefined, undefined);
      // Degrade: refreshMediaUrls fails gracefully -> original url kept.
      expect(result).toEqual(mediaRecords);
    });

    it('D23: refreshes the bare unsigned url to a presigned GET', async () => {
      // On a private bucket the stored url 403s every <img>; resolveMediaRefs
      // must swap it for a fresh presigned read URL before returning.
      const stored = 'https://minio.web10.app/web10-media/alice/abc/pic.png';
      const presigned = 'https://minio.web10.app/web10-media/alice/abc/pic.png?X-Amz-Signature=zzz';
      mock.read.mockResolvedValue([{ _id: 'm9', url: stored, created_at: '2026-07-18T00:00:00Z' }]);
      mock.getReadUrl.mockResolvedValue({ readUrl: presigned, expiresIn: 60 });

      const result = await posts.resolveMediaRefs(['m9']);
      expect(mock.getReadUrl).toHaveBeenCalledWith('alice/abc/pic.png', undefined, undefined, undefined);
      expect(result[0].url).toBe(presigned);
    });

    it('D23: prefers record.object_key over deriving from url', async () => {
      // Lane A's confirm-upload touch persists object_key; a record that
      // already carries it must skip URL-derived derivation.
      mock.read.mockResolvedValue([
        { _id: 'mK', url: 'https://whatever/legacy/path.jpg', object_key: 'bob/zz/real.png', created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.getReadUrl.mockResolvedValue({ readUrl: 'https://signed/real', expiresIn: 60 });

      await posts.resolveMediaRefs(['mK']);
      expect(mock.getReadUrl).toHaveBeenCalledWith('bob/zz/real.png', undefined, undefined, undefined);
    });

    it('D23: thumbnail gets its own presigned URL when it differs from the full image', async () => {
      // The thumbnail is a different S3 object — it must get its own presign,
      // not the full image's presigned URL.
      const fullUrl = 'https://minio.web10.app/web10-media/alice/abc/photo.png';
      const thumbUrl = 'https://minio.web10.app/web10-media/alice/abc/photo-thumb.png';
      mock.read.mockResolvedValue([
        { _id: 'm1', url: fullUrl, thumbnail_url: thumbUrl, created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.getReadUrl
        .mockResolvedValueOnce({ readUrl: 'https://signed/photo?sig=full', expiresIn: 60 })
        .mockResolvedValueOnce({ readUrl: 'https://signed/photo-thumb?sig=thumb', expiresIn: 60 });

      const result = await posts.resolveMediaRefs(['m1']);

      expect(mock.getReadUrl).toHaveBeenNthCalledWith(1, 'alice/abc/photo.png', undefined, undefined, undefined);
      expect(mock.getReadUrl).toHaveBeenNthCalledWith(2, 'alice/abc/photo-thumb.png', undefined, undefined, undefined);
      expect(result[0].url).toBe('https://signed/photo?sig=full');
      expect(result[0].thumbnail_url).toBe('https://signed/photo-thumb?sig=thumb');
    });

    it('D23: thumbnail presign failure keeps stored thumbnail_url', async () => {
      // If the thumbnail presign fails, fall back to the stored thumbnail_url.
      const fullUrl = 'https://minio.web10.app/web10-media/alice/abc/photo.png';
      const thumbUrl = 'https://minio.web10.app/web10-media/alice/abc/photo-thumb.png';
      mock.read.mockResolvedValue([
        { _id: 'm1', url: fullUrl, thumbnail_url: thumbUrl, created_at: '2026-07-18T00:00:00Z' },
      ]);
      let getReadUrlCalls = 0;
      mock.getReadUrl.mockImplementation(() => {
        getReadUrlCalls++;
        if (getReadUrlCalls === 1) {
          return Promise.resolve({ readUrl: 'https://signed/photo?sig=full', expiresIn: 60 });
        }
        return Promise.reject(new Error('thumbnail presign failed'));
      });

      const warnings: unknown[] = [];
      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);
      const result = await posts.resolveMediaRefs(['m1']);
      console.warn = origWarn;

      expect(result[0].url).toBe('https://signed/photo?sig=full');
      expect(result[0].thumbnail_url).toBe(thumbUrl);
      expect(warnings.length).toBe(1);
      expect(String(warnings[0][0])).toContain('thumbnail presign failed for key');
    });

    it('D23: getReadUrl failure logs a warning and falls back to stored URL', async () => {
      mock.read.mockResolvedValue([
        { _id: 'mFail', url: 'https://minio.web10.app/web10-media/alice/abc/broken.png', created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.getReadUrl.mockRejectedValue(new Error('presign endpoint down'));

      const warnings: unknown[] = [];
      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);
      const result = await posts.resolveMediaRefs(['mFail']);
      console.warn = origWarn;

      expect(result[0].url).toBe('https://minio.web10.app/web10-media/alice/abc/broken.png');
      expect(warnings.length).toBe(1);
      expect(String(warnings[0][0])).toContain('presign failed for key "alice/abc/broken.png"');
    });

    it('D23: when thumbnail_url equals url, no extra presign is made', async () => {
      // Same URL means same object — no second round-trip needed.
      const sameUrl = 'https://minio.web10.app/web10-media/alice/abc/photo.png';
      mock.read.mockResolvedValue([
        { _id: 'm1', url: sameUrl, thumbnail_url: sameUrl, created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.getReadUrl.mockResolvedValue({ readUrl: 'https://signed/photo?sig=full', expiresIn: 60 });

      await posts.resolveMediaRefs(['m1']);

      expect(mock.getReadUrl).toHaveBeenCalledTimes(1);
    });

    it('D35: resolveMediaRefs reads from public_media when service is passed', async () => {
      // Cross-user reads must use public_media so the presign endpoint
      // checks the anon-readable terms instead of the owner-only media terms.
      mock.read.mockResolvedValue([
        { _id: 'm1', url: 'https://s3.local/bob/abc/photo.png', created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.getReadUrl.mockResolvedValue({ readUrl: 'https://signed/photo', expiresIn: 60 });

      await posts.resolveMediaRefs(['m1'], { username: 'bob', provider: 'node.web10.app' }, 'public_media');

      expect(mock.read).toHaveBeenCalledWith('public_media', { _id: { $in: ['m1'] } }, 'bob', 'node.web10.app');
      // deriveObjectKey strips the host prefix -> 'bob/abc/photo.png' becomes
      // the path after the first / (the bucket). The URL's path is /bob/abc/photo.png,
      // so the derived key is 'abc/photo.png' (bucket = first path segment).
      expect(mock.getReadUrl).toHaveBeenCalledWith(
        'abc/photo.png',
        'bob',
        'node.web10.app',
        'public_media',
      );
    });

    it('D35: resolveMediaRefs defaults to media service when not specified', async () => {
      mock.read.mockResolvedValue([
        { _id: 'm1', url: 'https://s3.local/alice/abc/photo.png', created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.getReadUrl.mockResolvedValue({ readUrl: 'https://signed/photo', expiresIn: 60 });

      await posts.resolveMediaRefs(['m1']);

      expect(mock.read).toHaveBeenCalledWith('media', { _id: { $in: ['m1'] } }, undefined, undefined);
    });

    it('regression: cross-user resolveMediaRefs passes owner to wapi.read (not viewer)', async () => {
      // Before fix: wapi.read('public_media', { _id: $in: refs }) omitted the
      // owner params, so the wapi wrapper defaulted to the CURRENT signed-in
      // user (the viewer). The viewer's collection has no records for the
      // author's media IDs → zero records → empty avatar, no post photos.
      mock.read.mockResolvedValue([
        { _id: 'm1', url: 'https://s3.local/bob/abc/photo.png', created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.getReadUrl.mockResolvedValue({ readUrl: 'https://signed/photo', expiresIn: 60 });

      // Viewer is 'alice' (the wapi mock defaults to alice), but the media
      // belongs to 'bob'. resolveMediaRefs must read from bob's collection.
      await posts.resolveMediaRefs(['m1'], { username: 'bob', provider: 'node.web10.app' }, 'public_media');

      // The critical assertion: owner params must reach wapi.read
      expect(mock.read).toHaveBeenCalledWith(
        'public_media',
        { _id: { $in: ['m1'] } },
        'bob',
        'node.web10.app',
      );
    });
  });

  describe('refreshMediaUrl (single-record convenience)', () => {
    it('wraps refreshMediaUrls for a single record', async () => {
      mock.read.mockResolvedValue([
        { _id: 'm1', url: 'https://minio.web10.app/web10-media/alice/abc/pic.png', created_at: '2026-07-18T00:00:00Z' },
      ]);
      mock.getReadUrl.mockResolvedValue({ readUrl: 'https://signed/pic', expiresIn: 60 });

      const result = await posts.refreshMediaUrl({
        _id: 'm1',
        url: 'https://minio.web10.app/web10-media/alice/abc/pic.png',
        created_at: '2026-07-18T00:00:00Z',
      });

      expect(result.url).toBe('https://signed/pic');
    });
  });

  describe('readUserPostsFromDiscovery (D-user-profile-stats bug #3)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      mock = mockWapi();
    });

    it('paginates through discovery posts to find all posts by a specific author', async () => {
      // Regression: UserProfileScreen viewer path fetched /discover/posts?limit=50
      // and filtered client-side. A post outside the top 50 was invisible.
      // The fix paginates with limit=200 (API max) until all posts are found.
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      // Page 1: 200 posts, bob's post is at index 150
      const page1 = Array.from({ length: 200 }, (_, i) => ({
        post_id: `p${i}`,
        author: i === 150 ? 'bob' : 'other',
        provider: i === 150 ? 'web10' : 'web10',
        text: `post ${i}`,
        created_at: '2026-07-18T00:00:00Z',
      }));
      // Page 2: 50 more posts, bob has another at index 10
      const page2 = Array.from({ length: 50 }, (_, i) => ({
        post_id: `p${200 + i}`,
        author: i === 10 ? 'bob' : 'other2',
        provider: i === 10 ? 'web10' : 'web10',
        text: `post ${200 + i}`,
        created_at: '2026-07-17T00:00:00Z',
      }));

      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => page1 })
        .mockResolvedValueOnce({ ok: true, json: async () => page2 });

      const result = await posts.readUserPostsFromDiscovery('bob', 'web10');

      expect(result).toHaveLength(2);
      expect(result[0]._id).toBe('p150');
      expect(result[1]._id).toBe('p210');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('limit=200&skip=0'),
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('limit=200&skip=200'),
        expect.objectContaining({ method: 'PATCH' }),
      );

      vi.unstubAllGlobals();
    });

    it('stops paginating when fewer results than limit are returned', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const page1 = Array.from({ length: 10 }, (_, i) => ({
        post_id: `p${i}`,
        author: i === 5 ? 'bob' : 'other',
        provider: 'web10',
        text: `post ${i}`,
        created_at: '2026-07-18T00:00:00Z',
      }));

      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => page1 });

      const result = await posts.readUserPostsFromDiscovery('bob', 'web10');

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('p5');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('returns empty array when author has no posts', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const page1 = Array.from({ length: 5 }, (_, i) => ({
        post_id: `p${i}`,
        author: 'other',
        provider: 'web10',
        text: `post ${i}`,
        created_at: '2026-07-18T00:00:00Z',
      }));

      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => page1 });

      const result = await posts.readUserPostsFromDiscovery('nobody', 'web10');

      expect(result).toHaveLength(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('returns empty array when discovery API fails', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await posts.readUserPostsFromDiscovery('bob', 'web10');

      expect(result).toHaveLength(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('includes media_refs in returned posts', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const page1 = [{
        post_id: 'p1',
        author: 'bob',
        provider: 'web10',
        text: 'photo post',
        created_at: '2026-07-18T00:00:00Z',
        media_refs: ['m1', 'm2'],
        tags: ['photo'],
      }];

      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => page1 });

      const result = await posts.readUserPostsFromDiscovery('bob', 'web10');

      expect(result).toHaveLength(1);
      expect(result[0].media_refs).toEqual(['m1', 'm2']);
      expect(result[0].tags).toEqual(['photo']);

      vi.unstubAllGlobals();
    });
  });

  describe('movePostVisibility', () => {
    it('returns the server-created record with the new _id', async () => {
      // The old code returned a local object without _id. The second toggle
      // then deleted the wrong _id, leaving a duplicate.
      const original = {
        _id: 'old-id',
        text: 'hello',
        visibility: 'public' as const,
        created_at: '2026-07-18T00:00:00Z',
      };
      const serverCreated = {
        _id: 'new-id',
        text: 'hello',
        visibility: 'private' as const,
        created_at: '2026-07-18T00:00:00Z',
      };
      mock.create.mockResolvedValue(serverCreated);
      mock.delete.mockResolvedValue(undefined);

      const result = await posts.movePostVisibility(original);

      expect(mock.create).toHaveBeenCalledWith('private_posts', {
        text: 'hello',
        visibility: 'private',
        created_at: '2026-07-18T00:00:00Z',
      });
      expect(mock.delete).toHaveBeenCalledWith('public_posts', { _id: 'old-id' });
      expect(result._id).toBe('new-id');
      expect(result.visibility).toBe('private');
    });

    it('public → private → public round-trip leaves exactly one record', async () => {
      // Regression: a stale post object across toggles duplicates the post.
      // The first toggle must return the server record, and the second toggle
      // must use that return value (not the original).
      const original = {
        _id: 'p1',
        text: 'test',
        visibility: 'public' as const,
        created_at: '2026-07-18T00:00:00Z',
      };

      // Toggle 1: public → private
      const afterFirst = {
        _id: 'p2',
        text: 'test',
        visibility: 'private' as const,
        created_at: '2026-07-18T00:00:00Z',
      };
      mock.create.mockResolvedValueOnce(afterFirst);
      mock.delete.mockResolvedValue(undefined);
      const step1 = await posts.movePostVisibility(original);

      expect(step1._id).toBe('p2');
      expect(mock.create).toHaveBeenLastCalledWith('private_posts', expect.objectContaining({ visibility: 'private' }));
      expect(mock.delete).toHaveBeenLastCalledWith('public_posts', { _id: 'p1' });

      // Toggle 2: private → public — uses the RETURNED record from step 1
      const afterSecond = {
        _id: 'p3',
        text: 'test',
        visibility: 'public' as const,
        created_at: '2026-07-18T00:00:00Z',
      };
      mock.create.mockResolvedValueOnce(afterSecond);
      const step2 = await posts.movePostVisibility(step1);

      expect(step2._id).toBe('p3');
      expect(mock.create).toHaveBeenLastCalledWith('public_posts', expect.objectContaining({ visibility: 'public' }));
      expect(mock.delete).toHaveBeenLastCalledWith('private_posts', { _id: 'p2' });

      // Verify: p1 deleted from public, p2 deleted from private, p3 in public
      // Exactly one record exists (p3 in public_posts)
      expect(mock.delete).toHaveBeenCalledTimes(2);
      expect(mock.create).toHaveBeenCalledTimes(2);
    });

    it('stale-object case: using original record for second toggle creates duplicate', async () => {
      // This test documents the BUG path: if the caller re-uses the original
      // post object instead of the return value, the second toggle targets
      // the wrong _id and the first toggle's copy survives.
      const original = {
        _id: 'p1',
        text: 'test',
        visibility: 'public' as const,
        created_at: '2026-07-18T00:00:00Z',
      };

      // Toggle 1: public → private
      mock.create.mockResolvedValueOnce({
        _id: 'p2',
        text: 'test',
        visibility: 'private' as const,
        created_at: '2026-07-18T00:00:00Z',
      });
      mock.delete.mockResolvedValueOnce(undefined);
      await posts.movePostVisibility(original);

      // BUG: second toggle uses `original` (visibility=public, _id=p1)
      // instead of the returned record (visibility=private, _id=p2)
      mock.create.mockResolvedValueOnce({
        _id: 'p3',
        text: 'test',
        visibility: 'private' as const,
        created_at: '2026-07-18T00:00:00Z',
      });
      await posts.movePostVisibility(original);

      // The stale-object path: second toggle sees visibility=public, so it
      // creates in private_posts AND deletes from public_posts. But p1 was
      // already deleted from public_posts by toggle 1. So p2 (private)
      // survives AND p3 is created in private — DUPLICATE.
      expect(mock.create).toHaveBeenCalledTimes(2);
      // First create: private_posts (toggle 1)
      expect(mock.create).toHaveBeenNthCalledWith(1, 'private_posts', expect.anything());
      // Second create: private_posts (stale toggle 2, because original.visibility is still 'public')
      expect(mock.create).toHaveBeenNthCalledWith(2, 'private_posts', expect.anything());
      // Delete 1: public_posts p1 (toggle 1, correct)
      expect(mock.delete).toHaveBeenNthCalledWith(1, 'public_posts', { _id: 'p1' });
      // Delete 2: public_posts p1 (stale toggle 2 — p1 already gone, no-op)
      expect(mock.delete).toHaveBeenNthCalledWith(2, 'public_posts', { _id: 'p1' });
    });

    it('private → public toggle works correctly', async () => {
      const original = {
        _id: 'priv1',
        text: 'secret',
        visibility: 'private' as const,
        created_at: '2026-07-18T00:00:00Z',
      };
      const serverCreated = {
        _id: 'pub1',
        text: 'secret',
        visibility: 'public' as const,
        created_at: '2026-07-18T00:00:00Z',
      };
      mock.create.mockResolvedValue(serverCreated);
      mock.delete.mockResolvedValue(undefined);

      const result = await posts.movePostVisibility(original);

      expect(mock.create).toHaveBeenCalledWith('public_posts', {
        text: 'secret',
        visibility: 'public',
        created_at: '2026-07-18T00:00:00Z',
      });
      expect(mock.delete).toHaveBeenCalledWith('private_posts', { _id: 'priv1' });
      expect(result._id).toBe('pub1');
    });

    it('preserves media_refs and tags across the move', async () => {
      const original = {
        _id: 'p1',
        text: 'photo',
        visibility: 'public' as const,
        created_at: '2026-07-18T00:00:00Z',
        media_refs: ['m1', 'm2'],
        tags: ['photo'],
      };
      const serverCreated = {
        ...original,
        _id: 'p2',
        visibility: 'private' as const,
      };
      mock.create.mockResolvedValue(serverCreated);
      mock.delete.mockResolvedValue(undefined);

      const result = await posts.movePostVisibility(original);

      expect(mock.create).toHaveBeenCalledWith('private_posts', expect.objectContaining({
        media_refs: ['m1', 'm2'],
        tags: ['photo'],
        visibility: 'private',
      }));
      expect(result.media_refs).toEqual(['m1', 'm2']);
      expect(result.tags).toEqual(['photo']);
    });
  });
});
